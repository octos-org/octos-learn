import { useEffect, useState } from "react";

import { getToken } from "../../api/client";
import { openHistoryApi, type MapState, type MonthlyReport, type WeeklyReport } from "../history/history-api";
import { achievementName, readAwardTone } from "../map/award-line";
import { domainLabel, subjectLabel, topicLabel } from "../map/taxonomy-labels";
import { getTeacher, PLAIN_REPORT, resolveSelectedTeacherId } from "../teachers/teachers";
import { localDayOf, monthLabel, shiftMonth, shiftWeek, weekLabel, weekStartOf } from "./report-week";
import { NextSteps } from "../map/next-steps";
import type { LearningSessionRecord } from "../learning-session-store";

const STATE_LABEL: Record<MapState, string> = { explored: "已探索", practising: "正在练习", "did-it": "做出来过" };
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });

function ReportBody({ report }: { report: WeeklyReport | MonthlyReport }) {
  const teacher = readAwardTone() === "playful" ? getTeacher(resolveSelectedTeacherId()) : null;
  const lines = teacher?.report ?? PLAIN_REPORT;
  const monthly = "month" in report;
  // A model comment shows only for the teacher it was written as, on these exact facts.
  const comment = !monthly && teacher && report.comment && report.comment_teacher_id === teacher.id ? report.comment : null;
  const { activity } = report;
  const lit = report.topics.filter(topic => !topic.state_before);
  const raised = report.topics.filter(topic => topic.state_before && topic.change);
  const place = (topic: WeeklyReport["topics"][number]) => `${subjectLabel(topic.subject)}·${domainLabel(topic.domain)}`;
  if (!activity.runs && !report.achievements.length) {
    return <p className="weekly-report-opening">{teacher ? `${teacher.name}：` : ""}{monthly ? lines.monthQuiet : lines.quiet}</p>;
  }
  return <>
    <p className="weekly-report-opening">{teacher ? `${teacher.name}：` : ""}{comment ?? (monthly ? lines.monthActive : lines.active)}</p>
    {comment && <p className="weekly-report-meaning">老师评语由模型根据本周记录生成，可在设置中关闭。</p>}
    <p className="weekly-report-activity">学了 {activity.days.length} 天 · {activity.runs} 节课 · 播放 {activity.played_beats} 段 · 练习 {activity.task_attempts} 次 · 提问 {activity.questions} 个</p>
    {monthly && report.weeks.length > 0 && <p className="weekly-report-weeks">{report.weeks.map(week => `${weekLabel(week.week_start)} ${week.days} 天`).join(" · ")}</p>}
    {lit.length > 0 && <section aria-label="新点亮"><h4>新点亮</h4><ul>
      {lit.map(topic => <li key={topic.topic_id}><small>{place(topic)}</small> <strong>{topicLabel(topic.topic_id, topic.name)}</strong> <span>{STATE_LABEL[topic.state_after]}</span></li>)}
    </ul></section>}
    {raised.length > 0 && <section aria-label="状态变化"><h4>状态变化</h4><ul>
      {raised.map(topic => <li key={topic.topic_id}><small>{place(topic)}</small> <strong>{topicLabel(topic.topic_id, topic.name)}</strong>{" "}
        <span>{STATE_LABEL[topic.state_before!]} → {STATE_LABEL[topic.state_after]}</span>
        <small>（{shortDay(topic.change!.occurred_at)}，{topic.state_after === "did-it" ? "不用提示达到练习要求" : topic.change!.kind === "task_attempt" ? "做了相关练习" : "播放了相关讲解"}）</small></li>)}
    </ul></section>}
    {report.achievements.length > 0 && <section aria-label="新成就"><h4>新成就</h4><ul>
      {report.achievements.map(item => <li key={`${item.achievement_id}:${item.scope}`}>
        {achievementName(item.achievement_id)}{item.topic_name ? ` · ${topicLabel(item.scope, item.topic_name)}` : ""}</li>)}
    </ul></section>}
    <p className="weekly-report-closing">{lines.closing}</p>
    {teacher && <p className="weekly-report-meaning">这些记录说明你学过、练过什么，都不等于已经掌握。</p>}
  </>;
}

export function WeeklyReportPanel({ today = () => new Date(), onSelect, onNew }: {
  today?: () => Date; onSelect?: (session: LearningSessionRecord) => void; onNew?: (draft: string) => void;
}) {
  const current = weekStartOf(localDayOf(today()));
  const currentMonth = localDayOf(today()).slice(0, 7);
  const [period, setPeriod] = useState<"week" | "month">("week");
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
  }, [period, week, month]);

  const shown = period === "week"
    ? (report && "week_start" in report && report.week_start === week ? report : undefined)
    : (report && "month" in report && report.month === month ? report : undefined);
  const first = shown && ("month" in shown ? shown.first_month : shown.first_week);
  const at = period === "week" ? week : month, now = period === "week" ? current : currentMonth;
  const go = (step: number) => { setError(false); if (period === "week") setWeek(shiftWeek(week, step)); else setMonth(shiftMonth(month, step)); };
  const unit = period === "week" ? "周" : "月";
  return <div className="learning-history-account weekly-report">
    <div className="weekly-report-period" role="group" aria-label="报告周期">
      <button type="button" aria-pressed={period === "week"} onClick={() => { setError(false); setPeriod("week"); }}>周报</button>
      <button type="button" aria-pressed={period === "month"} onClick={() => { setError(false); setPeriod("month"); }}>月报</button>
    </div>
    <nav className="weekly-report-nav" aria-label={`选择${unit}`}>
      <button type="button" disabled={!first || at <= first} onClick={() => go(-1)}>‹ 上一{unit === "周" ? "周" : "个月"}</button>
      <h3>{period === "week" ? `${week === current ? "本周" : "周报"} · ${weekLabel(week)}` : `${month === currentMonth ? "本月" : "月报"} · ${monthLabel(month)}`}</h3>
      <button type="button" disabled={at >= now} onClick={() => go(1)}>下一{unit === "周" ? "周" : "个月"} ›</button>
    </nav>
    {error ? <p role="status">暂时读不到{period === "week" ? "周报" : "月报"}，请稍后再试。</p>
      : !shown ? <p role="status">正在整理{period === "week" ? "周报" : "月报"}…</p>
        : <ReportBody report={shown} />}
    {/* Suggestions describe now, so they follow only this week and the last one. */}
    {shown && period === "week" && week >= shiftWeek(current, -1) && <NextSteps onSelect={onSelect} onNew={onNew} />}
  </div>;
}
