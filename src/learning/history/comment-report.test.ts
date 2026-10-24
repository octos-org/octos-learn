import { REPORT_COMMENT_INSTRUCTIONS } from '../../../services/learning-history/report-comment-instructions.mjs';
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { commentWeeklyReport } from './comment-report';
import type { UiProtocolBridge } from '../../runtime/ui-protocol-bridge';

const identity = { owner: 'alice', token: 'synthetic-login' };
const id = 'a'.repeat(64), lease = '12345678-1234-4234-8234-123456789abc';
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture({ none = false, resumed = false, invalid = false, rejected = false } = {}) {
  const host = `learn-report-${'b'.repeat(32)}`;
  const old = { host, peer: 'report-old', session: `${host}#peer-report-old`, token: 'synthetic-control', namespace: 'app/learning-reports/report-old', turn: lease };
  const input = { input_sha256: 'c'.repeat(64), teacher: '豆豆', activity: { 学习天数: 2 } };
  const result = { schema: 1, input_sha256: input.input_sha256, comment: '这周来了 2 天，地图亮起来啦！' };
  const calls: { method: string; params: Record<string, unknown> }[] = [], http: string[] = [];
  let control = resumed ? old : undefined, turn = old.turn;
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url).split('/report-comments')[1]; http.push(path);
    const json = options?.body ? JSON.parse(String(options.body)) : {};
    let payload: unknown;
    if (path === '/controls') payload = { controls: control ? [{ id, control }] : [] };
    else if (path === `/jobs/${id}`) payload = { job: { state: 'leased' } };
    else if (path === '/claim') { expect(typeof json.utc_offset_minutes).toBe('number');
      payload = { tasks: none ? [] : [{ id, lease_id: lease, teacher_id: 'doudou', input, execution: resumed ? { session_id: old.session, turn_id: old.turn } : null }] }; }
    else if (path === `/controls/${id}`) { control = options?.method === 'DELETE' ? undefined : json.control; payload = { recorded: true }; }
    else if (path === `/jobs/${id}/execution`) { turn = json.execution.turn_id; payload = { recorded: true }; }
    else if (path === `/jobs/${id}/result`) {
      if (rejected) return new Response('{}', { status: 400 });
      expect(json.result).toEqual(result); payload = { recorded: true };
    } else if (path.endsWith('/reject') || path.endsWith('/pause')) payload = { recorded: true };
    else throw Error(`Unexpected HTTP ${path}`);
    return Response.json({ profile_id: identity.owner, ...payload as object });
  });
  const callMethod = vi.fn(async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === 'peer/prepare') {
      const peer = (params.names as string[])[0];
      return { slug: peer, topic: `peer-${peer}`, host_token: 'synthetic-control', cwd: '/synthetic/octos/report-workspace' };
    }
    if (method === 'session/hydrate') return { turns: [{ turn_id: turn, state: 'completed' }], messages: [{ role: 'assistant', turn_id: turn, content: invalid ? 'malformed' : JSON.stringify(result) }] };
    if (method === 'peer/purge') return { purged: true };
    return {};
  });
  const connection = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), callMethod, onPeerToolCall: () => () => {} } as unknown as UiProtocolBridge;
  return { fetcher, calls, http, connection };
}
const run = (f: ReturnType<typeof fixture>) => commentWeeklyReport(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection, sleep: async () => {} });

it('does not connect to Octos when there is no finished week to comment on', async () => {
  const f = fixture({ none: true });
  expect(await run(f)).toBe(false);
  expect(f.connection.start).not.toHaveBeenCalled();
  expect(f.http).toEqual(['/controls', '/claim']);
});

it('records the control and execution before one tool-less turn, saves the comment and purges the peer', async () => {
  const f = fixture();
  expect(await run(f)).toBe(true);
  expect(f.http).toEqual(['/controls', '/claim', `/controls/${id}`, `/jobs/${id}/execution`, `/jobs/${id}/result`, `/controls/${id}`]);
  const methods = f.calls.map(call => call.method);
  expect(methods).toEqual(['peer/prepare', 'peer/tools/register', 'session/open', 'turn/start', 'session/hydrate', 'peer/purge']);
  expect(f.calls[1].params).toMatchObject({ generic_tools: [], tools: [] });
  expect(f.calls[0].params).toMatchObject({ brief: REPORT_COMMENT_INSTRUCTIONS });
  const text = ((f.calls[3].params.input as { text: string }[])[0]).text;
  expect(f.calls[3].params).toMatchObject({ origin: { kind: 'app' } });
  expect(text).toContain('本次授课老师：豆豆');
  expect(text).toContain('"学习天数":2');
});

it('reconciles a started turn without starting another', async () => {
  const f = fixture({ resumed: true });
  expect(await run(f)).toBe(true);
  expect(f.calls.map(call => call.method)).not.toContain('turn/start');
  expect(f.calls[0].params).toMatchObject({ resume: true, host_token: 'synthetic-control' });
});

it('rejects a malformed or refused comment so the fixed lines stay, and still purges the peer', async () => {
  for (const options of [{ invalid: true }, { rejected: true }]) {
    const f = fixture(options);
    await expect(run(f)).rejects.toThrow();
    expect(f.http).toContain(`/jobs/${id}/reject`);
    expect(f.calls.at(-1)?.method).toBe('peer/purge');
  }
});
