// Two-choice items for choice mode (plan §7.6): one correct answer and one
// plausible wrong one, with the correct side balanced across the round.

import { expectedAnswer, type Item } from "./facts";
import type { Rng } from "./rng";

export type Side = "left" | "right";

const MAX_ANSWER = 100;

/** Plausible wrong answers, most telling first. */
export function distractorCandidates(item: Item): number[] {
  const expected = expectedAnswer(item);
  const { fact, form } = item;
  const telling: number[] = [];
  if (form === "result") {
    // The other operation's result (9 − 8 → 17).
    if (fact.op === "add") telling.push(Math.abs(fact.left - fact.right));
    if (fact.op === "sub") telling.push(fact.left + fact.right);
    if (fact.op === "mul") telling.push(fact.left + fact.right, fact.left * (fact.right + 1), fact.left * (fact.right - 1), (fact.left + 1) * fact.right, (fact.left - 1) * fact.right);
    if (fact.op === "div") telling.push(fact.left - fact.right, fact.answer + 1, fact.answer - 1);
  } else {
    // □ + b = c: adding instead of taking away.
    telling.push(fact.answer + (form === "missing-left" ? fact.right : fact.left));
  }
  if (expected >= 10) {
    const swapped = Number(String(expected).split("").reverse().join(""));
    telling.push(swapped);
  }
  const near = [expected + 1, expected - 1, expected + 2, expected - 2];
  const valid = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_ANSWER && value !== expected;
  return [...new Set([...telling, ...near].filter(valid))];
}

export function pickDistractor(item: Item, rng: Rng): number {
  const candidates = distractorCandidates(item);
  const expected = expectedAnswer(item);
  const near = candidates.filter(value => Math.abs(value - expected) <= 2);
  const telling = candidates.filter(value => !near.includes(value));
  // Half the time a "telling" mistake, when the fact has one.
  if (telling.length && rng.next() < 0.5) return rng.pick(telling);
  return rng.pick(near.length ? near : candidates);
}

/**
 * Correct sides for a round: balanced, and never the same side more than 3
 * times in a row.
 */
export function correctSides(count: number, rng: Rng): Side[] {
  for (;;) {
    const sides: Side[] = rng.shuffle(Array.from({ length: count }, (_, i) => (i % 2 === 0 ? "left" : "right")));
    let run = 1;
    let ok = true;
    for (let i = 1; i < sides.length && ok; i++) {
      run = sides[i] === sides[i - 1] ? run + 1 : 1;
      if (run > 3) ok = false;
    }
    if (ok) return sides;
  }
}

export function choicesFor(item: Item, correctSide: Side, rng: Rng): [number, number] {
  const correct = expectedAnswer(item);
  const wrong = pickDistractor(item, rng);
  return correctSide === "left" ? [correct, wrong] : [wrong, correct];
}
