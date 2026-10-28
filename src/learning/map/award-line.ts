import type { EarnedAchievement } from "../history/history-api";
import { ACHIEVEMENT_BY_ID } from "../../../services/learning-history/achievement-catalog.mjs";
import { getTeacher, isTeacherId, PLAIN_AWARDS, resolveSelectedTeacherId, type AchievementId, type TeacherDefinition, type TitledAchievementId } from "../teachers/teachers";
import { topicLabel } from "./taxonomy-labels";

const ORIGINAL: readonly string[] = ["first-footprint", "did-it-alone", "regular-guest", "reunion"];

/** The catalog name; an id the app does not know yet shows as itself. */
export function achievementName(id: string): string {
  return ACHIEVEMENT_BY_ID.get(id)?.name ?? id;
}
const TONE_KEY = "octos-learn-award-tone";
export type AwardTone = "playful" | "plain";

export function readAwardTone(): AwardTone {
  try { return localStorage.getItem(TONE_KEY) === "plain" ? "plain" : "playful"; } catch { return "playful"; }
}
export function saveAwardTone(tone: AwardTone) {
  try { localStorage.setItem(TONE_KEY, tone); } catch { /* applies to this page */ }
}

/** Who presents an award: the teacher of the lesson that earned it, else the
 * learner's current teacher; nobody when playful lines are off. The ceremony
 * and the achievement hall both use this. */
export function awardPresenter(achievement: EarnedAchievement, tone: AwardTone): TeacherDefinition | null {
  if (tone !== "playful") return null;
  return getTeacher(isTeacherId(achievement.teacher_id) ? achievement.teacher_id : resolveSelectedTeacherId());
}

/** The presenter's line, or plain wording when playful lines are off. */
export function awardLine(achievement: EarnedAchievement, tone: AwardTone): string {
  const awards = awardPresenter(achievement, tone)?.awards;
  const id = achievement.achievement_id;
  const definition = ACHIEVEMENT_BY_ID.get(id);
  const template = ORIGINAL.includes(id) ? (awards ?? PLAIN_AWARDS)[id as AchievementId]
    : awards ? awards.titled[id as TitledAchievementId] ?? (definition ? awards.rarity[definition.rarity] : awards.other)
      : PLAIN_AWARDS.other;
  return template.replaceAll("{name}", achievementName(id))
    .replaceAll("{topic}", achievement.topic_name ? topicLabel(achievement.scope, achievement.topic_name) : "这个知识点");
}
