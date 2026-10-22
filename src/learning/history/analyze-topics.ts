import { ANALYSIS_INSTRUCTIONS, buildTopicAnalysisPrompt } from '../../../services/learning-history/topic-analysis-instructions.mjs';
import { createRequestId } from '../../lib/request-id';
import { createUiProtocolBridge, getUiProtocolFeatures, type UiProtocolBridge, type PeerToolCall } from '../../runtime/ui-protocol-bridge';
import { historySha256 } from './identifiers';
import { historyRequestTimeout } from './request-timeout';
import type { HistoryIdentity } from './synchronize';

interface AnalysisInput { input_sha256: string; units: { unit_id: string }[] }
interface Task { id: string; lease_id: string; input: AnalysisInput; execution: { session_id: string; turn_id: string } | null }
interface Control { host: string; peer: string; session: string; token: string; namespace: string; turn: string }
interface Status { profile_id: string; enabled: boolean; states: { state: string; count: number }[] }
interface Hydration { messages?: { role: string; content: string; turn_id?: string }[]; turns?: { turn_id: string; state: string }[] }
export interface TopicAnalysisProgress { pending: number; completed: number; enabled: boolean }
export const createTopicAnalysisBridge = (identity: HistoryIdentity, origin?: string) => createUiProtocolBridge({ origin,
  getToken: () => identity.token, getProfileId: () => identity.owner,
  features: [...getUiProtocolFeatures(), 'session.workspace_cwd.v1'] });
const analysisWorkspace = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) throw new Error('Octos 未返回有效分析工作目录');
  return value;
};
class AnalysisHttpError extends Error {
  readonly status: number;
  constructor(status: number) { super('知识点分析暂不可用，原始学习记录已保留'); this.status = status; }
}
const safeControl = (value: unknown): value is Control => {
  if (!value || typeof value !== 'object') return false;
  const c = value as Control;
  return /^learn-topic-[a-f0-9]{32}$/.test(c.host) && /^[a-z0-9-]{1,64}$/.test(c.peer)
    && c.session === `${c.host}#peer-${c.peer}` && typeof c.token === 'string' && c.token.length > 0
    && typeof c.namespace === 'string' && c.namespace.startsWith('app/learning-topics/') && /^[a-f0-9-]{36}$/.test(c.turn);
};

/** One bounded maintenance task. Octos owns the model and tool loop; this
 * adapter only transports catalog records and validated source/result data.
 * Peer-control capabilities remain in app-host private files scoped by the
 * verified Octos profile, through the authenticated adapter, not in browser storage,
 * facts, course content, SQLite, result requests or logs. This is an app-host
 * capability, not a supplier API key. Another device of the same account can
 * reconcile/purge work after a lost reply; no replacement turn is started.
 */
export async function analyzeTopics(identity: HistoryIdentity, base: string, {
  fetcher = fetch,
  createBridge = () => createTopicAnalysisBridge(identity),
  isCurrent = () => true, canContinue = () => true,
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  now = Date.now,
}: { fetcher?: typeof fetch; createBridge?: () => UiProtocolBridge; isCurrent?: () => boolean; canContinue?: () => boolean;
  sleep?: (ms: number) => Promise<void>; now?: () => number } = {}): Promise<TopicAnalysisProgress> {
  const headers = { Authorization: `Bearer ${identity.token}`, 'X-Learning-Owner': identity.owner, 'Content-Type': 'application/json' };
  const request = async <T,>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> => {
    if (!isCurrent()) throw new Error('账号已切换，知识点分析已停止');
    const response = await fetcher(`${base}/api/learn/history/analysis${path}`, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: historyRequestTimeout(10000) });
    if (!isCurrent()) throw new Error('账号已切换，知识点分析已停止');
    if (!response.ok) throw new AnalysisHttpError(response.status);
    const result = await response.json() as T & { profile_id?: string };
    if (result.profile_id !== identity.owner) throw new Error('知识点分析账号不符');
    return result;
  };
  const controls = (await request<{ controls: { id: string; control: Control }[] }>('/controls')).controls;
  if (!Array.isArray(controls) || controls.some(row => !/^[a-f0-9]{64}$/.test(row.id) || !safeControl(row.control))) throw new Error('分析连接的授权记录需要核对');
  const controlFor = (id: string) => controls.find(row => row.id === id)?.control;
  // Resource RPCs identify the host explicitly. An auth-only connection avoids
  // implicitly reopening its persisted session without the required cwd. The
  // analysis peer is opened below with the workspace returned by prepare.
  const connect = async (control: Control, connection: UiProtocolBridge) => {
    await connection.start({ profileId: identity.owner });
    const prepared = await connection.callMethod<{ cwd: string }>('peer/prepare', { session_id: control.host, profile_id: identity.owner, names: [control.peer],
      brief: ANALYSIS_INSTRUCTIONS, memory_namespace: control.namespace, resume: true, host_token: control.token });
    return analysisWorkspace(prepared.cwd);
  };
  const purge = async (id: string, control: Control, connection?: UiProtocolBridge) => {
    const own = !connection; const bridge = connection ?? createBridge();
    try {
      if (own) await bridge.start({ profileId: identity.owner });
      const result = await bridge.callMethod<{ purged?: boolean; already_purged?: boolean; partial?: boolean; errors?: unknown[]; residual_errors?: unknown[] }>('peer/purge', {
        session_id: control.host, profile_id: identity.owner, peer: control.peer, host_token: control.token,
      });
      if ((!result.purged && !result.already_purged) || result.partial || result.errors?.length || result.residual_errors?.length) throw new Error('分析临时资料尚未清理完成');
      await request(`/controls/${id}`, undefined, 'DELETE');
    } finally { if (own) await bridge.stop(); }
  };
  // Clean completed/deleted work even when the user disabled future analysis.
  // A crash or lost result receipt must not leave an untracked namespace.
  for (const { id, control } of controls) {
    if (!canContinue()) break;
    let state: string;
    try { state = (await request<{ job: { state: string } }>(`/jobs/${id}`)).job.state; }
    catch (error) { if (error instanceof AnalysisHttpError && error.status === 404) state = 'deleted'; else throw error; }
    if (['deleted', 'complete', 'blocked'].includes(state)) await purge(id, control);
  }
  const status = await request<Status>('');
  const pendingCount = (value: Status) => value.enabled ? value.states.filter(row => ['pending', 'leased', 'uncertain'].includes(row.state)).reduce((n, row) => n + row.count, 0) : 0;
  if (!status.enabled || !canContinue()) return { pending: pendingCount(status), completed: 0, enabled: status.enabled };
  const claimed = await request<{ tasks: Task[] }>('/claim', {});
  if (!claimed.tasks.length) return { pending: pendingCount(status), completed: 0, enabled: true };
  const task = claimed.tasks[0], bridge = createBridge();
  // A persisted execution may already have incurred a model request. Recovery
  // failures before opening its session must never purge the only saved result.
  let control = controlFor(task.id), admitted = Boolean(task.execution), resultSaved = false, toolCalls = 0, unsubscribe = () => {};
  let workspace: string;
  let outcome: TopicAnalysisProgress | undefined;
  const rpc = <T,>(method: string, params: Record<string, unknown>) => bridge.callMethod<T>(method, { ...params, profile_id: identity.owner });
  const interrupt = async () => { if (control) await rpc('turn/interrupt', { session_id: control.session, turn_id: control.turn }); };
  const rejectResult = async () => {
    const receipt = await request<{ recorded: boolean }>(`/jobs/${task.id}/reject`, { lease_id: task.lease_id });
    if (!receipt.recorded) throw new Error('分析任务已重新领取，保留原执行等待核对');
    resultSaved = true;
  };
  const answerTool = async (event: PeerToolCall) => {
    if (!control || event.peer !== control.peer || event.session_id !== control.session || event.turn_id !== control.turn) return;
    let data: unknown, ok = false;
    try {
      if (!canContinue() || !isCurrent() || ++toolCalls > 8 || event.name !== 'learning_topics.search') throw new Error('Analysis tool limit or classroom state changed');
      const args = event.args as { query?: string; ids?: string[]; limit?: number };
      if (!args || Object.keys(args).some(key => !['query', 'ids', 'limit'].includes(key)) || (args.query === undefined) === (args.ids === undefined)) throw new Error('Invalid catalog request');
      if (args.query !== undefined && (typeof args.query !== 'string' || args.query.length > 256)) throw new Error('Invalid catalog query');
      if (args.ids !== undefined && (!Array.isArray(args.ids) || args.ids.length > 12 || args.ids.some(id => typeof id !== 'string' || !/^mt_[A-Za-z0-9_-]+$/.test(id)))) throw new Error('Invalid catalog identifiers');
      const query = new URLSearchParams({ limit: String(args.limit ?? 8) });
      if (args.ids) query.set('ids', args.ids.join(',')); else query.set('query', args.query!);
      data = await request(`/catalog?${query}`); ok = true;
    } catch {
      data = { error: 'Catalog lookup refused. Keep unsupported units unknown.' };
      if (!canContinue() || toolCalls > 8) await interrupt().catch(() => undefined);
    }
    await rpc('peer/tool/result', { session_id: control.host, peer: control.peer, host_token: control.token, call_id: event.call_id,
      ...(ok ? { ok: true, data } : { ok: false, error: 'Catalog lookup refused; keep unsupported units unknown.' }) });
  };
  try {
    if (task.execution) {
      // A lost admission/result reply never authorizes another model call.
      // Re-open only the recorded execution, using its local control token.
      if (!control || control.session !== task.execution.session_id || control.turn !== task.execution.turn_id) throw new Error('旧分析结果需要核对，不自动重复调用模型');
      workspace = await connect(control, bridge);
    } else {
      if (control) { await purge(task.id, control); control = undefined; }
      const host = `learn-topic-${(await historySha256(identity.owner)).slice(0, 32)}`, name = `topics-${createRequestId().replaceAll('-', '')}`;
      await bridge.start({ profileId: identity.owner });
      if (!canContinue()) throw new Error('课堂已开始，分析延后');
      const namespace = `app/learning-topics/${name}`;
      const prepared = await rpc<{ slug: string; topic: string; host_token: string; cwd: string }>('peer/prepare', { session_id: host, names: [name], brief: ANALYSIS_INSTRUCTIONS, memory_namespace: namespace });
      workspace = analysisWorkspace(prepared.cwd);
      control = { host, peer: prepared.slug, token: prepared.host_token, namespace, turn: createRequestId(),
        session: prepared.topic.startsWith(`${host}#`) ? prepared.topic : `${host}#${prepared.topic}` };
      if (!safeControl(control)) throw new Error('Octos 未返回有效分析连接');
      // Persist the host capability in account-scoped host storage before
      // recording/admitting execution. Never fall back to local-only storage.
      await request(`/controls/${task.id}`, { lease_id: task.lease_id, control });
      const recorded = await request<{ recorded: boolean }>(`/jobs/${task.id}/execution`, { lease_id: task.lease_id, execution: { session_id: control.session, turn_id: control.turn } });
      if (!recorded.recorded || !canContinue()) throw new Error('分析暂停或已达到本人的每日任务限制');
    }
    unsubscribe = bridge.onPeerToolCall(event => { void answerTool(event).catch(() => undefined); });
    await rpc('peer/tools/register', { session_id: control.host, peer: control.peer, host_token: control.token, generic_tools: [], max_result_bytes: 65536,
      tools: [{ name: 'learning_topics.search', description: 'Look up pinned math topic definitions using English concepts or exact topic IDs.', risk: 'read', background: true,
        input_schema: { type: 'object', properties: { query: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, limit: { type: 'integer' } }, additionalProperties: false } }] });
    await rpc('session/open', { session_id: control.session, cwd: workspace });
    if (!task.execution) {
      if (!canContinue()) throw new Error('课堂已开始，分析延后');
      // The execution bookmark is already durable. Treat a lost admission
      // response as potentially charged; never submit a replacement turn.
      admitted = true;
      await rpc('turn/start', { session_id: control.session, turn_id: control.turn, origin: { kind: 'app', label: 'Learning topic analysis' }, input: [{ kind: 'text', text: buildTopicAnalysisPrompt(task.input) }] });
    } else admitted = true;
    const started = now();
    for (let tick = 0; now() - started < 120000 && tick < 240; tick++) {
      if (!canContinue() || !isCurrent()) { await interrupt().catch(() => undefined); throw new Error('课堂开始或账号切换，分析已停止'); }
      const page = await rpc<Hydration>('session/hydrate', { session_id: control.session, include: ['messages', 'turns'] });
      const state = page.turns?.find(turn => turn.turn_id === control!.turn)?.state;
      if (state === 'completed') {
        // Current Octos hydrate persists messages without typed turn_id. Each
        // analysis peer is deliberately single-use: accept an untyped row only
        // when its entire turn list is exactly this one recorded execution.
        // The server additionally checks the frozen input hash and every unit.
        const singleTurn = page.turns?.length === 1 && page.turns[0].turn_id === control.turn;
        const message = page.messages?.filter(row => row.role === 'assistant'
          && (row.turn_id === control!.turn || (!row.turn_id && singleTurn))).at(-1);
        let candidate: unknown;
        try { candidate = JSON.parse(message?.content ?? ''); }
        catch { await rejectResult(); throw new Error('分析未返回有效结果，保留未知'); }
        try {
          const receipt = await request<{ recorded: boolean }>(`/jobs/${task.id}/result`, { lease_id: task.lease_id, result: candidate });
          if (!receipt.recorded) throw new Error('分析来源已删除或任务已重新领取');
          resultSaved = true;
        } catch (error) {
          if (error instanceof AnalysisHttpError && error.status === 400) await rejectResult();
          throw error;
        }
        const latest = await request<Status>('');
        outcome = { pending: pendingCount(latest), completed: 1, enabled: latest.enabled };
        return outcome;
      }
      if (['errored', 'interrupted'].includes(state ?? '')) { await rejectResult(); throw new Error('上次分析已结束但没有有效结果，保留未知，不自动重复调用模型'); }
      if (task.execution && (!state || state === 'unknown')) throw new Error('上次分析未完成，不自动重复调用模型');
      if (tick % 10 === 0) await request(`/jobs/${task.id}`); // Notice deletion on another device.
      await sleep(500);
    }
    await interrupt().catch(() => undefined); throw new Error('知识点分析超时，保留未知');
  } catch (error) {
    if (isCurrent() && !resultSaved) await request(`/jobs/${task.id}/pause`, { lease_id: task.lease_id }).catch(() => undefined);
    throw error;
  } finally {
    unsubscribe();
    if (control && (resultSaved || !admitted)) await purge(task.id, control, bridge).catch(() => { if (outcome) outcome.pending++; /* host control retained for retry */ });
    await bridge.stop();
  }
}
