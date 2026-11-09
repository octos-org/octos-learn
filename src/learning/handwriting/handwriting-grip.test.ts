import { describe, expect, it } from "vitest";
import { HandwritingPointerController, type HandwritingPointerAction } from "./handwriting-controller";
import { HANDWRITING_DEFAULT_MODE, handPalmCenter, readHandwritingGesture, type HandwritingInputFrame } from "./handwriting-gesture";
import { HANDWRITING_GRIP_BUFFER_MS } from "./handwriting-grip-controller";
import { makeHandwritingLandmarks, simulatedHandwritingFrames, summarizeSimulatedActions } from "./simulated-trajectory";

const viewport = { width: 800, height: 600 };
const center = { x: 0.4, y: 0.4 };
function frame(timeMs: number, closure: number, point = center): HandwritingInputFrame {
  const open = makeHandwritingLandmarks(point, 0.75, "grip", false);
  const closed = makeHandwritingLandmarks(point, 0.75, "grip", true);
  return { timeMs, tracked: true, confidence: 0.95, landmarks: open.map((p, index) => ({
    x: p.x + (closed[index]!.x - p.x) * closure,
    y: p.y + (closed[index]!.y - p.y) * closure,
  })) };
}
function start(controller: HandwritingPointerController) {
  for (const time of [0, 33, 66, 99]) controller.update(frame(time, 0), viewport);
  return [132, 165, 198, 231].flatMap(time => controller.update(frame(time, 1), viewport).actions);
}
function open(controller: HandwritingPointerController, startMs: number, point = center) {
  return [0, 33, 66, 99].flatMap(delta => controller.update(frame(startMs + delta, 0, point), viewport).actions);
}

describe("loose grip gesture and palm reference", () => {
  it("is the default, recognizes open and relaxed closed hands, and ignores the thumb", () => {
    expect(HANDWRITING_DEFAULT_MODE).toBe("grip");
    for (const pinch of [0.01, 0.75, 1.5]) {
      const closed = readHandwritingGesture(makeHandwritingLandmarks(center, pinch, "grip", true));
      const opened = readHandwritingGesture(makeHandwritingLandmarks(center, pinch, "grip", false));
      expect(closed.writingPose).toBe(true);
      expect(opened.movePose).toBe(true);
      expect(closed.palmCenter!.x).toBeCloseTo(center.x);
      expect(opened.palmCenter!.y).toBeCloseTo(center.y);
    }
  });

  it("does not move the palm reference when the index and middle fingers change shape", () => {
    const closed = frame(0, 1).landmarks!;
    const opened = frame(0, 0).landmarks!;
    const relaxed = structuredClone(closed);
    for (const index of [6, 7, 8, 10, 11, 12]) relaxed[index] = opened[index]!;
    expect(handPalmCenter(relaxed)).toEqual(handPalmCenter(closed));
    expect(readHandwritingGesture(relaxed).indexTip).not.toEqual(readHandwritingGesture(closed).indexTip);
  });

  it("does not start writing with a closed hand entering the camera", () => {
    const controller = new HandwritingPointerController();
    for (let index = 0; index < 20; index += 1) {
      expect(controller.update(frame(index * 33, 1), viewport).actions).toEqual([]);
    }
  });

  it("locks the visible hovered point across a closure with palm-estimation drift", () => {
    const controller = new HandwritingPointerController();
    let hovered = controller.update(frame(0, 0, { x: 0.3, y: 0.4 }), viewport).cursor;
    for (const time of [33, 66, 99, 132]) hovered = controller.update(frame(time, 0), viewport).cursor;
    const actions: HandwritingPointerAction[] = [];
    for (let index = 0; index < 4; index += 1) {
      const update = controller.update(frame(165 + index * 33, 1, { x: 0.45 + index * 0.01, y: 0.46 }), viewport);
      expect(update.cursor).toEqual(hovered);
      actions.push(...update.actions);
    }
    expect(actions).toEqual([{ type: "down", point: hovered, timeMs: 264, reason: "grip" }]);
    const next = controller.update(frame(297, 1, { x: 0.48, y: 0.46 }), viewport).cursor!;
    expect(next.x).toBeCloseTo(hovered!.x, 6);
    expect(next.y).toBeCloseTo(hovered!.y, 6);
  });

  it("keeps writing when the index naturally loosens or straightens", () => {
    const controller = new HandwritingPointerController();
    start(controller);
    for (let index = 0; index < 12; index += 1) {
      const input = frame(264 + index * 33, 1, { x: 0.4 + index * 0.005, y: 0.4 });
      const natural = frame(input.timeMs, index % 2 ? 0 : 0.5).landmarks!;
      for (const joint of [6, 7, 8]) input.landmarks![joint] = natural[joint]!;
      const update = controller.update(input, viewport);
      expect(update.penDown).toBe(true);
      expect(update.phase).toBe("drawing");
      expect(update.actions.every(action => action.type === "move")).toBe(true);
    }
  });

  it("requires sustained closure, not a one-frame closed classification", () => {
    const controller = new HandwritingPointerController();
    for (const time of [0, 33, 66, 99]) controller.update(frame(time, 0), viewport);
    for (let index = 0; index < 15; index += 1) {
      expect(controller.update(frame(132 + index * 33, index % 3 === 0 ? 1 : 0), viewport).actions).toEqual([]);
    }
  });
});

describe("buffered grip ink segmentation", () => {
  it("keeps the cursor responsive while holding back only recent ink", () => {
    const controller = new HandwritingPointerController();
    const down = start(controller)[0]!;
    const moved = controller.update(frame(264, 1, { x: 0.5, y: 0.4 }), viewport);
    expect(moved.cursor).not.toEqual(down.point);
    expect(moved.actions).toEqual([]);
    const delayed = controller.update(frame(264 + HANDWRITING_GRIP_BUFFER_MS + 1, 1, { x: 0.5, y: 0.4 }), viewport);
    expect(delayed.actions[0]).toMatchObject({ type: "move", point: moved.cursor, timeMs: 264 });
  });

  it("does not append opening movement or change position when pen-up is confirmed", () => {
    const controller = new HandwritingPointerController();
    const down = start(controller)[0]!;
    const actions = open(controller, 264, { x: 0.75, y: 0.6 });
    expect(actions).toEqual([{ type: "up", point: down.point, timeMs: 330, reason: "release" }]);
    const next = controller.update(frame(396, 0, { x: 0.75, y: 0.6 }), viewport);
    expect(next.cursor!.x).toBeCloseTo(down.point.x, 6);
    expect(next.cursor!.y).toBeCloseTo(down.point.y, 6);
  });

  it("uses preceding shape changes to exclude early opening samples still classified as a grip", () => {
    const controller = new HandwritingPointerController();
    const down = start(controller)[0]!;
    const actions: HandwritingPointerAction[] = [];
    for (const [index, closure] of [0.85, 0.65, 0.4, 0.1, 0, 0, 0].entries()) {
      actions.push(...controller.update(frame(264 + index * 33, closure, { x: 0.4 + index * 0.025, y: 0.4 }), viewport).actions);
    }
    expect(actions.at(-1)?.type).toBe("up");
    const ink = actions.filter(action => action.type === "move");
    // The large translated open-palm positions never become permanent ink.
    expect(ink.every(action => Math.abs(action.point.x - down.point.x) < 35)).toBe(true);
  });

  it("does not blindly remove a fixed tail from a valid completed stroke", () => {
    const controller = new HandwritingPointerController();
    start(controller);
    const written = controller.update(frame(264, 1, { x: 0.45, y: 0.4 }), viewport).cursor!;
    controller.update(frame(297, 1, { x: 0.45, y: 0.4 }), viewport);
    controller.update(frame(330, 1, { x: 0.45, y: 0.4 }), viewport);
    controller.update(frame(363, 1, { x: 0.45, y: 0.4 }), viewport);
    const actions = open(controller, 396);
    expect(actions.some(action => action.type === "move" && action.timeMs === 264 && action.point.x === written.x)).toBe(true);
  });

  it("recovers a brief false open classification without splitting the stroke or losing its buffered motion", () => {
    const controller = new HandwritingPointerController();
    start(controller);
    const pending = controller.update(frame(264, 0, { x: 0.45, y: 0.4 }), viewport);
    expect(pending.phase).toBe("holding");
    expect(pending.penDown).toBe(true);
    const resumed = controller.update(frame(297, 1, { x: 0.48, y: 0.4 }), viewport);
    expect(resumed.phase).toBe("drawing");
    expect(resumed.penDown).toBe(true);
    const flushed = controller.reset(330, "stop");
    expect(flushed.filter(action => action.type === "up")).toHaveLength(1);
    expect(flushed.some(action => action.type === "move" && action.timeMs === 264)).toBe(true);
  });

  it("flushes valid recent motion on explicit stop", () => {
    const controller = new HandwritingPointerController();
    start(controller);
    const moved = controller.update(frame(264, 1, { x: 0.5, y: 0.4 }), viewport);
    const stopped = controller.reset(280, "stop");
    expect(stopped).toEqual([
      { type: "move", point: moved.cursor, timeMs: 264 },
      { type: "up", point: moved.cursor, timeMs: 280, reason: "stop" },
    ]);
  });

  it("does not flush an unresolved opening as ordinary writing on stop", () => {
    const controller = new HandwritingPointerController();
    const down = start(controller)[0]!;
    controller.update(frame(264, 0, { x: 0.7, y: 0.4 }), viewport);
    expect(controller.reset(280, "stop")).toEqual([{ type: "up", point: down.point, timeMs: 280, reason: "stop" }]);
  });

  it.each(["lost", "invalid", "stale", "outside"])("ends safely on %s and requires an open palm before starting again", condition => {
    const controller = new HandwritingPointerController();
    start(controller);
    controller.update(frame(264, 1, { x: 0.45, y: 0.4 }), viewport);
    const time = condition === "stale" ? 600 : 297;
    const input = condition === "lost" ? { timeMs: time, tracked: false }
      : condition === "invalid" ? { ...frame(time, 1), confidence: 0.1 }
      : frame(time, 1, condition === "outside" ? { x: 0.99, y: 0.4 } : center);
    const ended = controller.update(input, viewport);
    expect(ended.penDown).toBe(false);
    expect(ended.actions.map(action => action.type)).toEqual(["up"]);
    for (let index = 1; index <= 5; index += 1) expect(controller.update(frame(time + index * 33, 1), viewport).actions).toEqual([]);
  });

  it("runs three distinct strokes with a single occlusion break", () => {
    const controller = new HandwritingPointerController();
    const frames = simulatedHandwritingFrames();
    const actions = frames.flatMap(input => controller.update(input, viewport).actions);
    const report = summarizeSimulatedActions(frames, actions);
    expect(report.strokes).toBe(3);
    expect(report.breakUps).toBe(1);
    expect(report.releaseUps).toBe(2);
    let active = false;
    for (const action of actions) {
      expect(active).toBe(action.type !== "down");
      active = action.type !== "up";
    }
    expect(active).toBe(false);
  });
});
