import type { SkillActionDefinition } from "@/api/skill-actions";

export type LessonContextField = "teacher_profile" | "learner_background" | "current_lesson" | "teacher_experiences";
const FIELDS: readonly LessonContextField[] = ["teacher_profile", "learner_background", "current_lesson", "teacher_experiences"];

/** Which host context fields each installed lesson action declares. Lesson
 * actions reject undeclared fields, and the older tutor_context and
 * learner_context carry a different meaning, so only these dedicated fields are
 * sent and only when the installed Learning Coach advertises them. */
export function lessonContextSupport(actions: readonly SkillActionDefinition[]): Map<string, Set<LessonContextField>> {
  const support = new Map<string, Set<LessonContextField>>();
  for (const action of actions) {
    const properties = (action.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
    support.set(action.id, new Set(FIELDS.filter((field) => field in properties)));
  }
  return support;
}
