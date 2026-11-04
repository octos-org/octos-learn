// The camera performance of each take, kept on this device only: face and
// head parameters, never camera images. It is not synced with the account
// draft; a lesson made on another device is presented with mouth motion only.
// Packages carry the performance only after it is re-timed onto the final
// narration (avatar/lesson-performance.ts).

import { parseAvatarTrack, type AvatarTrack } from "../avatar/performance-track";

const DATABASE = "octos-take-performances";
const TAKES = "takes";
const MAX_BYTES = 5_000_000;

export interface TakePerformanceKey { profileId: string; recordingId: string; cardKey: string; take: number }

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(TAKES, { keyPath: ["profileId", "recordingId", "cardKey", "take"] }).createIndex("recording", ["profileId", "recordingId"]);
    };
    request.onerror = () => reject(request.error ?? new Error("performance_storage_failed"));
    request.onblocked = () => reject(new Error("performance_storage_blocked"));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}

async function run<T>(factory: IDBFactory, mode: IDBTransactionMode, work: (store: IDBObjectStore) => () => T): Promise<T> {
  const db = await open(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(TAKES, mode);
      let result: () => T;
      try { result = work(tx.objectStore(TAKES)); } catch (error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => { try { resolve(result()); } catch (error) { reject(error); } };
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("performance_storage_failed"));
    });
  } finally { db.close(); }
}

function validKey(key: TakePerformanceKey): [string, string, string, number] {
  if (!key.profileId.trim() || !key.recordingId.trim() || !key.cardKey.trim() || !Number.isSafeInteger(key.take) || key.take < 1) throw new Error("invalid_take_key");
  return [key.profileId, key.recordingId, key.cardKey, key.take];
}

/** Keeps a take's performance; only validated parameter fields are stored. */
export async function saveTakePerformance(key: TakePerformanceKey, track: AvatarTrack, factory: IDBFactory = indexedDB): Promise<void> {
  const [profileId, recordingId, cardKey, take] = validKey(key);
  const clean = parseAvatarTrack(track);
  if (new Blob([JSON.stringify(clean)]).size > MAX_BYTES) throw new Error("performance_too_large");
  await run(factory, "readwrite", (store) => { store.put({ profileId, recordingId, cardKey, take, track: clean }); return () => undefined; });
}

export async function readTakePerformance(key: TakePerformanceKey, factory: IDBFactory = indexedDB): Promise<AvatarTrack | null> {
  const id = validKey(key);
  return run(factory, "readonly", (store) => {
    const request = store.get(id);
    return () => (request.result ? parseAvatarTrack(request.result.track) : null);
  });
}

/** Removes every take performance of a recording, for example when its draft is deleted. */
export async function deleteRecordingPerformances(profileId: string, recordingId: string, factory: IDBFactory = indexedDB): Promise<void> {
  if (!profileId.trim() || !recordingId.trim()) throw new Error("invalid_take_key");
  await run(factory, "readwrite", (store) => {
    const request = store.index("recording").getAllKeys([profileId, recordingId]);
    request.onsuccess = () => { for (const key of request.result) store.delete(key); };
    return () => undefined;
  });
}
