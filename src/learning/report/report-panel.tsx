import { getLocale, localizedCatalog, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { getToken } from "../../api/client";
import { ACHIEVEMENT_BY_ID } from "@/learning/academy/achievement-catalog";
import { Medal } from "../academy/medal";
import { openHistoryApi, type MapState, type MonthlyReport, type WeeklyReport } from "../history/history-api";
import { achievementName, readAwardTone } from "../map/award-line";
import { domainLabel, subjectLabel, topicLabel } from "../map/taxonomy-labels";
import { TEACHER_LORE } from "../teachers/teacher-lore";
import { getTeacher, PLAIN_REPORT, resolveSelectedTeacherId } from "../teachers/teachers";
import { localDayOf, monthLabel, shiftMonth, shiftWeek, weekLabel, weekStartOf } from "./report-week";

export type ReportPeriod = "week" | "month";

const STATE_LABEL: Record<MapState, string> = localizedCatalog({ explored: "已探索", practising: "正在练习", "did-it": "做出来过" });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { month: "numeric", day: "numeric" });

function ReportBody({ report }: { report: WeeklyReport | MonthlyReport }) {
  useLocale();
  const teacher = readAwardTone() === "playful" ? getTeacher(resolveSelectedTeacherId()) : null;
  const lines = teacher?.report ?? PLAIN_REPORT;
  const monthly = "month" in report;
  // A model comment shows only for the teacher it was written as, on these exact facts.
  const comment = !monthly && teacher && report.comment && report.comment_teacher_id === teacher.id ? report.comment : null;
  const { activity } = report;
  const quiet = !activity.runs && !report.achievements.length;
  const lit = report.topics.filter(topic => !topic.state_before);
  const raised = report.topics.filter(topic => topic.state_before && topic.change);
  const place = (topic: WeeklyReport["topics"][number]) => `${subjectLabel(topic.subject)} · ${domainLabel(topic.domain)}`;
  const opening = quiet ? (monthly ? lines.monthQuiet : lines.quiet) : comment ?? (monthly ? lines.monthActive : lines.active);
  const stats = [
    [tr("学了"), activity.days.length, tr("天")], [tr("上了"), activity.runs, tr("节课")], [tr("播放"), activity.played_beats, tr("段")],
    [tr("练习"), activity.task_attempts, tr("次")], [tr("提问"), activity.questions, tr("个")],
  ] as const;
  return <>
    <div className="academy-report-band" data-quiet={quiet || undefined}>
      <figure className="academy-report-words">
        <blockquote>{opening}</blockquote>
        {teacher && <figcaption><span>{teacher.name}</span>{TEACHER_LORE[teacher.id].post}</figcaption>}
      </figure>
      {!quiet && <dl className="academy-report-stats" aria-label={stats.map(([verb, value, unit]) => `${verb} ${value} ${unit}`).join("，")}>
        {stats.map(([verb, value, unit]) => <div key={unit}><dt>{verb}</dt><dd><b>{value}</b>{unit}</dd></div>)}
      </dl>}
      {monthly && !quiet && report.weeks.length > 0 && <ol className="academy-report-weeks" aria-label={tr("每周来过的天数")}>
        {report.weeks.map(week => <li key={week.week_start} aria-label={tr("{{v0}} {{v1}} 天", { v0: weekLabel(week.week_start), v1: week.days })}>
          <span>{weekLabel(week.week_start).split("–")[0]}</span>
          <span className="academy-report-dots" aria-hidden="true">{Array.from({ length: 7 }, (_, day) => <i key={day} data-on={day < week.days || undefined} />)}</span>
          <b>{week.days} {tr("天")}</b>
        </li>)}
      </ol>}
    </div>
    {comment && <p className="academy-report-note">{tr("老师评语由模型根据本周记录生成，可在设置中关闭。")}</p>}
    {!quiet && (lit.length > 0 || raised.length > 0 || report.achievements.length > 0) && <div className="academy-report-sections">
      {lit.length > 0 && <section aria-label={tr("新点亮")}><h3>{tr("新点亮")}<small>{lit.length}</small></h3><ul>
        {lit.map(topic => <li key={topic.topic_id}>
          <small>{place(topic)}</small>
          <strong>{topicLabel(topic.topic_id, topic.name)}</strong>
          <span className="academy-state" data-state={topic.state_after}>{STATE_LABEL[topic.state_after]}</span>
        </li>)}
      </ul></section>}
      {raised.length > 0 && <section aria-label={tr("状态变化")}><h3>{tr("状态变化")}<small>{raised.length}</small></h3><ul>
        {raised.map(topic => <li key={topic.topic_id}>
          <small>{place(topic)}</small>
          <strong>{topicLabel(topic.topic_id, topic.name)}</strong>
          <span className="academy-state" data-state={topic.state_after}>{STATE_LABEL[topic.state_before!]} → {STATE_LABEL[topic.state_after]}</span>
          <em>{shortDay(topic.change!.occurred_at)}，{topic.state_after === "did-it" ? tr("不用提示达到练习要求") : topic.change!.kind === "task_attempt" ? tr("做了相关练习") : tr("播放了相关讲解")}</em>
        </li>)}
      </ul></section>}
      {report.achievements.length > 0 && <section aria-label={tr("新成就")}><h3>{tr("新成就")}<small>{report.achievements.length}</small></h3><ul className="academy-report-awards">
        {report.achievements.map(item => {
          const definition = ACHIEVEMENT_BY_ID.get(item.achievement_id);
          return <li key={`${item.achievement_id}:${item.scope}`}>
            {definition && <Medal achievement={definition} className="academy-report-medal" />}
            <strong>{achievementName(item.achievement_id)}</strong>
            {item.topic_name && <small>{topicLabel(item.scope, item.topic_name)}</small>}
            <em>{shortDay(item.earned_at)}</em>
          </li>;
        })}
      </ul></section>}
    </div>}
    {!quiet && <p className="academy-report-closing">{lines.closing}</p>}
    <p className="academy-report-note">{tr("这些记录说明你学过、练过什么，都不等于已经掌握。")}</p>
  </>;
}

/** The weekly or monthly report, paged back to the first period with records. */
export function ReportPanel({ period, today = () => new Date() }: { period: ReportPeriod; today?: () => Date }) {
  const locale = useLocale();
  const current = weekStartOf(localDayOf(today()));
  const currentMonth = localDayOf(today()).slice(0, 7);
  const [week, setWeek] = useState(current);
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<WeeklyReport | MonthlyReport>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const token = getToken();
    void Promise.resolve().then(() => {
      if (!token) throw new Error("signed out");
      return openHistoryApi(token);
    }).then((api): Promise<WeeklyReport | MonthlyReport> => period === "week" ? api.weeklyReport(week) : api.monthlyReport(month)).then(next => {
      if (active) { setReport(next); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [period, week, month, locale]);

  const shown = period === "week"
    ? (report && "week_start" in report && report.week_start === week ? report : undefined)
    : (report && "month" in report && report.month === month ? report : undefined);
  const first = shown && ("month" in shown ? shown.first_month : shown.first_week);
  const at = period === "week" ? week : month, now = period === "week" ? current : currentMonth;
  const go = (step: number) => { setError(false); if (period === "week") setWeek(shiftWeek(week, step)); else setMonth(shiftMonth(month, step)); };
  const unit = period === "week" ? tr("周") : tr("个月");
  const name = period === "week" ? tr("周报") : tr("月报");
  return <div className="academy-report">
    <nav className="academy-report-nav" aria-label={tr("选择{{v0}}", { v0: period === "week" ? tr("周") : tr("月") })}>
      <button type="button" aria-label={tr("上一{{v0}}", { v0: unit })} disabled={!first || at <= first} onClick={() => go(-1)}><ChevronLeft size={18} aria-hidden="true" /><span>{tr("上一")}{unit}</span></button>
      <h2>{at === now ? (period === "week" ? tr("本周") : tr("本月")) : name}<span>{period === "week" ? weekLabel(week) : monthLabel(month)}</span></h2>
      <button type="button" aria-label={tr("下一{{v0}}", { v0: unit })} disabled={at >= now} onClick={() => go(1)}><span>{tr("下一")}{unit}</span><ChevronRight size={18} aria-hidden="true" /></button>
    </nav>
    {error ? <p role="status" className="academy-report-status">{tr("暂时读不到")}{name}{tr("，请稍后再试。")}</p>
      : !shown ? <p role="status" className="academy-report-status">{tr("正在整理")}{name}…</p>
        : <ReportBody report={shown} />}
  </div>;
}
