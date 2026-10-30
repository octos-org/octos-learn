import { tr } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { synthesizeSpeech, synthesizeCloudSpeech } from "@/api/voice";
import { getVoiceRouting, markPrivateTtsFailed, peekVoiceRouting } from "@/api/voice-routing";
import { ServiceError, type LessonVoices } from "@/byok/providers";
import { playPrivateSpeech } from "@/home/voice/private-tts";
import {
  playAudioBlob,
  stopAudio,
} from "@/home/voice/audio-playback";
import {
  nativePackagedAudioAvailable,
  nativeTtsAvailable,
  playNativeAudioBlob,
  playNativeTts,
  prefetchNativeTts,
  stopNativeTts,
} from "@/home/voice/native-tts";

export interface OllNarrationTtsOptions {
  language?: string;
  upcomingLanguage?: string;
  prewarmLanguage?: string;
  enabled: boolean;
  playing: boolean;
  text: string;
  narrationId?: string;
  prefetchEnabled?: boolean;
  prewarmText?: string;
  prewarmNarrationId?: string;
  upcomingText?: string;
  upcomingNarrationId?: string;
  /** The teacher's voices for this narration; a prefetch made for another
   * teacher's voice is not reused. A clip already playing keeps the voice it
   * started with. */
  voices?: LessonVoices | null;
  /** Voices for the upcoming narration when it belongs to another teacher's
   * lesson; defaults to `voices`. */
  upcomingVoices?: LessonVoices | null;
  /** Voices for the prewarmed first sentence, which may belong to another
   * lesson than the current narration; defaults to `voices`. */
  prewarmVoices?: LessonVoices | null;
  /** The voice is not known yet: audible narration and prewarming wait for
   * it. Narration with audio off still completes at once. */
  voicePending?: boolean;
  /** Resolve narration bytes from a verified local CoursePack. When supplied,
   * neither native TTS nor the hosted synthesis API is consulted. */
  resolveAudio?: (
    narrationId: string,
    text: string,
    signal: AbortSignal,
  ) => Blob | null | Promise<Blob | null>;
  onSpeakingChange?: (speaking: boolean) => void;
  onPlaybackStart?: (narrationId: string) => void;
  onPlaybackComplete?: (narrationId: string) => void;
  onPlaybackEnd?: (narrationId: string, reason: "ended" | "disabled" | "failed" | "cancelled") => void;
}

export interface OllNarrationTtsState {
  error: string | null;
  preparing: boolean;
}

interface PrefetchedSpeech {
  key: string;
  controller: AbortController;
  promise: Promise<Blob | null>;
  claimed: boolean;
  failure: { cause: unknown } | null;
}

function narrationFailure(cause: unknown): string {
  // Only our typed, sanitized provider errors may reach the whiteboard.
  return cause instanceof ServiceError
    ? tr("课程旁白：{{v0}} 文字旁白仍会显示。", { v0: cause.message })
    : tr("课程语音暂时不可用，旁白仍会显示。");
}

function speechKey(narrationId: string | undefined, text: string, voiceTag: string, language?: string): string | null {
  return narrationId && text ? `${narrationId}\u0000${text}\u0000${voiceTag}\u0000${language ?? ""}` : null;
}

/**
 * Plays the Runtime's current narration through the profile's system TTS.
 *
 * The hook knows nothing about the learner's input mode. Text and voice input
 * therefore share this exact synthesis, cancellation, and playback path.
 */
export function useOllNarrationTts({
  language,
  upcomingLanguage,
  prewarmLanguage,
  enabled,
  playing,
  text,
  narrationId,
  prefetchEnabled = false,
  prewarmText = "",
  prewarmNarrationId,
  upcomingText = "",
  upcomingNarrationId,
  voices,
  upcomingVoices,
  prewarmVoices,
  voicePending = false,
  resolveAudio,
  onSpeakingChange,
  onPlaybackStart,
  onPlaybackComplete,
  onPlaybackEnd,
}: OllNarrationTtsOptions): OllNarrationTtsState {
  const normalizedText = text.trim();
  const normalizedPrewarmText = prewarmText.trim();
  const normalizedUpcomingText = upcomingText.trim();
  const requestedVoiceTag = voices ? JSON.stringify(voices) : "";
  // Once a clip plays, a change of voice waits for the next clip rather than
  // cutting the sentence off and starting it again.
  const [clipVoice, setClipVoice] = useState<{ id: string; tag: string } | null>(null);
  if (playing && !voicePending && narrationId && clipVoice?.id !== narrationId) setClipVoice({ id: narrationId, tag: requestedVoiceTag });
  const voiceTag = clipVoice && playing && clipVoice.id === narrationId ? clipVoice.tag : requestedVoiceTag;
  const upcomingVoiceTag = upcomingVoices === undefined ? requestedVoiceTag : upcomingVoices ? JSON.stringify(upcomingVoices) : "";
  const prewarmVoiceTag = prewarmVoices === undefined ? requestedVoiceTag : prewarmVoices ? JSON.stringify(prewarmVoices) : "";
  const lessonVoices = useMemo<LessonVoices | null>(() => voiceTag ? JSON.parse(voiceTag) : null, [voiceTag]);
  const warmVoices = useMemo<LessonVoices | null>(() => prewarmVoiceTag ? JSON.parse(prewarmVoiceTag) : null, [prewarmVoiceTag]);
  const nextVoices = useMemo<LessonVoices | null>(() => upcomingVoiceTag ? JSON.parse(upcomingVoiceTag) : null, [upcomingVoiceTag]);
  const currentKey = speechKey(narrationId, normalizedText, voiceTag, language);
  const prewarmKey = speechKey(prewarmNarrationId, normalizedPrewarmText, prewarmVoiceTag, prewarmLanguage ?? language);
  const upcomingKey = speechKey(upcomingNarrationId, normalizedUpcomingText, upcomingVoiceTag, upcomingLanguage ?? language);
  const [failure, setFailure] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [startedKey, setStartedKey] = useState<string | null>(null);
  const prefetchedSpeechRef = useRef<PrefetchedSpeech | null>(null);
  const nativePrefetchRef = useRef<{
    key: string;
    cancel: () => void;
  } | null>(null);
  const callbacksRef = useRef({
    onSpeakingChange,
    onPlaybackStart,
    onPlaybackComplete,
  onPlaybackEnd,
  });

  useEffect(() => {
    const clear = (event: Event) => {
      if (event.type === "octos:client-service-changed" && (event as CustomEvent).detail !== "tts") return;
      prefetchedSpeechRef.current?.controller.abort(); prefetchedSpeechRef.current = null;
      nativePrefetchRef.current?.cancel(); nativePrefetchRef.current = null;
    };
    window.addEventListener("octos:client-services-reset", clear);
    window.addEventListener("octos:client-service-changed", clear);
    return () => { window.removeEventListener("octos:client-services-reset", clear); window.removeEventListener("octos:client-service-changed", clear); };
  }, []);

  useEffect(() => {
    callbacksRef.current = {
      onSpeakingChange,
      onPlaybackStart,
      onPlaybackComplete,
  onPlaybackEnd,
    };
  }, [onPlaybackComplete, onPlaybackEnd, onPlaybackStart, onSpeakingChange]);

  // One end per playback of a beat: the effect below reruns when the voice
  // becomes known or changes, and must not end the same playback again. A
  // beat played again (after a stop or a seek back) is a new playback.
  const endedNarrationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!playing || endedNarrationRef.current !== narrationId) endedNarrationRef.current = null;
  }, [narrationId, playing]);

  useEffect(() => {
    const request = new AbortController();
    let current = true;
    let completed = false;
    const reportEnd = (reason: "ended" | "disabled" | "failed" | "cancelled") => {
      if (!current || completed || !narrationId || endedNarrationRef.current === narrationId) return false;
      completed = true;
      endedNarrationRef.current = narrationId;
      callbacksRef.current.onPlaybackEnd?.(narrationId, reason);
      return true;
    };
    const completePlayback = (reason: "ended" | "disabled" | "failed") => {
      if (reportEnd(reason) && narrationId) callbacksRef.current.onPlaybackComplete?.(narrationId);
    };

    if (!enabled || !playing || !normalizedText) {
      queueMicrotask(() => {
        if (!current) return;
        setPreparing(false);
        setStartedKey(null);
      });
      callbacksRef.current.onSpeakingChange?.(false);
      stopAudio();
      stopNativeTts();
      if (!enabled && playing && normalizedText) completePlayback("disabled");
      return () => {
        current = false;
        request.abort();
      };
    }
    // Audible narration waits until its teacher's voice is known; nothing is
    // synthesized meanwhile, so no sentence starts in one voice and restarts.
    if (voicePending) {
      queueMicrotask(() => {
        if (!current) return;
        setPreparing(true);
        setStartedKey(null);
      });
      return () => {
        current = false;
        request.abort();
      };
    }

    queueMicrotask(() => {
      if (!current) return;
      setPreparing(true);
      setStartedKey(null);
    });
    const usePackagedAudio = Boolean(resolveAudio && narrationId);
    const cached = !usePackagedAudio
      && currentKey && prefetchedSpeechRef.current?.key === currentKey
      ? prefetchedSpeechRef.current
      : null;
    if (cached) {
      cached.claimed = true;
      prefetchedSpeechRef.current = null;
    }
    const audioRequest = cached?.controller ?? request;
    const invalidate = () => {
      reportEnd("cancelled");
      current = false; request.abort(); audioRequest.abort();
      prefetchedSpeechRef.current?.controller.abort(); prefetchedSpeechRef.current = null;
      stopAudio(); stopNativeTts(); setPreparing(false); setStartedKey(null);
    };
    const configChanged = (event: Event) => { if ((event as CustomEvent).detail === "tts") invalidate(); };
    window.addEventListener("octos:client-services-reset", invalidate);
    window.addEventListener("octos:client-service-changed", configChanged);
    const packagedAudio = usePackagedAudio && narrationId
      ? Promise.resolve(resolveAudio?.(
          narrationId,
          normalizedText,
          audioRequest.signal,
        ) ?? null).then((audio) => audio ?? null)
      : null;
    const finishAudio = () => {
      if (!current) return;
      callbacksRef.current.onSpeakingChange?.(false);
      completePlayback("ended");
    };
    const playCloudTts = (useCache = true) =>
      nativeTtsAvailable()
        ? playNativeTts(normalizedText, finishAudio, audioRequest.signal)
          .catch((error) => {
            if (audioRequest.signal.aborted) throw error;
            return synthesizeCloudSpeech(normalizedText, audioRequest.signal, lessonVoices, language)
              .then(audio => playAudioBlob(audio, finishAudio, audioRequest.signal));
          })
        : (useCache && cached ? cached.promise : synthesizeCloudSpeech(normalizedText, audioRequest.signal, lessonVoices, language))
          .then(audio => {
            if (useCache && cached?.failure) throw cached.failure.cause;
            return audio ?? synthesizeCloudSpeech(normalizedText, audioRequest.signal, lessonVoices, language);
          })
          .then(audio => playAudioBlob(audio, finishAudio, audioRequest.signal));
    const playFallbackTts = async () => {
      const routing = await getVoiceRouting();
      if (!current || audioRequest.signal.aborted) return false;
      if (routing.tts === "private") {
        const fallback = () => {
          markPrivateTtsFailed();
          return playCloudTts(false);
        };
        try {
          return await playPrivateSpeech(normalizedText, finishAudio, audioRequest.signal, () => {
            if (!current || audioRequest.signal.aborted) return;
            void fallback().catch(() => {
              if (!current) return;
              setFailure(tr("课程语音暂时不可用，旁白仍会显示。"));
              finishAudio();
            });
          });
        } catch (error) {
          if (audioRequest.signal.aborted) throw error;
          return fallback();
        }
      }
      if (routing.tts === "cloud") return playCloudTts();
      return (cached?.promise ?? synthesizeSpeech(
            normalizedText,
            audioRequest.signal,
            lessonVoices,
            language,
          ).then((audio) => audio as Blob | null))
          .then((audio) => {
            if (cached?.failure) throw cached.failure.cause;
            return audio ?? synthesizeSpeech(normalizedText, audioRequest.signal, lessonVoices, language);
          })
          .then((audio) => playAudioBlob(
            audio,
            finishAudio,
            audioRequest.signal,
          ));
    };
    const playback = packagedAudio
      ? packagedAudio.then((audio) => {
          if (!audio) {
            return playFallbackTts();
          }
          return nativePackagedAudioAvailable()
            ? playNativeAudioBlob(audio, finishAudio, audioRequest.signal)
            : playAudioBlob(audio, finishAudio, audioRequest.signal);
        })
      : playFallbackTts();

    void playback
      .then((started) => {
        if (!current || audioRequest.signal.aborted) return;
        setFailure(null);
        setPreparing(false);
        if (started) {
          callbacksRef.current.onSpeakingChange?.(true);
          setStartedKey(currentKey);
          if (narrationId) callbacksRef.current.onPlaybackStart?.(narrationId);
          return;
        }
        if (!started && current) {
          setStartedKey(null);
          callbacksRef.current.onSpeakingChange?.(false);
          setFailure(tr("当前设备无法播放课程语音，旁白仍会显示。"));
          completePlayback("failed");
        }
      })
      .catch((cause: unknown) => {
        if (
          !current ||
          audioRequest.signal.aborted ||
          (cause instanceof DOMException && cause.name === "AbortError")
        ) {
          return;
        }
        setPreparing(false);
        setStartedKey(null);
        callbacksRef.current.onSpeakingChange?.(false);
        setFailure(narrationFailure(cause));
        completePlayback("failed");
      });

    return () => {
      window.removeEventListener("octos:client-services-reset", invalidate);
      window.removeEventListener("octos:client-service-changed", configChanged);
      reportEnd("cancelled");
      current = false;
      request.abort();
      if (cached) cached.controller.abort();
      callbacksRef.current.onSpeakingChange?.(false);
      stopAudio();
      stopNativeTts();
    };
  }, [
    enabled,
    narrationId,
    normalizedText,
    currentKey,
    lessonVoices,
    playing,
    resolveAudio,
    voicePending,
    language,
  ]);

  useEffect(() => {
    const existing = prefetchedSpeechRef.current;
    const nativeExisting = nativePrefetchRef.current;
    if (resolveAudio || !enabled || !prefetchEnabled) {
      if ((resolveAudio || !enabled || !prefetchEnabled) && existing && !existing.claimed) {
        existing.controller.abort();
        prefetchedSpeechRef.current = null;
      }
      if ((resolveAudio || !enabled || !prefetchEnabled) && nativeExisting) {
        nativeExisting.cancel();
        nativePrefetchRef.current = null;
      }
      return;
    }
    // Nothing is prewarmed in a voice that may turn out to be the wrong one.
    if (voicePending) return;
    const currentHasStarted = Boolean(currentKey && startedKey === currentKey);
    const candidateKey = currentHasStarted ? upcomingKey : prewarmKey;
    const candidateText = currentHasStarted
      ? normalizedUpcomingText
      : normalizedPrewarmText;
    const candidateVoices = currentHasStarted ? nextVoices : warmVoices;
    const candidateLanguage = (currentHasStarted ? upcomingLanguage : prewarmLanguage) ?? language;
    if (!candidateKey || !candidateText) return;
    // The playback effect above claims a web prefetch before this effect runs.
    // Do not immediately recreate the same request while audio startup is
    // still pending (and before `startedKey` can be published).
    if (playing && candidateKey === currentKey) return;
    if (peekVoiceRouting()?.tts === "cloud" && nativeTtsAvailable()) {
      if (nativeExisting?.key === candidateKey) return;
      nativeExisting?.cancel();
      const controller = new AbortController();
      const cancelNative = prefetchNativeTts(
        candidateText,
        controller.signal,
      );
      nativePrefetchRef.current = cancelNative
        ? {
            key: candidateKey,
            cancel: () => {
              controller.abort();
              cancelNative();
            },
          }
        : null;
      return;
    }
    if (existing?.key === candidateKey) return;
    if (existing && !existing.claimed) existing.controller.abort();

    const controller = new AbortController();
    const entry: PrefetchedSpeech = {
      key: candidateKey,
      controller,
      claimed: false,
      failure: null,
      promise: getVoiceRouting().then(routing => {
        if (controller.signal.aborted || routing.tts === "private"
          || (routing.tts === "cloud" && nativeTtsAvailable())) return null;
        return routing.tts === "cloud"
          ? synthesizeCloudSpeech(candidateText, controller.signal, candidateVoices, candidateLanguage)
          : synthesizeSpeech(candidateText, controller.signal, candidateVoices, candidateLanguage);
      })
        .then((audio) => audio)
        .catch(cause => { entry.failure = { cause }; return null; }),
    };
    prefetchedSpeechRef.current = entry;
  }, [
    currentKey,
    enabled,
    nextVoices,
    warmVoices,
    normalizedPrewarmText,
    normalizedUpcomingText,
    prefetchEnabled,
    prewarmKey,
    playing,
    startedKey,
    upcomingKey,
    resolveAudio,
    voicePending,
    language,
    upcomingLanguage,
    prewarmLanguage,
  ]);

  useEffect(() => () => {
    const pending = prefetchedSpeechRef.current;
    if (pending && !pending.claimed) pending.controller.abort();
    prefetchedSpeechRef.current = null;
    nativePrefetchRef.current?.cancel();
    nativePrefetchRef.current = null;
  }, []);

  return {
    error: enabled ? failure : null,
    preparing,
  };
}
