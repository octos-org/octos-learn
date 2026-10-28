import type { ReflectionSnapshot } from "octos-lesson-language/web-runtime";

import type { OllLessonOutlineTopic } from "./use-oll-lesson-runtime";

/** The thinking questions the learner can see, each with the lesson topic
 * that poses it: a question opens once the after-lesson window is open or its
 * topic has played to the end. The board's cards and the lesson context both
 * read this, so they never disagree. */
export function visibleReflections(
  reflections: readonly ReflectionSnapshot[],
  outline: readonly OllLessonOutlineTopic[],
  cursor: number,
): (ReflectionSnapshot & { topic: OllLessonOutlineTopic })[] {
  return reflections.flatMap((reflection) => {
    const topic = outline.find((candidate) => candidate.nodeIds?.includes(reflection.anchor))
      ?? (outline.length === 1 ? outline[0] : undefined);
    if (!topic) return [];
    const end = topic.steps.at(-1)?.end_cursor;
    const topicEnded = typeof end === "number" && cursor >= end;
    return reflection.available || topicEnded ? [{ ...reflection, topic }] : [];
  });
}
