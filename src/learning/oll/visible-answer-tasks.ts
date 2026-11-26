import { checkNumericAnswer, type AuthoringAnswerStudentTask, type AuthoringRowStudentTask, type AuthoringStudentTask } from "octos-lesson-language";
import type { StudentTaskSnapshot } from "octos-lesson-language/web-runtime";

import type { OllLessonOutlineTopic } from "./use-oll-lesson-runtime";

export type AnswerTaskCard = StudentTaskSnapshot & {
  /** A typed answer, or a row of blanks (decision 0023 amendment 1). */
  definition: AuthoringAnswerStudentTask | AuthoringRowStudentTask;
  topic: OllLessonOutlineTopic;
};

/** The typed-answer tasks the learner can see, each with the lesson topic
 * whose card poses it. Like a thinking question, a task appears once it is
 * open or its topic has played to the end (the newest topic only once
 * delivery has settled); one that is not open yet shows as locked. */
export function visibleAnswerTasks(
  tasks: readonly StudentTaskSnapshot[],
  definitions: ReadonlyMap<string, AuthoringAnswerStudentTask | AuthoringRowStudentTask>,
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

/**
 * Whether a typed answer waits on the card task just before it (OLL decision 0026): that task is open, has no
 * "done" (`auto_submit`: the tap that completes the card submits it), and works the card this answer is anchored
 * to. The answer box then shows from the start, disabled, and opens on the completing tap (the owner's accepted
 * sketch for 35P-07: seeing where the answer goes mattered).
 */
export function answerWaitsOnCardTask(
  taskId: string,
  tasks: readonly StudentTaskSnapshot[],
  definitions: readonly AuthoringStudentTask[],
): boolean {
  const index = definitions.findIndex((definition) => definition.as === taskId);
  const answer = definitions[index];
  const before = index > 0 ? definitions[index - 1] : undefined;
  if (answer?.completion.kind !== "numeric_answer" || before?.completion.kind !== "card_fact") return false;
  if ((answer as AuthoringAnswerStudentTask).anchor !== before.completion.node) return false;
  const card = tasks.find((task) => task.task_id === before.as);
  return card?.auto_submit === true && card.available && card.status !== "succeeded";
}

/** What the last typed answer got wrong: its value, or only its written form. */
export function lastAnswerMistake(card: AnswerTaskCard): "value" | "form" | undefined {
  const last = card.attempts.at(-1);
  if (!last || last.succeeded || last.answer === undefined || card.definition.completion.kind !== "numeric_answer") return undefined;
  const check = checkNumericAnswer(card.definition.completion, last.answer);
  return check.readable && !check.succeeded ? check.reason : undefined;
}
