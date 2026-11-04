// Making a lesson's package: each card's narration is spoken once in the
// chosen voice with the learner's own speech key, then everything is packed
// and hashed. After this the lesson plays with no speech service at all.

import type { CanonicalEvent } from "octos-lesson-language";
import { narrationDuration } from "octos-lesson-language/web-runtime";

import { synthesizeSpeech } from "@/api/voice";
import type { LessonVoices } from "@/byok/providers";
import { tr } from "@/i18n";

import type { StoredInkSnapshot } from "./ink-snapshot-store";
import { buildLearnerPackage, lessonNarration, type NarrationClip } from "./learner-package";
import { preparePreviewAudio } from "../avatar/prepare-preview-audio";
import { retimePerformance } from "../avatar/lesson-performance";
import type { AvatarTrack } from "../avatar/performance-track";

/** A card's camera performance from its kept take, by the card's narration beat. */
export type CardPerformances = Record<string, { track: AvatarTrack; speechSpanMs?: [number, number] }>;

/** A clip's length from its audio, or a reading-time estimate when the browser cannot tell. */
export function audioDuration(blob: Blob, text: string): Promise<number> {
  return new Promise((resolve) => {
    const estimate = narrationDuration(text);
    if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") { resolve(estimate); return; }
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(value); };
    const timer = setTimeout(() => done(estimate), 5_000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : estimate);
    audio.onerror = () => done(estimate);
    audio.src = url;
  });
}

function bytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the narration"));
    reader.readAsArrayBuffer(blob);
  });
}

export async function makeLearnerPackage(input: {
  lessonId: string;
  title: string;
  language: string;
  events: CanonicalEvent[];
  snapshots: Record<string, StoredInkSnapshot>;
  voices: LessonVoices | null;
  signal: AbortSignal;
  onProgress: (done: number, total: number) => void;
  includeLipSync?: boolean;
  /** Re-timed onto each card's final narration; needs `includeLipSync`. */
  performances?: CardPerformances;
}) {
  const cancelled = () => { if (input.signal.aborted) throw new DOMException("Aborted", "AbortError"); };
  cancelled();
  const lines = lessonNarration(input.events);
  const narration: NarrationClip[] = [];
  for (const [index, { beatId, text }] of lines.entries()) {
    cancelled();
    input.onProgress(index, lines.length);
    const clip = await synthesizeSpeech(text, input.signal, input.voices, input.language);
    cancelled();
    const audio = await bytes(clip);
    let lipSync: NarrationClip["lipSync"];
    if (input.includeLipSync) {
      try { lipSync = await preparePreviewAudio(new Uint8Array(audio).buffer, input.signal); }
      catch (error) {
        cancelled();
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new Error(tr("第 {{v0}} 张卡片未能准备嘴型，请确认配音不超过 60 秒，或先取消保存基础嘴型后重试。", { v0: index + 1 }));
      }
    }
    cancelled();
    const mediaType = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"].includes(clip.type) ? clip.type as NarrationClip["mediaType"] : undefined;
    const moves = lipSync ? input.performances?.[beatId] : undefined;
    const performance = moves && lipSync ? retimePerformance(moves.track, moves.speechSpanMs, { sha256: lipSync.audioSha256, durationMs: lipSync.durationMs }) : undefined;
    narration.push({ beatId, text, audio, mediaType, durationMs: lipSync?.durationMs ?? await audioDuration(clip, text), ...(lipSync ? { lipSync } : {}), ...(performance ? { performance } : {}) });
  }
  cancelled();
  input.onProgress(lines.length, lines.length);
  const result = await buildLearnerPackage({
    lessonId: input.lessonId, title: input.title, language: input.language, createdAt: new Date().toISOString(),
    events: input.events, snapshots: input.snapshots, narration,
  });
  cancelled(); return result;
}
