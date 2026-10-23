import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { NEUTRAL_REACTIONS, PLAIN_AWARDS, TEACHERS, getTeacher, teacherProfile, teacherReactions, useSelectedTeacher } from './teachers';
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

const SITUATIONS = ['学生答错', '学生质疑老师', '学生反复问同一个点', '学生没有回应', '学生要求直接讲', '老师在这节课里讲错'];

it('gives every teacher a distinct example for each S3-02 situation, sent in the profile', () => {
  for (const teacher of TEACHERS) {
    const situations = teacher.examples.map(example => example.situation);
    for (const situation of SITUATIONS) expect(situations).toContain(situation);
    const profile = teacherProfile(teacher);
    expect(profile).toContain('情境范例');
    // A claimed earlier statement cannot be checked, so it is neither admitted nor denied.
    expect(profile).toContain('不要承认也不要否认说过');
    for (const example of teacher.examples) expect(profile).toContain(example.line);
  }
  const [alan, doudou] = TEACHERS;
  for (const situation of SITUATIONS) {
    const line = (teacher: typeof alan) => teacher.examples.find(example => example.situation === situation)!.line;
    expect(line(alan)).not.toEqual(line(doudou));
  }
});

it('keeps fixed reactions within what each event proves', () => {
  for (const reactions of [...TEACHERS.map(teacher => teacher.reactions), NEUTRAL_REACTIONS]) {
    // A hint was used: never "by yourself"; a finished lesson proves nothing was learned.
    expect(reactions.taskSucceededWithHint).not.toMatch(/自己|独立|靠你/);
    expect(reactions.lessonComplete).not.toMatch(/学会|掌握|懂了/);
    expect(reactions.taskRetry).not.toMatch(/差一点|快了/);
    for (const line of Object.values(reactions)) expect(line.length).toBeLessThanOrEqual(40);
  }
  const [alan, doudou] = TEACHERS;
  for (const key of Object.keys(alan.reactions) as (keyof typeof alan.reactions)[]) {
    expect(alan.reactions[key]).not.toEqual(doudou.reactions[key]);
  }
  expect(teacherReactions(null)).toBe(NEUTRAL_REACTIONS);
  expect(teacherReactions(getTeacher('doudou'))).toBe(getTeacher('doudou').reactions);
});

it('gives every teacher a line for each achievement that never claims mastery', () => {
  const ids = ['first-footprint', 'did-it-alone', 'regular-guest', 'reunion'] as const;
  for (const awards of [...TEACHERS.map(teacher => teacher.awards), PLAIN_AWARDS]) {
    for (const id of ids) {
      expect(awards[id]).toBeTruthy();
      expect(awards[id]).not.toMatch(/学会|掌握|精通/);
    }
    expect(awards['regular-guest']).toContain('{topic}');
    expect(awards.reunion).toContain('{topic}');
  }
  expect(TEACHERS[0].awards['regular-guest']).not.toEqual(TEACHERS[1].awards['regular-guest']);
});

it('adds the learning map to learner context with the same states and no mastery claim', () => {
  const asOf = new Date('2026-10-23T00:00:00.000Z');
  const topic = (name: string, state: 'explored' | 'practising' | 'did-it', last: string) => ({ topic_id: name, subject: 'Mathematics', domain: 'Algebra', name, state,
    evidence: { played_beats: 2, runs: 2, task_attempts: state === 'explored' ? 0 : 2, unassisted_successes: state === 'did-it' ? 1 : 0, assisted_successes: 0, days: ['2026-10-20', '2026-10-22'], first_at: null, last_at: last } });
  const map = { rules_version: 'map-states-v1', through: 3, taxonomy: { commit: 'c7ed549' },
    topics: [topic('Old topic', 'explored', '2026-09-01T00:00:00.000Z'), ...Array.from({ length: 6 }, (_, i) => topic(`Topic ${i}`, 'did-it', `2026-10-2${i}T00:00:00.000Z`))] };
  const context = buildLearnerContext({ map }, asOf)!;
  expect(context).toContain('【学习地图】');
  expect(context).toContain('都不等于掌握');
  expect(context).toContain('- Topic 5，数学·代数：做出来过；2 天学过，练习作答 2 次，其中不用提示达到要求 1 次');
  // A topic with a draft Chinese name shows both names.
  expect(buildLearnerContext({ map: { ...map, topics: [{ ...map.topics[1], topic_id: 'mt_WBdHkc2HTf', name: 'Linear Function Graphs' }] } }, asOf)).toContain('- 一次函数图像（Linear Function Graphs），数学·代数');
  expect(context).not.toContain('Old topic'); // Only the six most recent topics.
  expect(buildLearnerContext({ map: { ...map, topics: [] } }, asOf)).toBeUndefined();
});
