import type { NextStep } from "../history/history-api";
import { getTeacher, PLAIN_SUGGESTIONS, resolveSelectedTeacherId } from "../teachers/teachers";
import { readAwardTone } from "./award-line";
import { topicLabel } from "./taxonomy-labels";
import { topicDraft } from "./topic-prompts";

/** The chosen teacher's line, or plain wording when playful lines are off. */
export function nextStepLine(step: NextStep): { speaker: string | null; text: string } {
  const teacher = readAwardTone() === "playful" ? getTeacher(resolveSelectedTeacherId()) : null;
  const template = (teacher?.suggestions ?? PLAIN_SUGGESTIONS)[step.type];
  const text = template.replaceAll("{topic}", topicLabel(step.topic.topic_id, step.topic.name))
    .replaceAll("{target}", step.target ? topicLabel(step.target.topic_id, step.target.name) : "")
    .replaceAll("{days}", String(step.days_away ?? ""));
  return { speaker: teacher?.name ?? null, text };
}

/** The question put in a new board's input box; the learner decides to send
 * it. A step towards a new topic starts from its real-life question; continuing
 * or revisiting a topic starts from a problem to try. */
export function nextStepDraft(step: NextStep): Promise<string> {
  return step.target ? topicDraft(step.target.topic_id, step.target.name, "hook") : topicDraft(step.topic.topic_id, step.topic.name, "try");
}
