import type { EarnedAchievement } from "../history/history-api";
import { ACHIEVEMENT_BY_ID } from "../../../services/learning-history/achievement-catalog.mjs";
import { getTeacher, isTeacherId, PLAIN_AWARDS, type AchievementId } from "../teachers/teachers";
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
 * that lesson or the learner turned playful lines off. */
export function awardLine(achievement: EarnedAchievement, tone: AwardTone): string {
  const teacher = tone === "playful" && isTeacherId(achievement.teacher_id) ? getTeacher(achievement.teacher_id) : null;
  const awards = teacher?.awards ?? PLAIN_AWARDS;
  const template = ORIGINAL.includes(achievement.achievement_id)
    ? awards[achievement.achievement_id as AchievementId]
    : awards.other.replaceAll("{name}", achievementName(achievement.achievement_id));
  return template.replaceAll("{topic}", achievement.topic_name ? topicLabel(achievement.scope, achievement.topic_name) : "这个知识点");
}

/** A one-line classroom announcement that names who presents the award, so an
 * award earned in another teacher's lesson is never claimed by the current one. */
export function awardAnnouncement(achievement: EarnedAchievement, tone: AwardTone): string {
  const name = `「${achievementName(achievement.achievement_id)}${achievement.topic_name ? ` · ${topicLabel(achievement.scope, achievement.topic_name)}` : ""}」`;
  const teacher = tone === "playful" && isTeacherId(achievement.teacher_id) ? getTeacher(achievement.teacher_id) : null;
  return teacher ? `${teacher.name}颁发${name}：${awardLine(achievement, tone)}` : `获得成就${name}：${awardLine(achievement, tone)}`;
}

