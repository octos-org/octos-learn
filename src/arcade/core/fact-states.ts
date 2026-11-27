// Per-fact state, derived from recorded answers one at a time in time order
// (plan §4.3, §4.4; rules version arcade-facts-v1). Pure: the same answers
// always give the same states, so clearing answers clears progress.

import type { FactForm } from "./facts";

export const FACT_RULES_VERSION = "arcade-facts-v1";

export type AnswerInput = "keypad" | "ink" | "body" | "tap";
export type AnswerResult = "correct" | "wrong" | "unsure" | "shown";

/** One answer, in the shape of the future `arcade_answer` event (plan §7.9). */
export interface AnswerRecord {
  roundId: string;
  item: number;
  factId: string;
  form: FactForm;
  input: AnswerInput;
  result: AnswerResult;
  /** The number given; absent when unsure or shown. */
  given?: number;
  /** From the item shown to the accepted answer, paused time excluded. */
  totalMs: number;
  /** Epoch milliseconds. */
  at: number;
  /** The device's local calendar day, as days since 1970-01-01 (plan §7.13). */
  day: number;
  /** Body mode only: the two choices and the side taken. */
  choices?: [number, number];
  side?: "left" | "right";
}

/** Time limit T per input (plan §4.3; proposed, tuned in playtests). */
export const QUICK_LIMIT_MS: Record<AnswerInput, number> = { ink: 3000, keypad: 2500, body: 3000, tap: 3000 };

/** Review spacing for quick facts, in days (plan §4.4). */
export const REVIEW_DAYS = [1, 3, 7, 14] as const;

export type FactStatus = "new" | "learning" | "quick" | "slipping";

export interface FactState {
  status: FactStatus;
  attempts: number;
  correct: number;
  /** The last two attempts, oldest first. */
  recent: { quick: boolean; day: number }[];
  /** Index into REVIEW_DAYS of the next review gap, for quick facts. */
  reviewStep: number;
  /** Local day on which the fact is due: for review, or (slipping) at once. */
  dueDay: number | null;
  lastAt: number | null;
  lastResult: "correct" | "wrong" | null;
}

export function newFactState(): FactState {
  return { status: "new", attempts: 0, correct: 0, recent: [], reviewStep: 0, dueDay: null, lastAt: null, lastResult: null };
}

export function localDay(at: number, timezoneOffsetMinutes = new Date(at).getTimezoneOffset()): number {
  return Math.floor((at - timezoneOffsetMinutes * 60_000) / 86_400_000);
}

export function isQuickAnswer(answer: Pick<AnswerRecord, "result" | "totalMs" | "input">): boolean {
  return answer.result === "correct" && answer.totalMs <= QUICK_LIMIT_MS[answer.input];
}

/** Applies one answer. Unsure readings are not attempts (plan §4.5). */
export function applyAnswer(state: FactState, answer: AnswerRecord): FactState {
  if (answer.result === "unsure") return state;
  const correct = answer.result === "correct";
  const quick = isQuickAnswer(answer);
  const recent = [...state.recent, { quick, day: answer.day }].slice(-2);
  const next: FactState = {
    ...state,
    attempts: state.attempts + 1,
    correct: state.correct + (correct ? 1 : 0),
    recent,
    lastAt: answer.at,
    lastResult: correct ? "correct" : "wrong",
  };
  if (!correct) {
    // A miss (or "Show me") on a quick fact makes it slipping; it comes back
    // in the same or the next round.
    return { ...next, status: state.status === "quick" || state.status === "slipping" ? "slipping" : "learning", reviewStep: 0, dueDay: answer.day };
  }
  if (state.status === "quick") {
    if (!quick) return { ...next, reviewStep: 0, dueDay: answer.day + REVIEW_DAYS[0] };
    const step = Math.min(state.reviewStep + 1, REVIEW_DAYS.length - 1);
    return { ...next, reviewStep: step, dueDay: answer.day + REVIEW_DAYS[state.reviewStep] };
  }
  const qualifies = recent.length === 2 && recent.every(entry => entry.quick) && recent[0].day !== recent[1].day;
  if (qualifies) return { ...next, status: "quick", reviewStep: 1, dueDay: answer.day + REVIEW_DAYS[0] };
  return { ...next, status: state.status === "slipping" ? "slipping" : "learning", dueDay: state.status === "slipping" ? answer.day : null };
}

/** Derives every fact's state from answers in any order. */
export function deriveFactStates(answers: readonly AnswerRecord[]): Map<string, FactState> {
  const states = new Map<string, FactState>();
  const ordered = [...answers].sort((a, b) => a.at - b.at || a.item - b.item);
  for (const answer of ordered) states.set(answer.factId, applyAnswer(states.get(answer.factId) ?? newFactState(), answer));
  return states;
}

export function stateOf(states: ReadonlyMap<string, FactState>, factId: string): FactState {
  return states.get(factId) ?? newFactState();
}
