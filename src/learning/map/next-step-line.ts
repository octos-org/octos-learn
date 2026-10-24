import type { NextStep } from "../history/history-api";
import { getTeacher, PLAIN_SUGGESTIONS, resolveSelectedTeacherId } from "../teachers/teachers";
import { readAwardTone } from "./award-line";
import { topicLabel } from "./taxonomy-labels";

const VISIBILITY_KEY = "octos-learn-next-steps";

/** The chosen teacher's line, or plain wording when playful lines are off. */
export function nextStepLine(step: NextStep): { speaker: string | null; text: string } {
  const teacher = readAwardTone() === "playful" ? getTeacher(resolveSelectedTeacherId()) : null;
  const template = (teacher?.suggestions ?? PLAIN_SUGGESTIONS)[step.type];
  const text = template.replaceAll("{topic}", topicLabel(step.topic.topic_id, step.topic.name))
    .replaceAll("{target}", step.target ? topicLabel(step.target.topic_id, step.target.name) : "")
    .replaceAll("{days}", String(step.days_away ?? ""));
  return { speaker: teacher?.name ?? null, text };
}

/** The question put in a new board's input box; the learner decides to send it. */
export function nextStepDraft(step: NextStep): string {
  return step.target ? `${topicLabel(step.target.topic_id, step.target.name)}是什么？` : `我想再学一下${topicLabel(step.topic.topic_id, step.topic.name)}`;
}

/** Learners can hide suggestions on this device; nothing is requested while hidden. */
export function nextStepsShown(): boolean {
  try { return localStorage.getItem(VISIBILITY_KEY) !== "hidden"; } catch { return true; }
}
export function showNextSteps(shown: boolean) {
  try { if (shown) localStorage.removeItem(VISIBILITY_KEY); else localStorage.setItem(VISIBILITY_KEY, "hidden"); } catch { /* applies to this page */ }
}
