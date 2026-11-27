import { describe, expect, it } from "vitest";
import { choicesFor, correctSides, distractorCandidates } from "./choices";
import { expectedAnswer, makeFact, SKILLS } from "./facts";
import { createRng } from "./rng";

describe("two-choice items", () => {
  it("never offers the answer twice and stays within 0–100", () => {
    const rng = createRng(1);
    for (const skill of SKILLS) {
      for (const fact of skill.facts) {
        for (const form of ["result", "missing-left", "missing-right"] as const) {
          if (form !== "result" && fact.op !== "add") continue;
          const item = { fact, form };
          const [left, right] = choicesFor(item, "left", rng);
          expect(left).toBe(expectedAnswer(item));
          expect(right, fact.id).not.toBe(left);
          expect(right >= 0 && right <= 100 && Number.isInteger(right), fact.id).toBe(true);
        }
      }
    }
  });

  it("includes the telling mistakes from the plan", () => {
    expect(distractorCandidates({ fact: makeFact("sub", 9, 8), form: "result" })).toContain(17);
    const table = distractorCandidates({ fact: makeFact("mul", 6, 7), form: "result" });
    expect(table).toEqual(expect.arrayContaining([36, 48]));
    expect(distractorCandidates({ fact: makeFact("add", 9, 3), form: "result" })).toContain(21);
  });

  it("balances sides with at most three in a row", () => {
    for (let seed = 0; seed < 50; seed++) {
      const sides = correctSides(20, createRng(seed));
      expect(sides.filter(side => side === "left")).toHaveLength(10);
      let run = 1;
      for (let i = 1; i < sides.length; i++) {
        run = sides[i] === sides[i - 1] ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(3);
      }
    }
  });
});
