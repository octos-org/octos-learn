import { getMessages, getSessionFiles, listSessions, type SessionFileInfo } from "@/api/sessions";
import { buildApiHeaders } from "@/api/client";
import { buildFileUrl } from "@/api/files";
import { stripLearningContext } from "./learning-context";
import { getLearningSession, isSubstantiveLearningText, titleFromLearningText, type LearningSessionRecord } from "./learning-session-store";
import { isOllLessonArtifact } from "./oll/oll-artifacts";
import { isSelectionEnhancementArtifact } from "./selection-enhancements";

function sessionTimestamp(sessionId: string): number {
  const value = Number(/^learn-(\d+)/.exec(sessionId)?.[1]);
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}

function usableTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = stripLearningContext(value);
  return text && !text.startsWith("[[LEARNING_") && text !== "已保存的学习" && text !== "新的学习"
    && isSubstantiveLearningText(text) ? text : null;
}

async function recoverTitle(id: string, files: SessionFileInfo[]): Promise<string | null> {
  // Prefer a complete saved lesson to a streaming fragment. Never materialize
  // or regenerate a lesson just to restore its display title.
  const lessons = files.filter(isOllLessonArtifact).sort((a, b) =>
    Number(a.filename.includes(".part-")) - Number(b.filename.includes(".part-")));
  for (const file of lessons.slice(0, 3)) {
    try {
      const response = await fetch(buildFileUrl(file.path, { sessionId: id }), { headers: buildApiHeaders() });
      if (!response.ok) continue;
      const data = await response.json();
      const title = usableTitle(data?.lesson?.title);
      if (title) return title;
    } catch { /* Try another saved source; title recovery is non-destructive. */ }
  }
  try {
    const messages = await getMessages(id, 50);
    for (const message of messages) {
      if (message.role !== "user") continue;
      const title = usableTitle(message.content);
      if (title) return titleFromLearningText(title);
    }
  } catch { /* A missing transcript must not hide an existing lesson. */ }
  return null;
}

export async function discoverServerLearningSessions(): Promise<LearningSessionRecord[]> {
  const sessions = (await listSessions()).filter(session => session.id.startsWith("learn-"));
  const result: LearningSessionRecord[] = [];
  // Keep network concurrency bounded for accounts with a long history.
  for (let start = 0; start < sessions.length; start += 6) {
    const batch = await Promise.all(sessions.slice(start, start + 6).map(async session => {
      // File-list errors propagate: an incomplete discovery must never be
      // treated as authoritative evidence for deleting the local index.
      const files = await getSessionFiles(session.id);
      if (!files.some(file => isOllLessonArtifact(file) || isSelectionEnhancementArtifact(file))) return null;
      const createdAt = sessionTimestamp(session.id);
      return { id: session.id, status: "paused" as const,
        title: usableTitle(session.title) ?? usableTitle(getLearningSession(session.id)?.title) ?? await recoverTitle(session.id, files) ?? "已保存的学习",
        createdAt, updatedAt: createdAt };
    }));
    for (const session of batch) if (session) result.push(session);
  }
  return result;
}
