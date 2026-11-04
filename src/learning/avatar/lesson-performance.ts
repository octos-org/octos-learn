// The learner's camera performance for one card, re-timed onto the card's
// final narration audio. The take was spoken by the learner; the lesson is
// narrated by a synthetic voice with different timing, so the take's speech
// span is mapped onto the whole clip and resampled at a fixed rate. Only
// expression and head parameters are kept: jaw and lip shapes come from the
// final audio (lip-sync.ts), never from the learner's own speech, and no
// camera image is ever part of this data.

import { FACE_CHANNELS, normalizeFaceFrame, type FaceChannel, type FaceFrame } from "./face-frame";
import { sampleAvatarTrack, type AvatarTrack } from "./performance-track";

export const LESSON_PERFORMANCE_SCHEMA = "octos.avatar-lesson-performance.v1";
/** Expression channels: eyes, brows, cheeks, nose, and smile/frown at the mouth corners. Articulation stays with the audio. */
export const PERFORMANCE_CHANNELS: readonly FaceChannel[] = FACE_CHANNELS.filter((key) => !/^(jaw|tongue|mouth)/.test(key)
  || /^mouth(Smile|Frown)(Left|Right)$/.test(key));
export const PERFORMANCE_STEP_MS = 50;
export const MAX_PERFORMANCE_MS = 60_000;
const MAX_KEYS = MAX_PERFORMANCE_MS / PERFORMANCE_STEP_MS + 2;
const ROTATION_LIMIT = 1.25;

export interface PerformanceKey { timeMs: number; channels: Partial<Record<FaceChannel, number>>; rotation: [number, number, number] }
export interface LessonPerformanceTrack {
  schema: typeof LESSON_PERFORMANCE_SCHEMA;
  /** The final narration this performance was re-timed onto. */
  audioSha256: string;
  durationMs: number;
  keys: PerformanceKey[];
}

const round = (value: number, places: number) => Number(value.toFixed(places));

/**
 * Maps the take's speech span onto the final clip: audio time 0 is the start
 * of the learner's speech and the clip's end is its end. Frames before the
 * first or after the last recorded one hold their value.
 */
export function retimePerformance(track: AvatarTrack, speechSpanMs: [number, number] | undefined, audio: { sha256: string; durationMs: number }): LessonPerformanceTrack {
  if (!track.frames.length) throw new Error("empty_performance");
  if (!/^[a-f0-9]{64}$/.test(audio.sha256) || !Number.isFinite(audio.durationMs) || audio.durationMs <= 0 || audio.durationMs > MAX_PERFORMANCE_MS) throw new Error("invalid_performance_audio");
  const [rawStart, rawEnd] = speechSpanMs ?? [0, track.durationMs];
  const start = Math.max(0, Math.min(rawStart, track.durationMs));
  const end = Math.max(start + 1, Math.min(Math.max(rawEnd, start + 1), Math.max(track.durationMs, start + 1)));
  const keys: PerformanceKey[] = [];
  const times: number[] = [];
  for (let time = 0; time < audio.durationMs; time += PERFORMANCE_STEP_MS) times.push(time);
  times.push(audio.durationMs);
  for (const timeMs of times) {
    const frame = sampleAvatarTrack(track, start + (end - start) * timeMs / audio.durationMs);
    const channels: PerformanceKey["channels"] = {};
    for (const key of PERFORMANCE_CHANNELS) {
      const value = frame.channels[key];
      if (value !== undefined && value >= .0005) channels[key] = round(value, 3);
    }
    keys.push({ timeMs: round(timeMs, 1), channels, rotation: frame.rotation.map((value) => round(Math.max(-ROTATION_LIMIT, Math.min(ROTATION_LIMIT, value)), 4)) as PerformanceKey["rotation"] });
  }
  return { schema: LESSON_PERFORMANCE_SCHEMA, audioSha256: audio.sha256, durationMs: audio.durationMs, keys };
}

/** Strict reading: the same rules as the account service (services/learner-lessons/package-check.mjs). */
export function parseLessonPerformance(raw: unknown, expected: { audioSha256: string; durationMs: number }): LessonPerformanceTrack {
  const bad = (): never => { throw new Error("invalid_performance"); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad();
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join() !== "audioSha256,durationMs,keys,schema" || value.schema !== LESSON_PERFORMANCE_SCHEMA) return bad();
  if (value.audioSha256 !== expected.audioSha256) throw new Error("performance_audio_mismatch");
  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs <= 0 || value.durationMs > MAX_PERFORMANCE_MS
    || Math.abs(value.durationMs - expected.durationMs) > 50 || !Array.isArray(value.keys) || value.keys.length < 2 || value.keys.length > MAX_KEYS) return bad();
  const durationMs = value.durationMs;
  let previous = -1;
  const keys = value.keys.map((rawKey): PerformanceKey => {
    if (!rawKey || typeof rawKey !== "object" || Array.isArray(rawKey)) return bad();
    const key = rawKey as Record<string, unknown>;
    if (Object.keys(key).sort().join() !== "channels,rotation,timeMs" || typeof key.timeMs !== "number" || !Number.isFinite(key.timeMs)
      || key.timeMs <= previous || key.timeMs < 0 || key.timeMs > durationMs || !key.channels || typeof key.channels !== "object" || Array.isArray(key.channels)
      || !Array.isArray(key.rotation) || key.rotation.length !== 3
      || !key.rotation.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= ROTATION_LIMIT)) return bad();
    const channels = key.channels as Record<string, unknown>;
    if (Object.entries(channels).some(([name, weight]) => !PERFORMANCE_CHANNELS.includes(name as FaceChannel)
      || typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1)) return bad();
    previous = key.timeMs;
    return { timeMs: key.timeMs, channels: { ...channels } as PerformanceKey["channels"], rotation: [...key.rotation] as PerformanceKey["rotation"] };
  });
  if (keys[0]!.timeMs !== 0 || keys.at(-1)!.timeMs !== durationMs) return bad();
  return { schema: LESSON_PERFORMANCE_SCHEMA, audioSha256: value.audioSha256, durationMs, keys };
}

/** Samples the media position, like lipSyncFrame; no state, so pause and seek need nothing extra. */
export function performanceFrame(track: LessonPerformanceTrack | null, timeMs: number, available: boolean): FaceFrame {
  if (!track || !available || !Number.isFinite(timeMs) || timeMs < 0 || timeMs > track.durationMs) {
    return normalizeFaceFrame({ timeMs: Math.max(0, timeMs || 0), source: "demo", tracked: true, channels: {} });
  }
  let low = 0, high = track.keys.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (track.keys[mid]!.timeMs <= timeMs) low = mid; else high = mid - 1; }
  const before = track.keys[low]!, after = track.keys[low + 1] ?? before;
  const mix = after.timeMs === before.timeMs ? 0 : (timeMs - before.timeMs) / (after.timeMs - before.timeMs);
  const channels = Object.fromEntries(PERFORMANCE_CHANNELS.flatMap((key) => before.channels[key] === undefined && after.channels[key] === undefined ? []
    : [[key, (before.channels[key] ?? 0) * (1 - mix) + (after.channels[key] ?? 0) * mix]]));
  return normalizeFaceFrame({ timeMs, source: "demo", tracked: true, channels,
    rotation: before.rotation.map((value, index) => value * (1 - mix) + after.rotation[index]! * mix) });
}

/** The presenter's frame: expression and head from the performance, articulation from the final audio. */
export function presenterFrame(performance: FaceFrame, mouth: FaceFrame): FaceFrame {
  return { ...performance, channels: { ...performance.channels, ...mouth.channels } };
}
