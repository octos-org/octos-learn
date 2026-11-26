import { describe, expect, it } from "vitest";
import { makeFact, SKILLS, skillById } from "./facts";
import { newFactState, type FactState } from "./fact-states";
import { createRng } from "./rng";
import { planRound, quickShare, requeue, suggestedSkill } from "./schedule";

const TODAY = 100;
function states(entries: Record<string, Partial<FactState>>): Map<string, FactState> {
  return new Map(Object.entries(entries).map(([id, patch]) => [id, { ...newFactState(), ...patch }]));
}

describe("round planning", () => {
  it("fills a first round with 20 items, never the same fact twice in a row", () => {
    for (const skill of SKILLS) {
      for (let seed = 1; seed <= 30; seed++) {
        const plan = planRound(skill, new Map(), createRng(seed), { today: TODAY });
        expect(plan).toHaveLength(20);
        for (let i = 1; i < plan.length; i++) expect(plan[i].fact.id, `${skill.id} seed ${seed}`).not.toBe(plan[i - 1].fact.id);
        expect(plan.every(item => skill.facts.includes(item.fact))).toBe(true);
      }
    }
  });

  it("introduces at most two new facts, easiest first, when other facts are known", () => {
    const skill = skillById("add-sub-5")!;
    const known = Object.fromEntries(skill.facts.slice(5).map(fact => [fact.id, { status: "quick" as const, dueDay: TODAY + 5 }]));
    const plan = planRound(skill, states(known), createRng(3), { today: TODAY });
    // Random fill may draw new facts too; the first singles are the easiest two.
    expect(plan.slice(0, 2).map(item => item.fact.id)).toEqual(["add:0:0", "add:0:1"]);
  });

  it("asks each target up to three times, spaced 2–5 apart", () => {
    const skill = skillById("add-sub-10")!;
    const targets = { "add:3:4": { status: "slipping" as const, lastResult: "wrong" as const }, "sub:9:6": { status: "learning" as const, lastResult: "wrong" as const } };
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planRound(skill, states(targets), createRng(seed), { today: TODAY });
      for (const id of Object.keys(targets)) {
        const positions = plan.flatMap((item, index) => (item.fact.id === id ? [index] : []));
        expect(positions.length, `${id} seed ${seed}`).toBeGreaterThanOrEqual(3);
        const planned = positions.slice(0, 3);
        for (let i = 1; i < planned.length; i++) expect(planned[i] - planned[i - 1]).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("asks due reviews before random fill", () => {
    const skill = skillById("mul-2-5-10")!;
    const known = Object.fromEntries(skill.facts.map(fact => [fact.id, { status: "quick" as const, dueDay: TODAY + 3 }]));
    known["mul:2:7"] = { status: "quick", dueDay: TODAY - 1 };
    const plan = planRound(skill, states(known), createRng(9), { today: TODAY });
    expect(plan[0].fact.id).toBe("mul:2:7");
  });

  it("uses missing-addend forms only on addition from add-sub-10 up", () => {
    const forms = (id: string) => Array.from({ length: 40 }, (_, seed) => planRound(skillById(id)!, new Map(), createRng(seed), { today: TODAY })).flat();
    expect(forms("add-sub-5").every(item => item.form === "result")).toBe(true);
    const items = forms("add-sub-10");
    const missing = items.filter(item => item.form !== "result");
    expect(missing.every(item => item.fact.op === "add")).toBe(true);
    const share = missing.length / items.filter(item => item.fact.op === "add").length;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.3);
  });

  it("brings a missed fact back 2–4 items later and keeps the length", () => {
    const skill = skillById("add-sub-10")!;
    const remaining = planRound(skill, new Map(), createRng(4), { today: TODAY }).slice(0, 10);
    const fact = makeFact("add", 6, 3);
    for (let seed = 0; seed < 20; seed++) {
      const next = requeue(remaining, fact, createRng(seed));
      expect(next).toHaveLength(10);
      const at = next.findIndex(item => item.fact.id === fact.id);
      expect(at + 1).toBeGreaterThanOrEqual(2);
      expect(at + 1).toBeLessThanOrEqual(4);
    }
  });

  it("suggests the lowest skill with fewer than 90% of facts quick", () => {
    const first = SKILLS[0];
    expect(suggestedSkill(SKILLS, new Map()).id).toBe("add-sub-5");
    const quick = states(Object.fromEntries(first.facts.map(fact => [fact.id, { status: "quick" as const }])));
    expect(quickShare(first, quick)).toBe(1);
    expect(suggestedSkill(SKILLS, quick).id).toBe("add-sub-10");
  });
});
