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
  expect(await screen.findByText('学生提问')).toBeTruthy();
  expect(screen.getByText('提问 1 次 · 已播放 2 个不同片段 · 作答 1 次')).toBeTruthy();
  fireEvent.click(screen.getByText('查看原始依据编号'));
  expect(screen.getByText(/记录：event-1/)).toBeTruthy();
  expect(screen.getByText(/不代表已经理解或掌握/)).toBeTruthy();
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
  fireEvent.click(await screen.findByRole('button', { name: '加载更多' }));
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
  await screen.findByText('学生提问'); fireEvent.click(screen.getByRole('button', { name: '删除这次学习记录' }));
  expect(await screen.findByText(/还没有已同步的学习经过/)).toBeTruthy();
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
  await waitFor(() => expect(screen.queryByText('学生提问')).toBeNull());
  expect(await screen.findByText(/还没有已同步的学习经过/)).toBeTruthy();
});
