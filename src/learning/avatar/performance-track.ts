import { FACE_CHANNELS, normalizeFaceFrame, type FaceFrame, type FaceSource } from "./face-frame";

export const AVATAR_TRACK_SCHEMA = "octos.avatar-performance.v1";
export const MAX_TRACK_MS = 60_000;
export const MAX_TRACK_FRAMES = 3601;
export interface AvatarTrack { schema: typeof AVATAR_TRACK_SCHEMA; durationMs: number; frames: FaceFrame[] }

/** Short, in-memory technical recordings; nothing is automatically persisted. */
export class PerformanceRecorder {
  private start: number | null = null;
  private frames: FaceFrame[] = [];
  begin(now: number): void { this.start = now; this.frames = []; }
  get recording(): boolean { return this.start !== null; }
  append(frame: FaceFrame, now: number): boolean {
    if (this.start === null) return false;
    const timeMs = Math.max(0, now - this.start);
    if (timeMs > MAX_TRACK_MS || this.frames.length >= MAX_TRACK_FRAMES) return false;
    const previous = this.frames.at(-1);
    if (previous && timeMs - previous.timeMs < 1000 / 60) return true;
    this.frames.push({ ...structuredClone(frame), timeMs });
    return true;
  }
  finish(now: number): AvatarTrack {
    const durationMs = this.start === null ? 0 : Math.min(MAX_TRACK_MS, Math.max(0, now - this.start));
    this.start = null;
    return { schema: AVATAR_TRACK_SCHEMA, durationMs, frames: structuredClone(this.frames) };
  }
}

export function parseAvatarTrack(raw: unknown): AvatarTrack {
  if (!raw || typeof raw !== "object") throw new Error("invalid_track");
  const value = raw as Record<string, unknown>;
  if (value.schema !== AVATAR_TRACK_SCHEMA || typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs)
    || value.durationMs < 0 || value.durationMs > MAX_TRACK_MS || !Array.isArray(value.frames) || !value.frames.length || value.frames.length > MAX_TRACK_FRAMES) throw new Error("invalid_track");
  let last = -1;
  const frames = value.frames.map((rawFrame) => {
    if (!rawFrame || typeof rawFrame !== "object") throw new Error("invalid_track");
    const frame = rawFrame as Record<string, unknown>;
    if (typeof frame.timeMs !== "number" || !Number.isFinite(frame.timeMs) || frame.timeMs < 0 || frame.timeMs <= last || frame.timeMs > (value.durationMs as number)
      || !["mediapipe", "arkit", "demo"].includes(String(frame.source)) || typeof frame.tracked !== "boolean"
      || !frame.channels || typeof frame.channels !== "object" || Array.isArray(frame.channels)
      || !Array.isArray(frame.rotation) || frame.rotation.length !== 3 || !frame.rotation.every((x) => typeof x === "number" && Number.isFinite(x))) throw new Error("invalid_track");
    const channels = frame.channels as Record<string, unknown>;
    if (Object.keys(channels).some((key) => !FACE_CHANNELS.includes(key as typeof FACE_CHANNELS[number]))
      || Object.values(channels).some((x) => typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1)) throw new Error("invalid_track");
    last = frame.timeMs;
    // A recorded lost-face frame may contain the already-smoothed return to
    // neutral. Keep those display values, while retaining the tracking flag.
    return { ...normalizeFaceFrame({ timeMs: frame.timeMs, source: frame.source as FaceSource, tracked: true,
      channels, rotation: frame.rotation }), tracked: frame.tracked };
  });
  return { schema: AVATAR_TRACK_SCHEMA, durationMs: value.durationMs, frames };
}

/** Random access makes pause/seek deterministic; no accumulated timer drift. */
export function sampleAvatarTrack(track: AvatarTrack, timeMs: number): FaceFrame {
  let low = 0, high = track.frames.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (track.frames[mid]!.timeMs <= timeMs) low = mid; else high = mid - 1; }
  const before = track.frames[low]!;
  const after = track.frames[low + 1];
  if (!after || before.tracked !== after.tracked || before.source !== after.source || timeMs <= before.timeMs) return structuredClone(before);
  const weight = Math.min(1, (timeMs - before.timeMs) / (after.timeMs - before.timeMs));
  const channels = Object.fromEntries(FACE_CHANNELS.flatMap((key) => before.channels[key] === undefined && after.channels[key] === undefined ? []
    : [[key, (before.channels[key] ?? 0) * (1 - weight) + (after.channels[key] ?? 0) * weight]]));
  // The track stores displayed motion, including the smooth decay while lost.
  // Normalizing as untracked here would zero every interpolated lost frame.
  return { ...normalizeFaceFrame({ timeMs, source: before.source, tracked: true, channels,
    rotation: before.rotation.map((v, i) => v * (1 - weight) + after.rotation[i]! * weight) }), tracked: before.tracked };
}

export function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}
