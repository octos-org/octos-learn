import { beforeEach, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '../../lib/constants';
import type { AccountTeacherChoice } from '../history/history-api';
import { chooseTeacher, deviceTeacherChoice, syncTeacherChoice, TEACHER_CHANGE_EVENT, type TeacherChoiceApi } from './teacher-choice';

const KNOWN = new Set(['alan', 'doudou']);
const isKnown = (id: string) => KNOWN.has(id);

/** One account's copy in the learning-history service. */
class FakeAccount {
  choice: AccountTeacherChoice | null = null;
  offline = false;
  calls: { teacherId: string; baseRevision?: number }[] = [];
  constructor(readonly owner: string) {}
  api(): TeacherChoiceApi {
    return {
      owner: this.owner,
      teacherChoice: async () => { this.fail(); return { choice: this.choice }; },
      chooseTeacher: async (teacherId: string, baseRevision?: number) => {
        this.fail();
        this.calls.push({ teacherId, baseRevision });
        if (baseRevision !== undefined && (this.choice?.revision ?? 0) !== baseRevision) return { status: 'conflict' as const, choice: this.choice };
        this.choice = { teacher_id: teacherId, revision: (this.choice?.revision ?? 0) + 1, updated_at: '2026-10-23T00:00:00.000Z' };
        return { status: 'saved' as const, choice: this.choice };
      },
    };
  }
  private fail() { if (this.offline) throw new TypeError('Failed to fetch'); }
}

let account: FakeAccount;
const options = () => ({ isKnown, open: async () => account.api() });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, 'token');
  account = new FakeAccount('alice');
});

it('uses the account choice on a new device and announces it', async () => {
  account.choice = { teacher_id: 'doudou', revision: 3, updated_at: 'x' };
  const seen = vi.fn();
  window.addEventListener(TEACHER_CHANGE_EVENT, seen);
  await syncTeacherChoice(options());
  window.removeEventListener(TEACHER_CHANGE_EVENT, seen);
  expect(deviceTeacherChoice()).toBe('doudou');
  expect(seen).toHaveBeenCalledOnce();
  expect(account.calls).toEqual([]);
});

it('saves the teacher chosen on this device before account storage existed, once', async () => {
  localStorage.setItem('octos-learn-teacher', 'doudou');
  await syncTeacherChoice(options());
  expect(account.calls).toEqual([{ teacherId: 'doudou', baseRevision: 0 }]);
  await syncTeacherChoice(options());
  expect(account.calls).toHaveLength(1);
});

it('saves a choice to the account and keeps it queued while offline', async () => {
  await syncTeacherChoice(options());
  await chooseTeacher('doudou', options());
  expect(account.choice?.teacher_id).toBe('doudou');

  account.offline = true;
  await chooseTeacher('alan', options());
  expect(deviceTeacherChoice()).toBe('alan');
  expect(account.choice?.teacher_id).toBe('doudou');

  account.offline = false;
  await syncTeacherChoice(options());
  expect(account.choice).toMatchObject({ teacher_id: 'alan', revision: 2 });
  expect(account.calls.at(-1)).toEqual({ teacherId: 'alan', baseRevision: 1 });
});

it('keeps a later choice from another device over a stale offline one', async () => {
  await syncTeacherChoice(options());
  await chooseTeacher('doudou', options());
  account.offline = true;
  await chooseTeacher('alan', options());
  account.offline = false;
  account.choice = { teacher_id: 'doudou', revision: 5, updated_at: 'x' }; // chosen elsewhere meanwhile
  await syncTeacherChoice(options());
  expect(deviceTeacherChoice()).toBe('doudou');
  expect(account.choice.revision).toBe(5);
  await syncTeacherChoice(options());
  expect(account.calls.at(-1)?.teacherId).toBe('alan'); // the stale replay was sent once, not repeated
  expect(account.calls.filter(call => call.teacherId === 'alan')).toHaveLength(1);
});

it('does not save one account’s queued choice into another account', async () => {
  await syncTeacherChoice(options());
  account.offline = true;
  await chooseTeacher('doudou', options());
  const bob = new FakeAccount('bob');
  bob.choice = { teacher_id: 'alan', revision: 1, updated_at: 'x' };
  await syncTeacherChoice({ isKnown, open: async () => bob.api() });
  expect(bob.calls).toEqual([]);
  expect(deviceTeacherChoice()).toBe('alan');
});

it('leaves the device copy alone for a teacher this version does not offer', async () => {
  localStorage.setItem('octos-learn-teacher', 'alan');
  account.choice = { teacher_id: 'newcomer', revision: 1, updated_at: 'x' };
  await syncTeacherChoice(options());
  expect(deviceTeacherChoice()).toBe('alan');
});
