// Keeps the drafts on this device and the drafts kept with the account in
// step. The device copy is what the studio edits; the service copy lets a
// draft survive a cleared browser or move to another device. Each side
// remembers the revision it last agreed on, so a change made on one side is
// carried to the other and the newer edit wins when both changed.

import { loadRecoverableJson, writeRecoverableJson } from "../recoverable-storage";
import { loadInkSnapshots, saveInkSnapshot, type StoredInkSnapshot } from "./ink-snapshot-store";
import type { LearnerRecording } from "./recording";
import { decodeRecording, deleteRecordingDraft, loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { listLessons, putLessonDraft, readLesson, type SavedLessonSummary } from "./learner-lessons-api";

/** What both sides last agreed on for one draft. */
interface SyncedDraft { revision: number; updatedAt: string }

export function draftSyncKey(profileId: string): string {
  return `octos-learn:learner-lesson-sync:v1:${profileId}`;
}

function decodeSynced(value: unknown): Record<string, SyncedDraft> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid draft sync state");
  for (const entry of Object.values(value)) {
    if (!entry || typeof entry.revision !== "number" || typeof entry.updatedAt !== "string") throw new Error("Invalid draft sync state");
  }
  return value as Record<string, SyncedDraft>;
}

function loadSynced(storage: Storage, profileId: string) {
  return loadRecoverableJson<Record<string, SyncedDraft>>({ storage, key: draftSyncKey(profileId), fallback: () => ({}), decode: decodeSynced });
}

export function forgetSyncedDraft(storage: Storage, profileId: string, id: string) {
  const synced = loadSynced(storage, profileId);
  delete synced[id];
  writeRecoverableJson(storage, draftSyncKey(profileId), synced);
}

/** The handwriting a recording uses, by snapshot id. */
export function recordingInk(recording: LearnerRecording, snapshots: Record<string, StoredInkSnapshot>): Record<string, StoredInkSnapshot> {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (key === "snapshotId" && typeof item === "string") ids.add(item);
        else visit(item);
      }
    }
  };
  visit(recording);
  return Object.fromEntries([...ids].flatMap((id) => (snapshots[id] ? [[id, snapshots[id]!]] : [])));
}

export interface LessonsApi {
  listLessons: typeof listLessons;
  readLesson: typeof readLesson;
  putLessonDraft: typeof putLessonDraft;
}

export interface DraftSyncResult {
  lessons: SavedLessonSummary[];
  pushed: string[];
  pulled: string[];
  removed: string[];
}

/** Brings both sides in line. Throws only when the service cannot be reached; the device copy is never lost. */
export async function syncLessonDrafts(storage: Storage, profileId: string, api: LessonsApi = { listLessons, readLesson, putLessonDraft }): Promise<DraftSyncResult> {
  const result: DraftSyncResult = { lessons: await api.listLessons(), pushed: [], pulled: [], removed: [] };
  const synced = loadSynced(storage, profileId);
  const remote = new Map(result.lessons.map((lesson) => [lesson.lesson_id, lesson]));
  const agree = (id: string, revision: number, updatedAt: string) => { synced[id] = { revision, updatedAt }; };

  const pull = async (id: string) => {
    const lesson = await api.readLesson(id);
    const recording = decodeRecording(lesson.recording);
    for (const [snapshotId, snapshot] of Object.entries(lesson.ink)) saveInkSnapshot(storage, profileId, snapshotId, snapshot);
    if (!saveRecordingDraft(storage, profileId, recording)) throw new Error("This device could not keep the draft");
    agree(id, lesson.revision, recording.updatedAt);
    result.pulled.push(id);
  };
  const push = async (draft: LearnerRecording, base: number | null) => {
    const answer = await api.putLessonDraft(draft, recordingInk(draft, loadInkSnapshots(storage, profileId)), base);
    if (answer.status === "conflict") return false;
    agree(draft.id, answer.revision!, draft.updatedAt);
    result.pushed.push(draft.id);
    return true;
  };

  for (const draft of loadRecordingDrafts(storage, profileId)) {
    if (!draft.cards.length) continue;
    const known = synced[draft.id];
    const server = remote.get(draft.id);
    if (!server) {
      // Known to the service before and gone now: the learner deleted it there.
      if (known) {
        deleteRecordingDraft(storage, profileId, draft.id);
        delete synced[draft.id];
        result.removed.push(draft.id);
      } else await push(draft, null);
      continue;
    }
    const localChanged = !known || known.updatedAt !== draft.updatedAt;
    const remoteChanged = !known || known.revision !== server.revision;
    if (localChanged && !remoteChanged) await push(draft, server.revision);
    else if (remoteChanged && !localChanged) await pull(draft.id);
    else if (localChanged && remoteChanged) {
      // Both changed: the newer edit wins.
      if (draft.updatedAt >= server.updated_at) { if (!await push(draft, server.revision)) await pull(draft.id); }
      else await pull(draft.id);
    }
  }
  const local = new Set(loadRecordingDrafts(storage, profileId).map((draft) => draft.id));
  for (const lesson of result.lessons) if (!local.has(lesson.lesson_id)) await pull(lesson.lesson_id);
  writeRecoverableJson(storage, draftSyncKey(profileId), synced);
  if (result.pushed.length) result.lessons = await api.listLessons();
  return result;
}
