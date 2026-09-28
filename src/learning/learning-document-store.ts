import type { InkDocumentRecord, InkDocumentStore } from 'octos-lesson-language/ink-runtime';
import type { PlaybackStore } from 'octos-lesson-language/web-runtime';

export const LEARNING_DATABASE_NAME = 'octos-learning-documents';
const DOCUMENTS = 'documents';
const inkKeys = new Set<string>();
const pending = new Map<string, unknown>();
const failures = new Map<string, unknown>();
const inkCommitWaiters = new Map<string, Set<() => void>>();
const listeners = new Set<() => void>();
let database: Promise<IDBDatabase> | undefined;
let initialization: Promise<void> | undefined;
let queue: Promise<void> = Promise.resolve();
let errorMessage = '';

function notify() {
  errorMessage = failures.size ? '本地保存失败，最新学习进度或笔迹尚未保存。请重试，暂勿关闭页面。' : '';
  listeners.forEach(listener => listener());
}
export const learningStorageStatus = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => errorMessage,
};

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('此设备的本地数据库不可用')); return; }
    let blocked = false;
    const request = indexedDB.open(LEARNING_DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DOCUMENTS);
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('请关闭其他 Octos 页面后重试本地数据库初始化')); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); database = undefined; initialization = undefined; };
      resolve(db);
    };
  }).catch(error => { database = undefined; throw error; });
  return database;
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS, mode);
    const request = operation(tx.objectStore(DOCUMENTS));
    // Request success is not durability: only the transaction commit counts.
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new Error('本地保存事务已中止'));
    tx.onerror = () => reject(tx.error ?? new Error('本地数据库读写失败'));
  });
}

export function initializeLearningDocuments(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    const keys = await transact('readonly', store => store.getAllKeys());
    inkKeys.clear();
    keys.forEach(key => { if (typeof key === 'string' && key.startsWith('octos-learning-ink:v1:')) inkKeys.add(key); });
    // Development reset explicitly authorized: no import of legacy documents.
    // Keep login, settings, session index and installed CoursePack archives.
    for (const key of Object.keys(localStorage)) {
      if (/^octos-learning-(oll:|ink:v1:|ink-run:v1:|ink-merge-source:v1:|ink-cumulative-run:v1:)/u.test(key)) localStorage.removeItem(key);
    }
  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}

export function hasStoredInk(key: string): boolean { return inkKeys.has(key); }
export function hasStoredSessionInk(sessionId: string): boolean {
  const prefix = `octos-learning-ink:v1:${sessionId}`;
  return [...inkKeys].some(key => key === prefix || key.startsWith(`${prefix}:replay:`));
}

async function read<T>(key: string): Promise<T | undefined> {
  await initializeLearningDocuments();
  await queue;
  return transact('readonly', store => store.get(key)) as Promise<T | undefined>;
}
function write(key: string, value: unknown): Promise<void> {
  const snapshot = value === undefined ? undefined : structuredClone(value);
  pending.set(key, snapshot);
  const work = queue.then(async () => {
    try {
      if (snapshot === undefined) await transact('readwrite', store => store.delete(key));
      else await transact('readwrite', store => store.put(snapshot, key));
      if (key.startsWith('octos-learning-ink:v1:')) {
        if (snapshot === undefined) inkKeys.delete(key); else inkKeys.add(key);
      }
      if (pending.get(key) === snapshot) { pending.delete(key); failures.delete(key); }
      inkCommitWaiters.get(key)?.forEach(resolve => resolve());
      inkCommitWaiters.delete(key);
      notify();
    } catch (error) {
      failures.set(key, error); notify(); throw error;
    }
  });
  queue = work.catch(() => undefined);
  return work;
}
export async function flushLearningDocumentWrites(): Promise<void> {
  let current;
  do { current = queue; await current; } while (current !== queue);
  if (failures.size) throw new Error(errorMessage);
}

export async function retryLearningDocumentWrites(): Promise<void> {
  await queue;
  await Promise.all([...pending].map(([key, value]) => write(key, value)));
}

export const indexedInkStore: InkDocumentStore = {
  async load(key) { return await read<InkDocumentRecord>(key) ?? null; },
  save: (key, record) => new Promise<void>(resolve => {
    // Keep the Runtime's save transaction pending on a disk failure. Retrying
    // commits that same document and resumes its merge exactly once, without
    // importing the old SVG again or claiming the ink has already been saved.
    const waiters = inkCommitWaiters.get(key) ?? new Set<() => void>();
    waiters.add(resolve);
    inkCommitWaiters.set(key, waiters);
    void write(key, record).catch(() => undefined);
  }),
  remove: key => write(key, undefined),
};

// OLL's playback contract is synchronous. Hydrate only this session's three
// records before constructing the player; subsequent writes commit asynchronously.
export async function createIndexedPlaybackStore(key: string): Promise<PlaybackStore> {
  const keys = [key, `${key}:student-operations:v1`, `${key}:student-task-progress:v1`];
  const values = await Promise.all(keys.map(k => read(k)));
  const cache = new Map(keys.map((k, index) => [k, values[index]]));
  const save = (k: string, value: unknown) => {
    cache.set(k, structuredClone(value));
    void write(k, value).catch(() => undefined); // surfaced by learningStorageStatus
  };
  const remove = (k: string) => { cache.delete(k); void write(k, undefined).catch(() => undefined); };
  return {
    load: k => structuredClone(cache.get(k)) as ReturnType<PlaybackStore['load']>,
    save, remove,
    loadStudentOperations: k => structuredClone(cache.get(`${k}:student-operations:v1`)),
    saveStudentOperations: (k, value) => save(`${k}:student-operations:v1`, value),
    removeStudentOperations: k => remove(`${k}:student-operations:v1`),
    loadStudentTaskProgress: k => structuredClone(cache.get(`${k}:student-task-progress:v1`)),
    saveStudentTaskProgress: (k, value) => save(`${k}:student-task-progress:v1`, value),
    removeStudentTaskProgress: k => remove(`${k}:student-task-progress:v1`),
  };
}
