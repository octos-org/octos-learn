import { finishSessionDeletions } from "./delete-session-copies";
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getToken } from '../../api/client';
import { API_BASE } from '../../lib/constants';
import { DeviceHistoryQueue } from './device-queue';
import { LearningHistoryRecorder } from './recorder';
import { HistorySynchronizer, resolveHistoryIdentity, type HistoryIdentity } from './synchronize';
import { deliverHistoryMessages } from './deliver-messages';

export interface LearningHistoryStatus { saving: number; pending: number; syncing: boolean; error: string; conversationPending: number; checked: boolean; cleanupPending: number }
const EMPTY: LearningHistoryStatus = { saving: 0, pending: 0, syncing: false, error: '', conversationPending: 0, checked: false, cleanupPending: 0 };
const noSubscribe = () => () => undefined;
const emptySnapshot = () => EMPTY;

export class LearningHistoryCoordinator {
  private readonly token: string;
  private readonly queue = new DeviceHistoryQueue();
  private readonly synchronizer = new HistorySynchronizer(this.queue, API_BASE);
  private identity?: Promise<HistoryIdentity>;
  private recorders = new Map<string, LearningHistoryRecorder>();
  private listeners = new Set<() => void>();
  private status = EMPTY;
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private busy = new Set<string>();
  constructor(token: string) { this.token = token; }
  private current = () => getToken() === this.token;
  private getIdentity = (): Promise<HistoryIdentity> => {
    if (!this.identity) {
      this.identity = resolveHistoryIdentity(API_BASE, this.token, this.queue).catch(error => { this.identity = undefined; throw error; });
    }
    return this.identity;
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.status;
  private update(patch: Partial<LearningHistoryStatus> = {}) {
    const local = [...this.recorders.values()].map(recorder => recorder.getSnapshot());
    this.status = { ...this.status, ...patch, saving: local.reduce((sum, item) => sum + item.pendingWrites, 0) };
    this.listeners.forEach(listener => listener());
  }
  recorder(sessionId: string): LearningHistoryRecorder {
    let recorder = this.recorders.get(sessionId);
    if (!recorder) {
      recorder = new LearningHistoryRecorder(sessionId, this.getIdentity, this.queue, () => this.schedule());
      recorder.subscribe(() => this.update());
      this.recorders.set(sessionId, recorder);
    }
    return recorder;
  }
  setClassroomBusy(sessionId: string, busy: boolean) {
    const wasBusy = this.busy.has(sessionId);
    if (busy) this.busy.add(sessionId); else this.busy.delete(sessionId);
    if (wasBusy && !busy) this.schedule();
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.synchronize(); }, 1000);
  }
  synchronize = (): Promise<void> => {
    if (!this.current()) return Promise.resolve();
    if (this.active) return this.active;
    this.active = this.run().finally(() => { this.active = undefined; });
    return this.active;
  };
  private async run() {
    this.update({ syncing: true, error: '' });
    try {
      await Promise.all([...this.recorders.values()].map(recorder => recorder.flush()));
      const identity = await this.getIdentity();
      if (!this.current()) return;
      this.update({ pending: (await this.queue.list(identity.owner)).length });
      await this.synchronizer.synchronize(identity);
      const remaining = await this.queue.list(identity.owner);
      this.update({ pending: remaining.length, error: remaining.some(row => row.state === 'conflict') ? '有学习记录内容冲突，原记录已保留，等待核对。' : '' });
      const headers = { Authorization: `Bearer ${this.token}`, 'X-Learning-Owner': identity.owner };
      const pending = await fetch(`${API_BASE}/api/learn/history/deliveries`, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!pending.ok) throw new Error('问答交付状态暂不可用');
      const payload = await pending.json() as { profile_id: string; states: { state: string; count: number }[]; pending_session_deletions: number };
      if (payload.profile_id !== identity.owner || !Array.isArray(payload.states)) throw new Error('无法确认问答交付账号');
      const cleanup = Number(payload.pending_session_deletions) || 0;
      this.update({ cleanupPending: cleanup });
      if (cleanup && this.current() && !this.busy.size) {
        const accepted = await finishSessionDeletions(identity, API_BASE, { isCurrent: this.current });
        this.update({ cleanupPending: Math.max(0, cleanup - accepted) });
      }
      let conversations = payload.states.filter(row => ['pending', 'leased'].includes(row.state)).reduce((sum, row) => sum + row.count, 0);
      this.update({ conversationPending: conversations, checked: true });
      if (conversations && this.current() && !this.busy.size) {
        const result = await deliverHistoryMessages(identity, API_BASE, { isCurrent: this.current });
        conversations = Math.max(0, conversations - result.delivered);
        this.update({ conversationPending: conversations, checked: true });
      }
    } catch {
      this.update({ error: '学习记录尚未全部同步，已保存的本机副本会保留，请稍后重试。' });
    } finally { this.update({ syncing: false }); }
  }
  markDeletionQueued() { this.update({ cleanupPending: Math.max(1, this.status.cleanupPending) }); }
  retry = async () => {
    await Promise.all([...this.recorders.values()].map(recorder => recorder.retry().catch(() => undefined)));
    await this.synchronize();
  };
}

// Keep unsaved transactions reachable across route changes. This cache is in
// memory only; authenticated credentials never enter IndexedDB or SQLite.
const coordinators = new Map<string, LearningHistoryCoordinator>();
export function useLearningHistoryRecorder(sessionId: string, enabled = true) {
  const [token, setToken] = useState(getToken);
  useEffect(() => {
    const changed = () => setToken(getToken());
    for (const name of ['octos:identity-changed', 'crew:token_cleared', 'storage']) window.addEventListener(name, changed);
    return () => { for (const name of ['octos:identity-changed', 'crew:token_cleared', 'storage']) window.removeEventListener(name, changed); };
  }, []);
  const coordinator = useMemo(() => {
    if (!enabled || !token) return undefined;
    let value = coordinators.get(token);
    if (!value) { value = new LearningHistoryCoordinator(token); coordinators.set(token, value); }
    return value;
  }, [enabled, token]);
  const recorder = useMemo(() => coordinator?.recorder(sessionId), [coordinator, sessionId]);
  const status = useSyncExternalStore(coordinator?.subscribe ?? noSubscribe, coordinator?.getSnapshot ?? emptySnapshot);
  const localStatus = useSyncExternalStore(recorder?.subscribe ?? noSubscribe, recorder?.getSnapshot ?? (() => LOCAL_EMPTY));
  useEffect(() => {
    if (!coordinator) return;
    void coordinator.synchronize();
    const online = () => { void coordinator.retry(); };
    const deletion = () => { coordinator.markDeletionQueued(); online(); };
    window.addEventListener('online', online);
    window.addEventListener('octos:history-sync-needed', deletion);
    return () => { window.removeEventListener('online', online); window.removeEventListener('octos:history-sync-needed', deletion); };
  }, [coordinator]);
  return { recorder, coordinator, status, localStatus };
}
const LOCAL_EMPTY = { pendingWrites: 0, error: '' };
