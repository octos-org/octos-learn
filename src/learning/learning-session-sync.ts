import { getSessionFiles, listSessions } from "@/api/sessions";
import { stripLearningContext } from "./learning-context";
import {
  isSubstantiveLearningText,
  type LearningSessionRecord,
} from "./learning-session-store";
import { isOllLessonArtifact } from "./oll/oll-artifacts";
import { isSelectionEnhancementArtifact } from "./selection-enhancements";

function sessionTimestamp(sessionId: string): number {
  const value = Number(/^learn-(\d+)/.exec(sessionId)?.[1]);
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}

export async function discoverServerLearningSessions(): Promise<LearningSessionRecord[]> {
  const allServerSessions = await listSessions();
  const learningSessions = allServerSessions.filter((session) =>
    session.id.startsWith("learn-"));
  const validatedSessions = await Promise.all(
    learningSessions.map(async (session) => ({
      session,
      files: await getSessionFiles(session.id),
    })),
  );
  return validatedSessions
    .filter(({ files }) => files.some((file) =>
      isOllLessonArtifact(file) || isSelectionEnhancementArtifact(file)))
    .map(({ session }) => {
      const createdAt = sessionTimestamp(session.id);
      const serverTitle = stripLearningContext(session.title ?? "");
      const usableServerTitle = serverTitle
        && !serverTitle.startsWith("[[LEARNING_")
        && isSubstantiveLearningText(serverTitle)
        ? serverTitle
        : null;
      return {
        id: session.id,
        status: "paused" as const,
        title: usableServerTitle ?? "已保存的学习",
        createdAt,
        updatedAt: createdAt,
      };
    });
}
