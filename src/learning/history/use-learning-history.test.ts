import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '../../lib/constants';

beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); localStorage.clear(); localStorage.setItem(TOKEN_KEY, 'credential'); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('keeps durable local facts during active teaching, then uploads them once after a lost receipt without any model request', async () => {
  const accepted = new Map<string, unknown>(); let loseReply = true;
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async function (this: unknown, input: string | URL | Request, init?: RequestInit) {
    // A native browser fetch cannot be invoked with a coordinator/API instance
    // as its receiver. Verify the adapter does not bind it to those objects.
    expect(this === undefined || this === globalThis).toBe(true);
    const path = String(input); calls.push(path);
    if (path.endsWith('/api/my/profile')) return Response.json({ id: 'alice' });
    if (path.includes('/changes?')) return Response.json({ changes: [], through: 0, next_after: null });
    if (path.endsWith('/events')) {
      const { events } = JSON.parse(String(init?.body));
      const results = events.map((event: { id: string }) => {
        const exists = accepted.has(event.id); accepted.set(event.id, event);
        return { id: event.id, status: exists ? 'exists' : 'accepted', seq: 1 };
      });
      if (loseReply) { loseReply = false; throw new TypeError('lost HTTP receipt'); }
      return Response.json({ profile_id: 'alice', results });
    }
    if (path.endsWith('/deliveries')) return Response.json({ profile_id: 'alice', states: [], pending_session_deletions: 0 });
    throw new Error(`Unexpected network request: ${path}`);
  }));
  const { LearningHistoryCoordinator } = await import('./use-learning-history');
  const coordinator = new LearningHistoryCoordinator('credential');
  coordinator.setClassroomBusy('board', true);
  const recorder = coordinator.recorder('board');
  recorder.record({ kind: 'question_submitted', runKey: 'q1', questionId: 'q1', data: { text: '解释斜率', modality: 'text' } });
  await recorder.flush(); await coordinator.synchronize();
  expect(calls.filter(path => path.includes('/history/'))).toHaveLength(0);
  expect(coordinator.getSnapshot().pending).toBeGreaterThan(0);
  coordinator.setClassroomBusy('board', false);
  await coordinator.synchronize();
  expect(accepted.size).toBe(1); expect(coordinator.getSnapshot().error).toContain('尚未全部同步');
  await coordinator.retry();
  expect(accepted.size).toBe(1); expect(coordinator.getSnapshot()).toMatchObject({ pending: 0, syncing: false, error: '', checked: true });
  localStorage.removeItem(TOKEN_KEY); // Pending scheduled work cannot use a retired login.
});
