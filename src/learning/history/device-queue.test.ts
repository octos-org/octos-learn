import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import type { HistoryEvent } from '../../../services/learning-history/event-contract.mjs';
import type { DeviceHistoryQueue } from './device-queue';

beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); localStorage.clear(); });
const event = (id = 'event-1', run = 'run-1'): HistoryEvent => ({
  version: 1, id, kind: 'question_submitted', occurred_at: '2026-10-21T00:00:00.000Z', device_id: 'device-1',
  session_id: 'session-1', run_id: run, question_id: id, data: { text: '为什么？', modality: 'text' },
});
async function queue() { const { DeviceHistoryQueue } = await import('./device-queue'); return new DeviceHistoryQueue(); }
async function checkpoint() {
  const { openLearningDatabase } = await import('../learning-document-store');
  const db = await openLearningDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const request = tx.objectStore('documents').get('lesson');
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}

it('commits the checkpoint with its facts and recovers both after reopening', async () => {
  const first = await queue();
  await first.commit('alice', [event()], [{ key: 'lesson', value: { cursor: 4 } }]);
  vi.resetModules();
  const reopened = await queue();
  expect(await reopened.list('alice')).toEqual([{ owner: 'alice', event: event(), state: 'pending' }]);
  expect(await reopened.list('bob')).toEqual([]);
  expect(await checkpoint()).toEqual({ cursor: 4 });
});

it('aborting either side of a local transaction leaves neither a checkpoint nor a queued fact', async () => {
  const local = await queue();
  const put = IDBObjectStore.prototype.add;
  const failure = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (this.name === 'history-events') {
      throw new DOMException('full', 'QuotaExceededError');
    }
    return put.apply(this, args);
  });
  await expect(local.commit('alice', [event()], [{ key: 'lesson', value: { cursor: 4 } }])).rejects.toThrow();
  failure.mockRestore();
  expect(await local.list('alice')).toEqual([]);
  expect(await checkpoint()).toBeUndefined();
  // Retrying the exact original operation after a failed transaction succeeds.
  await local.commit('alice', [event()], [{ key: 'lesson', value: { cursor: 4 } }]);
  expect(await local.list('alice')).toHaveLength(1);
  expect(await checkpoint()).toEqual({ cursor: 4 });
});

it('retains the original on local conflicts and rejects an incomplete receipt without dropping data', async () => {
  const local = await queue();
  await local.commit('alice', [event()]);
  await local.commit('alice', [event()]);
  await expect(local.commit('alice', [{ ...event(), data: { text: '不同内容', modality: 'text' } }], [{ key: 'lesson', value: 9 }])).rejects.toThrow('不同内容');
  expect(await checkpoint()).toBeUndefined();
  await expect(local.acknowledge('alice', [event()], [])).rejects.toThrow('不完整');
  expect((await local.list('alice'))[0].event).toEqual(event());
  await local.acknowledge('alice', [event()], [{ id: event().id, status: 'conflict' }]);
  expect((await local.list('alice'))[0].state).toBe('conflict');
});

it('confirmed deletions remove unseen offline children and survive reopening without affecting another account', async () => {
  const local = await queue();
  await local.commit('alice', [event(), event('event-2')]);
  await local.commit('bob', [event()]);
  await local.applyDeletions('alice', ['run-1'], 7);
  await local.applyDeletions('alice', [], 3);
  vi.resetModules();
  const reopened = await queue();
  await reopened.commit('alice', [event('previously-unknown-child')]);
  expect(await reopened.list('alice')).toEqual([]);
  expect(await reopened.changeCursor('alice')).toBe(7);
  expect(await reopened.list('bob')).toHaveLength(1);
});

it('an upload with a lost reply stays queued, then accepts an exists receipt using its original identifiers', async () => {
  const local = await queue();
  await local.commit('alice', [event()]);
  const { HistorySynchronizer } = await import('./synchronize');
  const received: HistoryEvent[][] = [];
  let loseReply = true;
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json({ changes: [], through: 0, next_after: null });
    received.push(JSON.parse(String(init.body)).events);
    if (loseReply) { loseReply = false; throw new Error('reply lost'); }
    return Response.json({ profile_id: 'alice', results: [{ id: event().id, status: 'exists', seq: 1 }] });
  }) as unknown as typeof fetch;
  const sync = new HistorySynchronizer(local, '', fetcher);
  await expect(sync.synchronize({ owner: 'alice', token: 'credential-a' })).rejects.toThrow('reply lost');
  expect(await local.list('alice')).toHaveLength(1);
  await sync.synchronize({ owner: 'alice', token: 'credential-a' });
  expect(received).toEqual([[event()], [event()]]);
  expect(await local.list('alice')).toEqual([]);
});

it('identity is resolved from captured authentication and an account switch cannot send the previous queue as the next account', async () => {
  const local = await queue();
  await local.commit('alice', [event()]);
  await local.commit('bob', [event('bob-question', 'bob-run')]);
  localStorage.setItem('selected_profile', 'alice');
  const { HistorySynchronizer, verifyHistoryIdentity } = await import('./synchronize');
  const posted: string[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).Authorization;
    if (String(url).endsWith('/api/my/profile')) return Response.json({ profile: { id: auth.endsWith('credential-b') ? 'bob' : 'alice' } });
    if (init?.method !== 'POST') return Response.json({ changes: [], through: 0, next_after: null });
    const rows = JSON.parse(String(init.body)).events as HistoryEvent[];
    posted.push(...rows.map(row => row.id));
    expect(auth).toBe('Bearer credential-b');
    return Response.json({ profile_id: 'bob', results: rows.map(row => ({ id: row.id, status: 'accepted', seq: 1 })) });
  }) as unknown as typeof fetch;
  const identity = await verifyHistoryIdentity('', 'credential-b', fetcher);
  expect(identity.owner).toBe('bob');
  await new HistorySynchronizer(local, '', fetcher).synchronize(identity);
  expect(posted).toEqual(['bob-question']);
  expect(await local.list('alice')).toHaveLength(1);
  expect(await local.list('bob')).toHaveLength(0);
});

it('does not acknowledge a response claiming another account or silently retry conflicts', async () => {
  const local = await queue();
  await local.commit('alice', [event()]);
  const { HistorySynchronizer } = await import('./synchronize');
  let wrongOwner = true;
  let posts = 0;
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json({ changes: [], through: 0, next_after: null });
    posts++;
    return Response.json({ profile_id: wrongOwner ? 'bob' : 'alice', results: [{ id: event().id, status: 'conflict' }] });
  }) as unknown as typeof fetch;
  const sync = new HistorySynchronizer(local, '', fetcher);
  await expect(sync.synchronize({ owner: 'alice', token: 'a' })).rejects.toThrow('账号');
  expect(await local.list('alice')).toHaveLength(1);
  wrongOwner = false;
  await sync.synchronize({ owner: 'alice', token: 'a' });
  await sync.synchronize({ owner: 'alice', token: 'a' });
  expect(posts).toBe(2);
  expect((await local.list('alice'))[0].state).toBe('conflict');
});

it('processes a deletion before uploading the old device children', async () => {
  const local: DeviceHistoryQueue = await queue();
  await local.commit('alice', [event()]);
  const { HistorySynchronizer } = await import('./synchronize');
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(init?.method).not.toBe('POST');
    return Response.json({ changes: [{ seq: 2, run_id: 'run-1', change_kind: 'deleted' }], through: 2, next_after: null });
  }) as unknown as typeof fetch;
  await new HistorySynchronizer(local, '', fetcher).synchronize({ owner: 'alice', token: 'a' });
  expect(await local.list('alice')).toEqual([]);
  expect(await local.changeCursor('alice')).toBe(2);
});

it('upgrades an existing document database without losing its old playback state', async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('octos-learning-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').put({ cursor: 12 }, 'lesson');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const local = await queue();
  await local.commit('alice', [event()]);
  expect(await checkpoint()).toEqual({ cursor: 12 });
  expect(await local.list('alice')).toHaveLength(1);
});
