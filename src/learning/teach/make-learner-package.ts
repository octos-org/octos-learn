// Making a lesson's package: each card's narration is spoken once in the
// chosen voice with the learner's own speech key, then everything is packed
// and hashed. After this the lesson plays with no speech service at all.

import type { CanonicalEvent } from "octos-lesson-language";
import { narrationDuration } from "octos-lesson-language/web-runtime";

import { synthesizeSpeech } from "@/api/voice";
import type { LessonVoices } from "@/byok/providers";

import type { StoredInkSnapshot } from "./ink-snapshot-store";
import { buildLearnerPackage, lessonNarration, type NarrationClip } from "./learner-package";

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
}) {
  const lines = lessonNarration(input.events);
  const narration: NarrationClip[] = [];
  for (const [index, { beatId, text }] of lines.entries()) {
    input.onProgress(index, lines.length);
    const clip = await synthesizeSpeech(text, input.signal, input.voices, input.language);
    narration.push({ beatId, text, audio: await bytes(clip), durationMs: await audioDuration(clip, text) });
  }
  input.onProgress(lines.length, lines.length);
  return buildLearnerPackage({
    lessonId: input.lessonId, title: input.title, language: input.language, createdAt: new Date().toISOString(),
    events: input.events, snapshots: input.snapshots, narration,
  });
}
