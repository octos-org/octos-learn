import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InkRuntime } from "../oll/oll-ink-runtime";
import type { HandwritingCaptureCallbacks } from "../handwriting/handwriting-capture";
import { useSnapNeat } from "./use-snap-neat";

const mocks = vi.hoisted(() => ({
  captures: [] as Array<{ callbacks: HandwritingCaptureCallbacks; stop: ReturnType<typeof vi.fn> }>,
  micStop: vi.fn(), micStart: vi.fn(), neaten: vi.fn(), sound: null as ((time: number) => void) | null,
}));
vi.mock("../handwriting/handwriting-capture", () => ({ HandwritingCapture: class {
  stop = vi.fn();
  constructor(_video: HTMLVideoElement, callbacks: HandwritingCaptureCallbacks) { mocks.captures.push({ callbacks, stop: this.stop }); }
  async start() { mocks.captures.at(-1)!.callbacks.onState("tracking"); }
} }));
vi.mock("./impulse-capture", () => ({ ImpulseCapture: class { start = mocks.micStart; stop = mocks.micStop; } }));
vi.mock("./snap-neat", () => ({ SNAP_SOUND_THRESHOLD: 0.079, SNAP_HAND_THRESHOLD: 0.35, neatenSelectedInk: mocks.neaten }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.captures.length = 0; mocks.sound = null;
  mocks.micStart.mockImplementation(async (_threshold, _level, sound) => { mocks.sound = sound; return true; });
  mocks.neaten.mockResolvedValue(undefined);
});
afterEach(cleanup);

function setup() {
  const ink = { state: { mode: "select" } } as InkRuntime;
  const props = { inkRef: { current: ink }, sessionId: "first", available: true, playing: false, selected: false, selectionRevision: 0 };
  const hook = renderHook(useSnapNeat, { initialProps: props });
  Object.assign(hook.result.current.videoRef, { current: document.createElement("video") });
  const start = () => act(async () => { await hook.result.current.start(); });
  const select = () => hook.rerender({ ...props, selected: true, selectionRevision: 1 });
  const pose = (timeMs: number) => {
    const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    points[0] = { x: 0.5, y: 0.8 }; points[9] = { x: 0.5, y: 0.5 };
    points[4] = { x: 0.45, y: 0.4 }; points[12] = { x: 0.46, y: 0.4 };
    act(() => mocks.captures.at(-1)!.callbacks.onFrame({ timeMs, tracked: true, landmarks: points, confidence: 1, processingMs: 1, pipelineMs: 1 }));
  };
  return { ...hook, props, start, select, pose };
}

it("asks for audio only after enabling, and opens the snap camera only with a selection", async () => {
  const s = setup(); expect(mocks.micStart).not.toHaveBeenCalled(); expect(mocks.captures).toHaveLength(0);
  await s.start(); expect(mocks.micStart.mock.calls[0][0]).toBe(0.079); expect(mocks.captures).toHaveLength(0);
  s.select(); expect(mocks.captures).toHaveLength(1);
  s.rerender({ ...s.props, selected: false, selectionRevision: 2 }); expect(mocks.captures[0].stop).toHaveBeenCalled();
});
it("requires both modalities and avoids duplicate model requests while working", async () => {
  const s = setup(); await s.start(); s.select();
  act(() => mocks.sound!(500)); expect(mocks.neaten).not.toHaveBeenCalled();
  s.pose(1000); s.pose(1090); expect(mocks.neaten).not.toHaveBeenCalled();
  let finish!: () => void;
  mocks.neaten.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  act(() => mocks.sound!(1100)); expect(mocks.neaten).toHaveBeenCalledOnce(); expect(s.result.current.busy).toBe(true);
  act(() => mocks.sound!(1800)); expect(mocks.neaten).toHaveBeenCalledOnce();
  await act(async () => finish()); expect(s.result.current.notice).toContain("整理好了");
});
it("invalidates an in-flight result and releases devices on a session change", async () => {
  const s = setup(); await s.start(); s.select(); s.pose(1000); s.pose(1090);
  mocks.neaten.mockImplementation(() => new Promise(() => undefined));
  act(() => mocks.sound!(1100));
  const current = mocks.neaten.mock.calls[0][2] as () => boolean;
  expect(current()).toBe(true);
  s.rerender({ ...s.props, selected: true, sessionId: "second", selectionRevision: 1 });
  expect(current()).toBe(false); expect(s.result.current.enabled).toBe(false);
  expect(mocks.micStop).toHaveBeenCalled(); expect(mocks.captures[0].stop).toHaveBeenCalled();
});
it("turns the easter egg off for playback and ignores a stale hand callback", async () => {
  const s = setup(); await s.start(); s.select();
  const old = mocks.captures[0].callbacks;
  s.rerender({ ...s.props, selected: true, playing: true, selectionRevision: 1 });
  expect(s.result.current.enabled).toBe(false);
  act(() => old.onState("tracking")); expect(mocks.neaten).not.toHaveBeenCalled();
});
