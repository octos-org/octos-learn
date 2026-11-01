import type { CanonicalEvent } from "octos-lesson-language";
import type { RegionLayoutConstraint } from "octos-lesson-language/web-runtime";

import { teachingReadingScale } from "../oll/board-chrome-insets";

/** Each node's creation Step, so the teaching layout forms step columns. */
export function nodeSections(events: CanonicalEvent[]): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const event of events) {
    for (const beat of event.step?.beats ?? []) {
      for (const actions of Object.values(beat.stage ?? {})) {
        for (const action of actions as Array<{ node?: { id?: string } }>) {
          if (action.node?.id && !sections[action.node.id]) sections[action.node.id] = event.step!.id;
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
