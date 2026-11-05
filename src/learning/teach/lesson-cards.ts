import type { CanonicalEvent } from "octos-lesson-language";

import { joinSpoken } from "./recording";

/**
 * A recorded card of a learner lesson as it plays: its step, and its beats,
 * one per run of the card's sentences between board actions.
 */
export interface LessonCard {
  /** The card key the studio uses (card-1, card-2, …). */
  key: string;
  stepId: string;
  beatIds: string[];
  /** Everything said on the card, in order. */
  said: string;
}

const keyAfter = (id: string, marker: string) => id.slice(id.lastIndexOf(marker) + marker.length);

/**
 * The cards of a learner lesson, in order. Lessons saved before cards kept
 * their sentences have one step, "teach", with one beat per card; those still
 * play, card by card.
 */
export function lessonCards(events: CanonicalEvent[]): LessonCard[] {
  const steps = events.flatMap((event) => (event.step ? [event.step] : []));
  if (steps.length === 1 && steps[0]!.id.endsWith(":step:teach")) {
    const step = steps[0]!;
    return step.beats.map((beat) => ({ key: keyAfter(beat.id, ":beat:"), stepId: step.id, beatIds: [beat.id], said: beat.narration?.text.trim() ?? "" }));
  }
  return steps.map((step) => ({
    key: keyAfter(step.id, ":step:"),
    stepId: step.id,
    beatIds: step.beats.map((beat) => beat.id),
    said: joinSpoken(step.beats.map((beat) => beat.narration?.text ?? "")),
  }));
}

/** The card a beat belongs to, by index; -1 when the beat is not part of any card. */
export function cardIndexOfBeat(cards: LessonCard[], beatId: string | undefined): number {
  return beatId ? cards.findIndex((card) => card.beatIds.includes(beatId)) : -1;
}
