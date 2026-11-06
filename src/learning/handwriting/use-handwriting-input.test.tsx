import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useHandwritingInput } from "./use-handwriting-input";
import type { BoardHandwritingInput } from "./board-handwriting-input";
import type { HandwritingCaptureCallbacks } from "./handwriting-capture";
import type { InkRuntime } from "../oll/oll-ink-runtime";
import { makeHandwritingLandmarks } from "./simulated-trajectory";

const { captures, resize } = vi.hoisted(() => ({
  captures: [] as Array<{ callbacks: HandwritingCaptureCallbacks; stop: ReturnType<typeof vi.fn> }>,
  resize: { callback: null as (() => void) | null },
}));
vi.mock("./handwriting-capture", () => ({ HandwritingCapture: class {
  constructor(_video: HTMLVideoElement, callbacks: HandwritingCaptureCallbacks) { captures.push({ callbacks, stop: this.stop }); }
  stop = vi.fn();
  async start() { captures.at(-1)!.callbacks.onState("lost"); }
} }));
beforeEach(() => {
  captures.length = 0;
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId!; }
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize.callback = callback; }
    observe() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

function setup(enabled = true) {
  const viewport = document.createElement("div"); document.body.append(viewport);
  Object.defineProperty(viewport, "clientWidth", { value: 800 }); Object.defineProperty(viewport, "clientHeight", { value: 600 });
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 } as DOMRect);
  const ink = { state: { mode: "navigate" }, setMode: vi.fn((mode: string) => { ink.state.mode = mode; }), saveNow: vi.fn(async () => null) };
  const ownerRef = { current: null as BoardHandwritingInput | null };
  const props = { viewportRef: { current: viewport }, inputRef: ownerRef, inkRef: { current: ink as unknown as InkRuntime }, enabled, ready: true, playing: false, sessionId: "first" };
  const hook = renderHook(useHandwritingInput, { initialProps: props });
  const video = document.createElement("video");
  Object.assign(hook.result.current.videoRef, { current: video });
  const feed = (timeMs: number, drawing: boolean) => act(() => captures.at(-1)!.callbacks.onFrame({
    timeMs, tracked: true, confidence: 1, landmarks: makeHandwritingLandmarks({ x: 0.4, y: 0.4 }, 0.75, "grip", drawing), processingMs: 1, pipelineMs: 1,
  }));
  const start = async () => { await act(async () => { hook.result.current.start(); }); };
  const begin = async () => { await start(); [0, 33, 66, 99].forEach(t => feed(t, false)); [132, 165, 198, 231].forEach(t => feed(t, true)); };
  return { ...hook, props, viewport, ink, ownerRef, start, begin, feed };
}

it("flushes and releases the old session, resets its UI, and rejects old callbacks", async () => {
  const s = setup(); await s.begin(); expect(s.result.current.state.gesture?.penDown).toBe(true);
  const old = captures[0]!;
  s.rerender({ ...s.props, sessionId: "second" });
  expect(old.stop).toHaveBeenCalled(); expect(s.ink.saveNow).toHaveBeenCalled();
  expect(s.result.current.state.status).toBe("off");
  act(() => old.callbacks.onError("model_failed")); expect(s.result.current.state.status).toBe("off");
});

it("ends synthetic ink before a real pointer reaches the board", async () => {
  const s = setup(); const types: string[] = [];
  s.viewport.addEventListener("pointerup", () => types.push("gesture up"));
  s.viewport.addEventListener("pointerdown", event => { if ((event as PointerEvent).pointerId === 1) types.push("real down"); });
  await s.begin();
  act(() => s.viewport.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, bubbles: true })));
  expect(types).toEqual(["gesture up", "real down"]); expect(s.result.current.state.reason).toBe("direct");
});

it("pauses on resizing and playback, then requires explicit restart", async () => {
  const s = setup(); await s.begin(); act(() => resize.callback?.());
  expect(s.result.current.state).toMatchObject({ status: "paused", reason: "view" });
  await s.start(); expect(s.result.current.state.status).toBe("active");
  s.rerender({ ...s.props, playing: true });
  expect(s.result.current.state).toMatchObject({ status: "paused", reason: "playback" });
  s.rerender({ ...s.props, playing: false }); expect(s.result.current.state.status).toBe("paused");
});

it("does not install a camera input when the experimental feature is off", () => {
  const s = setup(false); expect(s.ownerRef.current).toBeNull(); s.result.current.start(); expect(captures).toHaveLength(0);
});

it("flushes an active stroke when disabled and requires an explicit camera start when re-enabled", async () => {
  const s = setup(); await s.begin();
  expect(s.result.current.state.gesture?.penDown).toBe(true);
  const capture = captures[0]!;
  s.rerender({ ...s.props, enabled: false });
  expect(capture.stop).toHaveBeenCalled();
  expect(s.ink.saveNow).toHaveBeenCalled();
  expect(s.ownerRef.current).toBeNull();
  s.rerender(s.props);
  expect(s.result.current.state.status).toBe("off");
  expect(captures).toHaveLength(1);
  await s.start();
  expect(captures).toHaveLength(2);
});
