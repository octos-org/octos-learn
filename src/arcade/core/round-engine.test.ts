import { describe, expect, it } from "vitest";
import { expectedAnswer, makeFact, skillById, type Item } from "./facts";
import type { AnswerRecord } from "./fact-states";
import { createRng } from "./rng";
import { ROUND_TIMING, RoundEngine, streakBonus, type Clock, type RoundEvent, type RoundMode, type RoundSummary } from "./round-engine";

class FakeClock implements Clock {
  time = Date.UTC(2026, 10, 26, 17);
  private queue: { at: number; run: () => void; id: number }[] = [];
  private nextId = 1;
  now() { return this.time; }
  setTimeout(run: () => void, ms: number) { const id = this.nextId++; this.queue.push({ at: this.time + ms, run, id }); return id; }
  clearTimeout(handle: unknown) { this.queue = this.queue.filter(entry => entry.id !== handle); }
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.queue[0];
      if (!next || next.at > end) break;
      this.queue.shift();
      this.time = next.at;
      next.run();
    }
    this.time = end;
  }
}

const skill = skillById("add-sub-10")!;
const PLAN: Item[] = [[3, 4], [5, 2], [6, 1], [2, 2], [4, 4]].map(([a, b]) => ({ fact: makeFact("add", a, b), form: "result" as const }));

function setup(mode: RoundMode = "answer", plan = PLAN) {
  const clock = new FakeClock();
  const answers: AnswerRecord[] = [];
  const events: RoundEvent[] = [];
  let summary: RoundSummary | null = null;
  const engine = new RoundEngine({
    roundId: "round-1", skill, gameId: "margin-run", plan, mode, input: mode === "answer" ? "keypad" : "tap", rng: createRng(7), clock,
    onAnswer: answer => answers.push(answer), onEnd: value => { summary = value; },
  });
  engine.subscribe(event => events.push(event));
  engine.start();
  clock.advance(ROUND_TIMING.countdownStepMs * 3);
  return { engine, clock, answers, events, summary: () => summary };
}
const current = (engine: RoundEngine) => expectedAnswer(engine.snapshot().item!);

describe("round engine", () => {
  it("counts down, then shows the first item", () => {
    const { engine, events } = setup();
    expect(events.map(event => event.type)).toEqual(["round_start", "countdown", "countdown", "countdown", "item_shown"]);
    expect(engine.snapshot()).toMatchObject({ phase: "asking", index: 0, tokens: ["3", "+", "4", "=", null] });
  });

  it("accepts a correct number at once and times it to acceptance", () => {
    const { engine, clock, answers, events } = setup();
    clock.advance(1800);
    engine.type("7");
    expect(answers[0]).toMatchObject({ factId: "add:3:4", result: "correct", given: 7, totalMs: 1800, input: "keypad" });
    expect(events.at(-1)).toMatchObject({ type: "answer_correct", streak: 1, gained: 5, quick: true });
    clock.advance(ROUND_TIMING.correctMs);
    expect(engine.snapshot().index).toBe(1);
  });

  it("waits for more digits, then judges a wrong number after idle or ✓", () => {
    const plan: Item[] = [{ fact: makeFact("add", 6, 6), form: "result" }, ...PLAN];
    const { engine, clock, answers } = setup("answer", plan);
    engine.type("1");
    clock.advance(5000);
    expect(answers).toHaveLength(0);
    engine.type("13");
    clock.advance(ROUND_TIMING.keypadIdleMs - 1);
    expect(answers).toHaveLength(0);
    clock.advance(1);
    expect(answers[0]).toMatchObject({ result: "wrong", given: 13 });
    clock.advance(ROUND_TIMING.wrongMs);
    engine.type("8");
    engine.confirm();
    expect(answers[1]).toMatchObject({ result: "wrong", given: 8 });
  });

  it("brings a missed fact back 2–4 items later and resets only the streak", () => {
    const { engine, clock, events } = setup();
    engine.type(String(current(engine)));
    clock.advance(ROUND_TIMING.correctMs);
    engine.type("9");
    clock.advance(ROUND_TIMING.keypadIdleMs);
    expect(engine.snapshot()).toMatchObject({ streak: 0, inkDrops: 5 });
    expect(events.at(-1)).toMatchObject({ type: "answer_wrong", expected: 7, given: 9 });
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      clock.advance(ROUND_TIMING.wrongMs + ROUND_TIMING.correctMs);
      seen.push(engine.snapshot().item!.fact.id);
      engine.type(String(current(engine)));
    }
    expect(seen).toContain("add:5:2");
  });

  it("offers Show me after 8 s and records it as shown", () => {
    const { engine, clock, answers, events } = setup();
    clock.advance(ROUND_TIMING.hintMs);
    expect(engine.snapshot().hint).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "show_me_hint" });
    engine.showMe();
    expect(answers[0]).toMatchObject({ result: "shown" });
    expect(answers[0].given).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: "answer_shown", expected: 7 });
  });

  it("excludes paused time from the answer time", () => {
    const { engine, clock, answers } = setup();
    clock.advance(1000);
    engine.pause();
    clock.advance(60_000);
    engine.type("7");
    expect(answers).toHaveLength(0);
    engine.resume();
    clock.advance(500);
    engine.type("7");
    expect(answers[0].totalMs).toBe(1500);
  });

  it("plays a two-choice round and records both choices and the side", () => {
    const { engine, answers, clock } = setup("choice");
    const [left, right] = engine.snapshot().choices!;
    const side = left === 7 ? "left" : "right";
    expect([left, right]).toContain(7);
    engine.choose(side);
    expect(answers[0]).toMatchObject({ result: "correct", side, choices: [left, right], input: "tap" });
    clock.advance(ROUND_TIMING.correctMs);
    const choices = engine.snapshot().choices!;
    engine.choose(choices[0] === current(engine) ? "right" : "left");
    expect(answers[1].result).toBe("wrong");
  });

  it("moves on at once when the child picks the right answer after a miss, without a new attempt", () => {
    const { engine, clock, answers, events } = setup("choice");
    const [left] = engine.snapshot().choices!;
    const wrongSide = left === 7 ? "right" : "left";
    const rightSide = wrongSide === "left" ? "right" : "left";
    engine.choose(wrongSide);
    expect(engine.snapshot().phase).toBe("feedback");
    clock.advance(300);
    engine.choose(wrongSide);
    expect(engine.snapshot()).toMatchObject({ phase: "feedback", index: 0 });
    engine.choose(rightSide);
    expect(events.at(-2)).toMatchObject({ type: "answer_corrected", index: 0, given: 7, side: rightSide });
    expect(engine.snapshot()).toMatchObject({ phase: "asking", index: 1, streak: 0 });
    expect(answers).toHaveLength(1);
    expect(answers[0].result).toBe("wrong");
    // The cancelled feedback timer must not skip the next item.
    clock.advance(ROUND_TIMING.wrongMs);
    expect(engine.snapshot()).toMatchObject({ phase: "asking", index: 1 });
  });

  it("lets the number pad fix a miss or a Show me by typing the answer", () => {
    const { engine, clock, answers } = setup();
    engine.type("9");
    clock.advance(ROUND_TIMING.keypadIdleMs);
    expect(engine.snapshot()).toMatchObject({ phase: "feedback", typed: "" });
    engine.type("7");
    expect(engine.snapshot()).toMatchObject({ phase: "asking", index: 1 });
    engine.showMe();
    engine.type("7");
    expect(engine.snapshot()).toMatchObject({ phase: "asking", index: 2 });
    expect(answers.map(answer => answer.result)).toEqual(["wrong", "shown"]);
  });

  it("adds streak bonuses and ends with a summary; leaving early keeps answers", () => {
    expect([1, 2, 3, 4, 5, 10, 15].map(streakBonus)).toEqual([0, 0, 5, 0, 10, 15, 15]);
    const full = setup();
    for (let i = 0; i < PLAN.length; i++) {
      full.engine.type(String(current(full.engine)));
      full.clock.advance(ROUND_TIMING.correctMs);
    }
    expect(full.summary()).toMatchObject({ reason: "finished", answered: 5, correct: 5, bestStreak: 5, inkDrops: 5 * 5 + 5 + 10 });
    const early = setup();
    early.engine.type("7");
    early.engine.leave();
    expect(early.summary()).toMatchObject({ reason: "left", answered: 1 });
    expect(early.engine.snapshot().phase).toBe("results");
  });

  it("replays the same round from the same seed", () => {
    const log = () => {
      const { engine, clock, events } = setup("choice");
      for (let i = 0; i < 5; i++) { engine.choose("left"); clock.advance(ROUND_TIMING.wrongMs); }
      return events;
    };
    expect(log()).toEqual(log());
  });
});
