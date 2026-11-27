import { describe, expect, it } from "vitest";
import { expectedAnswer, factById, factEase, makeFact, promptText, SKILLS, skillById } from "./facts";

describe("arcade skills", () => {
  it("has the fact counts in the plan (§4.1)", () => {
    const counts = Object.fromEntries(SKILLS.map(skill => [skill.id, [
      skill.facts.filter(fact => fact.op === "add" || fact.op === "mul").length,
      skill.facts.filter(fact => fact.op === "sub" || fact.op === "div").length,
    ]]));
    expect(counts).toEqual({
      "add-sub-5": [21, 21],
      "add-sub-10": [66, 66],
      "add-sub-20": [100, 100],
      "mul-2-5-10": [57, 54],
      "mul-3-4-8": [57, 54],
      "mul-div-100": [121, 110],
    });
  });

  it("checks every fact against plain arithmetic, within 0–100", () => {
    for (const skill of SKILLS) {
      const ids = new Set<string>();
      for (const fact of skill.facts) {
        const plain = { add: fact.left + fact.right, sub: fact.left - fact.right, mul: fact.left * fact.right, div: fact.left / fact.right }[fact.op];
        expect(fact.answer, fact.id).toBe(plain);
        expect(Number.isInteger(fact.answer) && fact.answer >= 0 && fact.answer <= 100, fact.id).toBe(true);
        expect(fact.left <= 100 && fact.right <= 100, fact.id).toBe(true);
        expect(fact.id).toMatch(/^[A-Za-z0-9._:-]+$/);
        expect(fact.family).toMatch(/^[A-Za-z0-9._:-]+$/);
        expect(ids.has(fact.id), fact.id).toBe(false);
        ids.add(fact.id);
      }
    }
  });

  it("keeps the sets as defined", () => {
    const within10 = skillById("add-sub-10")!;
    expect(within10.facts.every(fact => fact.op === "add" ? fact.answer <= 10 : fact.left <= 10)).toBe(true);
    const twos = skillById("mul-2-5-10")!;
    expect(twos.facts.filter(fact => fact.op === "mul").every(fact => [2, 5, 10].some(n => fact.left === n || fact.right === n))).toBe(true);
    expect(skillById("mul-div-100")!.facts.some(fact => fact.op === "div" && fact.right === 0)).toBe(false);
  });

  it("shares one id across skills and a family across turned-around facts", () => {
    expect(factById("mul:3:5")).toBe(skillById("mul-2-5-10")!.facts.find(fact => fact.id === "mul:3:5"));
    expect(skillById("mul-3-4-8")!.facts.some(fact => fact.id === "mul:3:5")).toBe(true);
    expect(makeFact("add", 3, 4).family).toBe(makeFact("add", 4, 3).family);
    expect(makeFact("sub", 7, 4).family).toBe(makeFact("add", 3, 4).family);
    expect(makeFact("div", 42, 7).family).toBe(makeFact("mul", 6, 7).family);
    expect(makeFact("add", 2, 2).family).not.toBe(makeFact("mul", 2, 2).family);
  });

  it("asks each form for the right number", () => {
    const fact = makeFact("add", 3, 4);
    expect(promptText({ fact, form: "result" })).toBe("3 + 4 = □");
    expect(expectedAnswer({ fact, form: "result" })).toBe(7);
    expect(promptText({ fact, form: "missing-left" })).toBe("□ + 4 = 7");
    expect(expectedAnswer({ fact, form: "missing-left" })).toBe(3);
    expect(promptText({ fact, form: "missing-right" })).toBe("3 + □ = 7");
    expect(expectedAnswer({ fact, form: "missing-right" })).toBe(4);
    expect(promptText({ fact: makeFact("div", 42, 7), form: "result" })).toBe("42 ÷ 7 = □");
  });

  it("orders easy tables before the rest", () => {
    expect(factEase(makeFact("mul", 2, 7))).toBeLessThan(factEase(makeFact("mul", 3, 7)));
    expect(factEase(makeFact("mul", 10, 9))).toBeLessThan(factEase(makeFact("mul", 6, 7)));
    expect(factEase(makeFact("add", 1, 1))).toBeLessThan(factEase(makeFact("add", 4, 5)));
  });
});
