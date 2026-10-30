import { useCallback, useEffect, useState } from "react";

import { getSelectedProfileId, getToken } from "@/api/client";

import { openHistoryApi } from "../history/history-api";
import { getTeacher, isTeacherId, type TeacherDefinition } from "./teachers";

type TeacherId = TeacherDefinition["id"];
type LessonTeachers = Readonly<Record<string, TeacherId>>;

const PREFIX = "octos-learn-lesson-teachers:v1:";
const storageKey = (owner: string, sessionId: string) => `${PREFIX}${encodeURIComponent(owner)}:${sessionId}`;
const currentOwner = () => getSelectedProfileId() ?? "anonymous";
const IDENTITY_EVENTS = ["octos:identity-changed", "crew:token_cleared", "storage"] as const;

function known(value: unknown): LessonTeachers {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, TeacherId] => isTeacherId(entry[1])));
}

function readLocal(owner: string, sessionId: string): LessonTeachers {
  try { return known(JSON.parse(localStorage.getItem(storageKey(owner, sessionId)) ?? "{}")); } catch { return {}; }
}

function writeLocal(owner: string, sessionId: string, teachers: LessonTeachers) {
  try { localStorage.setItem(storageKey(owner, sessionId), JSON.stringify(teachers)); } catch { /* the history service still has them */ }
}

export function forgetLessonTeachers(sessionId: string) {
  try { localStorage.removeItem(storageKey(currentOwner(), sessionId)); } catch { /* nothing to forget */ }
}

type State = { scope: string; asked: LessonTeachers; fetched: LessonTeachers; settled: boolean };
const initial = (owner: string, token: string | null, sessionId: string): State =>
  ({ scope: `${owner}\u0000${sessionId}`, asked: readLocal(owner, sessionId), fetched: {}, settled: !token });

/** The teacher who taught each lesson on a board, by question id, for the
 * signed-in account. A lesson is replayed with that teacher whoever is chosen
 * now. This device keeps what it asked; lessons asked elsewhere come from the
 * history service on each open and are not stored, so deleting their records
 * there also removes them here. `settled` turns true once the service has
 * answered or failed; a lesson without a record had no teacher. */
export function useLessonTeachers(sessionId: string) {
  const [who, setWho] = useState(() => ({ owner: currentOwner(), token: getToken() }));
  useEffect(() => {
    const changed = () => setWho(previous => {
      const next = { owner: currentOwner(), token: getToken() };
      return previous.owner === next.owner && previous.token === next.token ? previous : next;
    });
    for (const name of IDENTITY_EVENTS) window.addEventListener(name, changed);
    return () => { for (const name of IDENTITY_EVENTS) window.removeEventListener(name, changed); };
  }, []);
  const scope = `${who.owner}\u0000${sessionId}`;
  const [state, setState] = useState(() => initial(who.owner, who.token, sessionId));
  const current = state.scope === scope ? state : initial(who.owner, who.token, sessionId);
  if (state.scope !== scope) setState(current);
  useEffect(() => {
    if (!who.token) return;
    let active = true;
    const settle = (fetched: LessonTeachers) => {
      if (active) setState(previous => previous.scope === scope ? { ...previous, fetched, settled: true } : previous);
    };
    void openHistoryApi(who.token).then(api => {
      if (api.owner !== who.owner) throw new Error("account changed");
      return api.lessonTeachers(sessionId);
    }).then(result => settle(known(result.teachers)), () => settle({}));
    return () => { active = false; };
  }, [scope, sessionId, who]);
  const remember = useCallback((questionId: string, teacherId: TeacherId) => {
    // A question asked under another login never lands in this account.
    if (currentOwner() !== who.owner) return;
    setState(previous => {
      if (previous.scope !== scope) return previous;
      const asked = { ...previous.asked, [questionId]: teacherId };
      writeLocal(who.owner, sessionId, asked);
      return { ...previous, asked };
    });
  }, [scope, sessionId, who.owner]);
  const { asked, fetched, settled } = current;
  const teacherOf = useCallback((questionId: string | undefined): TeacherDefinition | null => {
    const id = questionId ? asked[questionId] ?? fetched[questionId] : undefined;
    return id ? getTeacher(id) : null;
  }, [asked, fetched]);
  return { teacherOf, remember, settled };
}
