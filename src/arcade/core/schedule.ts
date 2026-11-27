// Round composition (plan §4.5): targets, then due reviews, then up to two
// new facts, then random facts from the skill. Entertainment first: no
// placement round, and the fill is simply random (decision 10).

import { factEase, type Fact, type FactForm, type Item, type Skill } from "./facts";
import { stateOf, type FactState } from "./fact-states";
import type { Rng } from "./rng";

export const ROUND_LENGTH = 20;
const MAX_TARGETS = 4;
const TARGET_REPEATS = 3;
const MAX_NEW = 2;
const MISSING_ADDEND_SHARE = 0.2;

export interface PlanOptions {
  length?: number;
  today: number;
}

function chooseForm(fact: Fact, skill: Skill, rng: Rng): FactForm {
  if (!skill.missingAddend || fact.op !== "add" || rng.next() >= MISSING_ADDEND_SHARE) return "result";
  return rng.next() < 0.5 ? "missing-left" : "missing-right";
}

function isDue(state: FactState, today: number): boolean {
  return state.status === "quick" && state.dueDay !== null && state.dueDay <= today;
}

/**
 * Plans the items of one round. The plan never asks the same fact twice in a
 * row, unless the skill has only one fact.
 */
export function planRound(skill: Skill, states: ReadonlyMap<string, FactState>, rng: Rng, options: PlanOptions): Item[] {
  const length = options.length ?? ROUND_LENGTH;
  const facts = skill.facts;
  const withState = facts.map(fact => ({ fact, state: stateOf(states, fact.id) }));

  // 1. Targets: slipping first, then learning facts most recently missed.
  const targets = rng.shuffle(withState.filter(({ state }) => state.status === "slipping" || state.status === "learning"))
    .sort((a, b) => {
      const rank = (state: FactState) => (state.status === "slipping" ? 0 : 1) * 2 + (state.lastResult === "wrong" ? 0 : 1);
      return rank(a.state) - rank(b.state);
    })
    .slice(0, MAX_TARGETS)
    .map(({ fact }) => fact);

  // 2. Due reviews, the longest overdue first.
  const reviews = rng.shuffle(withState.filter(({ state }) => isDue(state, options.today)))
    .sort((a, b) => (a.state.dueDay ?? 0) - (b.state.dueDay ?? 0))
    .map(({ fact }) => fact);

  // 3. New facts, easiest first.
  const fresh = withState.filter(({ state }) => state.status === "new")
    .sort((a, b) => factEase(a.fact) - factEase(b.fact))
    .slice(0, MAX_NEW)
    .map(({ fact }) => fact);

  const singles = [...reviews, ...fresh];
  const pending = targets.map((fact, index) => ({ fact, left: TARGET_REPEATS, earliest: index * 2 }));
  const plan: Fact[] = [];
  let singleIndex = 0;
  const previous = () => plan.at(-1);

  for (let position = 0; position < length; position++) {
    const target = pending.find(entry => entry.left > 0 && entry.earliest <= position && entry.fact !== previous());
    if (target) {
      plan.push(target.fact);
      target.left -= 1;
      target.earliest = position + rng.range(2, 5);
      continue;
    }
    while (singleIndex < singles.length && singles[singleIndex] === previous()) singleIndex++;
    if (singleIndex < singles.length) {
      plan.push(singles[singleIndex++]);
      continue;
    }
    // 4. Random fill (decision 10), leaving targets to their own spacing.
    const open = facts.filter(fact => fact !== previous() && !targets.includes(fact));
    const choices = open.length ? open : facts.length > 1 ? facts.filter(fact => fact !== previous()) : facts;
    plan.push(rng.pick(choices));
  }
  return plan.map(fact => ({ fact, form: chooseForm(fact, skill, rng) }));
}

/**
 * After a wrong answer or "Show me", the fact comes back 2–4 items later
 * (plan §4.5). Only the remaining items change; the round keeps its length by
 * dropping the last remaining item.
 */
export function requeue(remaining: readonly Item[], fact: Fact, rng: Rng): Item[] {
  if (!remaining.length) return [];
  const at = Math.min(rng.range(1, 3), remaining.length);
  const next = [...remaining];
  next.splice(at, 0, { fact, form: "result" });
  next.pop();
  // Keep the same fact from appearing twice in a row.
  for (let i = 1; i < next.length; i++) {
    if (next[i].fact.id === next[i - 1].fact.id && i + 1 < next.length) [next[i], next[i + 1]] = [next[i + 1], next[i]];
  }
  return next;
}

/** Share of the skill's facts that are quick, 0–1. */
export function quickShare(skill: Skill, states: ReadonlyMap<string, FactState>): number {
  const quick = skill.facts.filter(fact => stateOf(states, fact.id).status === "quick").length;
  return quick / skill.facts.length;
}

/** The suggested skill: the lowest with fewer than 90% of its facts quick (plan §4.6). */
export function suggestedSkill(skills: readonly Skill[], states: ReadonlyMap<string, FactState>): Skill {
  return skills.find(skill => quickShare(skill, states) < 0.9) ?? skills[skills.length - 1];
}
