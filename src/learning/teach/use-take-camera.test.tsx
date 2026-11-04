import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { CaptureCallbacks } from "../avatar/face-capture";
import type { FaceFrame } from "../avatar/face-frame";

const fake = vi.hoisted(() => ({ callbacks: [] as CaptureCallbacks[], started: 0, stopped: 0 }));
vi.mock("../avatar/face-capture", () => ({
  FaceCapture: class { constructor(_video: unknown, callbacks: CaptureCallbacks) { fake.callbacks.push(callbacks); }
    async start() { fake.started++; } stop() { fake.stopped++; } },
}));
import { useTakeCamera } from "./use-take-camera";

const face = (yaw: number, tracked = true): FaceFrame => ({ timeMs: 0, source: "mediapipe", tracked, channels: { eyeBlinkLeft: .2 }, rotation: [0, yaw, 0] });

it("records smoothed face parameters on the take's clock, relative to the pose the take started in", () => {
  let now = 10_000;
  const { result } = renderHook(() => useTakeCamera(() => now));
  (result.current.video as { current: unknown }).current = document.createElement("video");
  act(() => result.current.start(10_000));
  expect(fake.started).toBe(1);
  const callbacks = fake.callbacks.at(-1)!;
  act(() => { callbacks.onState("tracking"); });
  expect(result.current.state).toBe("tracking");
  // The learner starts slightly turned; that is their neutral.
  for (const [at, yaw] of [[10_100, .3], [10_200, .3], [10_600, .5]] as const) { now = at; act(() => callbacks.onFrame(face(yaw), 5, 10)); }
  now = 11_000;
  let track: ReturnType<typeof result.current.stop> = null;
  act(() => { track = result.current.stop(); });
  expect(fake.stopped).toBeGreaterThan(0); expect(result.current.state).toBe("off");
  expect(track!.durationMs).toBe(1000);
  expect(track!.frames.map((frame) => frame.timeMs)).toEqual([100, 200, 600]);
  expect(track!.frames[0]!.rotation[1]).toBeCloseTo(0, 5);
  expect(track!.frames[2]!.rotation[1]).toBeGreaterThan(.1);
  // A late frame from the stopped camera is ignored.
  act(() => callbacks.onFrame(face(.9), 5, 10));
  expect(result.current.stop()).toBeNull();
});

it("returns nothing when no face was seen, and reports a camera that cannot start", () => {
  const { result } = renderHook(() => useTakeCamera(() => 0));
  (result.current.video as { current: unknown }).current = document.createElement("video");
  act(() => result.current.start(0));
  const callbacks = fake.callbacks.at(-1)!;
  act(() => callbacks.onError("permission_denied"));
  expect(result.current.state).toBe("failed"); expect(result.current.error).toBe("permission_denied");
  expect(result.current.stop()).toBeNull();
  act(() => result.current.start(0));
  act(() => fake.callbacks.at(-1)!.onFrame(face(0, false), 5, 10));
  expect(result.current.stop()).toBeNull();
});
