import { describe, expect, it } from "vitest";
import { HandwritingPointerController } from "./handwriting-controller";
import { handPalmCenter, type HandwritingInputFrame } from "./handwriting-gesture";
import { makeHandwritingLandmarks } from "./simulated-trajectory";

const viewport = { width: 800, height: 600 };
function frame(timeMs: number, ratio: number, x = 0.4): HandwritingInputFrame {
  // Keep the palm at the same location while the fingertips change shape.
  const points = makeHandwritingLandmarks({ x, y: 0.3 }, ratio, "pinch");
  const center = handPalmCenter(points);
  return { timeMs, tracked: true, landmarks: points.map(p => ({ x: p.x + x - center.x, y: p.y + 0.4 - center.y })) };
}
function begin(c: HandwritingPointerController, precision = false) {
  for (const t of [0, 33, 66, 99]) c.update(frame(t, 0.75), viewport);
  return [132, 165, 198, 231].flatMap(t => c.update(frame(t, 0.1), viewport, precision).actions);
}
describe("palm targeting with a thumb-index clutch", () => {
  it("anchors pen down to the visible hover point despite fingertip movement", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" });
    for (const t of [0, 33, 66, 99]) c.update(frame(t, 0.75), viewport);
    const hovered = c.update(frame(110, 0.75), viewport).cursor;
    const actions = [132, 165, 198, 231].flatMap(t => c.update(frame(t, 0.1), viewport).actions);
    expect(actions.filter(a => a.type === "down")).toHaveLength(1);
    expect(actions[0]!.point).toEqual(hovered);
  });
  it("writes a dot on a stationary pinch and release", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" });
    const actions = begin(c);
    for (const t of [264, 297, 330]) actions.push(...c.update(frame(t, 0.75), viewport).actions);
    expect(actions.map(a => a.type)).toEqual(["down", "up"]);
    expect(actions[1]!.point).toEqual(actions[0]!.point);
  });
  it("does not arm a closed hand on entry or after losing tracking", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" });
    for (const t of [0, 33, 66, 99]) expect(c.update(frame(t, 0.1), viewport).actions).toEqual([]);
    c.reset(); begin(c);
    expect(c.update({ timeMs: 264, tracked: false }, viewport).actions.at(-1)?.reason).toBe("lost");
    for (const t of [297, 330, 363, 396]) expect(c.update(frame(t, 0.1), viewport).actions).toEqual([]);
  });
  it("keeps a brief ambiguous opening in the same stroke", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" }); begin(c);
    expect(c.update(frame(264, 0.39), viewport).phase).toBe("holding");
    const update = c.update(frame(297, 0.1), viewport);
    expect(update.penDown).toBe(true); expect(update.transition).toBeNull();
  });
  it("drops the unconfirmed motion used to release the fingers", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" }); begin(c);
    const actions = [264, 297, 330].flatMap(t => c.update(frame(t, 0.75, 0.55), viewport).actions);
    expect(actions.map(a => a.type)).toEqual(["up"]);
  });
  it("uses calibrated thresholds and breaks an implausible tracked jump", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch", pinch: { down: 0.45, up: 0.7 } });
    for (const t of [0, 33, 66, 99]) c.update(frame(t, 0.8), viewport);
    const actions = [132, 165, 198, 231].flatMap(t => c.update(frame(t, 0.35), viewport).actions);
    expect(actions.filter(a => a.type === "down")).toHaveLength(1);
    expect(c.update(frame(264, 0.35, 0.8), viewport).actions.at(-1)?.reason).toBe("lost");
    expect(c.update(frame(297, 0.35, 0.8), viewport).actions).toEqual([]);
  });

  it("ends a long ambiguous opening without accepting further ink", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" }); begin(c);
    const actions = [264, 400, 530, 660, 730].flatMap(t => c.update(frame(t, 0.39), viewport).actions);
    expect(actions.map(a => a.type)).toEqual(["up"]);
    expect(actions[0]!.reason).toBe("lost");
  });

  it("tolerates a loose held pinch and requires sustained actual opening to release", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" }); begin(c);
    for (const t of [264, 297, 330, 363]) {
      const update = c.update(frame(t, 0.33), viewport);
      expect(update.penDown).toBe(true); expect(update.phase).toBe("drawing");
    }
    c.update(frame(396, 0.39), viewport);
    // One fully open observation after an ambiguous pose must not release.
    expect(c.update(frame(429, 0.75), viewport).transition).toBeNull();
    expect(c.update(frame(462, 0.1), viewport).penDown).toBe(true);
  });

  it("suppresses stationary hand tremor in writing without changing pinch recognition", () => {
    const run = (precision: boolean) => {
      const c = new HandwritingPointerController({ mode: "palm-pinch" });
      const down = begin(c, precision).find(action => action.type === "down")!;
      let maximum = 0;
      for (let i = 0; i < 90; i++) {
        const update = c.update(frame(264 + i * 33, 0.1, 0.4 + Math.sin(i * 1.9) * 0.003), viewport, precision);
        expect(update.penDown).toBe(true);
        maximum = Math.max(maximum, Math.abs(update.cursor!.x - down.point.x));
      }
      return maximum;
    };
    const ordinary = run(false), writing = run(true);
    expect(writing).toBeLessThan(ordinary * 0.5);
    expect(writing).toBeLessThan(1.5);
  });

  it("preserves accumulated slow movement, short lines, and return strokes in precision writing", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" });
    const down = begin(c, true).find(action => action.type === "down")!;
    let tip = down.point;
    const actions = [];
    for (let i = 0; i < 90; i++) {
      const update = c.update(frame(264 + i * 33, 0.1, 0.4 + Math.min(i, 60) * 0.0005), viewport, true);
      actions.push(...update.actions); tip = update.cursor!;
    }
    expect(down.point.x - tip.x).toBeGreaterThan(15);
    expect(down.point.x - tip.x).toBeLessThan(21);
    const far = tip.x;
    for (let i = 0; i < 60; i++) tip = c.update(frame(3234 + i * 33, 0.1, 0.43 - Math.min(i, 40) * 0.0005), viewport, true).cursor!;
    expect(tip.x - far).toBeGreaterThan(8);
    expect(actions.some(action => action.type === "move")).toBe(true);
    expect(c.update(frame(5214, 0.75), viewport, true).penDown).toBe(true);
    c.update(frame(5247, 0.75), viewport, true);
    expect(c.update(frame(5280, 0.75), viewport, true).actions.at(-1)?.type).toBe("up");
  });

  it("keeps the same writing gain in a half-width region while retaining full hover reach", () => {
    const region = { left: 0.25, right: 0.75, top: 0.08, bottom: 0.92 };
    const writingDistance = (c: HandwritingPointerController) => {
      const down = begin(c, true).find(action => action.type === "down")!;
      let tip = down.point;
      for (let i = 0; i < 90; i++) {
        tip = c.update(frame(264 + i * 33, 0.1, 0.4 + Math.min(i, 60) * 0.0005), viewport, true).cursor!;
      }
      return down.point.x - tip.x;
    };
    const narrow = new HandwritingPointerController({ mode: "palm-pinch", region });
    const standard = new HandwritingPointerController({ mode: "palm-pinch" });
    expect(writingDistance(narrow)).toBeCloseTo(writingDistance(standard), 0);
    narrow.reset();
    expect(narrow.update(frame(0, 0.75, 0.26), viewport).cursor!.x).toBeCloseTo(784);
  });

  it("recovers absolute hover position after clutch offsets so calibrated edges remain reachable", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" });
    begin(c);
    for (const t of [264, 297, 330]) c.update(frame(t, 0.75, 0.48), viewport);
    let cursor = null;
    for (let i = 0; i < 50; i++) cursor = c.update(frame(363 + i * 33, 0.75, 0.48), viewport).cursor;
    expect(cursor!.x).toBeCloseTo(420, 1);
    for (let i = 0; i < 50; i++) cursor = c.update(frame(2013 + i * 33, 0.75, 0.105), viewport).cursor;
    expect(cursor!.x).toBeGreaterThan(793);
  });

});
