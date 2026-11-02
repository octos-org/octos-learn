import { describe, expect, it } from "vitest";
import { FACE_CHANNELS, FaceSmoother, mediaPipeFrame, neutralFrame, normalizeFaceFrame } from "./face-frame";
import { MAX_TRACK_MS, parseAvatarTrack, PerformanceRecorder, percentile, sampleAvatarTrack } from "./performance-track";

const frame = (timeMs: number, value = .5) => normalizeFaceFrame({ timeMs, source: "arkit", tracked: true, channels: { jawOpen: value, eyeBlinkLeft: .2 }, rotation: [0, .3, 0] });

describe("normalized face data", () => {
  it("keeps source capabilities explicit and excludes geometry and unknown channels", () => {
    const value = normalizeFaceFrame({ timeMs: 3, source: "mediapipe", tracked: true, channels: { jawOpen: 2, tongueOut: NaN, _neutral: .8, image: "private" }, rotation: [NaN, 3, -4] });
    expect(value.channels).toEqual({ jawOpen: 1 });
    expect(value.rotation).toEqual([0, 1.25, -1.25]);
    expect(FACE_CHANNELS).toHaveLength(52);
  });
  it("maps detector output by name, not its source-specific array index", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const value = mediaPipeFrame(10, [{ categoryName: "eyeBlinkLeft", score: .8 }, { categoryName: "_neutral", score: 1 }, { categoryName: "jawOpen", score: .1 }], identity);
    expect(value.channels).toEqual({ eyeBlinkLeft: .8, jawOpen: .1 });
    expect(value.rotation.every((x) => Math.abs(x) < 1e-6)).toBe(true);
  });
  it("drops stale expressions when tracking is lost", () => {
    expect(normalizeFaceFrame({ timeMs: 10, source: "mediapipe", tracked: false, channels: { jawOpen: 1 } })).toEqual(neutralFrame(10, "mediapipe"));
  });
  it("settles to neutral after loss, without inventing unsupported channels", () => {
    const smoother = new FaceSmoother();
    smoother.update(frame(0, 1), 0);
    let result = smoother.update(neutralFrame(16), 16);
    expect(result.channels.jawOpen).toBeGreaterThan(0);
    expect(result.channels.tongueOut).toBeUndefined();
    for (let time = 32; time < 2500; time += 16) result = smoother.update(neutralFrame(time), time);
    expect(result.channels.jawOpen).toBeLessThan(.001);
    expect(Math.abs(result.rotation[1])).toBeLessThan(.001);
  });
  it("calibrates neutral head position, and can reset it for another person", () => {
    const smoother = new FaceSmoother(); smoother.calibrate(frame(0, .2));
    expect(smoother.update(frame(1, .2), 1).channels.jawOpen).toBe(0);
    expect(smoother.update(frame(2, .2), 2).rotation[1]).toBe(0);
    smoother.reset(); expect(smoother.update(frame(3, .2), 3).channels.jawOpen).toBeGreaterThan(0);
  });
});

describe("bounded portable performance tracks", () => {
  it("records relative time with deep copies and bounded duration", () => {
    const recorder = new PerformanceRecorder(); recorder.begin(100);
    const input = frame(10, .7); recorder.append(input, 110); input.channels.jawOpen = 0;
    expect(recorder.append(frame(20), 115)).toBe(true);
    expect(recorder.append(frame(30), 100 + MAX_TRACK_MS + 1)).toBe(false);
    const value = recorder.finish(100 + MAX_TRACK_MS + 10);
    expect(value.durationMs).toBe(MAX_TRACK_MS);
    expect(value.frames).toHaveLength(1);
    expect(value.frames[0]!.timeMs).toBe(10);
    expect(value.frames[0]!.channels.jawOpen).toBe(.7);
    expect(recorder.recording).toBe(false);
  });
  it("round-trips an ARKit trace without requiring its capture device", () => {
    const recorder = new PerformanceRecorder(); recorder.begin(0);
    recorder.append(frame(0, 0), 0); recorder.append(frame(100, 1), 100);
    const track = parseAvatarTrack(JSON.parse(JSON.stringify(recorder.finish(100))));
    expect(sampleAvatarTrack(track, 50).channels.jawOpen).toBe(.5);
    expect(sampleAvatarTrack(track, 50)).toEqual(sampleAvatarTrack(track, 50));
    expect(sampleAvatarTrack(track, 999).channels.jawOpen).toBe(1);
  });
  it.each([
    { durationMs: Infinity }, { frames: [] }, { durationMs: MAX_TRACK_MS + 1 },
    { frames: [frame(10), frame(1)] }, { frames: [frame(0), frame(0)] },
    { frames: [{ ...frame(0), channels: { jawOpen: -1 } }] },
    { frames: [{ ...frame(0), channels: { image: "private" } }] },
    { frames: [{ ...frame(0), rotation: [NaN, 0, 0] }] },
    { frames: [{ ...frame(0), source: "unknown" }] },
  ])("rejects invalid/unbounded or non-expression input: %j", (patch) => {
    expect(() => parseAvatarTrack({ schema: "octos.avatar-performance.v1", durationMs: 100, frames: [frame(0)], ...patch })).toThrow("invalid_track");
  });
  it("does not interpolate tracked motion through a missing-face interval", () => {
    const track = parseAvatarTrack({ schema: "octos.avatar-performance.v1", durationMs: 100, frames: [neutralFrame(0), frame(100)] });
    expect(sampleAvatarTrack(track, 50).tracked).toBe(false);
  });
  it("preserves the displayed return-to-neutral motion on a lost-face frame", () => {
    const lost = { ...frame(100, .25), tracked: false };
    const track = parseAvatarTrack({ schema: "octos.avatar-performance.v1", durationMs: 100, frames: [frame(0, 1), lost] });
    expect(sampleAvatarTrack(track, 100).channels.jawOpen).toBe(.25);
    expect(sampleAvatarTrack(track, 100).tracked).toBe(false);
  });
  it("reports a tail percentile rather than an average", () => {
    expect(percentile([...Array(18).fill(1), 40, 60], .95)).toBe(40);
    expect(percentile([], .95)).toBe(0);
  });
});
