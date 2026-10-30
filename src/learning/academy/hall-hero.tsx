import { formatDate, getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { ArrowRight, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getToken } from "@/api/client";

import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from "@/learning/academy/achievement-catalog";
import { openHistoryApi, type EarnedAchievement, type LearningMap } from "../history/history-api";
import { learningSessionHref } from "../learning-history";
import { updateLearningSession, type LearningSessionRecord } from "../learning-session-store";
import { achievementName } from "../map/award-line";
import { NextSteps } from "../map/next-steps";
import { topicLabel } from "../map/taxonomy-labels";
import { newBoardHref } from "../new-board-href";
import { weeklyReportShown } from "../report/report-week";
import { TeacherCard } from "../teachers/teacher-card";
import { TEACHER_LORE } from "../teachers/teacher-lore";
import { useSelectedTeacher } from "../teachers/teachers";
import { currentWeek, localToday, timeGreeting } from "./achievement-display";
import { Medal } from "./medal";

// Same words as the atlas: a star is lit once it was done without hints;
// every recorded topic leaves a footprint.
type Summary = { lit: number; footprints: number; days: Set<string>; topicDays: string[][]; earned: number; recent: EarnedAchievement[]; title: string | null };

const weekday = (index: number) => new Intl.DateTimeFormat(getLocale(), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + index)));

/** One greeting per visit; the same pick holds while the hall stays open,
 * and follows the teacher if the learner switches. */
function useHallLine(lines: readonly string[]): string {
  const [pick] = useState(() => Math.random());
  return lines[Math.floor(pick * lines.length)] ?? lines[0];
}

function summarize(map: LearningMap, awards: EarnedAchievement[], title: string | null): Summary {
  return {
    lit: map.topics.filter((topic) => topic.state === "did-it").length,
    footprints: map.topics.length,
    days: new Set(map.topics.flatMap((topic) => topic.evidence.days)),
    topicDays: map.topics.map((topic) => topic.evidence.days),
    earned: new Set(awards.map((award) => award.achievement_id)).size,
    recent: [...awards].sort((a, b) => b.earned_at.localeCompare(a.earned_at)).slice(0, 3),
    title,
  };
}

/** The academy hall: a dated greeting, then the chosen teacher standing in
 * the night band beside their own words and the way back into the last board or lesson, a
 * ledger of the star map, this week, the report and the latest awards, and
 * what to do next. The ledger is optional; the hall works the same without it. */
export function HallHero({ recent }: { recent: LearningSessionRecord[] }) {
  useLocale();
  const { teacher } = useSelectedTeacher();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reportShown] = useState(weeklyReportShown);
  const latest = recent[0];
  const line = useHallLine(latest ? teacher.hall.resume : teacher.hall.welcome);
  // Stable, so the suggestions are fetched once rather than on every render.
  const resume = useCallback((session: LearningSessionRecord) => {
    updateLearningSession(session.id, { status: "active" });
    navigate(learningSessionHref(session));
  }, [navigate]);
  const ask = useCallback((draft: string) => navigate(newBoardHref(draft)), [navigate]);
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
  const weekTopics = summary ? summary.topicDays.filter((days) => days.some((day) => week.includes(day))).length : 0;

  return (
    <section className="academy-hall-wrap" aria-labelledby="academy-hello">
      <div className="academy-hall-intro">
        <p className="academy-date">{formatDate(now, { month: "long", day: "numeric", weekday: "long" })}</p>
        <h1 id="academy-hello" className="academy-hello">{summary?.title ? tr("{{greeting}}，{{title}}。", { greeting: timeGreeting(now.getHours()), title: tr(summary.title) }) : tr("{{greeting}}。", { greeting: timeGreeting(now.getHours()) })}</h1>
      </div>
      <div className="academy-hall">
        <div className="academy-greeting">
          <div className="academy-greeting-card"><TeacherCard teacherId={teacher.id} bare /></div>
          <div className="academy-greeting-body">
            <figure className="academy-words">
              <blockquote className="academy-bubble">{line}</blockquote>
              <figcaption><span>{teacher.name}</span>{TEACHER_LORE[teacher.id].post}</figcaption>
            </figure>
            <div className="academy-actions">
              {latest && (
                <Link to={learningSessionHref(latest)} className="academy-primary academy-resume-link" onClick={() => updateLearningSession(latest.id, { status: "active" })}>
                  <span>{tr("继续上次的学习")}<small>{latest.title}</small></span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              )}
              <Link to="/board?new-board=1" className={latest ? "academy-secondary" : "academy-primary"}>
                <Plus size={18} aria-hidden="true" /> {tr("新建空白白板")}</Link>
            </div>
            <Link to="/records" className="academy-more academy-records-link">{tr("全部学习记录") + " "}<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="academy-ledger">
          <div className="academy-ledger-row academy-atlas-card">
            <Link to="/atlas" className="academy-card-link">
              <span className="academy-eyebrow">{tr("星图")}</span>
              {summary ? (
                <span className="academy-stats">
                  <span><b>{summary.lit}</b>{tr("颗已点亮")}</span>
                  <span><b>{summary.footprints}</b>{tr("个知识点留下足迹")}</span>
                </span>
              ) : <span className="academy-muted">{tr("每学完一段讲解或练习，星图上就会留下足迹。")}</span>}
            </Link>
            <div className="academy-week-row">
              <ol className="academy-week" aria-label={tr("这一周来过 {{v0}} 天", { v0: weekDays })}>
                {week.map((day, index) => (
                  <li key={day} data-came={summary?.days.has(day) || undefined} data-today={day === today || undefined} data-future={day > today || undefined}>
                    <i aria-hidden="true" />{weekday(index)}
                  </li>
                ))}
              </ol>
              <span className="academy-muted">{weekDays ? tr("这周来过 {{v0}} 天", { v0: weekDays }) : tr("这周还没来过")}<br />{tr("回来就好，不用天天来")}</span>
            </div>
            <Link to="/atlas" className="academy-more">{tr("打开星图") + " "}<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          {reportShown && (
            <Link to="/records?tab=week" className="academy-ledger-row academy-ledger-link">
              <span className="academy-eyebrow">{tr("学习周报")}</span>
              <span className="academy-ledger-line">
                {weekTopics ? tr("这周学过 {{v0}} 个知识点", { v0: weekTopics }) : tr("这周的学习会整理在这里")}
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          )}
          <Link to="/achievements" className="academy-ledger-row academy-ledger-link">
            <span className="academy-eyebrow">{tr("成就")}{summary ? ` · ${summary.earned} / ${ACHIEVEMENTS.length}` : ""}</span>
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
                      <time dateTime={award.earned_at}>{new Date(award.earned_at).toLocaleDateString(getLocale(), { month: "numeric", day: "numeric" })}</time>
                    </li>
                  );
                })}
              </ul>
            ) : <span className="academy-muted">{tr("还没有成就。完成课程片段或练习后会出现在这里。")}</span>}
          </Link>
        </div>
      </div>
      <div className="academy-next">
        <NextSteps onSelect={resume} onNew={ask} />
      </div>
    </section>
  );
}
