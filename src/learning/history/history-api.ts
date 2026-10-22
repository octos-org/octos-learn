import { historyRequestTimeout } from './request-timeout';
import { getToken } from '../../api/client';
import { API_BASE } from '../../lib/constants';
import { DeviceHistoryQueue } from './device-queue';
import { resolveHistoryIdentity, type HistoryIdentity } from './synchronize';
import type { HistoryCourse, HistoryEvent } from '../../../services/learning-history/event-contract.mjs';

export interface LearningRunSummary {
  run_id: string; session_id: string; updated_seq: number; question_preview: string | null; first_occurred_at: string;
  course: HistoryCourse | null; question_count: number; completed_beats: number; task_attempts: number; start_recorded: boolean;
}
export interface HistoryEventsPage { events: { seq: number; event: HistoryEvent }[]; through: number; next_after: number | null }
export interface HistoryRunsPage { runs: LearningRunSummary[]; through: number; next_before: number | null }
export interface ObjectiveCounts { played_runs: number; played_beats: number; task_attempts: number; hints: number }
export interface HistoryCoverage {
  status: 'approved' | 'pending-review' | 'unmapped'; through: number; mapping_id?: string;
  course_playback: { required_beats: number; played_beats: number; complete: boolean } | null;
  objectives: { topic_id: string; objective_key: string; title: string; counts: ObjectiveCounts | null }[];
  generated_playback?: { rule: string; status: 'available' | 'unknown'; reason?: string; source_event_id?: string; delivery_sha256?: string;
    evidence?: { event_id: string; step_id: string; beat_id: string; delivery_sha256: string }[] };
  automatic_topics?: { topic_id: string; title: string }[];
}
export interface HistoryTopicPage extends HistoryEventsPage {
  topic_id: string; status: string; counting_rule: string;
  objectives: { mapping_id: string; objective_key: string; title: string; counts: (ObjectiveCounts & { question_count: number | null }) | null }[];
  automatic?: { status: string; analysis_through: number; counts: { question_count: number | null; played_runs: number | null; played_beats: number | null; task_attempts?: number | null; task_successes?: number | null; task_hints?: number | null };
    coverage: { unprocessed_questions: number; unknown_questions: number; outside_catalog_questions?: number; unassociated_played_beats: number; unassociated_task_attempts?: number; unassociated_task_hints?: number }; events: { seq: number; event: HistoryEvent; associations: { result_seq: number; unit_id: string; quote: string }[] }[]; next_after: number | null };
}
export class HistoryApi {
  private readonly identity: HistoryIdentity;
  private readonly fetcher: typeof fetch;
  private readonly currentToken: () => string | null;
  constructor(identity: HistoryIdentity, fetcher: typeof fetch = fetch, currentToken: () => string | null = getToken) {
    this.identity = identity; this.fetcher = (input, init) => fetcher(input, init); this.currentToken = currentToken;
  }
  get owner() { return this.identity.owner; }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (this.currentToken() !== this.identity.token) throw new Error('账号已切换，请重新打开学习记录');
    const response = await this.fetcher(`${API_BASE}/api/learn/history${path}`, {
      method, headers: { Authorization: `Bearer ${this.identity.token}`, 'X-Learning-Owner': this.identity.owner, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', signal: historyRequestTimeout(10000),
    });
    if (this.currentToken() !== this.identity.token) throw new Error('账号已切换，请重新打开学习记录');
    if (response.status === 409) throw new Error('记录已发生删除或账号变化，请刷新后重新查看');
    if (!response.ok) throw new Error('暂时无法读取学习记录，请稍后重试');
    const data = await response.json() as T;
    if (this.currentToken() !== this.identity.token) throw new Error("账号已切换，请重新打开学习记录");
    return data;
  }
  runs(before?: number, through?: number) {
    const query = new URLSearchParams({ limit: '20' });
    if (before !== undefined) query.set('before', String(before));
    if (through !== undefined) query.set('through', String(through));
    return this.request<HistoryRunsPage>(`/runs?${query}`);
  }
  events(runId: string, after = 0, through?: number) {
    const query = new URLSearchParams({ limit: '50', after: String(after) });
    if (through !== undefined) query.set('through', String(through));
    return this.request<HistoryEventsPage>(`/runs/${encodeURIComponent(runId)}?${query}`);
  }
  coverage(runId: string, through: number) {
    return this.request<HistoryCoverage>(`/runs/${encodeURIComponent(runId)}/coverage?through=${through}`);
  }
  topic(topicId: string, through: number, after = 0, analysisThrough?: number) {
    return this.request<HistoryTopicPage>(`/topics/${encodeURIComponent(topicId)}?through=${through}&after=${after}&limit=50${analysisThrough === undefined ? '' : `&analysis_through=${analysisThrough}`}`);
  }
  analysisStatus() { return this.request<{ enabled: boolean; max_daily_tasks: number; states: { state: string; count: number }[] }>('/analysis'); }
  async configureAnalysis(enabled: boolean, maxDailyTasks: number) {
    await this.request('/analysis/settings', 'POST', { enabled, max_daily_tasks: maxDailyTasks });
    window.dispatchEvent(new Event('octos:analysis-sync-needed'));
  }
  async deleteSession(sessionId: string, deleteOctos = true) {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}`, 'DELETE', { delete_octos_session: deleteOctos });
    const queue = new DeviceHistoryQueue();
    await queue.applyDeletions(this.identity.owner, [], await queue.changeCursor(this.identity.owner), [sessionId]);
    window.dispatchEvent(new Event('octos:history-sync-needed'));
  }
  async deleteRun(runId: string) {
    await this.request(`/runs/${encodeURIComponent(runId)}`, 'DELETE');
    const queue = new DeviceHistoryQueue();
    await queue.applyDeletions(this.identity.owner, [runId], await queue.changeCursor(this.identity.owner));
    window.dispatchEvent(new Event('octos:analysis-sync-needed'));
  }
}
export async function openHistoryApi(token: string): Promise<HistoryApi> {
  return new HistoryApi(await resolveHistoryIdentity(API_BASE, token, new DeviceHistoryQueue()));
}


/** Queue the requested whiteboard cleanup durably before removing its card. */
export async function queueWhiteboardDeletion(sessionId: string): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const api = await openHistoryApi(token);
  await api.deleteSession(sessionId, true);
  return true;
}
