import { describe, expect, it } from "vitest";
import { handPinchContactScore } from "./handwriting-pinch";
import { HANDWRITING_PINCH_DOWN_SCORE, HANDWRITING_PINCH_UP_SCORE, pinchScore, type HandLandmark } from "./handwriting-gesture";
import { makeHandwritingLandmarks } from "./simulated-trajectory";

function hand(closed: boolean): HandLandmark[] {
  const points = makeHandwritingLandmarks({ x: 0, y: 0 }, 0.8, "pinch").map(p => ({ ...p, z: 0 }));
  if (closed) {
    // Thumb pad touches the side of the distal index, near its DIP joint.
    // Tip-to-tip measurement alone rejects this contact.
    points[4] = { x: 0.008, y: 0.06, z: 0.003 };
    points[3] = { x: 0.04, y: 0.09, z: 0.008 };
  }
  return points;
}
function rotate(points: HandLandmark[], yaw: number, pitch: number, mirror = false) {
  return points.map(p => {
    const x = (mirror ? -p.x : p.x), y = p.y, z = p.z ?? 0;
    const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return { x: rx, y: y * Math.cos(pitch) - rz * Math.sin(pitch), z: y * Math.sin(pitch) + rz * Math.cos(pitch) };
  });
}
function image(points: HandLandmark[], aspect: number) {
  return points.map(p => ({ x: 0.5 + p.x / aspect, y: 0.35 + p.y, z: (p.z ?? 0) / aspect }));
}

describe("pinch contact across camera orientations", () => {
  it("accepts pad contact that the old fingertip distance rejects", () => {
    const points = hand(true);
    expect(pinchScore(points)).toBeGreaterThan(HANDWRITING_PINCH_DOWN_SCORE);
    expect(handPinchContactScore(image(points, 1), points, 1)).toBeLessThan(HANDWRITING_PINCH_DOWN_SCORE);
  });
  it("keeps pad contact and open fingers distinct across yaw, pitch, handedness and image aspect", () => {
    for (const yaw of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, -Math.PI / 2]) {
      for (const pitch of [0, Math.PI / 4, -Math.PI / 4]) {
        for (const mirrored of [false, true]) {
          for (const aspect of [0.75, 1, 16 / 9]) {
            const closed = rotate(hand(true), yaw, pitch, mirrored);
            const opened = rotate(hand(false), yaw, pitch, mirrored);
            expect(handPinchContactScore(image(closed, aspect), closed, aspect)).toBeLessThan(HANDWRITING_PINCH_DOWN_SCORE);
            expect(handPinchContactScore(image(opened, aspect), opened, aspect)).toBeGreaterThan(HANDWRITING_PINCH_UP_SCORE);
          }
        }
      }
    }
  });
  it("uses the image 3D estimate when world fingertip depth is distorted", () => {
    const points = hand(true);
    const noisyWorld = points.map((p, i) => i === 3 || i === 4 ? { ...p, z: 0.15 } : p);
    expect(pinchScore(noisyWorld)).toBeGreaterThan(HANDWRITING_PINCH_UP_SCORE);
    expect(handPinchContactScore(image(points, 16 / 9), noisyWorld, 16 / 9)).toBeLessThan(HANDWRITING_PINCH_DOWN_SCORE);
  });
  it("uses world 3D when normalized image depth is distorted", () => {
    const points = hand(true);
    const noisyImage = image(points, 1).map((p, i) => i === 3 || i === 4 ? { ...p, z: 0.15 } : p);
    expect(handPinchContactScore(noisyImage, points, 1)).toBeLessThan(HANDWRITING_PINCH_DOWN_SCORE);
  });
  it("keeps fingers separated in depth open even when they overlap on screen", () => {
    const points = hand(false);
    points[3] = { ...points[7]!, z: 0.2 };
    points[4] = { ...points[8]!, z: 0.2 };
    expect(handPinchContactScore(image(points, 1), points, 1)).toBeGreaterThan(HANDWRITING_PINCH_UP_SCORE);
  });
  it("rejects degenerate input and supports the normalized 3D fallback", () => {
    expect(handPinchContactScore([], undefined, 1)).toBe(Infinity);
    expect(handPinchContactScore(image(hand(true), 16 / 9), undefined, 16 / 9)).toBeLessThan(HANDWRITING_PINCH_DOWN_SCORE);
  });
});
