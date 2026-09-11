import { useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "@/api/voice";
import {
  playAudioBlob,
  stopAudio,
} from "@/home/voice/audio-playback";
import {
  nativeTtsAvailable,
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
    const useNativeTts = nativeTtsAvailable();
    const cached = !useNativeTts
      && currentKey && prefetchedSpeechRef.current?.key === currentKey
      ? prefetchedSpeechRef.current
      : null;
    if (cached) {
      cached.claimed = true;
      prefetchedSpeechRef.current = null;
    }
    const audioRequest = cached?.controller ?? request;
    const playback = useNativeTts
      ? playNativeTts(normalizedText, () => {
          if (!current) return;
          callbacksRef.current.onSpeakingChange?.(false);
          completePlayback();
        }, audioRequest.signal)
      : (cached?.promise ?? synthesizeSpeech(
          normalizedText,
          audioRequest.signal,
        ).then((audio) => audio as Blob | null))
        .then((audio) =>
          audio ?? synthesizeSpeech(normalizedText, audioRequest.signal)
        )
        .then((audio) => playAudioBlob(
          audio,
          () => {
            if (!current) return;
            callbacksRef.current.onSpeakingChange?.(false);
            completePlayback();
          },
          audioRequest.signal,
        ));

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
  ]);

  useEffect(() => {
    const existing = prefetchedSpeechRef.current;
    const nativeExisting = nativePrefetchRef.current;
    if (!enabled || !prefetchEnabled) {
      if ((!enabled || !prefetchEnabled) && existing && !existing.claimed) {
        existing.controller.abort();
        prefetchedSpeechRef.current = null;
      }
      if ((!enabled || !prefetchEnabled) && nativeExisting) {
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
    if (nativeTtsAvailable()) {
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
      promise: synthesizeSpeech(candidateText, controller.signal)
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
