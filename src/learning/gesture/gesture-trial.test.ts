import { describe, expect, it } from "vitest";
import { GestureTrialTracker, readTrialHand } from "./gesture-trial";
import type { HandLandmark, HandwritingInputFrame } from "../handwriting/handwriting-gesture";

function hand(pose: "middle" | "index" | "open" = "middle"): HandLandmark[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  points[0] = { x: 0.5, y: 0.85 };
  for (const [mcp, x] of [[5, 0.35], [9, 0.45], [13, 0.55], [17, 0.65]]) {
    for (let joint = 0; joint < 4; joint++) points[mcp + joint] = { x, y: 0.6 - joint * 0.12 };
  }
  points[4] = pose === "middle" ? { x: 0.46, y: 0.25 } : pose === "index" ? { x: 0.36, y: 0.25 } : { x: 0.2, y: 0.65 };
  // Keep the other tip well away so index and middle pinches are distinct.
  if (pose === "middle") points[8] = { x: 0.25, y: 0.2 };
  if (pose === "index") points[12] = { x: 0.55, y: 0.2 };
  return points;
}
const frame = (timeMs: number, pose: "middle" | "index" | "open" = "middle"): HandwritingInputFrame => ({
  tracked: true, timeMs, landmarks: hand(pose), imageWidth: 640, imageHeight: 480,
});

describe("hand pose trial", () => {
  it("distinguishes middle pinch, index pinch, and an open hand", () => {
    expect(readTrialHand(frame(0)).pose).toBe("middle-pinch");
    expect(readTrialHand(frame(0, "index")).pose).toBe("index-pinch");
    expect(readTrialHand(frame(0, "open")).pose).toBe("open");
  });
  it("is invariant to hand size and horizontal mirroring", () => {
    const input = frame(0);
    const transformed = { ...input, landmarks: input.landmarks!.map(p => ({ x: 1 - p.x * 0.5, y: p.y * 0.5 })) };
    expect(readTrialHand(transformed).middleGap).toBeCloseTo(readTrialHand(input).middleGap!);
  });
  it("corrects image aspect ratio and rejects invalid or degenerate landmarks", () => {
    const input = frame(0);
    const wide = { ...input, imageWidth: 1280, landmarks: input.landmarks!.map(p => ({ x: p.x / 2, y: p.y })) };
    expect(readTrialHand(wide).middleGap).toBeCloseTo(readTrialHand(input).middleGap!);
    expect(readTrialHand({ ...input, tracked: false }).pose).toBe("lost");
    expect(readTrialHand({ ...input, landmarks: [{ x: NaN, y: 0 }] }).pose).toBe("lost");
    expect(readTrialHand({ ...input, landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 })) }).pose).toBe("lost");
  });
  it("requires a stable pose and counts a held pose only once", () => {
    const trial = new GestureTrialTracker();
    expect(trial.update(frame(0), 0.35).entered).toBe(false);
    expect(trial.update(frame(40), 0.35).ready).toBe(false);
    expect(trial.update(frame(90), 0.35).entered).toBe(true);
    expect(trial.update(frame(120), 0.35).entered).toBe(false);
    trial.update(frame(160, "open"), 0.35);
    expect(trial.update(frame(190), 0.35).ready).toBe(false);
    expect(trial.update(frame(280), 0.35).entered).toBe(true);
  });
  it("matches sound before or after the pose without double counting", () => {
    const trial = new GestureTrialTracker();
    trial.update(frame(0), 0.35); trial.update(frame(90), 0.35);
    expect(trial.sound(150)).toBe(true);
    expect(trial.update(frame(180), 0.35).matched).toBe(false);
    expect(trial.sound(200)).toBe(false);
    trial.reset();
    trial.update(frame(1000), 0.35);
    expect(trial.sound(1050)).toBe(false);
    expect(trial.update(frame(1090), 0.35).matched).toBe(true);
  });
  it("rejects unpaired sounds and old poses, and resets after capture gaps", () => {
    const trial = new GestureTrialTracker();
    expect(trial.sound(0)).toBe(false);
    trial.update(frame(1000), 0.35); trial.update(frame(1090), 0.35);
    expect(trial.sound(1400)).toBe(false);
    expect(trial.update(frame(1500), 0.35).ready).toBe(false);
    trial.reset();
    expect(trial.sound(1510)).toBe(false);
  });
  it("does not replay a sound suppressed during cooldown when the hand stays ready", () => {
    const trial = new GestureTrialTracker();
    trial.update(frame(0), 0.35); trial.update(frame(90), 0.35);
    expect(trial.sound(100)).toBe(true);
    expect(trial.sound(500)).toBe(false);
    for (const time of [200, 300, 400, 500, 600, 700, 800]) {
      expect(trial.update(frame(time), 0.35).matched).toBe(false);
    }
  });
});
