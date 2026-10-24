import { parseTopicAnalysisResponse } from '../../../services/learning-history/topic-analysis-response.mjs';
import { REPORT_COMMENT_INSTRUCTIONS, buildReportCommentPrompt } from '../../../services/learning-history/report-comment-instructions.mjs';
import { createRequestId } from '../../lib/request-id';
import { createUiProtocolBridge, getUiProtocolFeatures, type UiProtocolBridge } from '../../runtime/ui-protocol-bridge';
import { getTeacher, isTeacherId, teacherProfile } from '../teachers/teachers';
import { localUtcOffsetMinutes } from './history-api';
import { historySha256 } from './identifiers';
import { historyRequestTimeout } from './request-timeout';
import type { HistoryIdentity } from './synchronize';

interface Task { id: string; lease_id: string; teacher_id: string; input: { input_sha256: string }; execution: { session_id: string; turn_id: string } | null }
interface Control { host: string; peer: string; session: string; token: string; namespace: string; turn: string }
interface Hydration { messages?: { role: string; content: string; turn_id?: string }[]; turns?: { turn_id: string; state: string }[] }

const safeControl = (value: unknown): value is Control => {
  if (!value || typeof value !== 'object') return false;
  const c = value as Control;
  return /^learn-report-[a-f0-9]{32}$/.test(c.host) && /^[a-z0-9-]{1,64}$/.test(c.peer)
    && c.session === `${c.host}#peer-${c.peer}` && typeof c.token === 'string' && c.token.length > 0
    && typeof c.namespace === 'string' && c.namespace.startsWith('app/learning-reports/') && /^[a-f0-9-]{36}$/.test(c.turn);
};
const workspaceOf = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) throw new Error('Octos 未返回有效周报工作目录');
  return value;
};
class CommentHttpError extends Error {
  readonly status: number;
  constructor(status: number) { super('老师评语暂不可用，周报照常显示'); this.status = status; }
}

/** One teacher comment on the last finished week, through a single-use Octos
 * peer with no tools, following the topic-analysis lifecycle: the host control
 * is stored before the execution is recorded, the execution is recorded before
 * the turn starts, and a started turn is reconciled but never repeated. The
 * service checks the comment against the report; until it is accepted the
 * report keeps the teacher's fixed lines. Returns whether a comment was saved. */
export async function commentWeeklyReport(identity: HistoryIdentity, base: string, {
  fetcher = fetch,
  createBridge = () => createUiProtocolBridge({ getToken: () => identity.token, getProfileId: () => identity.owner,
    features: [...getUiProtocolFeatures(), 'session.workspace_cwd.v1'] }),
  isCurrent = () => true, canContinue = () => true,
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  now = Date.now,
}: { fetcher?: typeof fetch; createBridge?: () => UiProtocolBridge; isCurrent?: () => boolean; canContinue?: () => boolean;
  sleep?: (ms: number) => Promise<void>; now?: () => number } = {}): Promise<boolean> {
  const headers = { Authorization: `Bearer ${identity.token}`, 'X-Learning-Owner': identity.owner, 'Content-Type': 'application/json' };
  const request = async <T,>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> => {
    if (!isCurrent()) throw new Error('账号已切换，老师评语已停止');
    const response = await fetcher(`${base}/api/learn/history/report-comments${path}`, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: historyRequestTimeout(10000) });
    if (!isCurrent()) throw new Error('账号已切换，老师评语已停止');
    if (!response.ok) throw new CommentHttpError(response.status);
    const result = await response.json() as T & { profile_id?: string };
    if (result.profile_id !== identity.owner) throw new Error('老师评语账号不符');
    return result;
  };
  const controls = (await request<{ controls: { id: string; control: Control }[] }>('/controls')).controls;
  if (!Array.isArray(controls) || controls.some(row => !/^[a-f0-9]{64}$/.test(row.id) || !safeControl(row.control))) throw new Error('周报连接的授权记录需要核对');
  const purge = async (id: string, control: Control, connection?: UiProtocolBridge) => {
    const own = !connection; const bridge = connection ?? createBridge();
    try {
      if (own) await bridge.start({ profileId: identity.owner });
      const result = await bridge.callMethod<{ purged?: boolean; already_purged?: boolean; partial?: boolean; errors?: unknown[]; residual_errors?: unknown[] }>('peer/purge', {
        session_id: control.host, profile_id: identity.owner, peer: control.peer, host_token: control.token,
      });
      if ((!result.purged && !result.already_purged) || result.partial || result.errors?.length || result.residual_errors?.length) throw new Error('周报临时资料尚未清理完成');
      await request(`/controls/${id}`, undefined, 'DELETE');
    } finally { if (own) await bridge.stop(); }
  };
  for (const { id, control } of controls) {
    if (!canContinue()) break;
    let state: string;
    try { state = (await request<{ job: { state: string } }>(`/jobs/${id}`)).job.state; }
    catch (error) { if (error instanceof CommentHttpError && error.status === 404) state = 'deleted'; else throw error; }
    if (['deleted', 'complete', 'blocked'].includes(state)) await purge(id, control);
  }
  if (!canContinue()) return false;
  const [task] = (await request<{ tasks: Task[] }>('/claim', { utc_offset_minutes: localUtcOffsetMinutes() })).tasks;
  if (!task || !isTeacherId(task.teacher_id)) return false;
  const bridge = createBridge();
  let control = controls.find(row => row.id === task.id)?.control, admitted = Boolean(task.execution), resultSaved = false;
  const rpc = <T,>(method: string, params: Record<string, unknown>) => bridge.callMethod<T>(method, { ...params, profile_id: identity.owner });
  const interrupt = async () => { if (control) await rpc('turn/interrupt', { session_id: control.session, turn_id: control.turn }); };
  const rejectResult = async () => {
    const receipt = await request<{ recorded: boolean }>(`/jobs/${task.id}/reject`, { lease_id: task.lease_id });
    if (!receipt.recorded) throw new Error('评语任务已重新领取，保留原执行等待核对');
    resultSaved = true;
  };
  try {
    await bridge.start({ profileId: identity.owner });
    let workspace: string;
    if (task.execution) {
      if (!control || control.session !== task.execution.session_id || control.turn !== task.execution.turn_id) throw new Error('旧评语需要核对，不自动重复调用模型');
      workspace = workspaceOf((await rpc<{ cwd: string }>('peer/prepare', { session_id: control.host, names: [control.peer],
        brief: REPORT_COMMENT_INSTRUCTIONS, memory_namespace: control.namespace, resume: true, host_token: control.token })).cwd);
    } else {
      if (control) { await purge(task.id, control, bridge); control = undefined; }
      const host = `learn-report-${(await historySha256(identity.owner)).slice(0, 32)}`, name = `report-${createRequestId().replaceAll('-', '')}`;
      if (!canContinue()) throw new Error('课堂已开始，评语延后');
      const namespace = `app/learning-reports/${name}`;
      const prepared = await rpc<{ slug: string; topic: string; host_token: string; cwd: string }>('peer/prepare', { session_id: host, names: [name], brief: REPORT_COMMENT_INSTRUCTIONS, memory_namespace: namespace });
      workspace = workspaceOf(prepared.cwd);
      control = { host, peer: prepared.slug, token: prepared.host_token, namespace, turn: createRequestId(),
        session: prepared.topic.startsWith(`${host}#`) ? prepared.topic : `${host}#${prepared.topic}` };
      if (!safeControl(control)) throw new Error('Octos 未返回有效周报连接');
      await request(`/controls/${task.id}`, { lease_id: task.lease_id, control });
      const recorded = await request<{ recorded: boolean }>(`/jobs/${task.id}/execution`, { lease_id: task.lease_id, execution: { session_id: control.session, turn_id: control.turn } });
      if (!recorded.recorded || !canContinue()) throw new Error('评语暂停或已达到每日上限');
    }
    await rpc('session/open', { session_id: control.session, cwd: workspace });
    if (!task.execution) {
      if (!canContinue()) throw new Error('课堂已开始，评语延后');
      admitted = true;
      await rpc('turn/start', { session_id: control.session, turn_id: control.turn, origin: { kind: 'app', label: 'Weekly report comment' },
        input: [{ kind: 'text', text: buildReportCommentPrompt(task.input, teacherProfile(getTeacher(task.teacher_id))) }] });
    }
    const started = now();
    for (let tick = 0; now() - started < 120000 && tick < 240; tick++) {
      if (!canContinue() || !isCurrent()) { await interrupt().catch(() => undefined); throw new Error('课堂开始或账号切换，评语已停止'); }
      const page = await rpc<Hydration>('session/hydrate', { session_id: control.session, include: ['messages', 'turns'] });
      const state = page.turns?.find(turn => turn.turn_id === control!.turn)?.state;
      if (state === 'completed') {
        // Single-use peer: accept an untyped row only when this is its only turn.
        const singleTurn = page.turns?.length === 1 && page.turns[0].turn_id === control.turn;
        const message = page.messages?.filter(row => row.role === 'assistant' && (row.turn_id === control!.turn || (!row.turn_id && singleTurn))).at(-1);
        let candidate: unknown;
        try { candidate = parseTopicAnalysisResponse(message?.content ?? ''); }
        catch { await rejectResult(); throw new Error('评语格式无效，保留固定台词'); }
        try {
          const receipt = await request<{ recorded: boolean }>(`/jobs/${task.id}/result`, { lease_id: task.lease_id, result: candidate });
          if (!receipt.recorded) throw new Error('周报已变化或任务已重新领取');
          resultSaved = true;
        } catch (error) {
          if (error instanceof CommentHttpError && error.status === 400) await rejectResult();
          throw error;
        }
        return true;
      }
      if (['errored', 'interrupted'].includes(state ?? '')) { await rejectResult(); throw new Error('评语请求已结束但没有结果，不自动重复调用模型'); }
      if (task.execution && (!state || state === 'unknown')) throw new Error('上次评语未完成，不自动重复调用模型');
      if (tick % 10 === 0) await request(`/jobs/${task.id}`);
      await sleep(500);
    }
    await interrupt().catch(() => undefined); throw new Error('老师评语超时，保留固定台词');
  } catch (error) {
    if (isCurrent() && !resultSaved) await request(`/jobs/${task.id}/pause`, { lease_id: task.lease_id }).catch(() => undefined);
    throw error;
  } finally {
    if (control && (resultSaved || !admitted)) await purge(task.id, control, bridge).catch(() => undefined);
    await bridge.stop();
  }
}
