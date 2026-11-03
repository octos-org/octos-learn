// The learner-lessons service (services/learner-lessons): drafts kept with the
// account, and the checked package of each lesson the learner saved.

import { tr } from "@/i18n";

import { getToken } from "@/api/client";
import { API_BASE } from "@/lib/constants";

import { historyRequestTimeout } from "../history/request-timeout";
import type { StoredInkSnapshot } from "./ink-snapshot-store";
import type { LearnerRecording } from "./recording";

export type LessonState = "draft" | "submitted" | "approved" | "published" | "withdrawn";

export interface SavedLessonSummary {
  lesson_id: string;
  state: LessonState;
  title: string;
  star_topic_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  saved_at: string | null;
  /** The draft changed after the learner last saved the lesson. */
  changed_since_saved: boolean;
  saved: { content_sha256: string; bytes: number; language: string; cards: number; practice_tasks: number;
    author: { learner_ref: string; avatar_ref: string; voice_ref: string } } | null;
}

export interface SavedLesson extends SavedLessonSummary {
  recording: LearnerRecording;
  ink: Record<string, StoredInkSnapshot>;
}

export class LessonsUnavailable extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LessonsUnavailable";
    this.status = status;
  }
}

async function request(path: string, init: RequestInit = {}, timeout = 15_000): Promise<Response> {
  const token = getToken();
  if (!token) throw new LessonsUnavailable(tr("登录后才能把课保存到“我的课”。"), 401);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/learn/lessons${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, redirect: "error", signal: init.signal ?? historyRequestTimeout(timeout),
    });
  } catch {
    throw new LessonsUnavailable(tr("现在连不上“我的课”，课还保存在这台设备上。"));
  }
  if (!response.ok && response.status !== 409) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new LessonsUnavailable(response.status === 422 ? tr("课程包没有通过检查：{{v0}}", { v0: detail?.error ?? "" }) : tr("现在连不上“我的课”，课还保存在这台设备上。"), response.status);
  }
  return response;
}

const json = (body: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function listLessons(): Promise<SavedLessonSummary[]> {
  return ((await (await request("")).json()) as { lessons: SavedLessonSummary[] }).lessons;
}

export async function readLesson(id: string): Promise<SavedLesson> {
  return ((await (await request(`/${encodeURIComponent(id)}`)).json()) as { lesson: SavedLesson }).lesson;
}

/** Saves the draft; `baseRevision` is the revision this device last saw, null for a lesson the service has not seen. */
export async function putLessonDraft(recording: LearnerRecording, ink: Record<string, StoredInkSnapshot>, baseRevision: number | null) {
  const response = await request(`/${encodeURIComponent(recording.id)}/draft`, { method: "PUT", ...json({ base_revision: baseRevision, recording, ink }) }, 30_000);
  return await response.json() as { status: "saved" | "unchanged" | "conflict"; revision: number | null };
}

/** Saves the lesson: its checked package becomes the version in "My lessons". */
export async function saveLessonPackage(id: string, archive: ArrayBuffer): Promise<SavedLessonSummary> {
  const response = await request(`/${encodeURIComponent(id)}/package`, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: archive }, 120_000);
  return ((await response.json()) as { lesson: SavedLessonSummary }).lesson;
}

export async function fetchLessonPackage(id: string): Promise<ArrayBuffer> {
  return await (await request(`/${encodeURIComponent(id)}/package`, {}, 120_000)).arrayBuffer();
}

export async function exportLesson(id: string): Promise<unknown> {
  return await (await request(`/${encodeURIComponent(id)}/export`)).json();
}

export async function deleteLesson(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
