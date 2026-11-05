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

function cameraHook(clock: () => number) {
  const hook = renderHook(() => useTakeCamera(clock));
  (hook.result.current.video as { current: unknown }).current = document.createElement("video");
  return hook;
}

it("shows the character following the learner live once the camera is on, before any take", () => {
  let now = 5_000;
  const { result } = cameraHook(() => now);
  // Neutral before the camera sees a face.
  expect(result.current.frame(0).tracked).toBe(false);
  const started = fake.started;
  act(() => result.current.open());
  act(() => result.current.open());
  expect(fake.started).toBe(started + 1);
  expect(result.current.state).toBe("starting");
  const callbacks = fake.callbacks.at(-1)!;
  act(() => { callbacks.onState("tracking"); });
  for (const [at, yaw] of [[5_100, .2], [5_400, .6]] as const) { now = at; act(() => callbacks.onFrame(face(yaw), 5, 10)); }
  expect(result.current.frame(now).tracked).toBe(true);
  expect(result.current.frame(now).rotation[1]).toBeGreaterThan(.1);
  // Nothing was recorded without a take.
  expect(result.current.end()).toBeNull();
  act(() => result.current.close());
  expect(result.current.state).toBe("off");
  expect(result.current.frame(now).tracked).toBe(false);
});

it("records smoothed face parameters on the take's clock, relative to the pose the take started in, and stays on after", () => {
  let now = 10_000;
  const { result } = cameraHook(() => now);
  act(() => result.current.open());
  const callbacks = fake.callbacks.at(-1)!;
  act(() => { callbacks.onState("tracking"); });
  // Before the take, the learner looks elsewhere; the take recalibrates.
  act(() => callbacks.onFrame(face(-.4), 5, 10));
  act(() => result.current.begin(10_000));
  const opened = fake.callbacks.length;
  // The learner starts slightly turned; that is their neutral.
  for (const [at, yaw] of [[10_100, .3], [10_200, .3], [10_600, .5]] as const) { now = at; act(() => callbacks.onFrame(face(yaw), 5, 10)); }
  now = 11_000;
  let track: ReturnType<typeof result.current.end> = null;
  act(() => { track = result.current.end(); });
  expect(fake.callbacks.length).toBe(opened);
  expect(result.current.state).toBe("tracking");
  expect(track!.durationMs).toBe(1000);
  expect(track!.frames.map((frame) => frame.timeMs)).toEqual([100, 200, 600]);
  expect(track!.frames[0]!.rotation[1]).toBeCloseTo(0, 5);
  expect(track!.frames[2]!.rotation[1]).toBeGreaterThan(.1);
  // Frames after the take keep the character moving but are not recorded.
  act(() => callbacks.onFrame(face(.9), 5, 10));
  expect(result.current.end()).toBeNull();
  // A late frame from a closed camera is ignored.
  act(() => result.current.close());
  act(() => callbacks.onFrame(face(.9), 5, 10));
  expect(result.current.frame(now).tracked).toBe(false);
});

it("returns nothing when no face was seen or the take was dropped, and lets a camera that could not start try again", () => {
  const { result } = cameraHook(() => 0);
  act(() => result.current.begin(0));
  act(() => fake.callbacks.at(-1)!.onError("permission_denied"));
  expect(result.current.state).toBe("failed"); expect(result.current.error).toBe("permission_denied");
  expect(result.current.end()).toBeNull();
  // Turning it on again retries.
  const tries = fake.callbacks.length;
  act(() => result.current.begin(0));
  expect(fake.callbacks.length).toBe(tries + 1);
  act(() => fake.callbacks.at(-1)!.onFrame(face(0, false), 5, 10));
  expect(result.current.end()).toBeNull();
  act(() => result.current.begin(0));
  act(() => fake.callbacks.at(-1)!.onFrame(face(.1), 5, 10));
  act(() => result.current.abort());
  expect(result.current.end()).toBeNull();
});
