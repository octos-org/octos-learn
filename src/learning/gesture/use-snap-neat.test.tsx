import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InkRuntime } from "../oll/oll-ink-runtime";
import type { HandwritingControllerUpdate } from "../handwriting/handwriting-controller";
import { useSnapNeat } from "./use-snap-neat";

const mocks = vi.hoisted(() => ({
  micStop: vi.fn(), micStart: vi.fn(), neaten: vi.fn(), sound: null as ((time: number) => void) | null,
}));
vi.mock("./impulse-capture", () => ({ ImpulseCapture: class { start = mocks.micStart; stop = mocks.micStop; } }));
vi.mock("./snap-neat", () => ({ SNAP_SOUND_THRESHOLD: 0.079, SNAP_HAND_THRESHOLD: 0.35, neatenSelectedInk: mocks.neaten }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sound = null;
  mocks.micStart.mockImplementation(async (_threshold, _level, sound) => { mocks.sound = sound; return true; });
  mocks.neaten.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); document.body.replaceChildren(); });

function setup() {
  const state = { mode: "select", selected_count: 1, selection_revision: 1 };
  const ink = { state } as InkRuntime;
  const viewport = document.createElement("div");
  document.body.append(viewport);
  const props = { viewportRef: { current: viewport }, inkRef: { current: ink }, sessionId: "first", available: true, selected: true, selectionRevision: 1 };
  const hook = renderHook(useSnapNeat, { initialProps: props });
  const zone = document.createElement("div");
  zone.getBoundingClientRect = () => ({ left: 100, right: 300, top: 50, bottom: 150, width: 200, height: 100 }) as DOMRect;
  Object.assign(hook.result.current.zoneRef, { current: zone });
  const start = () => act(async () => { await hook.result.current.requestMic(); });
  const pose = (timeMs: number, { inside = true, phase = "ready", captured = false }: {
    inside?: boolean; phase?: HandwritingControllerUpdate["phase"]; captured?: boolean;
  } = {}) => {
    const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    points[0] = { x: 0.5, y: 0.8 }; points[9] = { x: 0.5, y: 0.5 };
    points[4] = { x: 0.45, y: 0.4 }; points[12] = { x: 0.46, y: 0.4 };
    let owns = false;
    act(() => {
      owns = hook.result.current.onGesture(
        { timeMs, tracked: true, landmarks: points, confidence: 1, processingMs: 1, pipelineMs: 1 },
        { cursor: { x: inside ? 200 : 400, y: 100 }, phase, penDown: phase === "drawing" } as HandwritingControllerUpdate,
        captured,
      );
    });
    return owns;
  };
  const pointer = (type: string) => act(() => { viewport.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 })); });
  const sound = (time: number) => act(() => mocks.sound!(time));
  return { ...hook, props, start, pose, pointer, sound, state };
}

it("uses a single permission request and listens again on a new selection without a toggle", async () => {
  const s = setup();
  expect(s.result.current.needsMic).toBe(true);
  expect(s.pose(1000)).toBe(true);
  expect(mocks.micStart).not.toHaveBeenCalled();
  await s.start();
  expect(mocks.micStart.mock.calls[0][0]).toBe(0.079);
  s.rerender({ ...s.props, selected: false, selectionRevision: 2 });
  expect(mocks.micStop).toHaveBeenCalled();
  s.state.selection_revision = 3;
  s.rerender({ ...s.props, selectionRevision: 3 });
  s.pose(1200);
  expect(mocks.micStart).toHaveBeenCalledTimes(2);
  await act(async () => undefined);
  expect(s.result.current.needsMic).toBe(false);
});

it("ignores pose and sound outside the target, and only applies a snap aimed at the target", async () => {
  const s = setup(); await s.start();
  expect(s.pose(1000, { inside: false })).toBe(false);
  s.pose(1090, { inside: false }); s.sound(1100);
  expect(mocks.neaten).not.toHaveBeenCalled();
  expect(s.pose(1200)).toBe(true);
  s.pose(1290);
  expect(s.result.current.handReady).toBe(true);
  expect(mocks.neaten).not.toHaveBeenCalled();
  let finish!: () => void;
  mocks.neaten.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  s.sound(1300); s.sound(1330);
  expect(mocks.neaten).toHaveBeenCalledOnce();
  expect(s.result.current.busy).toBe(true);
  await act(async () => finish());
  expect(s.result.current.notice).toContain("整理好了");
});

it("owns a pinch started in the zone after recoil, but leaves a board drag in control", async () => {
  const s = setup(); await s.start();
  expect(s.pose(1000, { captured: true })).toBe(false);
  expect(s.pose(1090, { captured: true })).toBe(false);
  s.sound(1100); expect(mocks.neaten).not.toHaveBeenCalled();
  expect(s.pose(1200, { phase: "pending" })).toBe(true);
  expect(s.pose(1290, { phase: "pending" })).toBe(true);
  expect(s.pose(1310, { inside: false, phase: "drawing" })).toBe(true);
  s.sound(1320);
  expect(mocks.neaten).toHaveBeenCalledOnce();
  expect(s.pose(1350, { inside: false })).toBe(false);
  await act(async () => undefined);
});

it("does not reuse the old target's pose after the selection changes", async () => {
  const s = setup(); await s.start();
  s.pose(1000); s.pose(1090);
  s.state.selection_revision = 2;
  s.sound(1100); // The runtime may have changed before React rerenders.
  expect(mocks.neaten).not.toHaveBeenCalled();
  s.rerender({ ...s.props, selectionRevision: 2 });
  s.pose(1120); s.sound(1130);
  expect(mocks.neaten).not.toHaveBeenCalled();
});

it("waits for a settled selection and invalidates recognition if it is dragged again", async () => {
  const s = setup(); await s.start();
  s.pointer("pointerdown");
  s.pose(1000); s.pose(1090); s.sound(1100);
  expect(mocks.neaten).not.toHaveBeenCalled();
  s.pointer("pointerup");
  s.pose(1150); s.pose(1240);
  mocks.neaten.mockImplementation(() => new Promise(() => undefined));
  s.sound(1250);
  const current = mocks.neaten.mock.calls[0][2] as () => boolean;
  expect(current()).toBe(true);
  s.pointer("pointerdown");
  expect(current()).toBe(false);
});

it("releases the microphone and invalidates an in-flight result when the board becomes unavailable", async () => {
  const s = setup(); await s.start();
  s.pose(1000); s.pose(1090);
  mocks.neaten.mockImplementation(() => new Promise(() => undefined));
  s.sound(1100);
  const current = mocks.neaten.mock.calls[0][2] as () => boolean;
  expect(current()).toBe(true);
  s.rerender({ ...s.props, available: false });
  expect(current()).toBe(false);
  expect(mocks.micStop).toHaveBeenCalled();
  expect(s.pose(1200)).toBe(false);
});
