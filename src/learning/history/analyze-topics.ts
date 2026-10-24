import { BridgeRpcError, createUiProtocolBridge, getUiProtocolFeatures, METHODS, type UiProtocolBridge } from '../../runtime/ui-protocol-bridge';
import { historySha256 } from './identifiers';
import { historyRequestTimeout } from './request-timeout';
import type { HistoryIdentity } from './synchronize';

interface AnalysisInput { input_sha256: string; units: { unit_id: string }[] }
interface Task { id: string; lease_id: string; input: AnalysisInput }
interface Control { host: string; peer: string; session: string; token: string; namespace: string; turn: string }
interface Status { profile_id: string; enabled: boolean; states: { state: string; count: number }[]; analysis_through: number }
/** `analysisThrough` is the latest saved result; when it grows, played
 * lessons have new topics and achievements may be due. */
export interface TopicAnalysisProgress { pending: number; dispatched: number; enabled: boolean; analysisThrough: number }
const TOPIC_ANALYSIS_ACTION = 'learning.topics.analyze';
// Each start counts against the learner's daily limit on the service.
const MAX_DISPATCHES_PER_SYNC = 3;
export const createTopicAnalysisBridge = (identity: HistoryIdentity, origin?: string) => createUiProtocolBridge({ origin,
  getToken: () => identity.token, getProfileId: () => identity.owner,
  features: [...getUiProtocolFeatures(), 'session.workspace_cwd.v1'] });
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

/** Starts pending analyses as Learning Coach background actions. Each runs
 * inside Octos and reports straight back to the history service with its
 * single-use capability, so closing this page does not stop it. This adapter
 * only claims jobs, asks the service for the capability and starts the action;
 * it never sees the model reply. It also cleans up peers left by the earlier
 * page-run analysis, whose host controls stay in app-host private files.
 */
export async function analyzeTopics(identity: HistoryIdentity, base: string, {
  fetcher = fetch,
  createBridge = () => createTopicAnalysisBridge(identity),
  isCurrent = () => true, canContinue = () => true,
}: { fetcher?: typeof fetch; createBridge?: () => UiProtocolBridge; isCurrent?: () => boolean; canContinue?: () => boolean } = {}): Promise<TopicAnalysisProgress> {
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
  const purge = async (id: string, control: Control) => {
    const bridge = createBridge();
    try {
      await bridge.start({ profileId: identity.owner });
      const result = await bridge.callMethod<{ purged?: boolean; already_purged?: boolean; partial?: boolean; errors?: unknown[]; residual_errors?: unknown[] }>('peer/purge', {
        session_id: control.host, profile_id: identity.owner, peer: control.peer, host_token: control.token,
      });
      if ((!result.purged && !result.already_purged) || result.partial || result.errors?.length || result.residual_errors?.length) throw new Error('分析临时资料尚未清理完成');
      await request(`/controls/${id}`, undefined, 'DELETE');
    } finally { await bridge.stop(); }
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
  if (!status.enabled || !canContinue()) return { pending: pendingCount(status), dispatched: 0, enabled: status.enabled, analysisThrough: status.analysis_through };
  let dispatched = 0;
  for (let round = 0; round < MAX_DISPATCHES_PER_SYNC && canContinue(); round++) {
    const [task] = (await request<{ tasks: Task[] }>('/claim', {})).tasks;
    if (!task) break;
    const admission = await request<{ recorded: boolean; capability?: string }>(`/jobs/${task.id}/dispatch`, { lease_id: task.lease_id });
    if (!admission.recorded || !admission.capability) break;
    const bridge = createBridge();
    try {
      await bridge.start({ profileId: identity.owner });
      const host = `learn-topic-${(await historySha256(identity.owner)).slice(0, 32)}`;
      const started = await bridge.callMethod<{ ok?: boolean; queued?: number }>(METHODS.SKILL_ACTION_INVOKE, { session_id: host, profile_id: identity.owner,
        action_id: TOPIC_ANALYSIS_ACTION, arguments: { job_id: task.id, capability: admission.capability, input: task.input } });
      if (!started.ok || !started.queued) throw new BridgeRpcError(0, 'Background analysis was not queued');
      dispatched++;
    } catch (error) {
      // Octos refused the action (for example an older Learning Coach), so no
      // model was called: return the job uncounted. A lost reply may mean it
      // is running; then the service's report window decides.
      if (error instanceof BridgeRpcError) await request(`/jobs/${task.id}/undispatch`, { lease_id: task.lease_id }).catch(() => undefined);
      throw error;
    } finally { await bridge.stop(); }
  }
  const latest = await request<Status>('');
  return { pending: pendingCount(latest), dispatched, enabled: latest.enabled, analysisThrough: latest.analysis_through };
}
