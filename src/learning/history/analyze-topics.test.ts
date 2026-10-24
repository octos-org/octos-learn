import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { analyzeTopics } from './analyze-topics';
import { BridgeRpcError, BridgeTimeoutError, type UiProtocolBridge } from '../../runtime/ui-protocol-bridge';

const identity = { owner: 'alice', token: 'synthetic-login' };
const id = 'a'.repeat(64), lease = '12345678-1234-4234-8234-123456789abc', capability = 'k'.repeat(43);
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture({ disabled = false, jobs = 1, quota = true, leftover = false, invoke }: {
  disabled?: boolean; jobs?: number; quota?: boolean; leftover?: boolean; invoke?: () => unknown } = {}) {
  const host = `learn-topic-${'b'.repeat(32)}`;
  const old = { host, peer: 'topics-old', session: `${host}#peer-topics-old`, token: 'synthetic-control', namespace: 'app/learning-topics/topics-old', turn: lease };
  const input = { input_sha256: 'c'.repeat(64), units: [{ unit_id: 'question' }] };
  const calls: { method: string; params: Record<string, unknown> }[] = [], http: string[] = [];
  let remaining = jobs, control = leftover ? old : undefined;
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url).split('/analysis')[1]; http.push(path);
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer synthetic-login');
    expect((options?.headers as Record<string, string>)['X-Learning-Owner']).toBe('alice');
    const json = options?.body ? JSON.parse(String(options.body)) : {};
    let payload: unknown;
    if (path === '/controls') payload = { controls: control ? [{ id, control }] : [] };
    else if (path === '') payload = { enabled: !disabled, states: [{ state: 'pending', count: remaining }], analysis_through: 4 };
    else if (path === `/jobs/${id}`) payload = { job: { state: 'complete' } };
    else if (path === `/controls/${id}`) { control = undefined; payload = { removed: true }; }
    else if (path === '/claim') payload = { tasks: remaining > 0 ? [{ id, lease_id: lease, input, execution: null }] : [] };
    else if (path === `/jobs/${id}/dispatch`) {
      expect(json).toEqual({ lease_id: lease });
      payload = quota ? { recorded: true, capability } : { recorded: false, reason: 'daily-task-limit' };
      if (quota) remaining--;
    } else if (path === `/jobs/${id}/undispatch`) { remaining++; payload = { recorded: true }; }
    else throw Error(`Unexpected HTTP ${path}`);
    return Response.json({ profile_id: identity.owner, ...payload as object });
  });
  const callMethod = vi.fn(async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === 'skill/action/invoke') return invoke ? invoke() : { action_id: 'learning.topics.analyze', ok: true, queued: 1 };
    if (method === 'peer/purge') return { purged: true };
    throw Error(`Unexpected RPC ${method}`);
  });
  const connection = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), callMethod } as unknown as UiProtocolBridge;
  return { fetcher, calls, http, connection, input };
}

it('keeps analysis disabled without connecting to Octos or starting anything', async () => {
  const f = fixture({ disabled: true });
  expect(await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection }))
    .toEqual({ enabled: false, pending: 0, dispatched: 0, analysisThrough: 4 });
  expect(f.connection.start).not.toHaveBeenCalled(); expect(f.http).toEqual(['/controls', '']);
});

it('starts a claimed job as a background action with its capability and frozen input, never a turn of its own', async () => {
  const f = fixture();
  expect(await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).toMatchObject({ enabled: true, dispatched: 1 });
  expect(f.http).toEqual(['/controls', '', '/claim', `/jobs/${id}/dispatch`, '/claim', '']);
  expect(f.calls).toEqual([{ method: 'skill/action/invoke', params: { session_id: expect.stringMatching(/^learn-topic-[a-f0-9]{32}$/), profile_id: 'alice',
    action_id: 'learning.topics.analyze', arguments: { job_id: id, capability, input: f.input } } }]);
  expect(f.connection.stop).toHaveBeenCalled();
});

it('starts at most three analyses in one pass, and stops at the daily limit', async () => {
  const many = fixture({ jobs: 5 });
  expect((await analyzeTopics(identity, '', { fetcher: many.fetcher, createBridge: () => many.connection })).dispatched).toBe(3);
  const limited = fixture({ quota: false });
  expect((await analyzeTopics(identity, '', { fetcher: limited.fetcher, createBridge: () => limited.connection })).dispatched).toBe(0);
  expect(limited.calls).toEqual([]);
});

it('returns the job uncounted when Octos refuses the action, so nothing was charged', async () => {
  const f = fixture({ invoke: () => { throw new BridgeRpcError(-32601, 'Unknown skill action learning.topics.analyze'); } });
  await expect(analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).rejects.toThrow('Unknown skill action');
  expect(f.http).toContain(`/jobs/${id}/undispatch`);
  const unqueued = fixture({ invoke: () => ({ ok: true, queued: 0 }) });
  await expect(analyzeTopics(identity, '', { fetcher: unqueued.fetcher, createBridge: () => unqueued.connection })).rejects.toThrow('not queued');
  expect(unqueued.http).toContain(`/jobs/${id}/undispatch`);
});

it('keeps the job dispatched when the reply is lost, since the action may be running', async () => {
  const f = fixture({ invoke: () => { throw new BridgeTimeoutError('skill/action/invoke', 10000); } });
  await expect(analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).rejects.toThrow();
  expect(f.http).not.toContain(`/jobs/${id}/undispatch`);
});

it('stops when teaching starts or the account changes', async () => {
  const busy = fixture();
  await analyzeTopics(identity, '', { fetcher: busy.fetcher, createBridge: () => busy.connection, canContinue: () => false });
  expect(busy.http).not.toContain('/claim');
  const switched = fixture();
  await expect(analyzeTopics(identity, '', { fetcher: switched.fetcher, createBridge: () => switched.connection, isCurrent: () => false })).rejects.toThrow('账号已切换');
  expect(switched.http).toEqual([]);
});

it('still purges a peer left by the earlier page-run analysis', async () => {
  const f = fixture({ leftover: true, jobs: 0 });
  await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection });
  expect(f.calls.map(call => call.method)).toEqual(['peer/purge']);
  expect(f.http).toContain(`/controls/${id}`);
});
