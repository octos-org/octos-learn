import { ANALYSIS_INSTRUCTIONS, buildTopicAnalysisPrompt } from '../../../services/learning-history/topic-analysis-instructions.mjs';
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { analyzeTopics } from './analyze-topics';
import type { UiProtocolBridge, PeerToolCall } from '../../runtime/ui-protocol-bridge';

const identity = { owner: 'alice', token: 'synthetic-login' };
const id = 'a'.repeat(64), lease = '12345678-1234-4234-8234-123456789abc';
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture({ disabled = false, resumed = false, invalid = false, lostReceipt = false, untyped = false, extraTurn = false } = {}) {
  const host = `learn-topic-${'b'.repeat(32)}`;
  const old = { host, peer: 'topics-old', session: `${host}#peer-topics-old`, token: 'synthetic-control', namespace: 'app/learning-topics/topics-old', turn: lease };
  const input = { input_sha256: 'c'.repeat(64), units: [{ unit_id: 'question' }] };
  const result = { schema: 1, input_sha256: input.input_sha256, units: [{ unit_id: 'question', status: 'unknown', topics: [], reason: 'Missing context' }] };
  const calls: { method: string; params: Record<string, unknown> }[] = [], http: string[] = [], rejections: string[] = [];
  let completed = false, busy = false, subscriber: (event: PeerToolCall) => void = () => {}, control = resumed ? old : undefined;
  let session = old.session, turn = old.turn;
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url).split('/analysis')[1]; http.push(path);
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer synthetic-login');
    expect((options?.headers as Record<string, string>)['X-Learning-Owner']).toBe('alice');
    const json = options?.body ? JSON.parse(String(options.body)) : {};
    let payload: unknown;
    if (path === '/controls') payload = { controls: control ? [{ id, control }] : [] };
    else if (path === '') payload = { enabled: !disabled, states: [{ state: completed ? 'complete' : 'pending', count: 1 }] };
    else if (path === `/jobs/${id}`) payload = { job: { state: completed ? 'complete' : 'uncertain' } };
    else if (path === '/claim') payload = { tasks: [{ id, lease_id: lease, input, execution: resumed ? { session_id: old.session, turn_id: old.turn } : null }] };
    else if (path === `/controls/${id}`) { control = options?.method === 'DELETE' ? undefined : json.control; payload = { recorded: true }; }
    else if (path === `/jobs/${id}/execution`) { session = json.execution.session_id; turn = json.execution.turn_id; payload = { recorded: true }; }
    else if (path === `/jobs/${id}/result`) {
      expect(json.result).toEqual(result); expect(JSON.stringify(json)).not.toContain('synthetic-control');
      completed = true; if (lostReceipt) throw Error('Saved receipt lost'); payload = { recorded: true };
    } else if (path.endsWith('/reject')) { rejections.push(json.reason); completed = true; payload = { recorded: true }; }
    else if (path.endsWith('/pause')) payload = { recorded: true };
    else if (path.startsWith('/catalog?')) payload = { topics: [{ id: 'mt_WBdHkc2HTf', name: 'Linear Function Graphs' }] };
    else throw Error(`Unexpected HTTP ${path}`);
    return Response.json({ profile_id: identity.owner, ...payload as object });
  });
  const callMethod = vi.fn(async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === 'peer/prepare') {
      const peer = (params.names as string[])[0];
      return { slug: peer, topic: `peer-${peer}`, host_token: 'synthetic-control', cwd: '/synthetic/octos/analysis-workspace' };
    }
    if (method === 'session/hydrate') return { turns: [{ turn_id: turn, state: 'completed' }, ...(extraTurn ? [{ turn_id: 'other-turn', state: 'completed' }] : [])], messages: [{ role: 'assistant', ...(untyped ? {} : { turn_id: turn }), content: invalid ? 'malformed' : JSON.stringify(result) }] };
    if (method === 'peer/purge') return { purged: true };
    return {};
  });
  const connection = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), callMethod,
    onPeerToolCall: (callback: typeof subscriber) => { subscriber = callback; return () => { subscriber = () => {}; }; } } as unknown as UiProtocolBridge;
  return { fetcher, calls, http, rejections, connection, result, setBusy: () => { busy = true; }, canContinue: () => !busy,
    emit: (overrides: Partial<PeerToolCall> = {}) => subscriber({ peer: control?.peer ?? '', session_id: session, turn_id: turn, call_id: 'catalog-call', name: 'learning_topics.search', args: { query: 'linear slope' }, ...overrides }) };
}

it('keeps analysis disabled without connecting to Octos or admitting a turn', async () => {
  const f = fixture({ disabled: true });
  expect(await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).toEqual({ enabled: false, pending: 0, completed: 0 });
  expect(f.connection.start).not.toHaveBeenCalled(); expect(f.http).toEqual(['/controls', '']);
});

it('records execution before app admission and confines catalog calls to the current analysis', async () => {
  const f = fixture();
  const original = f.connection.callMethod;
  f.connection.callMethod = async (method, params) => {
    if (method === 'turn/start') {
      expect(f.http).toContain(`/jobs/${id}/execution`);
      expect(params.origin).toEqual({ kind: 'app', label: 'Learning topic analysis' });
      f.emit({ session_id: 'student-classroom' });
      f.emit(); await Promise.resolve(); await Promise.resolve();
    }
    return original(method, params);
  };
  expect((await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).completed).toBe(1);
  expect(f.http.filter(path => path.startsWith('/catalog?'))).toHaveLength(1);
  expect(f.calls.find(call => call.method === 'peer/tools/register')?.params.generic_tools).toEqual([]);
  expect(f.connection.start).toHaveBeenCalledWith({ profileId: identity.owner });
  const admissions = f.calls.filter(call => call.method === 'turn/start');
  expect(admissions).toHaveLength(1);
  const prompt = (admissions[0].params.input as { text: string }[])[0].text;
  expect(prompt.startsWith(ANALYSIS_INSTRUCTIONS)).toBe(true);
  expect(prompt).toBe(buildTopicAnalysisPrompt({ input_sha256: 'c'.repeat(64), units: [{ unit_id: 'question' }] }));
  expect(f.calls.filter(call => call.method === 'peer/purge')).toHaveLength(1);
  expect(f.http).toContain(`/controls/${id}`);
});

it('reads the original execution after a lost response without starting another paid turn', async () => {
  const f = fixture({ resumed: true });
  await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection });
  expect(f.calls.some(call => call.method === 'turn/start')).toBe(false);
  expect(f.calls.find(call => call.method === 'peer/prepare')?.params.resume).toBe(true);
  expect(f.connection.start).toHaveBeenCalledWith({ profileId: identity.owner });
  expect(f.calls.find(call => call.method === 'session/open')?.params.cwd).toBe('/synthetic/octos/analysis-workspace');
  expect(f.calls.filter(call => call.method === 'peer/purge')).toHaveLength(1);
});

it.each(['partial', 'errors', 'residual_errors'])('retains cleanup authorization when Octos reports %s residue', async field => {
  const f = fixture(), original = f.connection.callMethod;
  f.connection.callMethod = async (method, params) => method === 'peer/purge' ? { already_purged: true, [field]: field === 'partial' ? true : ['residue'] } as never : original(method, params);
  const outcome = await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection });
  expect(outcome.pending).toBe(1);
  // The single controls request saved the token; no DELETE was acknowledged.
  expect(f.http.filter(path => path === `/controls/${id}`)).toHaveLength(1);
});

it.each(['errored', 'interrupted'])('settles a definitively %s execution without admitting a replacement', async state => {
  const f = fixture({ resumed: true }), original = f.connection.callMethod;
  f.connection.callMethod = async (method, params) => {
    const result = await original(method, params);
    if (method === 'session/hydrate') {
      const page = result as { turns: { turn_id: string; state: string }[] };
      return { ...page, turns: page.turns.map(turn => ({ ...turn, state })) } as never;
    }
    return result;
  };
  await expect(analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).rejects.toThrow('已结束但没有有效结果');
  expect(f.http).toContain(`/jobs/${id}/reject`);
  expect(f.rejections).toEqual(['analysis-turn-failed']);
  expect(f.calls.some(call => call.method === 'turn/start')).toBe(false);
  expect(f.calls.some(call => call.method === 'peer/purge')).toBe(true);
});

it('retains the original execution when a stale lease cannot reject its output', async () => {
  const f = fixture({ resumed: true, invalid: true });
  const fetcher = async (url: string | URL | Request, options?: RequestInit) => String(url).endsWith('/reject')
    ? Response.json({ profile_id: 'alice', recorded: false }) : f.fetcher(url, options);
  await expect(analyzeTopics(identity, '', { fetcher, createBridge: () => f.connection })).rejects.toThrow('重新领取');
  expect(f.calls.some(call => call.method === 'peer/purge')).toBe(false);
});

it.each(['peer/prepare', 'peer/tools/register', 'session/open'])('retains an existing execution when recovery fails at %s', async methodToFail => {
  const f = fixture({ resumed: true }), original = f.connection.callMethod;
  f.connection.callMethod = async (method, params) => {
    if (method === methodToFail) throw Error('Recovery connection failed');
    return original(method, params);
  };
  await expect(analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).rejects.toThrow('Recovery connection failed');
  expect(f.calls.some(call => call.method === 'turn/start')).toBe(false);
  expect(f.calls.some(call => call.method === 'peer/purge')).toBe(false);
  expect(f.http).toContain(`/jobs/${id}/pause`);
});

it('accepts current Octos untyped messages only in a single-use analysis session', async () => {
  const good = fixture({ untyped: true });
  expect((await analyzeTopics(identity, '', { fetcher: good.fetcher, createBridge: () => good.connection })).completed).toBe(1);
  const mixed = fixture({ untyped: true, extraTurn: true });
  await expect(analyzeTopics(identity, '', { fetcher: mixed.fetcher, createBridge: () => mixed.connection })).rejects.toThrow('保留未知');
  expect(mixed.http).not.toContain(`/jobs/${id}/result`);
});

it('retains the control and execution after a lost receipt; malformed output is blocked and purged', async () => {
  const lost = fixture({ lostReceipt: true });
  await expect(analyzeTopics(identity, '', { fetcher: lost.fetcher, createBridge: () => lost.connection })).rejects.toThrow('Saved receipt lost');
  expect(lost.http).toContain(`/jobs/${id}/pause`);
  expect(lost.calls.some(call => call.method === 'peer/purge')).toBe(false);
  const invalid = fixture({ invalid: true });
  await expect(analyzeTopics(identity, '', { fetcher: invalid.fetcher, createBridge: () => invalid.connection })).rejects.toThrow('保留未知');
  expect(invalid.http).toContain(`/jobs/${id}/reject`);
  expect(invalid.rejections).toEqual(['unparseable-analysis-result']);
  expect(invalid.calls.filter(call => call.method === 'peer/purge')).toHaveLength(1);
});

it.each(['```json\n', '```\n', '```JSON\r\n'])('accepts one whole JSON code block without another model turn (%j)', async prefix => {
  const f = fixture(), original = f.connection.callMethod;
  f.connection.callMethod = async (method, params) => {
    const result = await original(method, params);
    if (method === 'session/hydrate') {
      const page = result as { messages: { content: string }[] };
      page.messages[0].content = '  ' + prefix + JSON.stringify(f.result) + '\n```  ';
    }
    return result;
  };
  expect((await analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection })).completed).toBe(1);
  expect(f.calls.filter(call => call.method === 'turn/start')).toHaveLength(1);
  expect(f.http).not.toContain(`/jobs/${id}/reject`);
});

it('interrupts the captured analysis when teaching starts and preserves its bookmark for reconciliation', async () => {
  const f = fixture(); const original = f.connection.callMethod;
  f.connection.callMethod = async (method, params) => {
    const result = await original(method, params); if (method === 'turn/start') f.setBusy(); return result;
  };
  await expect(analyzeTopics(identity, '', { fetcher: f.fetcher, createBridge: () => f.connection, canContinue: f.canContinue })).rejects.toThrow('课堂开始');
  expect(f.calls.filter(call => call.method === 'turn/start')).toHaveLength(1);
  expect(f.calls.filter(call => call.method === 'turn/interrupt')).toHaveLength(1);
  expect(f.http).not.toContain(`/jobs/${id}/result`);
});

it('keeps the service reason when it rejects a reply', async () => {
  const f = fixture();
  const fetcher = async (url: string | URL | Request, options?: RequestInit) => String(url).endsWith('/result')
    ? Response.json({ error: 'Analysis evidence or catalog reference is invalid' }, { status: 400 }) : f.fetcher(url, options);
  const bodies: unknown[] = [];
  await expect(analyzeTopics(identity, '', { fetcher: async (url, options) => {
    if (String(url).endsWith('/reject')) bodies.push(JSON.parse(String(options?.body)));
    return fetcher(url, options);
  }, createBridge: () => f.connection })).rejects.toThrow();
  expect(bodies).toEqual([{ lease_id: expect.any(String), reason: 'invalid-analysis-result', detail: 'Analysis evidence or catalog reference is invalid' }]);
});
