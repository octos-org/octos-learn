import { tr } from "@/i18n";
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AccountHistoryPanel } from './account-history-panel';
import { TOKEN_KEY } from '../../lib/constants';

const run = { run_id: 'run-1', session_id: 'session-1', updated_seq: 8, first_occurred_at: '2026-10-21T00:00:00.000Z',
  question_preview: '为什么直线会变陡？', course: null, question_count: 1, completed_beats: 2, task_attempts: 1, start_recorded: true };
const event = { version: 1, id: 'event-1', kind: 'question_submitted', occurred_at: '2026-10-21T00:00:00.000Z', device_id: 'device', session_id: 'session-1', run_id: 'run-1', question_id: 'q-1', data: { text: '为什么直线会变陡？', modality: 'text' } };
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); localStorage.clear(); localStorage.setItem(TOKEN_KEY, 'a'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function stubFetch(extra?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const result = extra?.(url, init); if (result) return result;
    if (url.endsWith('/api/my/profile')) return Response.json({ profile: { id: 'alice' } });
    if (url.includes('/runs/run-1')) return Response.json({ events: [{ seq: 1, event }], through: 8, next_after: null });
    return Response.json({ runs: [run], through: 8, next_before: null });
  }));
}
it('shows separately counted facts and lets the learner inspect the original evidence', async () => {
  stubFetch(); render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  expect(await screen.findByText(tr("学生提问"))).toBeTruthy();
  expect(screen.getByText('提问 1 次 · 已播放 2 个不同片段 · 作答 1 次')).toBeTruthy();
  fireEvent.click(screen.getByText(tr("查看原始依据编号")));
  expect(screen.getByText(/记录：event-1/)).toBeTruthy();
  expect(screen.getByText(new RegExp(tr("从记录功能启用后开始统计。播放次数和作答结果不代表已经理解或掌握。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});
it('keeps pagination pinned to the initial upper sequence and refreshes after a deletion invalidates it', async () => {
  let first = true;
  stubFetch((url) => {
    if (!url.includes('/runs?')) return;
    if (first) { first = false; return Response.json({ runs: [run], through: 8, next_before: 6 }); }
    expect(url).toContain('through=8'); expect(url).toContain('before=6');
    return Response.json({ error: 'snapshot changed' }, { status: 409 });
  });
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: tr("加载更多") }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('请刷新'));
  expect(screen.getAllByRole('button', { name: /为什么直线会变陡/ })).toHaveLength(1);
});
it('deletes only learning facts and clearly distinguishes this from forgetting the conversation or memory', async () => {
  let deleted = false;
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  stubFetch((url, init) => {
    if (init?.method === 'DELETE') {
      expect((init.headers as Record<string, string>)['X-Learning-Owner']).toBe('alice');
      deleted = true; return Response.json({ status: 'deleted', seq: 9 });
    }
    if (deleted && url.includes('/runs?')) return Response.json({ runs: [], through: 9, next_before: null });
  });
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  await screen.findByText(tr("学生提问")); fireEvent.click(screen.getByRole('button', { name: tr("删除这次学习记录") }));
  expect(await screen.findByText(new RegExp(tr("还没有已同步的学习经过。此前的白板仍可从“白板与课程”打开。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('这不会删除 Octos 已保存的对话或长期记忆'));
});
it('never displays a delayed account-A detail response after switching to account B', async () => {
  let resolveOld: (response: Response) => void = () => undefined;
  stubFetch((url, init) => {
    const authorization = (init?.headers as Record<string, string>)?.Authorization;
    if (url.endsWith('/api/my/profile') && authorization === 'Bearer b') return Response.json({ profile: { id: 'bob' } });
    if (url.includes('/runs/run-1')) return new Promise<Response>(resolve => { resolveOld = resolve; });
    if (url.includes('/runs?') && authorization === 'Bearer b') return Response.json({ runs: [], through: 0, next_before: null });
  });
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  await act(async () => {
    localStorage.setItem(TOKEN_KEY, 'b'); window.dispatchEvent(new Event('octos:identity-changed'));
    resolveOld(Response.json({ events: [{ seq: 1, event }], through: 8, next_after: null }));
  });
  await waitFor(() => expect(screen.queryByText(tr("学生提问"))).toBeNull());
  expect(await screen.findByText(new RegExp(tr("还没有已同步的学习经过。此前的白板仍可从“白板与课程”打开。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});
it('shows unreviewed course mappings as pending rather than zero progress', async () => {
  stubFetch(url => {
    if (url.includes('/coverage?')) return Response.json({ status: 'pending-review', through: 8, course_playback: null, objectives: [] });
    if (url.includes('/runs?')) return Response.json({ runs: [{ ...run, course: { kind: 'course-pack', id: 'slope-and-intercept', version: '0.1.8' } }], through: 8, next_before: null });
  });
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  expect(await screen.findByText(new RegExp(tr("课程与知识点的对应表尚待内容审核，暂不计算知识点进度。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
  expect(screen.queryByText(new RegExp(tr("本遍课程实际播放了").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeNull();
});

it('shows automatic evidence separately and pins its pagination without turning unknown records into zero', async () => {
  let topicReads = 0;
  stubFetch(url => {
    if (url.includes('/coverage?')) return Response.json({ status: 'unmapped', through: 8, course_playback: null, objectives: [], automatic_topics: [{ topic_id: 'mt_WBdHkc2HTf', title: 'Linear Function Graphs' }] });
    if (url.includes('/topics/')) {
      topicReads++;
      if (topicReads === 2) { expect(url).toContain('analysis_through=12'); expect(url).toContain('after=1'); }
      return Response.json({ topic_id: 'mt_WBdHkc2HTf', through: 8, events: [], next_after: null, objectives: [], counting_rule: 'test', status: 'unmapped',
        automatic: { status: 'partial', analysis_through: 12, counts: { question_count: 1, played_runs: null, played_beats: null },
          coverage: { unprocessed_questions: 2, unknown_questions: 1, outside_catalog_questions: 4, unassociated_played_beats: 3 },
          events: [{ seq: topicReads, event: { ...event, id: `evidence-${topicReads}` }, associations: [{ result_seq: 12, unit_id: 'question', quote: `原问题依据 ${topicReads}` }] }], next_after: topicReads === 1 ? 1 : null } });
    }
  });
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  fireEvent.click(await screen.findByRole('button', { name: '查看 Linear Function Graphs 的记录' }));
  expect(await screen.findByText(/2 条提问未分析、1 条提问无法确定/)).toBeTruthy();
  expect(screen.getByText(/4 条提问超出当前目录/)).toBeTruthy();
  expect(screen.getByText(/提问 1 次 · 在 尚不能确定 遍/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: tr("继续查看自动分析依据") }));
  expect(await screen.findByText(/原问题依据 2/)).toBeTruthy();
  expect(screen.getByText(/原问题依据 1/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: tr("继续查看自动分析依据") })).toBeNull();
});


it('shows a failed request separately from delivered content and played progress', async () => {
  stubFetch(url => url.includes('/runs/run-1') ? Response.json({ events: [{ seq: 2, event: { ...event, kind: 'request_failed', data: { execution_id: 'job-one', status: 'failed', reason: 'job-ended' } } }], through: 8, next_after: null }) : undefined);
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  expect(await screen.findByText(tr("一次请求执行未完成"))).toBeTruthy();
  expect(screen.getByText(new RegExp(tr("已经交付的内容仍保留，是否播放另看播放记录。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});


it('shows generated whole-course playback with its actual source and counted records, without claiming mastery', async () => {
  stubFetch(url => {
    if (url.includes('/coverage?')) return Response.json({ status: 'unmapped', through: 8, objectives: [],
      course_playback: { required_beats: 2, played_beats: 1, complete: false },
      generated_playback: { status: 'available', rule: 'complete-delivery-matching-beats-v1', source_event_id: 'final-delivery',
        evidence: [{ event_id: 'old-part-playback', step_id: 'section', beat_id: 'first' }] } });
    if (url.includes('/runs?')) return Response.json({ runs: [{ ...run, course: { kind: 'generated', id: 'question', version: 'one' } }], through: 8, next_before: null });
  });
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  expect(await screen.findByText(/本遍课程实际播放了 1\/2/)).toBeTruthy();
  fireEvent.click(screen.getByText(tr("查看整课播放的依据")));
  expect(screen.getByText(/课程交付记录：final-delivery/)).toBeTruthy();
  expect(screen.getByText(/播放记录：old-part-playback/)).toBeTruthy();
  expect(screen.getByText(new RegExp(tr("按实际交付课程的全部片段核对；未改变的早期分段可以计入，改写后的内容需要重新播放。这不表示练习完成或掌握。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});

it('keeps generated whole-course playback unknown when a final source is unavailable', async () => {
  stubFetch(url => {
    if (url.includes('/coverage?')) return Response.json({ status: 'unmapped', through: 8, objectives: [], course_playback: null,
      generated_playback: { status: 'unknown', reason: 'incomplete-delivery', rule: 'complete-delivery-matching-beats-v1' } });
    if (url.includes('/runs?')) return Response.json({ runs: [{ ...run, course: { kind: 'generated', id: 'question', version: 'one' } }], through: 8, next_before: null });
  });
  render(<AccountHistoryPanel onSelect={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /为什么直线会变陡/ }));
  expect(await screen.findByText(new RegExp(tr("尚无足够的完整课程与内容版本依据，暂不能判断整课是否播放完成；已有片段记录仍保留。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
  expect(screen.queryByText(new RegExp(tr("本遍课程实际播放了").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeNull();
});
