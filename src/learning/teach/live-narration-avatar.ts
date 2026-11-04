// "Watch my lesson" before the lesson is saved: each card's narration is made
// here, the way saving makes it, so the presenter's mouth follows the voice and
// the learner's recorded expressions and head turns are re-timed onto it. The
// next card's clip is made while the current one plays, so cards follow each
// other as quickly as with the narration's own prefetching.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalEvent } from "octos-lesson-language";

import { synthesizeSpeech } from "@/api/voice";
import type { LessonVoices } from "@/byok/providers";
import { retimePerformance, type LessonPerformanceTrack } from "../avatar/lesson-performance";
import type { LipSyncTrack } from "../avatar/lip-sync";
import { preparePreviewAudio } from "../avatar/prepare-preview-audio";
import { lessonNarration } from "./learner-package";
import { bytes, type CardPerformances } from "./make-learner-package";

interface LiveClip { audio: Blob; mouth: LipSyncTrack | null; performance: LessonPerformanceTrack | null }

const keyOf = (beatId: string, text: string) => `${beatId}\u0000${text.trim()}`;

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export function useLiveNarrationAvatar({ enabled, events, voices, language, performances }: {
  /** Whether to make narration here (the lesson has no saved package and has a voice). */
  enabled: boolean;
  events: CanonicalEvent[] | null;
  voices: LessonVoices | null;
  language: string | undefined;
  /** The learner's recorded movement per card, when it is to be shown. */
  performances: () => Promise<CardPerformances>;
}) {
  const lines = useMemo(() => (events ? lessonNarration(events) : []), [events]);
  const clips = useRef(new Map<string, Promise<LiveClip>>());
  const work = useRef(new AbortController());
  const [ready, setReady] = useState<Record<string, LiveClip>>({});
  const performancesRef = useRef(performances);
  useEffect(() => { performancesRef.current = performances; }, [performances]);

  // A changed lesson, voice or language makes new clips.
  useEffect(() => {
    const controller = new AbortController();
    work.current = controller;
    clips.current = new Map();
    setReady({});
    return () => controller.abort();
  }, [lines, voices, language, enabled]);

  const make = useCallback((beatId: string, text: string): Promise<LiveClip> => {
    const key = keyOf(beatId, text);
    const existing = clips.current.get(key);
    if (existing) return existing;
    const { signal } = work.current;
    const map = clips.current;
    const clip = (async (): Promise<LiveClip> => {
      const audio = await synthesizeSpeech(text.trim(), signal, voices, language);
      // The mouth needs the clip itself; a clip it cannot read (or over 60 s) still plays, with a still mouth.
      const mouth = await preparePreviewAudio(new Uint8Array(await bytes(audio)).buffer, signal).catch(() => null);
      const moves = mouth ? (await performancesRef.current().catch(() => ({} as CardPerformances)))[beatId] : undefined;
      const performance = moves && mouth ? retimePerformance(moves.track, moves.speechSpanMs, { sha256: mouth.audioSha256, durationMs: mouth.durationMs }) : null;
      const made = { audio, mouth, performance };
      if (clips.current === map) setReady((current) => ({ ...current, [key]: made }));
      return made;
    })();
    map.set(key, clip);
    // A clip that failed is made again when it is next needed.
    clip.catch(() => { if (map.get(key) === clip) map.delete(key); });
    return clip;
  }, [voices, language]);

  const resolveAudio = useCallback(async (beatId: string, text: string, signal: AbortSignal): Promise<Blob | null> => {
    const clip = make(beatId, text);
    const next = lines[lines.findIndex((line) => line.beatId === beatId) + 1];
    if (next) void clip.then(() => make(next.beatId, next.text)).catch(() => undefined);
    return (await abortable(clip, signal)).audio;
  }, [make, lines]);

  const clipOf = (beatId: string | undefined, text: string) => (beatId ? ready[keyOf(beatId, text)] : undefined);
  return {
    resolveAudio: enabled ? resolveAudio : undefined,
    mouthTrack: (beatId: string | undefined, text: string) => (enabled ? clipOf(beatId, text)?.mouth ?? null : null),
    performanceTrack: (beatId: string | undefined, text: string) => (enabled ? clipOf(beatId, text)?.performance ?? null : null),
  };
}
