import { describe, expect, it } from "vitest";
import { HandwritingPointerController } from "./handwriting-controller";
import {
  HANDWRITING_DEFAULT_MODE, HandwritingGestureFilter, pinchScore, readHandwritingGesture, writingPose,
  type HandwritingInputFrame, type HandwritingGestureMode,
} from "./handwriting-gesture";
import { HandwritingPointFilter, mapHandPointToViewport, viewportPointToBoard } from "./handwriting-map";
import { percentile, summarizeLatency } from "./handwriting-metrics";
import { projectPreviewPoint } from "./handwriting-overlay";
import { makeHandwritingLandmarks, simulatedHandwritingFrames, summarizeSimulatedActions } from "./simulated-trajectory";

const viewport = { width: 800, height: 600 };
const tip = { x: 0.4, y: 0.4 };

function frame(timeMs: number, drawing: boolean, mode: HandwritingGestureMode = "fist", point = tip): HandwritingInputFrame {
  return { timeMs, tracked: true, confidence: 0.95,
    landmarks: makeHandwritingLandmarks(point, drawing ? 0.22 : 0.75, mode, drawing) };
}

function primeFilter(filter: HandwritingGestureFilter, mode: HandwritingGestureMode = "fist") {
  for (const time of [0, 33, 66, 99]) filter.update(frame(time, false, mode));
}

function startStroke(controller: HandwritingPointerController, mode: HandwritingGestureMode = "fist") {
  for (const time of [0, 33, 66, 99]) controller.update(frame(time, false, mode), viewport);
  return [132, 165, 198, 231].map(time => controller.update(frame(time, true, mode), viewport));
}

describe.each(["fist", "point", "pinch"] as const)("%s gesture safety", mode => {
  it("requires a stable pen-up pose before drawing, including at startup", () => {
    const filter = new HandwritingGestureFilter(mode);
    for (let time = 0; time < 500; time += 33) expect(filter.update(frame(time, true, mode)).penDown).toBe(false);
  });

  it("requires both enough frames and a dwell interval to lower the pen", () => {
    const filter = new HandwritingGestureFilter(mode);
    primeFilter(filter, mode);
    expect(filter.update(frame(132, true, mode)).transition).toBeNull();
    expect(filter.update(frame(140, true, mode)).transition).toBeNull();
    expect(filter.update(frame(145, true, mode)).transition).toBeNull();
    expect(filter.update(frame(231, true, mode)).transition).toBe("down");
  });

  it("rejects one-frame and interrupted write poses during movement", () => {
    const filter = new HandwritingGestureFilter(mode);
    primeFilter(filter, mode);
    for (let index = 0; index < 20; index += 1) {
      expect(filter.update(frame(132 + index * 33, index % 3 === 0, mode)).penDown).toBe(false);
    }
  });

  it("lifts immediately at the last drawing position, without a release tail", () => {
    const controller = new HandwritingPointerController({ mode });
    const started = startStroke(controller, mode);
    const down = started.at(-1)!.actions[0]!;
    expect(down.type).toBe("down");
    const moved = controller.update(frame(264, true, mode, { x: 0.45, y: 0.4 }), viewport).actions[0]!;
    expect(moved.type).toBe("move");
    const released = controller.update(frame(297, false, mode, { x: 0.7, y: 0.6 }), viewport);
    expect(released.penDown).toBe(false);
    expect(released.actions).toEqual([{ type: "up", point: moved.point, timeMs: 297, reason: "release" }]);
    expect(released.cursor).not.toEqual(moved.point);
  });

  it("does not reconnect after a lost hand until a stable neutral pose rearms it", () => {
    const controller = new HandwritingPointerController({ mode });
    startStroke(controller, mode);
    const lost = controller.update({ timeMs: 264, tracked: false }, viewport);
    expect(lost.actions.map(a => a.type)).toEqual(["up"]);
    expect(lost.actions[0]!.reason).toBe("lost");
    for (const time of [297, 330, 363, 396, 429]) {
      expect(controller.update(frame(time, true, mode), viewport).actions).toEqual([]);
    }
    for (const time of [462, 495, 528, 561]) controller.update(frame(time, false, mode), viewport);
    const result = [594, 627, 660, 693].flatMap(time => controller.update(frame(time, true, mode), viewport).actions);
    expect(result.map(a => a.type)).toEqual(["down"]);
  });

  it("breaks when samples are stale and does not bridge the unseen motion", () => {
    const controller = new HandwritingPointerController({ mode });
    startStroke(controller, mode);
    const delayed = controller.update(frame(600, true, mode, { x: 0.7, y: 0.5 }), viewport);
    expect(delayed.actions.map(a => a.type)).toEqual(["up"]);
    expect(delayed.penDown).toBe(false);
  });

  it("breaks on invalid landmarks and low confidence", () => {
    for (const corrupted of [{ confidence: 0.3 }, { landmarks: [{ x: NaN, y: 0 }] }]) {
      const controller = new HandwritingPointerController({ mode });
      startStroke(controller, mode);
      const result = controller.update({ ...frame(264, true, mode), ...corrupted }, viewport);
      expect(result.phase).toBe("lost");
      expect(result.actions.map(a => a.type)).toEqual(["up"]);
    }
  });

  it("runs three deterministic strokes with an occlusion and balanced input", () => {
    const controller = new HandwritingPointerController({ mode });
    const frames = simulatedHandwritingFrames(mode);
    const actions = frames.flatMap(input => controller.update(input, viewport).actions);
    const report = summarizeSimulatedActions(frames, actions);
    expect(report.strokes).toBe(3);
    expect(report.breakUps).toBe(1);
    expect(report.releaseUps).toBe(2);
    expect(report.actions.move).toBeGreaterThan(30);
    let active = false;
    for (const action of actions) {
      expect(active).toBe(action.type !== "down");
      active = action.type !== "up";
    }
    expect(active).toBe(false);
  });
});

describe("gesture geometry", () => {
  it("distinguishes one-finger drawing from two-finger movement without involving the thumb", () => {
    const draw = makeHandwritingLandmarks(tip, 0.9, "point", true);
    expect(writingPose(draw)).toBe(true);
    expect(readHandwritingGesture(draw, 1, "point").fingers).toEqual(["extended", "folded", "folded", "folded"]);
    const move = makeHandwritingLandmarks(tip, 0.1, "point", false);
    const reading = readHandwritingGesture(move, 1, "point");
    expect(reading.writingPose).toBe(false);
    expect(reading.movePose).toBe(true);
  });

  it("keeps sideways and rotated point gestures independent of screen direction", () => {
    const points = makeHandwritingLandmarks(tip, 0.9, "point", true);
    for (const angle of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const rotated = points.map(p => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
      expect(writingPose(rotated)).toBe(true);
    }
  });

  it("measures pinch in 3D rather than treating overlapping image tips as contact", () => {
    const points = makeHandwritingLandmarks(tip, 0.01);
    points[4]!.z = 0.12;
    expect(pinchScore(points)).toBeGreaterThan(0.42);
    expect(readHandwritingGesture(points, 1, "pinch").writingPose).toBe(false);
  });

  it("uses world geometry for hand shape and image coordinates for the cursor", () => {
    const screen = makeHandwritingLandmarks(tip, 0.01);
    const world = makeHandwritingLandmarks(tip, 0.75);
    const reading = readHandwritingGesture(screen, 1, "pinch", world);
    expect(reading.pinchScore).toBeCloseTo(0.75);
    expect(reading.movePose).toBe(true);
    expect(reading.indexTip).toEqual(tip);
  });

  it("corrects rectangular image normalization in the geometry fallback", () => {
    const points = makeHandwritingLandmarks(tip, 0.22);
    const stretched = points.map(p => ({ x: p.x / 2, y: p.y }));
    expect(readHandwritingGesture(stretched, 1, "pinch", undefined, 2).pinchScore).toBeCloseTo(0.22);
  });

  it("accepts a pinch with a bent index finger", () => {
    const points = makeHandwritingLandmarks(tip, 0.22);
    points[6] = { x: tip.x, y: tip.y - 0.1 };
    expect(readHandwritingGesture(points, 1, "pinch").writingPose).toBe(true);
  });

  it("freezes the pinch opening band before immediate release", () => {
    const controller = new HandwritingPointerController({ mode: "pinch" });
    const down = startStroke(controller, "pinch").at(-1)!.actions[0]!;
    const opening = frame(264, true, "pinch", { x: 0.6, y: 0.6 });
    opening.landmarks = makeHandwritingLandmarks({ x: 0.6, y: 0.6 }, 0.35);
    expect(controller.update(opening, viewport).actions).toEqual([]);
    const released = controller.update(frame(297, false, "pinch", { x: 0.7, y: 0.7 }), viewport);
    expect(released.actions[0]!.point).toEqual(down.point);
  });
});

describe("extend-to-draw and fist-to-lift mode", () => {
  function withExtendedFinger(points: ReturnType<typeof makeHandwritingLandmarks>, mcp: number) {
    for (let joint = mcp + 1; joint <= mcp + 3; joint += 1) {
      points[joint] = { x: points[mcp]!.x, y: points[mcp]!.y - (joint - mcp) * 0.075 };
    }
    return points;
  }

  it("is the default and accepts one or two fingers while always pointing with the index", () => {
    expect(HANDWRITING_DEFAULT_MODE).toBe("grip");
    const one = makeHandwritingLandmarks(tip, 0.75, "fist", true);
    const two = withExtendedFinger(structuredClone(one), 9);
    for (const points of [one, two]) {
      const reading = readHandwritingGesture(points, 1, "fist");
      expect(reading.writingPose).toBe(true);
      expect(reading.movePose).toBe(false);
      expect(reading.indexTip).toEqual(tip);
    }
  });

  it("keeps the same stroke and cursor through the entire middle-finger transition", () => {
    const controller = new HandwritingPointerController({ mode: "fist" });
    const down = startStroke(controller).at(-1)!.actions[0]!;
    const one = makeHandwritingLandmarks(tip, 0.75, "fist", true);
    const two = withExtendedFinger(structuredClone(one), 9);
    for (let index = 1; index <= 30; index += 1) {
      const amount = (Math.sin(index / 30 * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      const landmarks = one.map((point, joint) => joint >= 10 && joint <= 12 ? {
        x: point.x + (two[joint]!.x - point.x) * amount,
        y: point.y + (two[joint]!.y - point.y) * amount,
      } : point);
      const update = controller.update({ timeMs: 231 + index * 33, tracked: true, landmarks }, viewport);
      expect(update.penDown).toBe(true);
      expect(update.cursor).toEqual(down.point);
      expect(update.actions.every(action => action.type === "move")).toBe(true);
    }
  });

  it("lifts at the first ambiguous index curl, before a full fist, with no new drawing point", () => {
    const controller = new HandwritingPointerController({ mode: "fist" });
    const down = startStroke(controller).at(-1)!.actions[0]!;
    const closing = frame(264, true);
    const pip = closing.landmarks![6]!;
    closing.landmarks![8] = { x: pip.x + 0.08, y: pip.y - 0.1 };
    const reading = readHandwritingGesture(closing.landmarks, 1, "fist");
    expect(reading.fingers[0]).toBe("uncertain");
    expect(reading.movePose).toBe(false);
    const lifted = controller.update(closing, viewport);
    expect(lifted.penDown).toBe(false);
    expect(lifted.actions).toEqual([{ type: "up", point: down.point, timeMs: 264, reason: "release" }]);
    for (const time of [297, 330, 363, 396]) {
      expect(controller.update(frame(time, true), viewport).actions).toEqual([]);
    }
  });

  it("does not arm with two extended fingers; the old moving pose now writes only after a fist", () => {
    const filter = new HandwritingGestureFilter("fist");
    const two = withExtendedFinger(makeHandwritingLandmarks(tip, 0.75, "fist", true), 9);
    for (const timeMs of [0, 33, 66, 99, 132, 165]) {
      const update = filter.update({ timeMs, tracked: true, landmarks: two });
      expect(update.penDown).toBe(false);
      expect(update.phase).toBe("unarmed");
    }
  });

  it("rejects an open palm both on entry and while drawing", () => {
    const palm = makeHandwritingLandmarks(tip, 0.75, "fist", true);
    for (const mcp of [9, 13, 17]) withExtendedFinger(palm, mcp);
    const reading = readHandwritingGesture(palm, 1, "fist");
    expect(reading.fingers).toEqual(["extended", "extended", "extended", "extended"]);
    expect(reading.writingPose).toBe(false);
    expect(reading.movePose).toBe(false);
    const filter = new HandwritingGestureFilter("fist");
    for (const timeMs of [0, 33, 66, 99, 132]) {
      expect(filter.update({ timeMs, tracked: true, landmarks: palm }).penDown).toBe(false);
    }
    const controller = new HandwritingPointerController({ mode: "fist" });
    const down = startStroke(controller).at(-1)!.actions[0]!;
    const result = controller.update({ timeMs: 264, tracked: true, landmarks: palm }, viewport);
    expect(result.actions).toEqual([{ type: "up", point: down.point, timeMs: 264, reason: "release" }]);
  });

  it("ignores the thumb for both fist preparation and extended-finger writing", () => {
    for (const drawing of [false, true]) {
      for (const pinch of [0.01, 0.22, 0.75, 1.5]) {
        const reading = readHandwritingGesture(makeHandwritingLandmarks(tip, pinch, "fist", drawing), 1, "fist");
        expect(reading.movePose).toBe(!drawing);
        expect(reading.writingPose).toBe(drawing);
      }
    }
  });

  it("recognizes a relaxed fist independently of image rotation", () => {
    const fist = makeHandwritingLandmarks(tip, 0.75, "fist", false);
    for (const angle of [0, Math.PI / 2, Math.PI]) {
      const rotated = fist.map(p => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
      const reading = readHandwritingGesture(rotated, 1, "fist");
      expect(reading.movePose).toBe(true);
      expect(reading.writingPose).toBe(false);
    }
  });
});

describe("coordinate mapping and overlay", () => {
  it("mirrors a front-camera point exactly once", () => {
    const mapped = mapHandPointToViewport({ x: 0.25, y: 0.3 }, viewport, true);
    expect(mapped.inside).toBe(true);
    expect(mapped.x).toBeCloseTo(650, 5);
    expect(mapped.y).toBeCloseTo(157.142857, 5);
  });

  it("maps through the actual pan and zoom", () => {
    expect(viewportPointToBoard({ x: 260, y: 180 }, { panX: 60, panY: 30, scale: 2 }))
      .toEqual({ x: 100, y: 75 });
  });

  it("breaks and rearms when leaving the safe region", () => {
    const controller = new HandwritingPointerController({ mode: "fist" });
    startStroke(controller);
    const outside = controller.update(frame(264, true, "fist", { x: 0.99, y: 0.4 }), viewport);
    expect(outside.actions.map(a => a.type)).toEqual(["up"]);
    expect(outside.phase).toBe("outside");
    for (const time of [297, 330, 363, 396]) expect(controller.update(frame(time, true), viewport).actions).toEqual([]);
  });

  it("matches object-fit cover for widescreen and portrait sources", () => {
    expect(projectPreviewPoint({ x: 0.5, y: 0.5 }, { width: 400, height: 300 }, { width: 1920, height: 1080 }))
      .toEqual({ x: 200, y: 150 });
    expect(projectPreviewPoint({ x: 0, y: 0.5 }, { width: 400, height: 300 }, { width: 1920, height: 1080 }).x)
      .toBeCloseTo(-66.6666667);
    expect(projectPreviewPoint({ x: 0.5, y: 0 }, { width: 400, height: 300 }, { width: 480, height: 640 }).y)
      .toBeCloseTo(-116.6666667);
  });

  it("reduces static jitter without freezing a fast stroke", () => {
    const filter = new HandwritingPointFilter();
    const raw: number[] = [];
    const smoothed: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const value = 100 + (index % 2 === 0 ? 2 : -2);
      raw.push(value);
      smoothed.push(filter.filter({ x: value, y: 100 }, index * 33).x);
    }
    const variance = (values: number[]) => {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    };
    expect(variance(smoothed.slice(5))).toBeLessThan(variance(raw.slice(5)));
    expect(filter.filter({ x: 180, y: 120 }, 1020).x).toBeGreaterThan(120);
  });
});

describe("latency summaries", () => {
  it("uses nearest rank percentiles and handles empty data", () => {
    expect(percentile([30, 10, 20], 50)).toBe(20);
    expect(percentile([30, 10, 20], 95)).toBe(30);
    expect(summarizeLatency([]).count).toBe(0);
    expect(summarizeLatency([10, 20, 30]).p50).toBe(20);
  });
});
