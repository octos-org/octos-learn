import type { CanonicalEvent } from "octos-lesson-language";
import type { RegionLayoutConstraint } from "octos-lesson-language/web-runtime";

import { teachingReadingScale } from "../oll/board-chrome-insets";
import { lessonCards } from "./lesson-cards";

/**
 * Each node's creation card, so the teaching layout treats every recorded card
 * as a step: a card that adds a graph or grid starts a row; a card that only
 * writes or explains continues the current row. A card may span several beats.
 */
export function nodeSections(events: CanonicalEvent[]): Record<string, string> {
  const sections: Record<string, string> = {};
  const cards = lessonCards(events);
  const cardOf = new Map(cards.flatMap((card) => card.beatIds.map((beatId) => [beatId, card.beatIds.length === 1 && card.stepId.endsWith(":step:teach") ? beatId : card.stepId] as const)));
  for (const event of events) {
    for (const beat of event.step?.beats ?? []) {
      for (const actions of Object.values(beat.stage ?? {})) {
        for (const action of actions as Array<{ node?: { id?: string } }>) {
          if (action.node?.id && !sections[action.node.id]) sections[action.node.id] = cardOf.get(beat.id) ?? String(beat.id ?? event.step!.id);
        }
      }
    }
  }
  return sections;
}

/** The playback teaching layout for a learner lesson on a board of this size. */
export function teachingRegionLayout(events: CanonicalEvent[], width: number, height: number): Record<string, RegionLayoutConstraint> {
  return {
    __legacy__: {
      x: 20, y: 20, flow: "teaching", nodeSections: nodeSections(events),
      composition: { width, height, mode: "progressive", readingScale: teachingReadingScale() },
    },
  };
}

/** The single topic a learner lesson plays as, with its cards laid out one step each. */
export function learnerLessonTopic(events: CanonicalEvent[], title: string, language: string) {
  const sections = nodeSections(events);
  const stepIds = [...new Set(events.flatMap((event) => (event.step?.id ? [event.step.id] : [])))];
  return { id: "learner-lesson", title, language, stepIds, nodeIds: Object.keys(sections), nodeSections: sections };
}
