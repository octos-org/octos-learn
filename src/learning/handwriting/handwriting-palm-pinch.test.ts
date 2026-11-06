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
function begin(c: HandwritingPointerController) {
  for (const t of [0, 33, 66, 99]) c.update(frame(t, 0.75), viewport);
  return [132, 165, 198, 231].flatMap(t => c.update(frame(t, 0.1), viewport).actions);
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
    expect(c.update(frame(264, 0.35), viewport).phase).toBe("holding");
    const update = c.update(frame(297, 0.1), viewport);
    expect(update.penDown).toBe(true); expect(update.transition).toBeNull();
  });
  it("drops the unconfirmed motion used to release the fingers", () => {
    const c = new HandwritingPointerController({ mode: "palm-pinch" }); begin(c);
    const actions = [264, 297, 330].flatMap(t => c.update(frame(t, 0.75, 0.55), viewport).actions);
    expect(actions.map(a => a.type)).toEqual(["up"]);
  });
});
