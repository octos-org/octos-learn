import { describe, expect, it } from "vitest";
import { LESSON_PERFORMANCE_SCHEMA, PERFORMANCE_CHANNELS, parseLessonPerformance, performanceFrame, presenterFrame, retimePerformance } from "./lesson-performance";
import { lipSyncFrame, LIP_SYNC_SCHEMA } from "./lip-sync";
import { AVATAR_TRACK_SCHEMA, type AvatarTrack } from "./performance-track";
import type { FaceFrame } from "./face-frame";

const audio = { sha256: "a".repeat(64), durationMs: 2000 };
const frame = (timeMs: number, blink: number, yaw: number, extra: FaceFrame["channels"] = {}): FaceFrame =>
  ({ timeMs, source: "mediapipe", tracked: true, channels: { eyeBlinkLeft: blink, jawOpen: .9, mouthPucker: .5, mouthSmileLeft: .4, ...extra }, rotation: [0, yaw, 0] });
// A 4 s take: silence, then speech from 1 s to 3 s with the head turning from 0 to 0.4.
const take: AvatarTrack = { schema: AVATAR_TRACK_SCHEMA, durationMs: 4000, frames: [frame(0, 0, 0), frame(1000, 0, 0), frame(2000, 1, .2), frame(3000, 0, .4), frame(4000, 0, .4)] };

describe("camera performance re-timed onto the final narration", () => {
  it("maps the take's speech span onto the whole clip and keeps only expression and head", () => {
    const track = retimePerformance(take, [1000, 3000], audio);
    expect(track.schema).toBe(LESSON_PERFORMANCE_SCHEMA);
    expect(track.keys[0]!.timeMs).toBe(0); expect(track.keys.at(-1)!.timeMs).toBe(2000); expect(track.keys).toHaveLength(41);
    // Speech start → clip start; speech middle (the blink) → clip middle; speech end → clip end.
    expect(performanceFrame(track, 0, true).rotation[1]).toBeCloseTo(0, 3);
    expect(performanceFrame(track, 1000, true).channels.eyeBlinkLeft).toBeCloseTo(1, 3);
    expect(performanceFrame(track, 2000, true).rotation[1]).toBeCloseTo(.4, 3);
    // The learner's own articulation never reaches the lesson; the smile does.
    for (const key of track.keys) { expect(key.channels.jawOpen).toBeUndefined(); expect(key.channels.mouthPucker).toBeUndefined(); }
    expect(track.keys[5]!.channels.mouthSmileLeft).toBe(.4);
    expect(PERFORMANCE_CHANNELS).toContain("browInnerUp"); expect(PERFORMANCE_CHANNELS).not.toContain("jawOpen");
  });

  it("combines with the final-audio mouth and returns to neutral without a clock", () => {
    const track = retimePerformance(take, [1000, 3000], audio);
    const mouth = lipSyncFrame({ schema: LIP_SYNC_SCHEMA, audioSha256: audio.sha256, durationMs: 2000, method: "envelope-v1",
      keys: [{ timeMs: 0, channels: { jawOpen: .5 } }, { timeMs: 2000, channels: { jawOpen: .5 } }] }, 1000, true);
    const combined = presenterFrame(performanceFrame(track, 1000, true), mouth);
    expect(combined.channels.jawOpen).toBeCloseTo(.5); expect(combined.channels.eyeBlinkLeft).toBeCloseTo(1, 3);
    expect(performanceFrame(track, 1000, false)).toMatchObject({ channels: {}, rotation: [0, 0, 0] });
    expect(performanceFrame(null, 1000, true).channels).toEqual({});
  });

  it("round-trips through the strict reader and refuses tampering", () => {
    const track = retimePerformance(take, [1000, 3000], audio);
    expect(parseLessonPerformance(JSON.parse(JSON.stringify(track)), { audioSha256: audio.sha256, durationMs: 2000 })).toEqual(track);
    const edit = (change: (value: Record<string, unknown> & { keys: Array<Record<string, unknown>> }) => void) => { const copy = structuredClone(track) as never; change(copy); return copy; };
    expect(() => parseLessonPerformance(track, { audioSha256: "b".repeat(64), durationMs: 2000 })).toThrow("performance_audio_mismatch");
    expect(() => parseLessonPerformance(edit((v) => { (v.keys[3]!.channels as Record<string, number>).jawOpen = .5; }), { audioSha256: audio.sha256, durationMs: 2000 })).toThrow("invalid_performance");
    expect(() => parseLessonPerformance(edit((v) => { v.keys[3]!.rotation = [0, 2, 0]; }), { audioSha256: audio.sha256, durationMs: 2000 })).toThrow("invalid_performance");
    expect(() => parseLessonPerformance(edit((v) => { v.keys[3]!.image = "data:"; }), { audioSha256: audio.sha256, durationMs: 2000 })).toThrow("invalid_performance");
    expect(() => parseLessonPerformance(edit((v) => { v.keys.reverse(); }), { audioSha256: audio.sha256, durationMs: 2000 })).toThrow("invalid_performance");
    expect(() => parseLessonPerformance(track, { audioSha256: audio.sha256, durationMs: 2500 })).toThrow("invalid_performance");
  });

  it("handles a take without detected speech and a clip longer than the take", () => {
    const track = retimePerformance(take, undefined, { ...audio, durationMs: 8000 });
    expect(track.keys.at(-1)!.timeMs).toBe(8000);
    expect(performanceFrame(track, 8000, true).rotation[1]).toBeCloseTo(.4, 3);
    expect(() => retimePerformance(take, [0, 4000], { ...audio, durationMs: 61_000 })).toThrow("invalid_performance_audio");
  });
});
