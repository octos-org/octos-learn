import { checkNumericAnswer, type AuthoringAnswerStudentTask } from "octos-lesson-language";
import type { StudentTaskSnapshot } from "octos-lesson-language/web-runtime";

import type { OllLessonOutlineTopic } from "./use-oll-lesson-runtime";

export type AnswerTaskCard = StudentTaskSnapshot & {
  definition: AuthoringAnswerStudentTask;
  topic: OllLessonOutlineTopic;
};

/** The typed-answer tasks the learner can see, each with the lesson topic
 * whose card poses it. Like a thinking question, a task appears once it is
 * open or its topic has played to the end (the newest topic only once
 * delivery has settled); one that is not open yet shows as locked. */
export function visibleAnswerTasks(
  tasks: readonly StudentTaskSnapshot[],
  definitions: ReadonlyMap<string, AuthoringAnswerStudentTask>,
  outline: readonly OllLessonOutlineTopic[],
  cursor: number,
  settled: boolean,
): AnswerTaskCard[] {
  return tasks.flatMap((task) => {
    const definition = definitions.get(task.task_id);
    if (!definition) return [];
    const topic = outline.find((candidate) => candidate.nodeIds?.includes(definition.anchor))
      ?? (outline.length === 1 ? outline[0] : undefined);
    if (!topic) return [];
    const end = topic.steps.at(-1)?.end_cursor;
    const topicEnded = typeof end === "number" && cursor >= end && (settled || topic !== outline.at(-1));
    return task.available || topicEnded || task.status !== "not_started"
      ? [{ ...task, definition, topic }]
      : [];
  });
}

/** What the last typed answer got wrong: its value, or only its written form. */
export function lastAnswerMistake(card: AnswerTaskCard): "value" | "form" | undefined {
  const last = card.attempts.at(-1);
  if (!last || last.succeeded || last.answer === undefined) return undefined;
  const check = checkNumericAnswer(card.definition.completion, last.answer);
  return check.readable && !check.succeeded ? check.reason : undefined;
}
