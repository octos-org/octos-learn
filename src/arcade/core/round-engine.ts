// The round engine (plan §7.3): a plain state machine with an injectable clock
// and seeded randomness. Only the engine decides correctness, score and the
// next item; pages and games just render its events.

import { choicesFor, correctSides, type Side } from "./choices";
import { expectedAnswer, promptTokens, type Item, type Skill } from "./facts";
import { isQuickAnswer, localDay, type AnswerInput, type AnswerRecord, type AnswerResult } from "./fact-states";
import type { Rng } from "./rng";
import { requeue } from "./schedule";

export type RoundMode = "answer" | "choice";
export type RoundPhase = "intro" | "countdown" | "asking" | "feedback" | "results";
export type EndReason = "finished" | "left";

export interface RoundSummary {
  roundId: string;
  skillId: string;
  gameId: string;
  input: AnswerInput;
  reason: EndReason;
  answered: number;
  correct: number;
  inkDrops: number;
  bestStreak: number;
  startedAt: number;
  endedAt: number;
}

export type RoundEvent =
  | { type: "round_start"; total: number; mode: RoundMode; input: AnswerInput }
  | { type: "countdown"; remaining: number }
  | { type: "item_shown"; index: number; item: Item; tokens: (string | null)[]; choices?: [number, number] }
  | { type: "input_started"; index: number }
  | { type: "answer_correct"; index: number; given: number; streak: number; gained: number; inkDrops: number; totalMs: number; quick: boolean; side?: Side }
  | { type: "answer_wrong"; index: number; given: number; expected: number; side?: Side }
  | { type: "answer_shown"; index: number; expected: number }
  | { type: "show_me_hint"; index: number }
  | { type: "streak_milestone"; streak: number; bonus: number }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "round_end"; summary: RoundSummary };

export interface RoundSnapshot {
  phase: RoundPhase;
  paused: boolean;
  index: number;
  total: number;
  item: Item | null;
  tokens: (string | null)[];
  choices: [number, number] | null;
  typed: string;
  streak: number;
  bestStreak: number;
  inkDrops: number;
  answered: number;
  correct: number;
  hint: boolean;
  countdown: number;
  /** Set during feedback: the last answer's outcome. */
  outcome: { result: Exclude<AnswerResult, "unsure">; expected: number; given?: number } | null;
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Timings (proposed; tuned in the owner's playtest). */
export const ROUND_TIMING = {
  countdownStepMs: 800,
  correctMs: 750,
  wrongMs: 1500,
  shownMs: 2200,
  /** Number pad: a wrong answer is judged after this idle time (plan §7.5). */
  keypadIdleMs: 1500,
  /** "Show me" is offered after this long without input (plan §4.5). */
  hintMs: 8000,
};

/** Ink-drop streak bonuses (plan §5.4; proposed). */
export function streakBonus(streak: number): number {
  if (streak === 3) return 5;
  if (streak === 5) return 10;
  if (streak >= 10 && streak % 5 === 0) return 15;
  return 0;
}
export const INK_PER_CORRECT = 5;

export interface RoundOptions {
  roundId: string;
  skill: Skill;
  gameId: string;
  plan: Item[];
  mode: RoundMode;
  input: AnswerInput;
  rng: Rng;
  clock?: Clock;
  /** Called with each answer as it is decided, for the device store. */
  onAnswer?: (answer: AnswerRecord) => void;
  onEnd?: (summary: RoundSummary) => void;
}

type Listener = (event: RoundEvent, snapshot: RoundSnapshot) => void;
type Timer = "phase" | "idle" | "hint";

export class RoundEngine {
  private readonly clock: Clock;
  private readonly listeners = new Set<Listener>();
  private readonly timers = new Map<Timer, { handle: unknown; due: number; run: () => void }>();
  private readonly paused = new Map<Timer, { left: number; run: () => void }>();
  private readonly sides: Side[];
  private plan: Item[];
  private state: RoundSnapshot;
  private startedAt = 0;
  private shownAt = 0;
  private pausedAt: number | null = null;
  private pausedInItem = 0;
  private inputSeen = false;

  private readonly options: RoundOptions;

  constructor(options: RoundOptions) {
    this.options = options;
    this.clock = options.clock ?? systemClock;
    this.plan = [...options.plan];
    this.sides = correctSides(this.plan.length, options.rng);
    this.state = {
      phase: "intro", paused: false, index: -1, total: this.plan.length, item: null, tokens: [], choices: null, typed: "",
      streak: 0, bestStreak: 0, inkDrops: 0, answered: 0, correct: 0, hint: false, countdown: 0, outcome: null,
    };
  }

  snapshot(): RoundSnapshot {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.state.phase !== "intro") return;
    this.startedAt = this.clock.now();
    this.emit({ type: "round_start", total: this.plan.length, mode: this.options.mode, input: this.options.input });
    this.countdown(3);
  }

  /** Number pad: the value typed so far. A correct value is accepted at once (decision 9). */
  type(value: string): void {
    if (!this.canAnswer() || this.options.mode !== "answer") return;
    const typed = value.replace(/\D/g, "").slice(0, 3);
    this.noteInput();
    this.update({ typed });
    this.cancel("idle");
    if (!typed) return;
    const expected = expectedAnswer(this.state.item!);
    if (Number(typed) === expected) {
      this.judge("correct", expected);
      return;
    }
    if (typed.length >= String(expected).length) this.arm("idle", ROUND_TIMING.keypadIdleMs, () => this.judge("wrong", Number(typed)));
  }

  /** Number pad ✓ or Enter. */
  confirm(): void {
    if (!this.canAnswer() || this.options.mode !== "answer" || !this.state.typed) return;
    const given = Number(this.state.typed);
    this.judge(given === expectedAnswer(this.state.item!) ? "correct" : "wrong", given);
  }

  /** Choice mode: a tap or (from M2) a confirmed body movement. */
  choose(side: Side): void {
    if (!this.canAnswer() || this.options.mode !== "choice" || !this.state.choices) return;
    this.noteInput();
    const given = this.state.choices[side === "left" ? 0 : 1];
    this.judge(given === expectedAnswer(this.state.item!) ? "correct" : "wrong", given, side);
  }

  showMe(): void {
    if (!this.canAnswer()) return;
    this.judge("shown");
  }

  pause(): void {
    if (this.state.paused || this.state.phase === "results" || this.state.phase === "intro") return;
    this.pausedAt = this.clock.now();
    for (const [name, timer] of this.timers) {
      this.clock.clearTimeout(timer.handle);
      this.paused.set(name, { left: Math.max(0, timer.due - this.pausedAt), run: timer.run });
    }
    this.timers.clear();
    this.update({ paused: true });
    this.emit({ type: "paused" });
  }

  resume(): void {
    if (!this.state.paused) return;
    if (this.pausedAt !== null) this.pausedInItem += this.clock.now() - this.pausedAt;
    this.pausedAt = null;
    const waiting = [...this.paused];
    this.paused.clear();
    this.update({ paused: false });
    for (const [name, timer] of waiting) this.arm(name, timer.left, timer.run);
    this.emit({ type: "resumed" });
  }

  /** Leaving early ends the round; its answers still count (plan §4.5). */
  leave(): void {
    if (this.state.phase === "results") return;
    this.finish("left");
  }

  dispose(): void {
    for (const timer of this.timers.values()) this.clock.clearTimeout(timer.handle);
    this.timers.clear();
    this.paused.clear();
    this.listeners.clear();
  }

  private canAnswer(): boolean {
    return this.state.phase === "asking" && !this.state.paused && this.state.item !== null;
  }

  private noteInput(): void {
    this.cancel("hint");
    if (this.state.hint) this.update({ hint: false });
    this.arm("hint", ROUND_TIMING.hintMs, () => this.offerHint());
    if (this.inputSeen) return;
    this.inputSeen = true;
    this.emit({ type: "input_started", index: this.state.index });
  }

  private offerHint(): void {
    this.update({ hint: true });
    this.emit({ type: "show_me_hint", index: this.state.index });
  }

  private countdown(remaining: number): void {
    if (remaining === 0) {
      this.show(0);
      return;
    }
    this.update({ phase: "countdown", countdown: remaining });
    this.emit({ type: "countdown", remaining });
    this.arm("phase", ROUND_TIMING.countdownStepMs, () => this.countdown(remaining - 1));
  }

  private show(index: number): void {
    if (index >= this.plan.length) {
      this.finish("finished");
      return;
    }
    const item = this.plan[index];
    const choices = this.options.mode === "choice" ? choicesFor(item, this.sides[index], this.options.rng) : null;
    this.shownAt = this.clock.now();
    this.pausedInItem = 0;
    this.inputSeen = false;
    const tokens = promptTokens(item);
    this.update({ phase: "asking", index, item, tokens, choices, typed: "", hint: false, outcome: null, countdown: 0 });
    this.emit({ type: "item_shown", index, item, tokens, ...(choices ? { choices } : {}) });
    this.arm("hint", ROUND_TIMING.hintMs, () => this.offerHint());
  }

  private judge(result: Exclude<AnswerResult, "unsure">, given?: number, side?: Side): void {
    const item = this.state.item!;
    const index = this.state.index;
    const expected = expectedAnswer(item);
    const at = this.clock.now();
    const totalMs = Math.max(0, at - this.shownAt - this.pausedInItem);
    this.cancel("idle");
    this.cancel("hint");

    const record: AnswerRecord = {
      roundId: this.options.roundId, item: index, factId: item.fact.id, form: item.form, input: this.options.input,
      result, totalMs, at, day: localDay(at),
      ...(given !== undefined && result !== "shown" ? { given } : {}),
      ...(this.state.choices ? { choices: this.state.choices } : {}),
      ...(side ? { side } : {}),
    };
    this.options.onAnswer?.(record);

    const answered = this.state.answered + 1;
    if (result === "correct") {
      const streak = this.state.streak + 1;
      const bonus = streakBonus(streak);
      const gained = INK_PER_CORRECT + bonus;
      const inkDrops = this.state.inkDrops + gained;
      this.update({ phase: "feedback", streak, bestStreak: Math.max(this.state.bestStreak, streak), inkDrops, answered, correct: this.state.correct + 1, outcome: { result, expected, given }, hint: false });
      this.emit({ type: "answer_correct", index, given: expected, streak, gained, inkDrops, totalMs, quick: isQuickAnswer(record), ...(side ? { side } : {}) });
      if (bonus) this.emit({ type: "streak_milestone", streak, bonus });
      this.arm("phase", ROUND_TIMING.correctMs, () => this.show(index + 1));
      return;
    }

    // Wrong or shown: the streak resets, ink drops stay, the fact comes back.
    this.plan = [...this.plan.slice(0, index + 1), ...requeue(this.plan.slice(index + 1), item.fact, this.options.rng)];
    this.update({ phase: "feedback", streak: 0, answered, outcome: { result, expected, ...(given !== undefined && result === "wrong" ? { given } : {}) }, hint: false });
    if (result === "wrong") this.emit({ type: "answer_wrong", index, given: given!, expected, ...(side ? { side } : {}) });
    else this.emit({ type: "answer_shown", index, expected });
    this.arm("phase", result === "wrong" ? ROUND_TIMING.wrongMs : ROUND_TIMING.shownMs, () => this.show(index + 1));
  }

  private finish(reason: EndReason): void {
    for (const timer of this.timers.values()) this.clock.clearTimeout(timer.handle);
    this.timers.clear();
    this.paused.clear();
    const summary: RoundSummary = {
      roundId: this.options.roundId, skillId: this.options.skill.id, gameId: this.options.gameId, input: this.options.input, reason,
      answered: this.state.answered, correct: this.state.correct, inkDrops: this.state.inkDrops, bestStreak: this.state.bestStreak,
      startedAt: this.startedAt || this.clock.now(), endedAt: this.clock.now(),
    };
    this.update({ phase: "results", paused: false, hint: false });
    this.options.onEnd?.(summary);
    this.emit({ type: "round_end", summary });
  }

  private arm(name: Timer, ms: number, run: () => void): void {
    this.cancel(name);
    if (this.state.paused) {
      this.paused.set(name, { left: ms, run });
      return;
    }
    const handle = this.clock.setTimeout(() => {
      this.timers.delete(name);
      run();
    }, ms);
    this.timers.set(name, { handle, due: this.clock.now() + ms, run });
  }

  private cancel(name: Timer): void {
    const timer = this.timers.get(name);
    if (timer) this.clock.clearTimeout(timer.handle);
    this.timers.delete(name);
    this.paused.delete(name);
  }

  private update(patch: Partial<RoundSnapshot>): void {
    this.state = { ...this.state, ...patch };
  }

  private emit(event: RoundEvent): void {
    for (const listener of [...this.listeners]) listener(event, this.state);
  }
}
