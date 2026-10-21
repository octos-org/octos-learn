import { historyRequestTimeout } from './request-timeout';
import { historyId } from "./identifiers";
import { extractProfileIdFromPayload } from '../../api/client';
import { DeviceHistoryQueue, type HistoryReceipt } from './device-queue';
import type { HistoryEvent } from '../../../services/learning-history/event-contract.mjs';

export interface HistoryIdentity { owner: string; token: string }
/** Verify one captured credential. Never label queued data from selected_profile.
 * This object lives only in memory and must not be put in the device database.
 */
export async function verifyHistoryIdentity(base: string, token: string, fetcher: typeof fetch = fetch): Promise<HistoryIdentity> {
  const response = await fetcher(`${base}/api/my/profile`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: historyRequestTimeout(8000),
  });
  if (!response.ok) throw new Error('请登录后同步学习记录');
  const payload: unknown = await response.json();
  const direct = payload && typeof payload === 'object' && 'id' in payload ? payload.id : undefined;
  const owner = extractProfileIdFromPayload(payload) ?? (typeof direct === 'string' ? direct : null);
  if (!owner || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(owner)) throw new Error('无法确认学习记录所属账号');
  return { owner, token };
}

/** Cached ownership is for local offline attribution only. It never grants
 * server access; every upload still uses Octos authentication. No token is
 * persisted, and a different credential cannot adopt this binding.
 */
export async function resolveHistoryIdentity(base: string, token: string, queue: DeviceHistoryQueue, fetcher: typeof fetch = fetch): Promise<HistoryIdentity> {
  const key = await historyId(['verified-auth', token]);
  try {
    const identity = await verifyHistoryIdentity(base, token, fetcher);
    const bound = await queue.remember('verified-auth', key, identity.owner);
    if (bound !== identity.owner) throw new Error('账号归属已改变，旧记录保留等待核对');
    return identity;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && ['TimeoutError', 'AbortError', 'NetworkError'].includes(error.name))) {
      const owner = await queue.recall<string>('verified-auth', key);
      if (owner) return { owner, token };
    }
    throw error;
  }
}

function batch(events: HistoryEvent[]): HistoryEvent[] {
  const selected: HistoryEvent[] = [];
  let bytes = 32;
  for (const event of events) {
    const size = new TextEncoder().encode(JSON.stringify(event)).length + 1;
    if (selected.length === 100 || bytes + size > 768 * 1024) break;
    selected.push(event); bytes += size;
  }
  return selected;
}

export class HistorySynchronizer {
  private active = new Map<string, Promise<void>>();
  private readonly queue: DeviceHistoryQueue;
  private readonly base: string;
  private readonly fetcher: typeof fetch;
  constructor(queue: DeviceHistoryQueue, base: string, fetcher: typeof fetch = fetch) {
    this.queue = queue; this.base = base; this.fetcher = (input, init) => fetcher(input, init);
  }

  synchronize(identity: HistoryIdentity): Promise<void> {
    const active = this.active.get(identity.owner);
    if (active) return active;
    const work = this.run(identity).finally(() => { this.active.delete(identity.owner); });
    this.active.set(identity.owner, work);
    return work;
  }

  private async run(identity: HistoryIdentity): Promise<void> {
    const headers = { Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json', 'X-Learning-Owner': identity.owner };
    // Pull deletions before sending offline children. The server also rejects
    // deleted runs if another device deletes one after this read completes.
    let after = await this.queue.changeCursor(identity.owner);
    let through: number | undefined;
    for (;;) {
      const params = new URLSearchParams({ after: String(after), limit: '100' });
      if (through !== undefined) params.set('through', String(through));
      const response = await this.fetcher(`${this.base}/api/learn/history/changes?${params}`, { headers, redirect: 'error', signal: historyRequestTimeout(10000) });
      if (!response.ok) throw new Error('学习记录尚未同步，可稍后重试');
      const page = await response.json() as { changes: { seq: number; run_id?: string; session_id?: string; change_kind: string }[]; through: number; next_after: number | null };
      if (!Number.isSafeInteger(page.through) || page.through < after || !Array.isArray(page.changes)
        || page.changes.some((row, i) => !Number.isSafeInteger(row.seq) || row.seq <= (page.changes[i - 1]?.seq ?? after)
          || row.seq > page.through || !['event', 'deleted', 'session_deleted'].includes(row.change_kind)
          || (row.change_kind === 'session_deleted' ? typeof row.session_id !== 'string' : typeof row.run_id !== 'string'))
        || (page.next_after !== null && (!Number.isSafeInteger(page.next_after) || page.next_after <= after
          || page.next_after !== page.changes.at(-1)?.seq))) throw new Error('学习记录同步结果无效');
      if (through !== undefined && through !== page.through) throw new Error('学习记录同步范围发生变化');
      through = page.through;
      const cursor = page.next_after ?? through;
      await this.queue.applyDeletions(identity.owner, page.changes.filter(row => row.change_kind === 'deleted').map(row => row.run_id!), cursor, page.changes.filter(row => row.change_kind === 'session_deleted').map(row => row.session_id!));
      if (page.next_after === null) break;
      after = cursor;
    }
    for (;;) {
      const sent = batch((await this.queue.list(identity.owner)).filter(row => row.state === 'pending').map(row => row.event));
      if (!sent.length) return;
      const response = await this.fetcher(`${this.base}/api/learn/history/events`, {
        method: 'POST', headers, body: JSON.stringify({ events: sent }), redirect: 'error', signal: historyRequestTimeout(15000),
      });
      if (!response.ok) throw new Error('学习记录尚未同步，本机副本已保留');
      const payload = await response.json() as { profile_id: string; results: HistoryReceipt[] };
      if (payload.profile_id !== identity.owner || !Array.isArray(payload.results)) throw new Error('同步回执所属账号不符，保留本机记录');
      await this.queue.acknowledge(identity.owner, sent, payload.results);
    }
  }
}
