import { historyRequestTimeout } from './request-timeout';
import { getToken } from '../../api/client';
import { API_BASE } from '../../lib/constants';
import { DeviceHistoryQueue } from './device-queue';
import { resolveHistoryIdentity, type HistoryIdentity } from './synchronize';
import { announceNewAwards } from '../academy/award-events';
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
export type MapState = 'explored' | 'practising' | 'did-it';
export interface LearningMapTopic {
  topic_id: string; subject: string; domain: string; name: string; state: MapState;
  evidence: { played_beats: number; runs: number; task_attempts: number; unassisted_successes: number; assisted_successes: number; days: string[]; first_at: string | null; last_at: string | null };
}
export interface LearningMap { rules_version: string; through: number; taxonomy: { commit: string }; topics: LearningMapTopic[] }
export interface EarnedAchievement {
  /** An id from the shared achievement catalog. `scope` is a topic for topic-scoped ones, a year for seasonal ones, otherwise empty. */
  achievement_id: string; scope: string; topic_name: string | null;
  teacher_id: string | null; earned_at: string; awarded_at: string; evidence_event_id: string; new: boolean;
}
export interface AchievementProgress { achievement_id: string; current: number; target: number }
export interface LearnerTitle { id: string; name: string }
export interface AchievementList { rules_version: string; achievements: EarnedAchievement[]; progress?: AchievementProgress[]; title?: LearnerTitle }
/** `quota_used` counts analyses started today (UTC day) against `max_daily_tasks`. */
export interface AnalysisStatus { enabled: boolean; max_daily_tasks: number; quota_used: number; analysis_through: number; states: { state: string; count: number }[] }
export interface NextStep {
  id: string; type: 'continue' | 'foundation' | 'next' | 'revisit';
  topic: { topic_id: string; name: string; subject: string; domain: string; state: MapState; last_at: string };
  target?: { topic_id: string; name: string; subject: string; domain: string; strength: 'hard'; reason: string };
  days_away?: number; resume: { session_id: string; run_id: string };
}
export interface WeeklyReportTopic {
  topic_id: string; subject: string; domain: string; name: string; state_before: MapState | null; state_after: MapState;
  change: { evidence_event_id: string; occurred_at: string; kind: 'beat_completed' | 'task_attempt' } | null;
  played_beats: number; task_attempts: number;
}
export interface WeeklyReport {
  rules_version: string; through: number; week_start: string; first_week: string | null; report_sha256: string;
  activity: { days: string[]; runs: number; played_beats: number; task_attempts: number; unassisted_successes: number; questions: number };
  topics: WeeklyReportTopic[];
  achievements: Pick<EarnedAchievement, 'achievement_id' | 'scope' | 'topic_name' | 'teacher_id' | 'earned_at'>[];
  /** A checked model comment for these exact facts by comment_teacher_id, if any. */
  comment: string | null; comment_teacher_id: string;
}
/** Minutes east of UTC, so "different days" follow the learner's calendar. */
export const localUtcOffsetMinutes = () => -new Date().getTimezoneOffset();
export interface AccountTeacherChoice { teacher_id: string; revision: number; updated_at: string }
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
  learningMap() { return this.request<LearningMap>(`/map?utc_offset_minutes=${localUtcOffsetMinutes()}`); }
  /** Reading achievements also records any newly earned ones; those are
   * announced so the ceremony plays wherever the read happened. */
  async achievements() {
    const list = await this.request<AchievementList>(`/achievements?utc_offset_minutes=${localUtcOffsetMinutes()}`);
    announceNewAwards(list.achievements);
    return list;
  }
  setTitle(titleId: string) { return this.request<{ title: LearnerTitle }>('/title', 'PUT', { title_id: titleId }); }
  suggestions() { return this.request<{ rules_version: string; suggestions: NextStep[] }>(`/suggestions?utc_offset_minutes=${localUtcOffsetMinutes()}`); }
  dismissSuggestion(id: string) { return this.request<{ dismissed: boolean }>('/suggestions/dismiss', 'POST', { id }); }
  reportComments() { return this.request<{ enabled: boolean }>('/report-comments'); }
  setReportComments(enabled: boolean) { return this.request<{ enabled: boolean }>('/report-comments/settings', 'POST', { enabled }); }
  weeklyReport(weekStart: string) {
    return this.request<WeeklyReport>(`/report?${new URLSearchParams({ week_start: weekStart, utc_offset_minutes: String(localUtcOffsetMinutes()) })}`);
  }
  teacherChoice() { return this.request<{ choice: AccountTeacherChoice | null }>('/teacher-choice'); }
  chooseTeacher(teacherId: string, baseRevision?: number) {
    return this.request<{ status: 'saved' | 'conflict'; choice: AccountTeacherChoice | null }>('/teacher-choice', 'PUT',
      baseRevision === undefined ? { teacher_id: teacherId } : { teacher_id: teacherId, base_revision: baseRevision });
  }
  analysisStatus() { return this.request<AnalysisStatus>('/analysis'); }
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
