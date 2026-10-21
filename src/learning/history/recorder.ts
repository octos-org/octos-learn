import { historyId } from "./identifiers";
import type { HistoryCourse, HistoryEvent, HistoryKind } from '../../../services/learning-history/event-contract.mjs';
import { DeviceHistoryQueue, type HistoryDocumentWrite } from './device-queue';
import type { HistoryIdentity } from './synchronize';

export interface HistoryDraft {
  kind: HistoryKind; runKey: string; questionId?: string; course?: HistoryCourse; logKey?: string;
  data: HistoryEvent['data']; id?: string; stableKey?: string; occurredAt?: string;
}
export interface RecorderStatus { pendingWrites: number; error: string }
interface Write { drafts: HistoryDraft[]; documents: HistoryDocumentWrite[] }

/** One ordered write queue per classroom. A failed transaction holds later
 * snapshots behind it, preventing a newer checkpoint from hiding lost facts.
 * It never waits on network/model work in the playback or question call stack.
 */
export class LearningHistoryRecorder {
  readonly sessionId: string;
  private readonly identity: () => Promise<HistoryIdentity>;
  private readonly queue: DeviceHistoryQueue;
  private readonly committed: (identity: HistoryIdentity) => void;
  private jobs: Write[] = [];
  private stagedDocuments = new Map<string, unknown>();
  private stagedDrafts: HistoryDraft[] = [];
  private scheduled = false;
  private running?: Promise<void>;
  private listeners = new Set<() => void>();
  private status: RecorderStatus = { pendingWrites: 0, error: '' };
  constructor(sessionId: string, identity: Promise<HistoryIdentity> | (() => Promise<HistoryIdentity>), queue: DeviceHistoryQueue, committed: (identity: HistoryIdentity) => void = () => undefined) {
    this.sessionId = sessionId; this.identity = typeof identity === "function" ? identity : () => identity; this.queue = queue; this.committed = committed;
    // Authentication can fail before the first question. Keep that rejection
    // attached until a real write needs to surface it.
    if (typeof identity !== "function") void identity.catch(() => undefined);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.status;
  private notify(error = this.status.error) {
    this.status = { pendingWrites: this.jobs.length + (this.scheduled ? 1 : 0), error };
    this.listeners.forEach(listener => listener());
  }
  stage(document?: HistoryDocumentWrite, drafts: HistoryDraft[] = []) {
    if (document) this.stagedDocuments.set(document.key, structuredClone(document.value));
    this.stagedDrafts.push(...structuredClone(drafts).map(draft => ({ ...draft, occurredAt: draft.occurredAt ?? new Date().toISOString(), id: draft.id ?? (draft.stableKey ? undefined : crypto.randomUUID()) })));
    if (this.scheduled) return;
    this.scheduled = true; this.notify();
    queueMicrotask(() => {
      this.scheduled = false;
      this.jobs.push({ drafts: this.stagedDrafts, documents: [...this.stagedDocuments].map(([key, value]) => ({ key, value })) });
      this.stagedDrafts = []; this.stagedDocuments.clear(); this.notify();
      if (!this.status.error) void this.pump();
    });
  }
  private pump(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.write().finally(() => {
      this.running = undefined;
      if (this.jobs.length && !this.status.error) queueMicrotask(() => { void this.pump(); });
    });
    return this.running;
  }
  private async write() {
    try {
      const identity = await this.identity();
      const device = await this.queue.remember(identity.owner, 'device', crypto.randomUUID());
      while (this.jobs.length) {
        const job = this.jobs[0];
        const events: HistoryEvent[] = [];
        for (const draft of job.drafts) {
          const id = draft.id ?? await historyId([this.sessionId, draft.stableKey]);
          const time = await this.queue.remember(identity.owner, `event-time:${id}`, draft.occurredAt!);
          const event: HistoryEvent = {
            version: 1, id, kind: draft.kind, occurred_at: time, device_id: device,
            session_id: this.sessionId, run_id: await historyId([identity.owner, this.sessionId, draft.runKey]),
            ...(draft.questionId ? { question_id: draft.questionId } : {}),
            ...(draft.course ? { course: draft.course } : {}),
            ...(draft.logKey ? { log_id: await this.queue.remember(identity.owner, `log:${draft.logKey}`, crypto.randomUUID()) } : {}),
            data: { ...draft.data, ...(draft.kind === 'answer_delivered' ? { part_id: id } : {}) },
          };
          events.push(event);
        }
        await this.queue.commit(identity.owner, events, job.documents);
        this.jobs.shift(); this.notify('');
        try { this.committed(identity); } catch { /* network scheduling cannot undo a local commit */ }
      }
    } catch { this.notify('最新课堂记录尚未保存在本机，请重试保存，暂勿关闭页面。'); }
  }
  async flush() {
    await Promise.resolve();
    do { await this.pump(); } while (this.jobs.length && !this.status.error);
    if (this.jobs.length) throw new Error(this.status.error || '课堂记录尚未保存');
  }
  async retry() { this.notify(''); await this.flush(); }
  record(draft: HistoryDraft) { this.stage(undefined, [draft]); }
}
