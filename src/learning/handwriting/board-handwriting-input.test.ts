import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardHandwritingInput, handwritingPointBlocked, type BoardHandwritingState } from "./board-handwriting-input";
import type { HandwritingCaptureCallbacks } from "./handwriting-capture";
import { makeHandwritingLandmarks } from "./simulated-trajectory";
import type { InkRuntime } from "../oll/oll-ink-runtime";

beforeEach(() => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId!; this.pointerType = init.pointerType!; }
  });
});
afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const viewport = document.createElement("div"); document.body.append(viewport);
  Object.defineProperty(viewport, "clientWidth", { value: 800 }); Object.defineProperty(viewport, "clientHeight", { value: 600 });
  viewport.getBoundingClientRect = () => ({ x: 10, y: 20, left: 10, top: 20, right: 810, bottom: 620, width: 800, height: 600, toJSON() {} });
  const ink = { state: { mode: "navigate", selected_count: 0 }, setMode: vi.fn((mode: string) => { ink.state.mode = mode; }), clearSelection: vi.fn(), saveNow: vi.fn(async () => null) };
  const options = { allowed: true, targetOwnsGesture: false };
  const captures: Array<{ callbacks: HandwritingCaptureCallbacks; stop: ReturnType<typeof vi.fn> }> = [];
  const states: BoardHandwritingState[] = [];
  const visual = vi.fn();
  const input = new BoardHandwritingInput({ viewport, mode: "grip", getInk: () => ink as unknown as InkRuntime, allowed: () => options.allowed,
    routeGesture: () => options.targetOwnsGesture,
    onState: next => states.push(next), onVisual: visual,
    createCapture: (_video, callbacks) => {
      const capture = { callbacks, stop: vi.fn() }; captures.push(capture);
      return { stop: capture.stop, start: async () => { callbacks.onState("lost"); } };
    },
  });
  const events: PointerEvent[] = [];
  for (const type of ["pointerdown", "pointermove", "pointerup"]) viewport.addEventListener(type, event => events.push(event as PointerEvent));
  const feed = (timeMs: number, drawing: boolean, point = { x: 0.4, y: 0.4 }) => captures.at(-1)!.callbacks.onFrame({
    timeMs, tracked: true, confidence: 1, landmarks: makeHandwritingLandmarks(point, 0.75, "grip", drawing), processingMs: 1, pipelineMs: 2,
  });
  const begin = async () => { await input.start(document.createElement("video")); [0, 33, 66, 99].forEach(t => feed(t, false)); [132, 165, 198, 231].forEach(t => feed(t, true)); };
  return { input, captures, states, visual, ink, feed, begin, events, viewport, options };
}
describe("binding camera hand input to the existing whiteboard", () => {
  it("is inert until explicitly started, and does not save or request a camera while unused", () => {
    const s = setup(); expect(s.captures).toHaveLength(0); s.input.dispose(); expect(s.ink.saveNow).not.toHaveBeenCalled();
  });
  it("uses the existing editor, then flushes valid buffered ink before pausing and saving", async () => {
    const s = setup(); await s.begin(); s.feed(264, true, { x: 0.5, y: 0.4 });
    expect(s.events.map(e => e.type)).toEqual(["pointerdown"]);
    s.input.pause("tool");
    expect(s.events.map(e => e.type)).toEqual(["pointerdown", "pointermove", "pointerup"]);
    expect(s.events.at(-1)?.clientX).toBe(s.events.at(-2)?.clientX);
    expect(s.states.at(-1)).toMatchObject({ status: "paused", reason: "tool" });
    expect(s.ink.saveNow).toHaveBeenCalled(); expect(s.captures[0]!.stop).toHaveBeenCalled();
  });
  it("ignores late frames and errors from a prior session after pause and restart", async () => {
    const s = setup(); await s.begin(); const old = s.captures[0]!.callbacks;
    s.input.pause("view"); await s.input.start(document.createElement("video")); const count = s.events.length;
    old.onFrame({ timeMs: 264, tracked: false, confidence: 0, processingMs: 1, pipelineMs: 1 }); old.onError("model_failed");
    expect(s.events).toHaveLength(count); expect(s.states.at(-1)?.status).toBe("active"); s.input.dispose();
  });
  it("ends an active stroke on lesson playback without automatically taking the tool back", async () => {
    const s = setup(); await s.begin(); s.options.allowed = false; s.feed(264, true);
    expect(s.events.at(-1)?.type).toBe("pointerup"); expect(s.states.at(-1)).toMatchObject({ status: "paused", reason: "playback" });
    s.options.allowed = true; s.feed(297, true); expect(s.states.at(-1)?.status).toBe("paused"); s.input.dispose();
  });
  it("terminates and clears visual state when capture fails, and rejects later results", async () => {
    const s = setup(); await s.begin(); s.captures[0]!.callbacks.onError("capture_failed");
    expect(s.events.at(-1)?.type).toBe("pointerup"); expect(s.visual).toHaveBeenLastCalledWith(null, null);
    expect(s.states.at(-1)?.status).toBe("failed"); expect(s.ink.state.mode).toBe("navigate"); const count = s.events.length;
    s.feed(264, true); expect(s.events).toHaveLength(count); s.input.dispose();
  });
  it("blocks modal dialogs before processing another camera frame", async () => {
    const s = setup(); await s.begin(); const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog");
    dialog.getBoundingClientRect = () => ({ width: 300 } as DOMRect); document.body.append(dialog); s.feed(264, true);
    expect(s.states.at(-1)).toMatchObject({ status: "paused", reason: "dialog" }); expect(s.events.at(-1)?.type).toBe("pointerup"); s.input.dispose();
  });
  it("does not send a pointerdown into floating controls", async () => {
    const s = setup(); const overlay = document.createElement("div"); overlay.dataset.learningBoardOcclusion = "";
    overlay.getBoundingClientRect = () => ({ left: 100, top: 100, right: 700, bottom: 600, width: 600, height: 500 } as DOMRect);
    document.body.append(overlay); await s.begin(); expect(s.events).toHaveLength(0); s.input.dispose();
  });
  it("delivers release when a floating control covers the cursor on that same frame", async () => {
    const s = setup(); await s.begin();
    [264, 297].forEach(t => s.feed(t, true));
    [330, 363].forEach(t => s.feed(t, false));
    const overlay = document.createElement("div"); overlay.dataset.learningBoardOcclusion = "";
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700 } as DOMRect);
    document.body.append(overlay); s.feed(396, false); s.input.stop();
    expect(s.events.filter(e => e.type === "pointerdown")).toHaveLength(1);
    expect(s.events.filter(e => e.type === "pointerup")).toHaveLength(1);
  });
  it("clears an unfinished selection after tracking is lost", async () => {
    const s = setup(); await s.begin(); s.ink.state.mode = "select";
    s.captures[0]!.callbacks.onFrame({ timeMs: 264, tracked: false, confidence: 0, processingMs: 1, pipelineMs: 1 });
    expect(s.ink.clearSelection).toHaveBeenCalledTimes(1);
    expect(s.events.at(-1)?.type).toBe("pointerup"); s.input.dispose();
  });
  it("blocks a new air pointer only when the snap target owns the gesture", async () => {
    const s = setup();
    await s.input.start(document.createElement("video"));
    s.ink.state.mode = "select";
    for (const t of [0, 33, 66, 99]) s.feed(t, false);
    for (const t of [132, 165, 198, 231]) s.feed(t, true);
    for (const t of [264, 297, 330, 363]) s.feed(t, false);
    expect(s.events.map(event => event.type)).toEqual(["pointerdown", "pointerup"]);
    s.ink.state.selected_count = 2;
    s.options.targetOwnsGesture = true;
    for (const t of [396, 429, 462, 495]) s.feed(t, true);
    for (const t of [528, 561, 594, 627]) s.feed(t, false);
    expect(s.events).toHaveLength(2);
    expect(s.ink.clearSelection).not.toHaveBeenCalled();
    s.options.targetOwnsGesture = false;
    for (const t of [660, 693, 726, 759]) s.feed(t, true);
    expect(s.events.at(-1)?.type).toBe("pointerdown");
    s.input.dispose();
  });
  it("keeps tracking available after a physical selection without sending competing air events", async () => {
    const s = setup();
    await s.input.start(document.createElement("video"));
    s.ink.state.mode = "select";
    s.input.beginDirectSelection(1);
    for (const t of [0, 33, 66, 99]) s.feed(t, false);
    for (const t of [132, 165, 198, 231]) s.feed(t, true);
    expect(s.events).toEqual([]);
    expect(s.captures[0]!.stop).not.toHaveBeenCalled();
    s.input.endDirectSelection(1);
    for (const t of [264, 297, 330, 363]) s.feed(t, false);
    for (const t of [396, 429, 462, 495]) s.feed(t, true);
    expect(s.events.map(event => event.type)).toEqual(["pointerdown"]);
    s.input.dispose();
  });
  it("ends a held gesture when frames stop and requires the fingers to reopen", async () => {
    vi.useFakeTimers();
    const s = setup(); await s.begin();
    vi.advanceTimersByTime(351);
    expect(s.events.filter(e => e.type === "pointerup")).toHaveLength(1);
    expect(s.states.at(-1)?.capture).toBe("lost");
    [264, 297, 330, 363].forEach(t => s.feed(t, true));
    expect(s.events.filter(e => e.type === "pointerdown")).toHaveLength(1);
    s.input.dispose();
  });
  it("keeps a screen-space button captured when the board camera moves", async () => {
    const s = setup();
    const button = document.createElement("button"); button.dataset.airCommand = "undo";
    button.getBoundingClientRect = () => ({ left: 480, right: 540, top: 218, bottom: 278, width: 60, height: 60 } as DOMRect);
    const click = vi.fn(); button.addEventListener("click", click); document.body.append(button);
    await s.begin(); s.input.viewChanged();
    expect(s.states.at(-1)?.status).toBe("active");
    [264, 297, 330, 363].forEach(t => s.feed(t, false));
    expect(click).toHaveBeenCalledTimes(1); s.input.dispose();
  });
  it("keeps the cursor visible over a blocked floating panel while ending ink once", async () => {
    const s = setup(); await s.begin();
    const overlay = document.createElement("div"); overlay.dataset.learningBoardOcclusion = "";
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700 } as DOMRect);
    document.body.append(overlay);
    s.feed(264, true);
    expect(s.visual.mock.calls.at(-1)?.[1]).toMatchObject({ phase: "blocked", penDown: false });
    const cursor = s.visual.mock.calls.at(-1)?.[1]?.cursor;
    expect(cursor).not.toBeNull();
    s.feed(297, true); s.feed(330, true);
    expect(s.visual.mock.calls.at(-1)?.[1]?.cursor?.x).toBeCloseTo(cursor!.x);
    expect(s.visual.mock.calls.at(-1)?.[1]?.cursor?.y).toBeCloseTo(cursor!.y);
    expect(s.events.filter(event => event.type === "pointerup")).toHaveLength(1);
    overlay.remove(); s.feed(363, true); s.feed(396, true);
    expect(s.events.filter(event => event.type === "pointerdown")).toHaveLength(1);
    s.input.dispose();
  });
  it("does not restart after disposal", async () => {
    const s = setup(); await s.begin(); s.input.dispose(); const count = s.events.length;
    s.feed(264, true); await s.input.start(document.createElement("video")); expect(s.events).toHaveLength(count); expect(s.captures).toHaveLength(1);
  });
  it("ignores an old save failure after a new capture starts", async () => {
    const s = setup(); await s.begin();
    let rejectSave!: (reason: Error) => void;
    s.ink.saveNow.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    s.input.pause(); await s.input.start(document.createElement("video"));
    rejectSave(new Error("old session save failed")); await Promise.resolve();
    expect(s.states.at(-1)?.status).toBe("active"); s.input.dispose();
  });
  it("rejects out-of-board positions and honors hidden controls", () => {
    const s = setup(); expect(handwritingPointBlocked(s.viewport, { x: -1, y: 10 })).toBe(true);
    const button = document.createElement("button"); button.hidden = true; button.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700 } as DOMRect); document.body.append(button);
    expect(handwritingPointBlocked(s.viewport, { x: 10, y: 10 })).toBe(false); s.input.dispose();
  });
  it("maps the calibrated area to the whole input scope, including controls outside the canvas", async () => {
    const s = setup();
    const scope = document.createElement("main"); scope.dataset.airScope = "";
    scope.getBoundingClientRect = () => ({ left: 10, top: 0, width: 800, height: 640, right: 810, bottom: 640 } as DOMRect);
    document.body.append(scope); scope.append(s.viewport);
    const button = document.createElement("button"); button.dataset.airCommand = "home";
    button.getBoundingClientRect = () => ({ left: 480, right: 540, top: 0, bottom: 40, width: 60, height: 40 } as DOMRect);
    scope.append(button); const click = vi.fn(); button.addEventListener("click", click);
    await s.input.start(document.createElement("video"));
    for (const t of [0, 33, 66, 99]) s.feed(t, false, { x: 0.4, y: 0.1 });
    expect(s.visual.mock.calls.at(-1)?.[1]?.cursor?.y).toBeLessThan(0);
    for (const t of [132, 165, 198, 231]) s.feed(t, true, { x: 0.4, y: 0.1 });
    for (const t of [264, 297, 330, 363]) s.feed(t, false, { x: 0.4, y: 0.1 });
    expect(click).toHaveBeenCalledTimes(1);
    expect(s.events).toEqual([]); expect(s.states.at(-1)?.status).toBe("active");
    s.input.dispose();
  });

});
