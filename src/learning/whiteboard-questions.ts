import type { InkSelectionBounds } from "octos-lesson-language/ink-runtime";
import {
  loadRecoverableJson,
  writeRecoverableJson,
} from "./recoverable-storage";

export type WhiteboardQuestionStatus = "pending" | "answered" | "failed";

export interface WhiteboardQuestionRecord {
  id: string;
  sessionId: string;
  text: string;
  origin: "composer" | "selection";
  createdAt: string;
  status: WhiteboardQuestionStatus;
  error?: string;
  /** Exact session-scoped camera frame submitted with this question. */
  imagePath?: string;
  source?: {
    sourceId: string;
    bounds: InkSelectionBounds;
  };
  position?: {
    x: number;
    y: number;
  };
}

const STORAGE_PREFIX = "octos-learning-questions:v1:";

export function whiteboardQuestionsStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validBounds(value: unknown): value is InkSelectionBounds {
  if (!value || typeof value !== "object") return false;
  const bounds = value as Record<string, unknown>;
  return finiteNumber(bounds.x)
    && finiteNumber(bounds.y)
    && finiteNumber(bounds.width)
    && finiteNumber(bounds.height)
    && bounds.width >= 0
    && bounds.height >= 0;
}

function validQuestion(
  value: unknown,
  sessionId: string,
): value is WhiteboardQuestionRecord {
  if (!value || typeof value !== "object") return false;
  const question = value as Record<string, unknown>;
  if (
    typeof question.id !== "string"
    || question.sessionId !== sessionId
    || typeof question.text !== "string"
    || question.text.length === 0
    || !["composer", "selection"].includes(String(question.origin))
    || typeof question.createdAt !== "string"
    || !["pending", "answered", "failed"].includes(String(question.status))
  ) return false;
  if (question.error !== undefined && typeof question.error !== "string") {
    return false;
  }
  if (question.imagePath !== undefined && typeof question.imagePath !== "string") {
    return false;
  }
  if (question.position !== undefined) {
    if (!question.position || typeof question.position !== "object") return false;
    const position = question.position as Record<string, unknown>;
    if (!finiteNumber(position.x) || !finiteNumber(position.y)) return false;
  }
  if (question.origin === "selection") {
    if (!question.source || typeof question.source !== "object") return false;
    const source = question.source as Record<string, unknown>;
    if (typeof source.sourceId !== "string" || !validBounds(source.bounds)) {
      return false;
    }
  }
  return true;
}

export function loadWhiteboardQuestions(
  sessionId: string,
  storage: Storage = localStorage,
): WhiteboardQuestionRecord[] {
  return loadRecoverableJson({
    storage,
    key: whiteboardQuestionsStorageKey(sessionId),
    fallback: () => [],
    decode: (parsed) => {
      if (!Array.isArray(parsed)
        || parsed.some((value) => !validQuestion(value, sessionId))) {
        throw new Error("invalid whiteboard question state");
      }
      return [...parsed as WhiteboardQuestionRecord[]].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt));
    },
  });
}

export function saveWhiteboardQuestions(
  sessionId: string,
  questions: WhiteboardQuestionRecord[],
  storage: Storage = localStorage,
): void {
  if (questions.some((question) => !validQuestion(question, sessionId))) return;
  writeRecoverableJson(
    storage,
    whiteboardQuestionsStorageKey(sessionId),
    questions,
  );
}

export function hasSavedWhiteboardQuestion(
  sessionId: string,
  storage: Storage = localStorage,
): boolean {
  return loadWhiteboardQuestions(sessionId, storage).length > 0;
}
