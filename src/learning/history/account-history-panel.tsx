import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { useEffect, useState } from 'react';
import { getSelectedProfileId, getToken } from '../../api/client';
import { getLearningSession, type LearningSessionRecord } from '../learning-session-store';
import { openHistoryApi, type HistoryApi, type HistoryEventsPage, type HistoryRunsPage, type LearningRunSummary, type HistoryCoverage, type HistoryTopicPage } from './history-api';
import type { HistoryEvent } from '../../../services/learning-history/event-contract.mjs';
import { topicLabel } from '../map/taxonomy-labels';

function EventDetail({ event }: { event: HistoryEvent }) {
  useLocale();
  const d = event.data;
  const title: Record<string, string> = { question_submitted: tr("学生提问"), answer_delivered: tr("老师交付的文字"), course_delivered: tr("课程交付"), request_failed: tr("一次请求执行未完成"),
    run_started: tr("开始学习"), playback_position: tr("浏览与播放位置"), beat_completed: tr("片段实际播放完成"), narration_ended: tr("旁白结束"), task_attempt: tr("一次作答"), task_hint: tr("查看提示") };
  const reasons: Record<string, string> = { ended: tr("正常播完"), disabled: tr("关闭语音"), failed: tr("语音失败"), cancelled: tr("已取消"), play: tr("播放推进"), view: tr("查看"), seek: tr("跳转"), skip: tr("手动跳过"), restore: tr("恢复位置") };
  return <article className="learning-history-evidence">
    <strong>{title[event.kind] ?? tr("课堂操作")}</strong>
    <time>{new Date(event.occurred_at).toLocaleString(getLocale())}</time>
    {typeof d.text === 'string' && <p className="learning-history-original-text">{d.text}</p>}
    {event.kind === 'course_delivered' && <p>{d.status === 'complete' ? tr("已完整交付课程，是否学完需看实际播放记录。") : tr("课程部分内容已交付。")}</p>}
    {event.kind === 'request_failed' && <p>{d.status === 'cancelled' ? tr("一次请求执行已取消。") : d.reason === 'missing-artifact' ? tr("生成任务已结束，但没有收到课程内容。") : tr("一次生成或回答执行失败。")} {tr("已经交付的内容仍保留，是否播放另看播放记录。")}</p>}
    {event.kind === 'beat_completed' && <p>{d.presentation === 'audio' ? tr("包含正常结束的语音播放") : tr("图文播放")} · {String(d.step_id)} · {String(d.beat_id)}</p>}
    {event.kind === 'narration_ended' && <p>{reasons[String(d.reason)]}</p>}
    {event.kind === 'playback_position' && <p>{reasons[String(d.reason)]} {tr("· 位置") + " "}{String(d.cursor)}{tr("；不能据此推断此前内容全部学过。")}</p>}
    {event.kind === 'task_attempt' && <p>{String(d.task_id)}：{d.result === 'succeeded' ? tr("达到本题程序条件") : tr("未达到本题程序条件")} {tr("· 已用提示") + " "}{String(d.hints_used)} {tr("次")}</p>}
    {event.kind === 'task_hint' && <p>{String(d.task_id)} {tr("· 第") + " "}{String(d.hint_index)} {tr("条提示")}</p>}
    <details><summary>{tr("查看原始依据编号")}</summary><p>{tr("记录：")}{event.id}<br />{tr("学习：")}{event.run_id}{event.log_id && <><br />{tr("日志：")}{event.log_id}</>}</p></details>
  </article>;
}

/** Everything recorded for one topic, approved course mappings and model
 * analysis listed apart, paged as the learner asks for more. */
export function TopicEvidence({ api, topicId, through }: { api: HistoryApi; topicId: string; through: number }) {
  useLocale();
  const [topic, setTopic] = useState<HistoryTopicPage>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inspect = async (after = 0, automaticOnly = false) => {
    setBusy(true); setError('');
    try {
      const next = await api.topic(topicId, through, after, after ? topic?.automatic?.analysis_through : undefined);
      setTopic(previous => {
        if (!after || !previous) return next;
        if (automaticOnly && next.automatic) return { ...previous, automatic: { ...next.automatic, events: [...previous.automatic?.events ?? [], ...next.automatic.events] } };
        return { ...previous, events: [...previous.events, ...next.events], next_after: next.next_after };
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("依据暂不可用")); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    void api.topic(topicId, through).then(value => { if (active) setTopic(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : tr("依据暂不可用")); });
    return () => { active = false; };
  }, [api, topicId, through]);
  if (error) return <p role="alert">{error}</p>;
  if (!topic) return <p role="status">{tr("正在读取知识点依据…")}</p>;
  return <section aria-label={tr("知识点原始依据")}>
    <p>{tr("这里仅统计有来源依据的部分内容，不代表整个知识点已掌握。人工确认的课程对应与模型分析分别列出。")}</p>
    {topic.objectives.map(objective => <p key={`${objective.mapping_id}:${objective.objective_key}`}>{objective.title}：{objective.counts ? tr("在 {{v0}} 遍学习中播放过，作答 {{v1}} 次", { v0: objective.counts.played_runs, v1: objective.counts.task_attempts }) : tr("对应表待审核")}</p>)}
    {topic.events.map(row => <EventDetail key={row.seq} event={row.event} />)}
    {topic.next_after != null && <button disabled={busy} onClick={() => void inspect(topic.next_after!)}>{tr("继续查看知识点依据")}</button>}
    {topic.automatic && <section aria-label={tr("自动归属的学习记录")}>
      <p>{tr("在已对应的记录中：提问") + " "}{topic.automatic.counts.question_count ?? tr("尚不能确定")} {tr("次 · 在") + " "}{topic.automatic.counts.played_runs ?? tr("尚不能确定")} {tr("遍学习中播放过 · 播放") + " "}{topic.automatic.counts.played_beats ?? tr("尚不能确定")} {tr("个不同内容片段。")}</p>
      <p>{tr("有知识点依据的作答") + " "}{topic.automatic.counts.task_attempts ?? tr("尚不能确定")} {tr("次 · 达到本题程序条件") + " "}{topic.automatic.counts.task_successes ?? tr("尚不能确定")} {tr("次 · 查看提示") + " "}{topic.automatic.counts.task_hints ?? tr("尚不能确定")} {tr("次；不代表独立掌握。")}</p>
      <p>{tr("查询范围内另有") + " "}{topic.automatic.coverage.unprocessed_questions} {tr("条提问未分析、")}{topic.automatic.coverage.unknown_questions} {tr("条提问无法确定、")}{topic.automatic.coverage.outside_catalog_questions ?? 0} {tr("条提问超出当前目录、")}{topic.automatic.coverage.unassociated_played_beats} {tr("个播放片段尚无可靠对应。另有") + " "}{topic.automatic.coverage.unassociated_task_attempts ?? 0} {tr("次作答、")}{topic.automatic.coverage.unassociated_task_hints ?? 0} {tr("次查看提示尚无可靠知识点对应。这些没有当成零次或已掌握。")}</p>
      {topic.automatic.events.map(row => <div key={row.seq}><EventDetail event={row.event} />{row.associations.map(item => <blockquote key={`${item.result_seq}:${item.unit_id}`}>{tr("分析依据：")}{item.quote}{tr("（结果") + " "}{item.result_seq}）</blockquote>)}</div>)}
      {topic.automatic.next_after != null && <button disabled={busy} onClick={() => void inspect(topic.automatic!.next_after!, true)}>{tr("继续查看自动分析依据")}</button>}
    </section>}
    <details><summary>{tr("查看统计口径")}</summary><p>{topic.counting_rule} {tr("· 统计截至接收顺序") + " "}{topic.through}</p>{topic.objectives.map(objective => <p key={`${objective.mapping_id}:${objective.objective_key}`}>{objective.mapping_id} · {objective.objective_key}</p>)}</details>
  </section>;
}

function CourseCoverage({ api, run, through }: { api: HistoryApi; run: LearningRunSummary; through: number }) {
  useLocale();
  const [coverage, setCoverage] = useState<HistoryCoverage>();
  const [topicId, setTopicId] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api.coverage(run.run_id, through).then(value => { if (active) setCoverage(value); }).catch(() => { if (active) setError(tr("课程对应信息暂不可用")); });
    return () => { active = false; };
  }, [api, run.run_id, through]);
  return <section aria-label={tr("课程与知识点对应进度")}>
    {error && <p role="alert">{error}</p>}
    {coverage?.status === 'unmapped' && <p>{tr("这门课没有人工确认的教学对应表。自动分析的结果另列在下方；没有结果时不猜测知识点进度。")}</p>}
    {coverage?.status === 'pending-review' && <p>{tr("课程与知识点的对应表尚待内容审核，暂不计算知识点进度。")}</p>}
    {coverage?.generated_playback?.status === 'unknown' && <p>{tr("尚无足够的完整课程与内容版本依据，暂不能判断整课是否播放完成；已有片段记录仍保留。")}</p>}
    {coverage?.course_playback && <p>{tr("本遍课程实际播放了") + " "}{coverage.course_playback.played_beats}/{coverage.course_playback.required_beats} {tr("个必需片段。")}{coverage.course_playback.complete ? tr("必需讲解均有播放记录。") : tr("仍有讲解没有播放记录。")}{tr("这不代表掌握。")}</p>}
    {coverage?.generated_playback?.status === 'available' && <details><summary>{tr("查看整课播放的依据")}</summary>
      <p>{tr("按实际交付课程的全部片段核对；未改变的早期分段可以计入，改写后的内容需要重新播放。这不表示练习完成或掌握。")}</p>
      <p>{tr("课程交付记录：")}{coverage.generated_playback.source_event_id}</p>
      {coverage.generated_playback.evidence?.map(item => <p key={item.event_id}>{tr("片段") + " "}{item.step_id} / {item.beat_id} {tr("· 播放记录：")}{item.event_id}</p>)}
    </details>}
    {coverage?.status === 'approved' && coverage.objectives.map(objective => <article key={objective.objective_key}>
      <strong>{objective.title}</strong><p>{tr("本遍播放") + " "}{objective.counts?.played_beats} {tr("个片段 · 作答") + " "}{objective.counts?.task_attempts} {tr("次 · 查看提示") + " "}{objective.counts?.hints} {tr("次")}</p>
      <button onClick={() => setTopicId(objective.topic_id)}>{tr("查看“")}{objective.title}{tr("”所在知识点的全部学习依据")}</button>
    </article>)}
    {!!coverage?.automatic_topics?.length && <section aria-label={tr("自动分析发现的知识点")}>
      <p>{tr("以下知识点来自对原问题或课程材料的分析。材料涉及某知识点，不表示学生已播放或掌握；点击查看实际记录。")}</p>
      {coverage.automatic_topics.map(item => <button key={item.topic_id} onClick={() => setTopicId(item.topic_id)}>{tr("查看") + " "}{item.title} {tr("的记录")}</button>)}
    </section>}
    {topicId && <TopicEvidence key={topicId} api={api} topicId={topicId} through={through} />}
  </section>;
}

export function AccountHistoryPanel({ onSelect, topic, onTopicClose }: {
  onSelect: (session: LearningSessionRecord) => void;
  /** Opened from a star: show that topic's evidence before the list. */
  topic?: { id: string; name: string }; onTopicClose?: () => void;
}) {
  useLocale();
  const [token, setToken] = useState(getToken);
  const [api, setApi] = useState<HistoryApi>();
  const [page, setPage] = useState<HistoryRunsPage>();
  const [selected, setSelected] = useState<LearningRunSummary>();
  const [detail, setDetail] = useState<HistoryEventsPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const changed = () => {
      setApi(undefined); setPage(undefined); setSelected(undefined); setDetail(undefined); setError(''); setToken(getToken());
    };
    for (const event of ['octos:identity-changed', 'crew:token_cleared', 'storage']) window.addEventListener(event, changed);
    return () => { for (const event of ['octos:identity-changed', 'crew:token_cleared', 'storage']) window.removeEventListener(event, changed); };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!token) throw new Error(tr("请登录后查看已同步的学习记录"));
        const client = await openHistoryApi(token); const data = await client.runs();
        if (active && getToken() === token) { setApi(client); setPage(data); setError(''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : tr("记录暂不可用")); }
    })();
    return () => { active = false; };
  }, [token, refresh]);
  const loadMore = async () => {
    if (!api || page?.next_before == null || busy) return;
    setBusy(true);
    try { const next = await api.runs(page.next_before, page.through); setPage({ ...next, runs: [...page.runs, ...next.runs] }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("记录暂不可用")); }
    finally { setBusy(false); }
  };
  const open = async (run: LearningRunSummary) => {
    if (!api || busy) return;
    setBusy(true); setSelected(run); setDetail(undefined); setError('');
    try { setDetail(await api.events(run.run_id, 0, page?.through)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("记录暂不可用")); }
    finally { setBusy(false); }
  };
  const moreDetails = async () => {
    if (!api || !selected || detail?.next_after == null || busy) return;
    setBusy(true);
    try { const next = await api.events(selected.run_id, detail.next_after, detail.through); setDetail({ ...next, events: [...detail.events, ...next.events] }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("记录暂不可用")); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!api || !selected || busy || !window.confirm(tr("删除这次学习记录及其统计依据？这不会删除 Octos 已保存的对话或长期记忆。"))) return;
    setBusy(true);
    try { await api.deleteRun(selected.run_id); setSelected(undefined); setDetail(undefined); setPage(undefined); setRefresh(value => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("删除尚未完成")); }
    finally { setBusy(false); }
  };
  const local = selected && api?.owner === getSelectedProfileId() && getLearningSession(selected.session_id);
  return <section className="learning-history-account" aria-label={tr("学习经过与原始记录")}>
    <p>{tr("从记录功能启用后开始统计。播放次数和作答结果不代表已经理解或掌握。")}</p>
    {error && <p role="alert">{error} <button onClick={() => { setSelected(undefined); setDetail(undefined); setPage(undefined); setRefresh(value => value + 1); }}>{tr("刷新记录")}</button></p>}
    {busy && <p role="status">{tr("正在读取记录…")}</p>}
    {!page && !error && <p role="status">{tr("正在读取已同步记录…")}</p>}
    {topic && !selected ? <>
      <button onClick={onTopicClose}>{tr("返回列表")}</button>
      <h3>{topicLabel(topic.id, topic.name)}</h3>
      {api && page && <TopicEvidence key={`${api.owner}:${topic.id}`} api={api} topicId={topic.id} through={page.through} />}
    </> : selected ? <>
      <button onClick={() => { setSelected(undefined); setDetail(undefined); }}>{tr("返回列表")}</button>
      <h3>{selected.question_preview || selected.course?.id || tr("课程学习")}</h3>
      <p>{tr("提问") + " "}{selected.question_count} {tr("次 · 已播放") + " "}{selected.completed_beats} {tr("个不同片段 · 作答") + " "}{selected.task_attempts} {tr("次")}</p>
      <p>{tr("同一遍重复回放同一片段只计一次；下面保留每次原始记录。旧保存位置不能补成过去的学习次数。")}</p>
      {api && page && <CourseCoverage key={`${api.owner}:${selected.run_id}`} api={api} run={selected} through={page.through} />}
      {local && <button onClick={() => onSelect(local)}>{tr("继续这块白板")}</button>}
      <button onClick={() => void remove()} disabled={busy}>{tr("删除这次学习记录")}</button>
      {detail?.events.filter(row => row.event.kind !== 'question_routed').map(row => <EventDetail key={row.seq} event={row.event} />)}
      {detail?.next_after != null && <button onClick={() => void moreDetails()} disabled={busy}>{tr("继续查看原始记录")}</button>}
    </> : <>
      {!!page?.runs.length && <div className="learning-history-runs">{page.runs.map(run => <button className="learning-history-item" key={run.run_id} onClick={() => void open(run)}>
        <strong>{run.question_preview || run.course?.id || tr("课程学习")}</strong><span>{new Date(run.first_occurred_at).toLocaleString(getLocale())} {tr("· 提问") + " "}{run.question_count} {tr("次 · 已播放") + " "}{run.completed_beats} {tr("个片段 · 作答") + " "}{run.task_attempts} {tr("次")}</span>
      </button>)}</div>}
      {page?.runs.length === 0 && <p>{tr("还没有已同步的学习经过。此前的白板仍可从“白板与课程”打开。")}</p>}
      {page?.next_before != null && <button onClick={() => void loadMore()} disabled={busy}>{tr("加载更多")}</button>}
    </>}
  </section>;
}
