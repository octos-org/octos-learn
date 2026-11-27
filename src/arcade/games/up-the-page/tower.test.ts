import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CLEAR_X, pageDoodles } from "./doodles";
import {
  BLOCK_STYLES, cameraYFor, finaleView, HANG, hopLift, hopPath, hopTime, LANDING_GAP, landingOffset, landingTime, NIB_ASIDE, NIB_BODY,
  PLINTH, planLooks, SHAPES, streakScale, swayAmount, swayAt, swingPath, swingTime,
} from "./tower";

const FOV = 36;

function project(camera: THREE.PerspectiveCamera, x: number, y: number): THREE.Vector3 {
  camera.updateMatrixWorld();
  return new THREE.Vector3(x, y, 0).project(camera);
}

describe("Up the Page blocks", () => {
  it("come in every style and shape, never the same style or colour twice in a row, whichever block is picked", () => {
    for (const perItem of [1, 2]) {
      for (let start = 0; start < BLOCK_STYLES.length; start++) {
        const plan = planLooks(22, perItem, start);
        expect(plan).toHaveLength(22);
        const decos = new Set<string>();
        plan.forEach((looks, index) => {
          expect(looks).toHaveLength(perItem);
          const colors = looks.map(look => look.color);
          expect(new Set(colors).size).toBe(perItem);
          for (const look of looks) {
            decos.add(look.style.deco);
            if (look.style.color) expect(look.color).toBe(look.style.color);
            expect(look.size).toEqual(SHAPES[look.style.shape]);
          }
          const before = plan[index - 1];
          if (before) {
            for (const look of looks) {
              for (const previous of before) {
                expect(look.color).not.toBe(previous.color);
                expect(look.style.deco).not.toBe(previous.style.deco);
              }
            }
          }
        });
        expect(decos.size).toBe(BLOCK_STYLES.length);
      }
    }
  });

  it("get bigger on a streak of 5, and bigger again at 10", () => {
    expect(streakScale(4)).toEqual({ x: 1, y: 1 });
    expect(streakScale(5).y).toBeGreaterThan(1);
    expect(streakScale(10).y).toBeGreaterThan(streakScale(9).y);
    expect(streakScale(30)).toEqual(streakScale(10));
  });

  it("swing in from beside the tower and land on top, never dipping into it", () => {
    const top = 12;
    for (const style of BLOCK_STYLES) {
      const size = SHAPES[style.shape];
      for (const streak of [0, 5, 10]) {
        const grow = streakScale(streak);
        for (const side of [-1, 1]) {
          const from = { x: side * HANG.x, y: top + HANG.above + size.height / 2 };
          const to = { x: 0.2, y: top + (size.height * grow.y) / 2 };
          expect(swingPath(from, to, 0)).toEqual(from);
          const end = swingPath(from, to, 1);
          expect(end.x).toBeCloseTo(to.x);
          expect(end.y).toBeCloseTo(to.y);
          for (let s = 0; s <= 1; s += 0.02) {
            const point = swingPath(from, to, s);
            // Its height grows to the streak size early in the swing (as the game does).
            const height = size.height * (1 + (grow.y - 1) * Math.min(1, s * 2.2));
            expect(point.y - height / 2, `${style.deco} ${streak} ${s}`).toBeGreaterThanOrEqual(top - 1e-9);
          }
        }
      }
    }
  });

  it("swing in under Nib's hop: Nib is always clear of the block, then lands on it", () => {
    const top = 12;
    for (const mode of ["answer", "choice"] as const) {
      for (const style of BLOCK_STYLES) {
        const size = SHAPES[style.shape];
        for (const streak of [0, 5, 10]) {
          const grow = streakScale(streak);
          const finalHeight = size.height * grow.y;
          for (const side of [-1, 1]) {
            for (const landX of [-0.5, 0, 0.5]) {
              const from = { x: side * HANG.x, y: top + HANG.above + size.height / 2 };
              const to = { x: landX, y: top + finalHeight / 2 };
              // Nib stands away from the block (in choice mode, in the middle: it could come from either side).
              const nibFrom = { x: mode === "answer" ? -side * NIB_ASIDE : 0, y: top };
              const nibTo = { x: to.x - side * 0.3, y: top + finalHeight };
              const swing = swingTime(from, to);
              const hop = hopTime(swing);
              const lift = hopLift(nibTo.y - nibFrom.y);
              for (let t = 0; t <= swing; t += 0.005) {
                const s = t / swing;
                const block = swingPath(from, to, s);
                const width = size.width * (1 + (streakScale(streak).x - 1) * Math.min(1, s * 2.2));
                const height = size.height * (1 + (grow.y - 1) * Math.min(1, s * 2.2));
                const nib = hopPath(nibFrom, nibTo, t / hop, lift);
                const apart = Math.abs(block.x - nib.x) >= width / 2 + NIB_BODY.halfWidth
                  || nib.y >= block.y + height / 2 - 0.02
                  || nib.y + NIB_BODY.height <= block.y - height / 2;
                expect(apart, `${mode} ${style.deco} streak ${streak} side ${side} land ${landX} at ${t.toFixed(3)}s`).toBe(true);
              }
              // Nib comes down on top of it.
              expect(hopPath(nibFrom, nibTo, 1, lift).y).toBeCloseTo(top + finalHeight);
            }
          }
        }
      }
    }
  });

  it("land in the order they were released, however quick the answers", () => {
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

  it("land dead on while a streak holds the tower steady, a little off while it sways", () => {
    for (const jitter of [-1, -0.3, 0.6, 1]) {
      expect(Math.abs(landingOffset(0.2, 0, jitter) - 0.2)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(landingOffset(0.2, 1, jitter) - 0.2)).toBeLessThanOrEqual(0.53);
      expect(Math.abs(landingOffset(0.65, 1, jitter))).toBeLessThanOrEqual(0.7);
    }
  });
});

describe("Up the Page tower", () => {
  it("sways more the taller it gets, and not at all on a streak", () => {
    let last = 0;
    for (let height = 0; height <= 40; height += 2) {
      const amount = swayAmount(height, 0);
      expect(amount).toBeGreaterThanOrEqual(last);
      last = amount;
      expect(swayAmount(height, 1)).toBe(0);
    }
    expect(swayAmount(30, 0)).toBeGreaterThan(swayAmount(5, 0) * 3);
  });

  it("bends from the base: the bottom stays put and the top moves most", () => {
    const top = 30;
    expect(swayAt(0, top, 0.4)).toBe(0);
    expect(swayAt(top, top, 0.4)).toBeCloseTo(0.4);
    let last = 0;
    for (let y = 0; y <= top; y += 0.5) {
      const sway = swayAt(y, top, 0.4);
      expect(sway).toBeGreaterThanOrEqual(last);
      last = sway;
    }
  });

  it("frames the top of the tower at the same place on screen, at any height", () => {
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
    for (const top of [0.7, 9, 33]) {
      camera.position.set(0, cameraYFor(top, 18, FOV, -0.27), 18);
      expect(project(camera, 0, top).y).toBeCloseTo(-0.27, 5);
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
