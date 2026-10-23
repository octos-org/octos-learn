import { getToken } from '../../api/client';
import { openHistoryApi, type HistoryApi, type AccountTeacherChoice } from '../history/history-api';

/** The device copy a lesson reads when it is submitted. The account copy in the
 * learning-history service is the source of truth; this mirrors it so lessons
 * never wait on the network. */
export const TEACHER_STORAGE_KEY = 'octos-learn-teacher';
export const TEACHER_CHANGE_EVENT = 'octos-learn-teacher-change';
/** A choice not yet saved to the account: holds its owner, or '' when the
 * account was not known yet. */
const PENDING_KEY = 'octos-learn-teacher-unsynced';
const OWNER_KEY = 'octos-learn-teacher-owner';
const revisionKey = (owner: string) => `octos-learn-teacher-revision:${owner}`;

export type TeacherChoiceApi = Pick<HistoryApi, 'owner' | 'teacherChoice' | 'chooseTeacher'>;
export interface TeacherChoiceOptions {
  isKnown: (id: string) => boolean;
  open?: (token: string) => Promise<TeacherChoiceApi>;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* the page keeps the choice */ }
}

export function deviceTeacherChoice(): string | null { return read(TEACHER_STORAGE_KEY); }

function showChoice(id: string) {
  if (read(TEACHER_STORAGE_KEY) === id) return;
  write(TEACHER_STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(TEACHER_CHANGE_EVENT, { detail: id }));
}

/** Mirror the account's saved choice. The device copy is left alone when the
 * learner chose again while the request was out (`seen` no longer matches), or
 * when this client does not offer that teacher (for example one added by a
 * newer version). */
function settle(owner: string, choice: AccountTeacherChoice | null, seen: string | null, isKnown: (id: string) => boolean) {
  write(OWNER_KEY, owner);
  if (!choice) return;
  write(revisionKey(owner), String(choice.revision));
  if (deviceTeacherChoice() === seen && isKnown(choice.teacher_id)) showChoice(choice.teacher_id);
}

let inFlight: Promise<void> | null = null;

/** Bring this device and the signed-in account into agreement. Failures leave
 * the device copy in use and any unsaved choice queued for the next attempt. */
export function syncTeacherChoice(options: TeacherChoiceOptions): Promise<void> {
  return inFlight ??= runSync(options).catch(() => undefined).finally(() => { inFlight = null; });
}

async function runSync({ isKnown, open = openHistoryApi }: TeacherChoiceOptions) {
  const token = getToken();
  if (!token) return;
  const api = await open(token);
  const owner = api.owner, local = deviceTeacherChoice(), pending = read(PENDING_KEY);
  const savedRevision = read(revisionKey(owner));
  if (local && isKnown(local) && pending !== null && (pending === '' || pending === owner)) {
    // Replay a choice made offline. If another device chose since the revision
    // this device last saw, that later choice wins.
    const result = await api.chooseTeacher(local, Number(savedRevision ?? 0));
    if (deviceTeacherChoice() === local) write(PENDING_KEY, null);
    settle(owner, result.choice, local, isKnown);
    return;
  }
  const { choice } = await api.teacherChoice();
  if (!choice && savedRevision === null && local && isKnown(local)) {
    // First sync of this account on this device: keep the teacher chosen here
    // before choices were saved to the account.
    const result = await api.chooseTeacher(local, 0);
    settle(owner, result.choice, local, isKnown);
    return;
  }
  settle(owner, choice, local, isKnown);
}

/** Use the new teacher on this device at once, then save it to the account. */
export async function chooseTeacher(id: string, { isKnown, open = openHistoryApi }: TeacherChoiceOptions): Promise<void> {
  showChoice(id);
  const knownOwner = read(OWNER_KEY) ?? '';
  write(PENDING_KEY, knownOwner);
  try {
    const token = getToken();
    if (!token) return;
    const api = await open(token);
    if (knownOwner && api.owner !== knownOwner) return;
    const result = await api.chooseTeacher(id);
    if (deviceTeacherChoice() === id) write(PENDING_KEY, null);
    settle(api.owner, result.choice, id, isKnown);
  } catch { /* stays queued; the next sync replays it */ }
}
