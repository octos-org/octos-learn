import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getToken } from "@/api/client";

import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from "../../../services/learning-history/achievement-catalog.mjs";
import { openHistoryApi, type EarnedAchievement, type LearningMap } from "../history/history-api";
import { learningSessionHref } from "../learning-history";
import type { LearningSessionRecord } from "../learning-session-store";
import { achievementName } from "../map/award-line";
import { topicLabel } from "../map/taxonomy-labels";
import { TeacherPortrait } from "../teachers/teacher-portrait";
import { useSelectedTeacher } from "../teachers/teachers";
import { currentWeek, localToday, timeGreeting } from "./achievement-display";
import { Medal } from "./medal";

// Same words as the atlas: a star is lit once it was done without hints;
// every recorded topic leaves a footprint.
type Summary = { lit: number; footprints: number; days: Set<string>; earned: number; recent: EarnedAchievement[]; title: string | null };

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function summarize(map: LearningMap, awards: EarnedAchievement[], title: string | null): Summary {
  return {
    lit: map.topics.filter((topic) => topic.state === "did-it").length,
    footprints: map.topics.length,
    days: new Set(map.topics.flatMap((topic) => topic.evidence.days)),
    earned: new Set(awards.map((award) => award.achievement_id)).size,
    recent: [...awards].sort((a, b) => b.earned_at.localeCompare(a.earned_at)).slice(0, 3),
    title,
  };
}

/** The academy hall: a dated greeting, the chosen teacher in front of their
 * own window scene with the last board, then the star map, this week and the
 * latest awards. The summary is optional; the hall works the same without it. */
export function HallHero({ latest }: { latest: LearningSessionRecord | undefined }) {
  const { teacher } = useSelectedTeacher();
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    void openHistoryApi(token)
      .then((api) => Promise.all([api.learningMap(), api.achievements()]))
      .then(([map, awards]) => { if (active) setSummary(summarize(map, awards.achievements, awards.title?.name ?? null)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const now = new Date();
  const today = localToday(now);
  const week = currentWeek(today);
  const weekDays = summary ? week.filter((day) => summary.days.has(day)).length : 0;

  return (
    <section className="academy-hall-wrap" aria-labelledby="academy-hello">
      <div className="academy-hall-intro">
        <p className="academy-date">{now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{WEEKDAYS[(now.getDay() + 6) % 7]}</p>
        <h1 id="academy-hello" className="academy-hello">{timeGreeting(now.getHours())}{summary?.title ? `，${summary.title}` : ""}。</h1>
      </div>
      <div className="academy-hall">
        <div className="academy-greeting">
          <span className="academy-greeting-portrait">
            <TeacherPortrait teacherId={teacher.id} pose="idle" frame="card" name={teacher.name} />
          </span>
          <div className="academy-greeting-body">
            <p className="academy-bubble">{latest ? teacher.hall.resume : teacher.hall.welcome}</p>
            <div className="academy-actions">
              {latest && (
                <Link to={learningSessionHref(latest)} className="academy-primary">
                  继续上次的白板 <ArrowRight size={18} aria-hidden="true" />
                </Link>
              )}
              <Link to="/board?new-board=1" className={latest ? "academy-secondary" : "academy-primary"}>
                <Plus size={18} aria-hidden="true" /> 新建空白白板
              </Link>
            </div>
          </div>
        </div>
        <div className="academy-glance">
          <div className="academy-card academy-atlas-card">
            <Link to="/atlas" className="academy-card-link">
              <span className="academy-eyebrow">星图</span>
              <strong>你的知识星图</strong>
              {summary ? (
                <span className="academy-stats">
                  <span><b>{summary.lit}</b>颗已点亮</span>
                  <span><b>{summary.footprints}</b>个知识点留下足迹</span>
                </span>
              ) : <span className="academy-muted">每学完一段讲解或练习，星图上就会留下足迹。</span>}
            </Link>
            <div className="academy-week-row">
              <ol className="academy-week" aria-label={`这一周来过 ${weekDays} 天`}>
                {week.map((day, index) => (
                  <li key={day} data-came={summary?.days.has(day) || undefined} data-today={day === today || undefined} data-future={day > today || undefined}>
                    <i aria-hidden="true" />{WEEKDAYS[index]}
                  </li>
                ))}
              </ol>
              <span className="academy-muted">{weekDays ? `这周来过 ${weekDays} 天` : "这周还没来过"}<br />回来就好，不用天天来</span>
            </div>
            <Link to="/atlas" className="academy-more">打开星图 <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <Link to="/achievements" className="academy-card">
            <span className="academy-eyebrow">成就殿{summary ? ` · ${summary.earned} / ${ACHIEVEMENTS.length}` : ""}</span>
            {summary?.recent.length ? (
              <ul className="academy-awards">
                {summary.recent.map((award) => {
                  const definition = ACHIEVEMENT_BY_ID.get(award.achievement_id);
                  return (
                    <li key={`${award.achievement_id}:${award.scope}`}>
                      {definition ? <Medal achievement={definition} className="academy-awards-medal" /> : <i aria-hidden="true" />}
                      <span>
                        {achievementName(award.achievement_id)}
                        {award.topic_name ? ` · ${topicLabel(award.scope, award.topic_name)}` : ""}
                      </span>
                      <time dateTime={award.earned_at}>{new Date(award.earned_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</time>
                    </li>
                  );
                })}
              </ul>
            ) : <span className="academy-muted">还没有成就。完成课程片段或练习后会出现在这里。</span>}
          </Link>
        </div>
      </div>
    </section>
  );
}
