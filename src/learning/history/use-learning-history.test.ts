import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '../../lib/constants';

let credentialSequence = 0;
beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); localStorage.clear(); localStorage.setItem(TOKEN_KEY, `credential-${++credentialSequence}`); });
afterEach(() => { localStorage.removeItem(TOKEN_KEY); vi.useRealTimers(); vi.restoreAllMocks(); });
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
    if (path.endsWith('/analysis/controls')) return Response.json({ profile_id: 'alice', controls: [] });
    if (path.endsWith('/analysis')) return Response.json({ profile_id: 'alice', enabled: false, states: [] });
    throw new Error(`Unexpected network request: ${path}`);
  }));
  const { LearningHistoryCoordinator } = await import('./use-learning-history');
  const coordinator = new LearningHistoryCoordinator(localStorage.getItem(TOKEN_KEY)!);
  coordinator.setClassroomBusy('board', true);
  const recorder = coordinator.recorder('board');
  recorder.record({ kind: 'question_submitted', runKey: 'q1', questionId: 'q1', data: { text: '解释斜率', modality: 'text' } });
  const syncingSeen: boolean[] = [];
  const stop = coordinator.subscribe(() => syncingSeen.push(coordinator.getSnapshot().syncing));
  await recorder.flush(); await coordinator.synchronize();
  stop();
  // During class the status stays "saved locally"; it never flashes "syncing".
  expect(syncingSeen).not.toContain(true);
  expect(calls.filter(path => path.includes('/history/'))).toHaveLength(0);
  expect(coordinator.getSnapshot().pending).toBeGreaterThan(0);
  coordinator.setClassroomBusy('board', false);
  await coordinator.synchronize();
  expect(accepted.size).toBe(1); expect(coordinator.getSnapshot().error).toContain('尚未全部同步');
  await coordinator.retry();
  expect(accepted.size).toBe(1); expect(coordinator.getSnapshot()).toMatchObject({ pending: 0, syncing: false, error: '', checked: true });
  localStorage.removeItem(TOKEN_KEY); // Pending scheduled work cannot use a retired login.
});

it('yields when teaching begins during an in-flight deletion-page read, retaining facts for the next idle sync', async () => {
  let release!: () => void; let reached!: () => void;
  const started = new Promise<void>(resolve => { reached = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let hold = true; const uploaded: string[] = []; const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input); calls.push(path);
    if (path.endsWith('/api/my/profile')) return Response.json({ id: 'alice' });
    if (path.includes('/changes?')) { if (hold) { hold = false; reached(); await blocked; } return Response.json({ changes: [], through: 0, next_after: null }); }
    if (path.endsWith('/events')) {
      const { events } = JSON.parse(String(init?.body)); uploaded.push(...events.map((e: { id: string }) => e.id));
      return Response.json({ profile_id: 'alice', results: events.map((e: { id: string }) => ({ id: e.id, status: 'accepted', seq: 1 })) });
    }
    if (path.endsWith('/deliveries')) return Response.json({ profile_id: 'alice', states: [], pending_session_deletions: 0 });
    if (path.endsWith('/analysis/controls')) return Response.json({ profile_id: 'alice', controls: [] });
    if (path.endsWith('/analysis')) return Response.json({ profile_id: 'alice', enabled: false, states: [] });
    throw new Error(`Unexpected request: ${path}`);
  }));
  const { LearningHistoryCoordinator } = await import('./use-learning-history');
  const coordinator = new LearningHistoryCoordinator(localStorage.getItem(TOKEN_KEY)!);
  coordinator.recorder('board').record({ kind: 'question_submitted', runKey: 'q1', questionId: 'q1', data: { text: '问题', modality: 'text' } });
  const work = coordinator.synchronize(); await started;
  coordinator.setClassroomBusy('board', true); release(); await work;
  expect(uploaded).toEqual([]); expect(calls.some(path => path.endsWith('/deliveries'))).toBe(false);
  expect(coordinator.getSnapshot().error).toBe('');
  coordinator.setClassroomBusy('board', false); await coordinator.synchronize();
  expect(uploaded).toHaveLength(1); expect(coordinator.getSnapshot().pending).toBe(0);
  localStorage.removeItem(TOKEN_KEY);
});

it('finishes an already-sent batch receipt but sends no next batch while teaching, then resumes the remaining facts', async () => {
  let release!: () => void; let reached!: () => void;
  const started = new Promise<void>(resolve => { reached = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const batches: string[][] = []; let deliveries = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/api/my/profile')) return Response.json({ id: 'alice' });
    if (path.includes('/changes?')) return Response.json({ changes: [], through: 0, next_after: null });
    if (path.endsWith('/events')) {
      const { events } = JSON.parse(String(init?.body)); batches.push(events.map((e: { id: string }) => e.id));
      if (batches.length === 1) { reached(); await blocked; }
      return Response.json({ profile_id: 'alice', results: events.map((e: { id: string }) => ({ id: e.id, status: 'accepted', seq: 1 })) });
    }
    if (path.endsWith('/deliveries')) { deliveries++; return Response.json({ profile_id: 'alice', states: [], pending_session_deletions: 0 }); }
    if (path.endsWith('/analysis/controls')) return Response.json({ profile_id: 'alice', controls: [] });
    if (path.endsWith('/analysis')) return Response.json({ profile_id: 'alice', enabled: false, states: [] });
    throw new Error(`Unexpected request: ${path}`);
  }));
  const { LearningHistoryCoordinator } = await import('./use-learning-history');
  const coordinator = new LearningHistoryCoordinator(localStorage.getItem(TOKEN_KEY)!); const recorder = coordinator.recorder('board');
  for (let i = 0; i < 101; i++) recorder.record({ id: `q-${i}`, kind: 'question_submitted', runKey: `q-${i}`, questionId: `q-${i}`, data: { text: '问题', modality: 'text' } });
  const work = coordinator.synchronize(); await started;
  coordinator.setClassroomBusy('board', true); release(); await work;
  expect(batches.map(batch => batch.length)).toEqual([100]); expect(deliveries).toBe(0);
  coordinator.setClassroomBusy('board', false); await coordinator.synchronize();
  expect(batches.map(batch => batch.length)).toEqual([100, 1]); expect(new Set(batches.flat()).size).toBe(101);
  expect(coordinator.getSnapshot()).toMatchObject({ pending: 0, error: '' });
  localStorage.removeItem(TOKEN_KEY);
});

it('checks achievements when a background analysis has saved a newer result, and once after opening', async () => {
  const through = [2, 2, 3];
  vi.doMock('./analyze-topics', () => ({ analyzeTopics: async () => ({ pending: 0, dispatched: 0, enabled: true, analysisThrough: through.shift() }) }));
  vi.doMock('./comment-report', () => ({ commentWeeklyReport: async () => false }));
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const path = String(input);
    if (path.endsWith('/api/my/profile')) return Response.json({ id: 'alice' });
    if (path.includes('/changes?')) return Response.json({ changes: [], through: 0, next_after: null });
    if (path.endsWith('/deliveries')) return Response.json({ profile_id: 'alice', states: [], pending_session_deletions: 0 });
    throw new Error(`Unexpected network request: ${path}`);
  }));
  const announced: unknown[] = [];
  const listener = (event: Event) => announced.push((event as CustomEvent).detail);
  window.addEventListener('octos:history-uploaded', listener);
  try {
    const { LearningHistoryCoordinator } = await import('./use-learning-history');
    const coordinator = new LearningHistoryCoordinator(localStorage.getItem(TOKEN_KEY)!);
    await coordinator.synchronize(); // first look: results may have arrived while closed
    await coordinator.synchronize(); // nothing new
    await coordinator.synchronize(); // one more saved result
    expect(announced).toEqual([{ owner: 'alice', uploaded: 0, analyzed: 1 }, { owner: 'alice', uploaded: 0, analyzed: 1 }]);
  } finally { window.removeEventListener('octos:history-uploaded', listener); vi.doUnmock('./analyze-topics'); vi.doUnmock('./comment-report'); }
});

it('uploads within a second while playback keeps saving, instead of postponing on every save', async () => {
  const { LearningHistoryCoordinator } = await import('./use-learning-history');
  const coordinator = new LearningHistoryCoordinator(localStorage.getItem(TOKEN_KEY)!);
  const synchronize = vi.spyOn(coordinator, 'synchronize').mockResolvedValue();
  vi.useFakeTimers();
  // A phase animation saves every 200 ms; each committed save schedules a sync.
  for (let elapsed = 0; elapsed < 3000; elapsed += 200) {
    (coordinator as unknown as { schedule(): void }).schedule();
    vi.advanceTimersByTime(200);
  }
  expect(synchronize.mock.calls.length).toBeGreaterThanOrEqual(2);
});
