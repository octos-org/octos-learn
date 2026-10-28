import type { EarnedAchievement } from "../history/history-api";
import { ACHIEVEMENT_BY_ID } from "../../../services/learning-history/achievement-catalog.mjs";
import { getTeacher, isTeacherId, PLAIN_AWARDS, type AchievementId, type TeacherDefinition, type TitledAchievementId } from "../teachers/teachers";
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

/** The presenting teacher's line, or plain wording when no preset teacher gave
 * that lesson or the learner turned playful lines off. A caller that knows
 * better who presents (the ceremony) passes the teacher. */
export function awardLine(achievement: EarnedAchievement, tone: AwardTone,
  presenter: TeacherDefinition | null = tone === "playful" && isTeacherId(achievement.teacher_id) ? getTeacher(achievement.teacher_id) : null): string {
  const teacher = tone === "playful" ? presenter : null;
  const awards = teacher?.awards ?? PLAIN_AWARDS;
  const id = achievement.achievement_id;
  const definition = ACHIEVEMENT_BY_ID.get(id);
  const template = ORIGINAL.includes(id) ? awards[id as AchievementId]
    : awards.titled?.[id as TitledAchievementId]
      ?? (definition && awards.rarity?.[definition.rarity])
      ?? awards.other;
  return template.replaceAll("{name}", achievementName(id))
    .replaceAll("{topic}", achievement.topic_name ? topicLabel(achievement.scope, achievement.topic_name) : "这个知识点");
}
