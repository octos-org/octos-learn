import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CLEAR_X, pageDoodles } from "./doodles";
import { BLOCK, blockColor, blockSize, cameraYFor, fallArc, fallTime, finaleView, LANDING_GAP, landingTime, PLINTH, swayAt, SWAY_SPAN } from "./tower";

const FOV = 36;

function project(camera: THREE.PerspectiveCamera, x: number, y: number): THREE.Vector3 {
  camera.updateMatrixWorld();
  return new THREE.Vector3(x, y, 0).project(camera);
}

describe("Up the Page tower", () => {
  it("makes blocks bigger on a streak of 5, and bigger again at 10", () => {
    expect(blockSize(0)).toEqual({ width: BLOCK.width, height: BLOCK.height });
    expect(blockSize(4)).toEqual(blockSize(0));
    expect(blockSize(5).width).toBeGreaterThan(BLOCK.width);
    expect(blockSize(10).height).toBeGreaterThan(blockSize(9).height);
    expect(blockSize(25)).toEqual(blockSize(10));
  });

  it("never stacks two blocks of one colour, whichever side the answer was on", () => {
    for (let index = 0; index < 40; index++) {
      const now = [blockColor(index, 0), blockColor(index, 2)];
      const next = [blockColor(index + 1, 0), blockColor(index + 1, 2)];
      expect(now[0]).not.toBe(now[1]);
      for (const a of now) for (const b of next) expect(a).not.toBe(b);
    }
  });

  it("drops a released block from where it hangs onto the top of the tower", () => {
    const cases = [
      { from: { x: 0.3, y: 6.2 }, to: { x: 0.05, y: 4.1 } },
      { from: { x: -3.5, y: 5.6 }, to: { x: 0.1, y: 4.1 } },
      { from: { x: 3.5, y: 12 }, to: { x: -0.1, y: 4.1 } },
    ];
    for (const { from, to } of cases) {
      const duration = fallTime(from, to);
      expect(duration).toBeGreaterThanOrEqual(0.3);
      expect(duration).toBeLessThanOrEqual(0.7);
      const arc = fallArc(from, to, duration);
      expect(arc(0).x).toBeCloseTo(from.x);
      expect(arc(0).y).toBeCloseTo(from.y);
      expect(arc(1).x).toBeCloseTo(to.x);
      expect(arc(1).y).toBeCloseTo(to.y);
      // Coming down at the end, never rising into the tower.
      expect(arc(0.98).y).toBeGreaterThan(arc(1).y);
    }
  });

  it("lands blocks in the order they were released, however quick the answers", () => {
    let previous = 0;
    let now = 0;
    for (const wait of [0.05, 0.02, 0.4, 0.01, 0.6, 0.03]) {
      now += wait;
      const lands = landingTime(now, 0.45, previous);
      expect(lands).toBeGreaterThanOrEqual(now + 0.45);
      expect(lands).toBeGreaterThanOrEqual(previous + LANDING_GAP - 1e-9);
      previous = lands;
    }
  });

  it("sways only the top of the tower, most at the very top", () => {
    const top = 30;
    expect(swayAt(top - SWAY_SPAN - 1, top, 0.4)).toBe(0);
    expect(swayAt(top, top, 0.4)).toBeCloseTo(0.4);
    let last = 0;
    for (let y = top - SWAY_SPAN; y <= top; y += 0.5) {
      const sway = swayAt(y, top, 0.4);
      expect(sway).toBeGreaterThanOrEqual(last);
      last = sway;
    }
  });

  it("frames the top of the tower at the same place on screen, at any height", () => {
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
    for (const top of [0.7, 9, 33]) {
      camera.position.set(0, cameraYFor(top, 18, FOV, -0.2), 18);
      expect(project(camera, 0, top).y).toBeCloseTo(-0.2, 5);
    }
  });

  it("ends on the whole tower, ground to flag, beside the results card", () => {
    for (const [height, aspect, margin] of [[34, 16 / 9, 0.25], [22, 16 / 9, 0.31], [40, 4 / 3, 0.2], [30, 0.6, 0.06]]) {
      const view = finaleView(height, aspect, FOV, margin);
      const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.5, 400);
      camera.position.set(view.x, view.y, view.z);
      const ground = project(camera, 0, 0);
      const flag = project(camera, 0, height + 2.6);
      expect(ground.y).toBeGreaterThan(-1);
      expect(flag.y).toBeLessThan(1);
      const left = project(camera, -PLINTH.width / 2, 0).x;
      const right = project(camera, PLINTH.width / 2, 0).x;
      if (margin >= 0.14) {
        // Inside the strip beside the card.
        expect(left).toBeGreaterThan(-1);
        expect(right).toBeLessThan(-1 + margin * 2);
      } else {
        expect((left + right) / 2).toBeCloseTo(0, 5);
      }
    }
  });
});

describe("Up the Page doodles", () => {
  it("are well formed, and above the grass they keep clear of the tower and the hanging blocks", () => {
    const shapes = pageDoodles();
    expect(shapes.length).toBeGreaterThan(40);
    for (const shape of shapes) {
      expect(shape.points.length).toBeGreaterThanOrEqual(shape.kind === "patch" ? 3 : 2);
      for (const [x, y] of shape.points) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        if (y > 2.5) expect(Math.abs(x), `${shape.kind} ${shape.color} at ${x}, ${y}`).toBeGreaterThanOrEqual(CLEAR_X);
      }
    }
  });
});
