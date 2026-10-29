import { useCallback, useEffect, useState } from "react";

import { getSelectedProfileId, getToken } from "@/api/client";

import { openHistoryApi } from "../history/history-api";
import { getTeacher, isTeacherId, type TeacherDefinition } from "./teachers";

type TeacherId = TeacherDefinition["id"];
type LessonTeachers = Readonly<Record<string, TeacherId>>;

const PREFIX = "octos-learn-lesson-teachers:v1:";
const storageKey = (sessionId: string) => `${PREFIX}${encodeURIComponent(getSelectedProfileId() ?? "anonymous")}:${sessionId}`;

function known(value: unknown): LessonTeachers {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, TeacherId] => isTeacherId(entry[1])));
}

function readLocal(sessionId: string): LessonTeachers {
  try { return known(JSON.parse(localStorage.getItem(storageKey(sessionId)) ?? "{}")); } catch { return {}; }
}

function writeLocal(sessionId: string, teachers: LessonTeachers) {
  try { localStorage.setItem(storageKey(sessionId), JSON.stringify(teachers)); } catch { /* the history service still has them */ }
}

export function forgetLessonTeachers(sessionId: string) {
  try { localStorage.removeItem(storageKey(sessionId)); } catch { /* nothing to forget */ }
}

/** The teacher who taught each lesson on a board, by question id. A lesson is
 * replayed with that teacher whoever is chosen now. This device remembers its
 * own lessons at once; the history service adds lessons taught elsewhere or
 * before this device kept them. A lesson without a record had no teacher. */
export function useLessonTeachers(sessionId: string) {
  const [state, setState] = useState(() => ({ sessionId, teachers: readLocal(sessionId) }));
  const teachers = state.sessionId === sessionId ? state.teachers : readLocal(sessionId);
  if (state.sessionId !== sessionId) setState({ sessionId, teachers });
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    void openHistoryApi(token).then(api => api.lessonTeachers(sessionId)).then(result => {
      if (!active) return;
      setState(previous => {
        if (previous.sessionId !== sessionId) return previous;
        // What this device recorded at the moment of asking stands.
        const merged = { ...known(result.teachers), ...previous.teachers };
        writeLocal(sessionId, merged);
        return { sessionId, teachers: merged };
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [sessionId]);
  const remember = useCallback((questionId: string, teacherId: TeacherId) => {
    setState(previous => {
      const base = previous.sessionId === sessionId ? previous.teachers : readLocal(sessionId);
      const next = { ...base, [questionId]: teacherId };
      writeLocal(sessionId, next);
      return { sessionId, teachers: next };
    });
  }, [sessionId]);
  const teacherOf = useCallback((questionId: string | undefined): TeacherDefinition | null => {
    const id = questionId ? teachers[questionId] : undefined;
    return id ? getTeacher(id) : null;
  }, [teachers]);
  return { teacherOf, remember };
}
