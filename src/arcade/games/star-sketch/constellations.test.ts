import { describe, expect, it } from "vitest";
import { CONSTELLATIONS, decoyFor, linesOf, planSky } from "./constellations";

describe("Star Sketch constellations", () => {
  it("are each one continuous path of 5–7 lines through every star, inside the sky band", () => {
    for (const constellation of CONSTELLATIONS) {
      const lines = linesOf(constellation);
      expect(lines.length, constellation.id).toBeGreaterThanOrEqual(5);
      expect(lines.length, constellation.id).toBeLessThanOrEqual(7);
      for (const [from, to] of lines) {
        expect(from).not.toBe(to);
        expect(constellation.stars[from]).toBeDefined();
        expect(constellation.stars[to]).toBeDefined();
      }
      expect(new Set(constellation.path).size, constellation.id).toBe(constellation.stars.length);
      for (const [x, y] of constellation.stars) {
        expect(Math.abs(x)).toBeLessThanOrEqual(7.2);
        expect(y).toBeGreaterThanOrEqual(-3.6);
        expect(y).toBeLessThanOrEqual(4.2);
      }
    }
  });

  it("plans one line per item, constellation after constellation, never making the pen jump", () => {
    for (let start = 0; start < CONSTELLATIONS.length; start++) {
      const plan = planSky(20, start);
      expect(plan.segments).toHaveLength(20);
      expect(plan.constellations[0]).toBe(start);
      plan.segments.forEach((segment, i) => {
        const constellation = CONSTELLATIONS[plan.constellations[segment.constellation]];
        if (segment.line === 0) expect(segment.from).toBe(constellation.path[0]);
        else expect(segment.from).toBe(plan.segments[i - 1].to);
        expect([segment.from, segment.to]).toEqual(linesOf(constellation)[segment.line]);
      });
    }
    expect(planSky(3, 99).segments).toHaveLength(3);
  });

  it("puts the decoy star clearly on the other side of the real one, clear of the constellation", () => {
    for (const constellation of CONSTELLATIONS) {
      for (const [from, to] of linesOf(constellation)) {
        for (const side of ["left", "right"] as const) {
          const target = constellation.stars[to];
          const decoy = decoyFor(constellation.stars[from], target, side, constellation.stars);
          const label = `${constellation.id} ${from}→${to} ${side}`;
          // The real star is on `side`, so the decoy is on the other side of it, by a clear gap.
          const gap = (decoy[0] - target[0]) * (side === "left" ? 1 : -1);
          expect(gap, label).toBeGreaterThanOrEqual(1.79);
          expect(Math.abs(decoy[0]), label).toBeLessThanOrEqual(8.8);
          expect(Math.hypot(decoy[0] - target[0], decoy[1] - target[1]), label).toBeGreaterThanOrEqual(2.6);
          expect(decoy[1], label).toBeGreaterThanOrEqual(-3.6);
          expect(decoy[1], label).toBeLessThanOrEqual(3.8);
          const nearest = Math.min(...constellation.stars.map(([x, y]) => Math.hypot(x - decoy[0], y - decoy[1])));
          expect(nearest, label).toBeGreaterThanOrEqual(1.2);
        }
      }
    }
  });
});
