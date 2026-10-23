import type { EarnedAchievement } from "../history/history-api";
import { getTeacher, isTeacherId, PLAIN_AWARDS } from "../teachers/teachers";

/** The presenting teacher's line, or plain wording when no preset teacher gave
 * that lesson or the learner turned playful lines off. */
export function awardLine(achievement: EarnedAchievement, tone: "playful" | "plain"): string {
  const teacher = tone === "playful" && isTeacherId(achievement.teacher_id) ? getTeacher(achievement.teacher_id) : null;
  const template = (teacher?.awards ?? PLAIN_AWARDS)[achievement.achievement_id];
  return template.replaceAll("{topic}", achievement.topic_name ?? "这个知识点");
}
