import { useEffect, useRef, useState } from "react";
import { synthesizeSpeech, synthesizeCloudSpeech } from "@/api/voice";
import { getVoiceRouting, markPrivateTtsFailed, peekVoiceRouting } from "@/api/voice-routing";
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
  enabled: boolean;
  playing: boolean;
  text: string;
  narrationId?: string;
  prefetchEnabled?: boolean;
  prewarmText?: string;
  prewarmNarrationId?: string;
  upcomingText?: string;
  upcomingNarrationId?: string;
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
}

function speechKey(narrationId: string | undefined, text: string): string | null {
  return narrationId && text ? `${narrationId}\u0000${text}` : null;
}

/**
 * Plays the Runtime's current narration through the profile's system TTS.
 *
 * The hook knows nothing about the learner's input mode. Text and voice input
 * therefore share this exact synthesis, cancellation, and playback path.
 */
export function useOllNarrationTts({
  enabled,
  playing,
  text,
  narrationId,
  prefetchEnabled = false,
  prewarmText = "",
  prewarmNarrationId,
  upcomingText = "",
  upcomingNarrationId,
  resolveAudio,
  onSpeakingChange,
  onPlaybackStart,
  onPlaybackComplete,
}: OllNarrationTtsOptions): OllNarrationTtsState {
  const normalizedText = text.trim();
  const normalizedPrewarmText = prewarmText.trim();
  const normalizedUpcomingText = upcomingText.trim();
  const currentKey = speechKey(narrationId, normalizedText);
  const prewarmKey = speechKey(prewarmNarrationId, normalizedPrewarmText);
  const upcomingKey = speechKey(upcomingNarrationId, normalizedUpcomingText);
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
  });

  useEffect(() => {
    callbacksRef.current = {
      onSpeakingChange,
      onPlaybackStart,
      onPlaybackComplete,
    };
  }, [onPlaybackComplete, onPlaybackStart, onSpeakingChange]);

  useEffect(() => {
    const request = new AbortController();
    let current = true;
    let completed = false;
    const completePlayback = () => {
      if (!current || completed || !narrationId) return;
      completed = true;
      callbacksRef.current.onPlaybackComplete?.(narrationId);
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
      if (!enabled && playing && normalizedText) completePlayback();
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
      completePlayback();
    };
    const playCloudTts = (useCache = true) =>
      nativeTtsAvailable()
        ? playNativeTts(normalizedText, finishAudio, audioRequest.signal)
          .catch((error) => {
            if (audioRequest.signal.aborted) throw error;
            return synthesizeCloudSpeech(normalizedText, audioRequest.signal)
              .then(audio => playAudioBlob(audio, finishAudio, audioRequest.signal));
          })
        : (useCache && cached ? cached.promise : synthesizeCloudSpeech(normalizedText, audioRequest.signal))
          .then(audio => audio ?? synthesizeCloudSpeech(normalizedText, audioRequest.signal))
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
              setFailure("课程语音暂时不可用，旁白仍会显示。");
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
          ).then((audio) => audio as Blob | null))
          .then((audio) =>
            audio ?? synthesizeSpeech(normalizedText, audioRequest.signal)
          )
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
          setFailure("当前设备无法播放课程语音，旁白仍会显示。");
          completePlayback();
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
        setFailure("课程语音暂时不可用，旁白仍会显示。");
        completePlayback();
      });

    return () => {
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
    playing,
    resolveAudio,
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
    const currentHasStarted = Boolean(currentKey && startedKey === currentKey);
    const candidateKey = currentHasStarted ? upcomingKey : prewarmKey;
    const candidateText = currentHasStarted
      ? normalizedUpcomingText
      : normalizedPrewarmText;
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
      promise: getVoiceRouting().then(routing => {
        if (controller.signal.aborted || routing.tts === "private"
          || (routing.tts === "cloud" && nativeTtsAvailable())) return null;
        return routing.tts === "cloud"
          ? synthesizeCloudSpeech(candidateText, controller.signal)
          : synthesizeSpeech(candidateText, controller.signal);
      })
        .then((audio) => audio)
        .catch(() => null),
    };
    prefetchedSpeechRef.current = entry;
  }, [
    currentKey,
    enabled,
    normalizedPrewarmText,
    normalizedUpcomingText,
    prefetchEnabled,
    prewarmKey,
    playing,
    startedKey,
    upcomingKey,
    resolveAudio,
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
