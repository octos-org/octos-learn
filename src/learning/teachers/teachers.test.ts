import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { TEACHERS, getTeacher, teacherProfile, useSelectedTeacher } from './teachers';
import { buildLearnerContext, LearnerBackgroundCache } from './learner-background';
import type { LearningRunSummary } from '../history/history-api';

beforeEach(() => localStorage.clear());

it('offers two distinct preset teachers whose settings bound shared memories', () => {
  expect(TEACHERS.map(teacher => teacher.id)).toEqual(['alan', 'doudou']);
  const alan = teacherProfile(getTeacher('alan')), doudou = teacherProfile(getTeacher('doudou'));
  expect(alan).toContain('本次授课老师：阿澜');
  expect(doudou).toContain('本次授课老师：豆豆');
  expect(alan).not.toEqual(doudou);
  for (const context of [alan, doudou]) {
    expect(context).toContain('不能说成自己的');
    expect(context).toContain('不要照抄');
  }
});

it('remembers the chosen teacher on this device and defaults to the first', () => {
  const { result } = renderHook(() => useSelectedTeacher());
  expect(result.current.teacher.id).toBe('alan');
  act(() => result.current.setTeacherId('doudou'));
  expect(result.current.teacher.id).toBe('doudou');
  expect(renderHook(() => useSelectedTeacher()).result.current.teacher.id).toBe('doudou');
});

const run = (preview: string | null, at = '2026-10-20T08:00:00.000Z'): LearningRunSummary => ({
  run_id: preview ?? 'none', session_id: 's', updated_seq: 1, question_preview: preview, first_occurred_at: at,
  course: null, question_count: 2, completed_beats: 12, task_attempts: 3, start_recorded: true,
});

it('states only sourced facts in learner context and omits it when there are none', () => {
  const asOf = new Date('2026-10-22T00:00:00.000Z');
  expect(buildLearnerContext({}, asOf)).toBeUndefined();
  expect(buildLearnerContext({ memory: { long_term: '  ' }, runs: [run(null)] }, asOf)).toBeUndefined();
  const context = buildLearnerContext({ memory: { long_term: '学生说过以后讲新内容先看图。' }, runs: [run('什么是斜率')] }, asOf)!;
  expect(context).toContain('截至 2026-10-22T00:00:00.000Z');
  expect(context).toContain('学生说过以后讲新内容先看图。');
  expect(context).toContain('2026-10-20 “什么是斜率”：提问 2 次，播放 12 个片段，练习作答 3 次');
  expect(context).toContain('播放不代表掌握');
  expect(buildLearnerContext({ memory: { long_term: 'x'.repeat(5000) } }, asOf)!.length).toBeLessThan(1800);
});

it('serves cached background per account without waiting, and keeps it when a refresh fails or stalls', async () => {
  let reply: () => Promise<{ memory: { long_term: string } }> = async () => ({ memory: { long_term: '偏好看图' } });
  let account = 'alice';
  const load = vi.fn(() => reply());
  const cache = new LearnerBackgroundCache(load, { currentAccount: () => account, timeoutMs: 20, maxAgeMs: 0 });
  expect(cache.current('alice')).toBeUndefined();
  await cache.refresh('alice');
  expect(cache.current('alice')).toContain('偏好看图');
  expect(cache.current('bob')).toBeUndefined();
  reply = async () => { throw new Error('offline'); };
  await cache.refresh('alice');
  expect(cache.current('alice')).toContain('偏好看图');
  reply = () => new Promise(() => {});
  await cache.refresh('alice');
  expect(cache.current('alice')).toContain('偏好看图');
  // A load that finishes after the account changed is discarded.
  reply = async () => { account = 'bob'; return { memory: { long_term: '另一个账号的记忆' } }; };
  await cache.refresh('alice');
  expect(cache.current('alice')).toContain('偏好看图');
  expect(cache.current('bob')).toBeUndefined();
});

it('refreshes at most once per interval unless forced, and keeps loads for different accounts apart', async () => {
  let time = 0;
  const load = vi.fn(async (account: string) => ({ memory: { long_term: `${account} 的记忆` } }));
  let account = 'alice';
  const cache = new LearnerBackgroundCache(load, { currentAccount: () => account, maxAgeMs: 1000, now: () => new Date(time) });
  await cache.refresh('alice'); await cache.refresh('alice');
  expect(load).toHaveBeenCalledTimes(1);
  await cache.refresh('alice', true);
  expect(load).toHaveBeenCalledTimes(2);
  time = 2000; await cache.refresh('alice');
  expect(load).toHaveBeenCalledTimes(3);
  account = 'bob';
  await Promise.all([cache.refresh('alice'), cache.refresh('bob')]);
  expect(load.mock.calls.map(call => call[0]).slice(-2).sort()).toEqual(['alice', 'bob']);
  expect(cache.current('bob')).toContain('bob 的记忆');
});

it('sends a context field only to lesson actions that declare it', async () => {
  const { lessonContextSupport } = await import('./lesson-context-support');
  const support = lessonContextSupport([
    { id: 'new', input_schema: { properties: { teacher_profile: {}, learner_background: {} } } },
    // Learning Coach 0.15 already declared tutor_context/learner_context with another meaning.
    { id: 'old', input_schema: { properties: { learner_request: {}, tutor_context: {}, learner_context: {} } } },
    { id: 'bare', input_schema: {} },
  ] as never);
  expect([...support.get('new')!]).toEqual(['teacher_profile', 'learner_background']);
  expect(support.get('old')!.size).toBe(0);
  expect(support.get('bare')!.size).toBe(0);
  expect(support.get('missing')).toBeUndefined();
});

it('a forced refresh during a running load reloads afterwards instead of reusing the stale result', async () => {
  let release!: () => void;
  const sources = [
    () => new Promise<{ memory: null }>((done) => { release = () => done({ memory: null }); }),
    async () => ({ memory: { long_term: '连接建立后才读到的记忆' } }),
  ];
  const load = vi.fn(() => sources[load.mock.calls.length - 1]());
  const cache = new LearnerBackgroundCache(load, { currentAccount: () => 'alice' });
  const first = cache.refresh('alice');
  const forced = cache.refresh('alice', true);
  expect(cache.refresh('alice', true)).toBe(forced);
  release();
  await first; await forced;
  expect(load).toHaveBeenCalledTimes(2);
  expect(cache.current('alice')).toContain('连接建立后才读到的记忆');
});

it('gives each teacher a distinct standard catalog voice for every catalog resource', () => {
  const catalog = JSON.parse(readFileSync(resolve(__dirname, '../../../public/voice-catalog/volcano.json'), 'utf8')) as { voices: { id: string; name: string; resourceIds: string[] }[] };
  for (const resource of new Set(catalog.voices.flatMap(voice => voice.resourceIds))) {
    const chosen = TEACHERS.map(teacher => teacher.voices[resource]);
    expect(new Set(chosen.map(voice => voice.id)).size).toBe(TEACHERS.length);
    for (const voice of chosen) expect(catalog.voices.find(entry => entry.id === voice.id && entry.name.startsWith(voice.name))?.resourceIds).toContain(resource);
  }
});
