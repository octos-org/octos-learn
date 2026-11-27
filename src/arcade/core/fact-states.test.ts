import { describe, expect, it } from "vitest";
import { deriveFactStates, localDay, type AnswerRecord } from "./fact-states";

const DAY = 86_400_000;
let item = 0;
function answer(day: number, result: AnswerRecord["result"], totalMs = 1200, factId = "add:3:4", input: AnswerRecord["input"] = "keypad"): AnswerRecord {
  return { roundId: "r", item: item++, factId, form: "result", input, result, totalMs, at: day * DAY + 10 * 3_600_000 + item, day };
}

describe("fact states (arcade-facts-v1)", () => {
  it("needs two quick correct answers on different days", () => {
    expect(deriveFactStates([answer(1, "correct"), answer(1, "correct")]).get("add:3:4")!.status).toBe("learning");
    const states = deriveFactStates([answer(1, "correct"), answer(2, "correct")]);
    expect(states.get("add:3:4")).toMatchObject({ status: "quick", dueDay: 3, attempts: 2, correct: 2 });
  });

  it("does not count slow answers as quick", () => {
    expect(deriveFactStates([answer(1, "correct", 2600), answer(2, "correct")]).get("add:3:4")!.status).toBe("learning");
    expect(deriveFactStates([answer(1, "correct", 2900, "add:3:4", "tap"), answer(2, "correct", 2900, "add:3:4", "tap")]).get("add:3:4")!.status).toBe("quick");
  });

  it("makes a quick fact slipping after a miss or Show me, due at once", () => {
    const base = [answer(1, "correct"), answer(2, "correct")];
    expect(deriveFactStates([...base, answer(4, "wrong")]).get("add:3:4")).toMatchObject({ status: "slipping", dueDay: 4 });
    expect(deriveFactStates([...base, answer(4, "shown")]).get("add:3:4")!.status).toBe("slipping");
    expect(deriveFactStates([...base, answer(4, "wrong"), answer(4, "correct"), answer(5, "correct")]).get("add:3:4")!.status).toBe("quick");
  });

  it("spaces reviews 1, 3, 7 and then 14 days", () => {
    const answers = [answer(1, "correct"), answer(2, "correct")];
    const dues = [];
    let day = 2;
    for (let i = 0; i < 5; i++) {
      const state = deriveFactStates(answers).get("add:3:4")!;
      dues.push(state.dueDay! - day);
      day = state.dueDay!;
      answers.push(answer(day, "correct"));
    }
    expect(dues).toEqual([1, 3, 7, 14, 14]);
  });

  it("keeps a quick fact quick after a slow correct answer, due sooner", () => {
    const state = deriveFactStates([answer(1, "correct"), answer(2, "correct"), answer(3, "correct"), answer(6, "correct", 2700)]).get("add:3:4")!;
    expect(state).toMatchObject({ status: "quick", dueDay: 7, reviewStep: 0 });
  });

  it("ignores unsure readings and is independent of input order", () => {
    const answers = [answer(1, "correct"), answer(1, "unsure"), answer(2, "correct")];
    expect(deriveFactStates(answers).get("add:3:4")!.attempts).toBe(2);
    expect(deriveFactStates([...answers].reverse())).toEqual(deriveFactStates(answers));
  });

  it("uses the local calendar day", () => {
    // 23:50 and 00:10 local time in UTC−8 are different local days but the same UTC day.
    const offset = 480;
    const before = Date.UTC(2026, 10, 26, 7, 50);
    const after = Date.UTC(2026, 10, 26, 8, 10);
    expect(localDay(after, offset) - localDay(before, offset)).toBe(1);
    expect(localDay(after, 0) - localDay(before, 0)).toBe(0);
  });
});
