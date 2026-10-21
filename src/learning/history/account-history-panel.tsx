import { useEffect, useState } from 'react';
import { getSelectedProfileId, getToken } from '../../api/client';
import { getLearningSession, type LearningSessionRecord } from '../learning-session-store';
import { openHistoryApi, type HistoryApi, type HistoryEventsPage, type HistoryRunsPage, type LearningRunSummary } from './history-api';
import type { HistoryEvent } from '../../../services/learning-history/event-contract.mjs';

function EventDetail({ event }: { event: HistoryEvent }) {
  const d = event.data;
  const title: Record<string, string> = { question_submitted: '学生提问', answer_delivered: '老师交付的文字', course_delivered: '课程交付',
    run_started: '开始学习', playback_position: '浏览与播放位置', beat_completed: '片段实际播放完成', narration_ended: '旁白结束', task_attempt: '一次作答', task_hint: '查看提示' };
  const reasons: Record<string, string> = { ended: '正常播完', disabled: '关闭语音', failed: '语音失败', cancelled: '已取消', play: '播放推进', view: '查看', seek: '跳转', skip: '手动跳过', restore: '恢复位置' };
  return <article className="learning-history-evidence">
    <strong>{title[event.kind] ?? '课堂操作'}</strong>
    <time>{new Date(event.occurred_at).toLocaleString('zh-CN')}</time>
    {typeof d.text === 'string' && <p className="learning-history-original-text">{d.text}</p>}
    {event.kind === 'course_delivered' && <p>{d.status === 'complete' ? '已完整交付课程，是否学完需看实际播放记录。' : '课程部分内容已交付。'}</p>}
    {event.kind === 'beat_completed' && <p>{d.presentation === 'audio' ? '包含正常结束的语音播放' : '图文播放'} · {String(d.step_id)} · {String(d.beat_id)}</p>}
    {event.kind === 'narration_ended' && <p>{reasons[String(d.reason)]}</p>}
    {event.kind === 'playback_position' && <p>{reasons[String(d.reason)]} · 位置 {String(d.cursor)}；不能据此推断此前内容全部学过。</p>}
    {event.kind === 'task_attempt' && <p>{String(d.task_id)}：{d.result === 'succeeded' ? '达到本题程序条件' : '未达到本题程序条件'} · 已用提示 {String(d.hints_used)} 次</p>}
    {event.kind === 'task_hint' && <p>{String(d.task_id)} · 第 {String(d.hint_index)} 条提示</p>}
    <details><summary>查看原始依据编号</summary><p>记录：{event.id}<br />学习：{event.run_id}{event.log_id && <><br />日志：{event.log_id}</>}</p></details>
  </article>;
}

export function AccountHistoryPanel({ onSelect }: { onSelect: (session: LearningSessionRecord) => void }) {
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
        if (!token) throw new Error('请登录后查看已同步的学习记录');
        const client = await openHistoryApi(token); const data = await client.runs();
        if (active && getToken() === token) { setApi(client); setPage(data); setError(''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : '记录暂不可用'); }
    })();
    return () => { active = false; };
  }, [token, refresh]);
  const loadMore = async () => {
    if (!api || page?.next_before == null || busy) return;
    setBusy(true);
    try { const next = await api.runs(page.next_before, page.through); setPage({ ...next, runs: [...page.runs, ...next.runs] }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '记录暂不可用'); }
    finally { setBusy(false); }
  };
  const open = async (run: LearningRunSummary) => {
    if (!api || busy) return;
    setBusy(true); setSelected(run); setDetail(undefined); setError('');
    try { setDetail(await api.events(run.run_id, 0, page?.through)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '记录暂不可用'); }
    finally { setBusy(false); }
  };
  const moreDetails = async () => {
    if (!api || !selected || detail?.next_after == null || busy) return;
    setBusy(true);
    try { const next = await api.events(selected.run_id, detail.next_after, detail.through); setDetail({ ...next, events: [...detail.events, ...next.events] }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '记录暂不可用'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!api || !selected || busy || !window.confirm('删除这次学习记录及其统计依据？这不会删除 Octos 已保存的对话或长期记忆。')) return;
    setBusy(true);
    try { await api.deleteRun(selected.run_id); setSelected(undefined); setDetail(undefined); setPage(undefined); setRefresh(value => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '删除尚未完成'); }
    finally { setBusy(false); }
  };
  const local = selected && api?.owner === getSelectedProfileId() && getLearningSession(selected.session_id);
  return <section className="learning-history-account" aria-label="学习经过与原始记录">
    <p>从记录功能启用后开始统计。播放次数和作答结果不代表已经理解或掌握。</p>
    {error && <p role="alert">{error} <button onClick={() => { setSelected(undefined); setDetail(undefined); setPage(undefined); setRefresh(value => value + 1); }}>刷新记录</button></p>}
    {busy && <p role="status">正在读取记录…</p>}
    {!page && !error && <p role="status">正在读取已同步记录…</p>}
    {selected ? <>
      <button onClick={() => { setSelected(undefined); setDetail(undefined); }}>返回列表</button>
      <h3>{selected.question_preview || selected.course?.id || '课程学习'}</h3>
      <p>提问 {selected.question_count} 次 · 已播放 {selected.completed_beats} 个不同片段 · 作答 {selected.task_attempts} 次</p>
      <p>同一遍重复回放同一片段只计一次；下面保留每次原始记录。旧保存位置不能补成过去的学习次数。</p>
      {local && <button onClick={() => onSelect(local)}>继续这块白板</button>}
      <button onClick={() => void remove()} disabled={busy}>删除这次学习记录</button>
      {detail?.events.filter(row => row.event.kind !== 'question_routed').map(row => <EventDetail key={row.seq} event={row.event} />)}
      {detail?.next_after != null && <button onClick={() => void moreDetails()} disabled={busy}>继续查看原始记录</button>}
    </> : <>
      {page?.runs.map(run => <button className="learning-history-item" key={run.run_id} onClick={() => void open(run)}>
        <strong>{run.question_preview || run.course?.id || '课程学习'}</strong><span>{new Date(run.first_occurred_at).toLocaleString('zh-CN')} · 提问 {run.question_count} 次 · 已播放 {run.completed_beats} 个片段 · 作答 {run.task_attempts} 次</span>
      </button>)}
      {page?.runs.length === 0 && <p>还没有已同步的学习经过。此前的白板仍可从“继续学习”打开。</p>}
      {page?.next_before != null && <button onClick={() => void loadMore()} disabled={busy}>加载更多</button>}
    </>}
  </section>;
}
