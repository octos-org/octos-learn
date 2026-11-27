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

const isAnswerTask = (definition: AuthoringStudentTask | undefined): definition is AuthoringAnswerStudentTask | AuthoringRowStudentTask =>
  definition?.completion.kind === "numeric_answer" || definition?.completion.kind === "numeric_row";

/**
 * Whether a typed answer or a row of blanks waits on the card task before it (OLL decision 0026). The card task has
 * no "done" (`auto_submit`: the tap that completes the card submits it) and works the card this answer is anchored
 * to; between them there may be only other answers and rows anchored to the same card (two typed answers in a row,
 * a row then an answer). The answer then shows from the start, disabled, where it goes (the owner's accepted sketch
 * for 35P-07: seeing where the answer goes mattered).
 *
 * It waits while that card task is open, and then while one of the answers before it on the same card is open:
 * OLL opens one task at a time, so after the completing tap the first answer opens and the next ones stay greyed
 * where they go until their turn, rather than turning into "complete the previous practice".
 */
export function answerWaitsOnCardTask(
  taskId: string,
  tasks: readonly StudentTaskSnapshot[],
  definitions: readonly AuthoringStudentTask[],
): boolean {
  const index = definitions.findIndex((definition) => definition.as === taskId);
  const answer = definitions[index];
  if (!isAnswerTask(answer)) return false;
  const snapshot = (id: string) => tasks.find((task) => task.task_id === id);
  if (snapshot(answer.as)?.available) return false;
  // Back over the answers on the same card to the card task they follow.
  const between: string[] = [];
  for (let at = index - 1; at >= 0; at -= 1) {
    const before = definitions[at]!;
    if (isAnswerTask(before)) {
      if (before.anchor !== answer.anchor) return false;
      between.push(before.as);
      continue;
    }
    if (before.completion.kind !== "card_fact" || before.completion.node !== answer.anchor) return false;
    const card = snapshot(before.as);
    if (card?.auto_submit !== true) return false;
    const open = (task: StudentTaskSnapshot | undefined) => task?.available === true && task.status !== "succeeded";
    return open(card) || (card.status === "succeeded" && between.some((id) => open(snapshot(id))));
  }
  return false;
}

/** What the last typed answer got wrong: its value, or only its written form. */
export function lastAnswerMistake(card: AnswerTaskCard): "value" | "form" | undefined {
  const last = card.attempts.at(-1);
  if (!last || last.succeeded || last.answer === undefined || card.definition.completion.kind !== "numeric_answer") return undefined;
  const check = checkNumericAnswer(card.definition.completion, last.answer);
  return check.readable && !check.succeeded ? check.reason : undefined;
}
