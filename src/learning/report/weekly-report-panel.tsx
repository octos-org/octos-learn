import { useEffect, useState } from "react";

import { getToken } from "../../api/client";
import { openHistoryApi, type MapState, type WeeklyReport } from "../history/history-api";
import { ACHIEVEMENT_NAME, readAwardTone } from "../map/award-line";
import { domainLabel, subjectLabel, topicLabel } from "../map/taxonomy-labels";
import { getTeacher, PLAIN_REPORT, resolveSelectedTeacherId } from "../teachers/teachers";
import { localDayOf, shiftWeek, weekLabel, weekStartOf } from "./report-week";

const STATE_LABEL: Record<MapState, string> = { explored: "已探索", practising: "正在练习", "did-it": "做出来过" };
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });

function ReportBody({ report }: { report: WeeklyReport }) {
  const teacher = readAwardTone() === "playful" ? getTeacher(resolveSelectedTeacherId()) : null;
  const lines = teacher?.report ?? PLAIN_REPORT;
  // A model comment shows only for the teacher it was written as, on these exact facts.
  const comment = teacher && report.comment && report.comment_teacher_id === teacher.id ? report.comment : null;
  const { activity } = report;
  const lit = report.topics.filter(topic => !topic.state_before);
  const raised = report.topics.filter(topic => topic.state_before && topic.change);
  const place = (topic: WeeklyReport["topics"][number]) => `${subjectLabel(topic.subject)}·${domainLabel(topic.domain)}`;
  if (!activity.runs && !report.achievements.length) {
    return <p className="weekly-report-opening">{teacher ? `${teacher.name}：` : ""}{lines.quiet}</p>;
  }
  return <>
    <p className="weekly-report-opening">{teacher ? `${teacher.name}：` : ""}{comment ?? lines.active}</p>
    {comment && <p className="weekly-report-meaning">老师评语由模型根据本周记录生成，可在设置中关闭。</p>}
    <p className="weekly-report-activity">学了 {activity.days.length} 天 · {activity.runs} 节课 · 播放 {activity.played_beats} 段 · 练习 {activity.task_attempts} 次 · 提问 {activity.questions} 个</p>
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
        {ACHIEVEMENT_NAME[item.achievement_id]}{item.topic_name ? ` · ${topicLabel(item.scope, item.topic_name)}` : ""}</li>)}
    </ul></section>}
    <p className="weekly-report-closing">{lines.closing}</p>
    {teacher && <p className="weekly-report-meaning">这些记录说明你学过、练过什么，都不等于已经掌握。</p>}
  </>;
}

export function WeeklyReportPanel({ today = () => new Date() }: { today?: () => Date }) {
  const current = weekStartOf(localDayOf(today()));
  const [week, setWeek] = useState(current);
  const [report, setReport] = useState<WeeklyReport>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const token = getToken();
    void Promise.resolve().then(() => {
      if (!token) throw new Error("signed out");
      return openHistoryApi(token);
    }).then(api => api.weeklyReport(week)).then(next => {
      if (active) { setReport(next); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [week]);

  const shown = report?.week_start === week ? report : undefined;
  const go = (weeks: number) => { setError(false); setWeek(shiftWeek(week, weeks)); };
  return <div className="learning-history-account weekly-report">
    <nav className="weekly-report-nav" aria-label="选择周">
      <button type="button" disabled={!shown?.first_week || week <= shown.first_week} onClick={() => go(-1)}>‹ 上一周</button>
      <h3>{week === current ? "本周" : "周报"} · {weekLabel(week)}</h3>
      <button type="button" disabled={week >= current} onClick={() => go(1)}>下一周 ›</button>
    </nav>
    {error ? <p role="status">暂时读不到周报，请稍后再试。</p>
      : !shown ? <p role="status">正在整理周报…</p>
        : <ReportBody report={shown} />}
  </div>;
}
