import type { StudentTaskSnapshot } from "octos-lesson-language/web-runtime";

/**
 * Whether a card task with no "done" (`auto_submit`, OLL decision 0026) offers its hint before any attempt.
 *
 * Elsewhere the hint button comes after a try that was not right: a typed answer, a slider let go, a card's "done".
 * A card task the completing tap submits records no attempt until it has succeeded, so its authored hints would
 * never be reachable. Its refused taps are not attempts either: the card answers each one itself with a fact at the
 * column, and they never reach the task's snapshot. So the hint is offered from the moment the task opens, while
 * hints are left; a learner who has not found where to start (the hint the trade lessons author is "Start with any
 * column.") is the one who needs it. Every other task keeps the button after its first attempt.
 */
export function cardTaskHintFromStart(task: Pick<StudentTaskSnapshot, "auto_submit" | "available" | "status" | "hints" | "hints_revealed">): boolean {
  return task.auto_submit === true && task.available && task.status !== "succeeded" && task.hints_revealed < task.hints.length;
}
