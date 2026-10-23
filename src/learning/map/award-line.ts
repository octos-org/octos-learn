import type { EarnedAchievement } from "../history/history-api";
import { getTeacher, isTeacherId, PLAIN_AWARDS, type AchievementId } from "../teachers/teachers";

export const ACHIEVEMENT_NAME: Record<AchievementId, string> = {
  "first-footprint": "初来乍到", "did-it-alone": "亲手搞定", "regular-guest": "常驻嘉宾", reunion: "老朋友重逢",
};
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
  const template = (teacher?.awards ?? PLAIN_AWARDS)[achievement.achievement_id];
  return template.replaceAll("{topic}", achievement.topic_name ?? "这个知识点");
}

/** A one-line classroom announcement that names who presents the award, so an
 * award earned in another teacher's lesson is never claimed by the current one. */
export function awardAnnouncement(achievement: EarnedAchievement, tone: AwardTone): string {
  const name = `「${ACHIEVEMENT_NAME[achievement.achievement_id]}${achievement.topic_name ? ` · ${achievement.topic_name}` : ""}」`;
  const teacher = tone === "playful" && isTeacherId(achievement.teacher_id) ? getTeacher(achievement.teacher_id) : null;
  return teacher ? `${teacher.name}颁发${name}：${awardLine(achievement, tone)}` : `获得成就${name}：${awardLine(achievement, tone)}`;
}

