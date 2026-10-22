export interface HistoryCourse { kind: "course-pack" | "generated"; id: string; version: string; sha256?: string }
export type HistoryKind = "question_submitted" | "question_routed" | "answer_delivered" | "request_failed" | "course_delivered" | "run_started" | "playback_position" | "beat_completed" | "narration_ended" | "task_attempt" | "task_hint";
export interface HistoryEvent {
  version: 1; id: string; kind: HistoryKind; occurred_at: string; device_id: string; session_id: string;
  question_id?: string; run_id: string; log_id?: string; course?: HistoryCourse;
  data: Record<string, string | number | string[]>;
}
export const HISTORY_VERSION: 1;
export const HISTORY_BATCH_LIMIT: 100;
export class HistoryValidationError extends Error {}
export function validateHistoryEvent(candidate: unknown): HistoryEvent;
export function canonicalHistoryJson(value: unknown): string;
export function historyCourseKey(value: HistoryCourse): string;
