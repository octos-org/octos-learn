import { canonicalHistoryJson, validateHistoryEvent, type HistoryEvent } from '../../../services/learning-history/event-contract.mjs';
import { openLearningDatabase } from '../learning-document-store';

const EVENTS = 'history-events';
const META = 'history-meta';
const DOCUMENTS = 'documents';
export interface QueuedHistoryEvent { owner: string; event: HistoryEvent; state: 'pending' | 'conflict' }
export interface HistoryReceipt { id: string; status: 'accepted' | 'exists' | 'deleted' | 'conflict'; seq?: number }
export interface HistoryDocumentWrite { key: string; value: unknown }
const ownerId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function assertOwner(owner: string) { if (!ownerId.test(owner)) throw new Error('无法确定学习记录所属账号'); }
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('学习记录事务未提交'));
    tx.onerror = () => { /* abort is the final outcome, including a failed request */ };
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Account-scoped durable facts. No credentials or model-generated summaries.
 * A checkpoint and its facts must enter commit() together. Completion means
 * the IndexedDB transaction committed, never merely that a request succeeded.
 */
export class DeviceHistoryQueue {
  private readonly database: () => Promise<IDBDatabase>;
  constructor(database: () => Promise<IDBDatabase> = openLearningDatabase) { this.database = database; }

  async commit(owner: string, candidates: HistoryEvent[], documents: HistoryDocumentWrite[] = []): Promise<void> {
    assertOwner(owner);
    const unique = new Map<string, HistoryEvent>();
    for (const candidate of candidates) {
      const event = validateHistoryEvent(candidate);
      const prior = unique.get(event.id);
      if (prior && canonicalHistoryJson(prior) !== canonicalHistoryJson(event)) throw new Error('同一学习记录编号对应不同内容');
      unique.set(event.id, event);
    }
    const events = [...unique.values()];
    const copies = structuredClone(documents);
    const db = await this.database();
    const tx = db.transaction([EVENTS, META, DOCUMENTS], 'readwrite');
    const completion = done(tx);
    let conflict: Error | undefined;
    try {
      const store = tx.objectStore(EVENTS);
      for (const event of events) {
        const deleted = tx.objectStore(META).get([owner, 'deleted', event.run_id]);
        deleted.onsuccess = () => {
          if (deleted.result) return;
          const prior = store.get([owner, event.id]);
          prior.onsuccess = () => {
            const old = prior.result as QueuedHistoryEvent | undefined;
            if (old && canonicalHistoryJson(old.event) !== canonicalHistoryJson(event)) {
              conflict = new Error('同一学习记录编号对应不同内容，已停止保存'); tx.abort(); return;
            }
            try {
              if (!old) store.add({ owner, event, state: 'pending' } satisfies QueuedHistoryEvent, [owner, event.id]);
            } catch (error) {
              conflict = error instanceof Error ? error : new Error('本机学习记录尚未保存');
              tx.abort();
            }
          };
        };
      }
      for (const document of copies) {
        if (document.value === undefined) tx.objectStore(DOCUMENTS).delete(document.key);
        else tx.objectStore(DOCUMENTS).put(document.value, document.key);
      }
    } catch (error) { tx.abort(); await completion.catch(() => undefined); throw error; }
    try { await completion; } catch (error) { throw conflict ?? error; }
  }

  async list(owner: string): Promise<QueuedHistoryEvent[]> {
    assertOwner(owner);
    const db = await this.database();
    const tx = db.transaction(EVENTS, 'readonly');
    const completion = done(tx);
    const [rows] = await Promise.all([result(tx.objectStore(EVENTS).index('owner').getAll(owner)), completion]) as [QueuedHistoryEvent[], void];
    return rows;
  }

  async acknowledge(owner: string, sent: HistoryEvent[], receipts: HistoryReceipt[]): Promise<void> {
    assertOwner(owner);
    const ids = new Set(sent.map(event => event.id));
    if (ids.size !== sent.length || receipts.length !== sent.length || new Set(receipts.map(row => row.id)).size !== ids.size
      || receipts.some(row => !ids.has(row.id) || !['accepted', 'exists', 'deleted', 'conflict'].includes(row.status)
        || (['accepted', 'exists'].includes(row.status) && (!Number.isSafeInteger(row.seq) || Number(row.seq) < 1)))) {
      throw new Error('同步回执不完整，保留本机记录等待重试');
    }
    const db = await this.database();
    const tx = db.transaction([EVENTS, META], 'readwrite');
    const completion = done(tx);
    const events = tx.objectStore(EVENTS);
    for (let i = 0; i < sent.length; i++) {
      const event = sent[i];
      const receipt = receipts.find(row => row.id === event.id)!;
      const request = events.get([owner, event.id]);
      request.onsuccess = () => {
        const local = request.result as QueuedHistoryEvent | undefined;
        if (!local || canonicalHistoryJson(local.event) !== canonicalHistoryJson(event)) return;
        if (receipt.status === 'conflict') events.put({ ...local, state: 'conflict' }, [owner, event.id]);
        else events.delete([owner, event.id]);
      };
      if (receipt.status === 'deleted') this.deleteWithin(tx, owner, event.run_id);
    }
    await completion;
  }

  private deleteWithin(tx: IDBTransaction, owner: string, runId: string) {
    tx.objectStore(META).put(true, [owner, 'deleted', runId]);
    const request = tx.objectStore(EVENTS).index('owner').openCursor(owner);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if ((cursor.value as QueuedHistoryEvent).event.run_id === runId) cursor.delete();
      cursor.continue();
    };
  }

  async applyDeletions(owner: string, runIds: string[], through: number): Promise<void> {
    assertOwner(owner);
    const db = await this.database();
    const tx = db.transaction([EVENTS, META], 'readwrite');
    const completion = done(tx);
    for (const runId of new Set(runIds)) this.deleteWithin(tx, owner, runId);
    // Concurrent tabs must never move the confirmed change cursor backwards.
    const request = tx.objectStore(META).get([owner, 'changes']);
    request.onsuccess = () => tx.objectStore(META).put(Math.max(Number(request.result) || 0, through), [owner, 'changes']);
    await completion;
  }

  async changeCursor(owner: string): Promise<number> {
    assertOwner(owner);
    const db = await this.database();
    const tx = db.transaction(META, 'readonly');
    const completion = done(tx);
    const [value] = await Promise.all([result(tx.objectStore(META).get([owner, 'changes'])), completion]);
    return Number(value) || 0;
  }
}
