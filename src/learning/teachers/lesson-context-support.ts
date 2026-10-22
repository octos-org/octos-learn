import type { SkillActionDefinition } from "@/api/skill-actions";

export type LessonContextField = "tutor_context" | "learner_context";
const FIELDS: readonly LessonContextField[] = ["tutor_context", "learner_context"];

/** Which context fields each installed lesson action declares. Lesson actions
 * reject undeclared fields, so a field is sent only when the installed
 * Learning Coach advertises it; an older install keeps working unchanged. */
export function lessonContextSupport(actions: readonly SkillActionDefinition[]): Map<string, Set<LessonContextField>> {
  const support = new Map<string, Set<LessonContextField>>();
  for (const action of actions) {
    const properties = (action.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
    support.set(action.id, new Set(FIELDS.filter((field) => field in properties)));
  }
  return support;
}
