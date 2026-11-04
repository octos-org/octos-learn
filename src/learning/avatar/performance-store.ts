import type { FaceSource } from "./face-frame";
import { parseAvatarTrack, type AvatarTrack } from "./performance-track";

const DATABASE = "octos-avatar-performances";
const CLIPS = "clips";
const TRACKS = "tracks";

export interface AvatarClipSummary {
  profileId: string;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  frameCount: number;
  sources: FaceSource[];
  deletedAt?: string;
}

function validateKey(profileId: string, id?: string): void {
  if (!profileId.trim() || (id !== undefined && !id.trim())) throw new Error("invalid_clip_key");
}
function clipName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error("invalid_clip_name");
  return trimmed;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(CLIPS, { keyPath: ["profileId", "id"] }).createIndex("profile", "profileId");
      db.createObjectStore(TRACKS, { keyPath: ["profileId", "id"] });
    };
    request.onerror = () => reject(request.error ?? new Error("clip_storage_failed"));
    request.onblocked = () => { blocked = true; reject(new Error("clip_storage_blocked")); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
}

/** Resolve only after both metadata and motion have committed. Never use localStorage for frame data. */
async function transaction<T>(factory: IDBFactory, mode: IDBTransactionMode, work: (tx: IDBTransaction) => () => T): Promise<T> {
  const db = await open(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([CLIPS, TRACKS], mode);
      let result: () => T;
      try { result = work(tx); } catch (error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => { try { resolve(result()); } catch (error) { reject(error); } };
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("clip_storage_failed"));
    });
  } finally { db.close(); }
}

export async function listAvatarClips(profileId: string, factory: IDBFactory = indexedDB): Promise<AvatarClipSummary[]> {
  validateKey(profileId);
  return transaction(factory, "readonly", (tx) => {
    // Only metadata is read for the library, not every clip's thousands of frames.
    const request = tx.objectStore(CLIPS).index("profile").getAll(profileId);
    return () => (request.result as AvatarClipSummary[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  });
}

export async function saveAvatarClip(profileId: string, input: { id: string; name: string; track: AvatarTrack }, factory: IDBFactory = indexedDB): Promise<AvatarClipSummary> {
  validateKey(profileId, input.id);
  const name = clipName(input.name);
  const track = parseAvatarTrack(input.track); // whitelist parameter fields; drop extraneous imported data
  if (new Blob([JSON.stringify(track)]).size > 5_000_000) throw new Error("clip_too_large");
  const now = new Date().toISOString();
  const summary: AvatarClipSummary = { profileId, id: input.id, name, createdAt: now, updatedAt: now,
    durationMs: track.durationMs, frameCount: track.frames.length, sources: [...new Set(track.frames.map((frame) => frame.source))] };
  return transaction(factory, "readwrite", (tx) => {
    // add (not put) means an accidental repeated ID cannot overwrite somebody's clip.
    tx.objectStore(CLIPS).add(summary);
    tx.objectStore(TRACKS).add({ profileId, id: input.id, track });
    return () => summary;
  });
}

export async function readAvatarClip(profileId: string, id: string, factory: IDBFactory = indexedDB): Promise<AvatarTrack> {
  validateKey(profileId, id);
  return transaction(factory, "readonly", (tx) => {
    const metadata = tx.objectStore(CLIPS).get([profileId, id]);
    const data = tx.objectStore(TRACKS).get([profileId, id]);
    return () => {
      if (!metadata.result || metadata.result.deletedAt || !data.result) throw new Error("clip_not_found");
      return parseAvatarTrack(data.result.track);
    };
  });
}

async function changeClip(profileId: string, id: string, edit: (clip: AvatarClipSummary) => AvatarClipSummary, factory: IDBFactory): Promise<void> {
  validateKey(profileId, id);
  await transaction(factory, "readwrite", (tx) => {
    const store = tx.objectStore(CLIPS);
    const request = store.get([profileId, id]);
    request.onsuccess = () => { if (request.result) store.put(edit(request.result as AvatarClipSummary)); };
    return () => { if (!request.result) throw new Error("clip_not_found"); };
  });
}

export function renameAvatarClip(profileId: string, id: string, name: string, factory: IDBFactory = indexedDB): Promise<void> {
  const next = clipName(name);
  return changeClip(profileId, id, (clip) => ({ ...clip, name: next, updatedAt: new Date().toISOString() }), factory);
}

/** Recoverable removal: motion remains on this device until restored or site data is cleared. */
export function trashAvatarClip(profileId: string, id: string, deleted: boolean, factory: IDBFactory = indexedDB): Promise<void> {
  return changeClip(profileId, id, (clip) => {
    const next = { ...clip, updatedAt: new Date().toISOString() };
    if (deleted) next.deletedAt = next.updatedAt; else delete next.deletedAt;
    return next;
  }, factory);
}
