import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { TEACHERS, getTeacher, teacherTutorContext, useSelectedTeacher } from './teachers';
import { buildLearnerContext, LearnerBackgroundCache } from './learner-background';
import type { LearningRunSummary } from '../history/history-api';

beforeEach(() => localStorage.clear());

it('offers two distinct preset teachers whose settings bound shared memories', () => {
  expect(TEACHERS.map(teacher => teacher.id)).toEqual(['alan', 'doudou']);
  const alan = teacherTutorContext(getTeacher('alan')), doudou = teacherTutorContext(getTeacher('doudou'));
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
  const cache = new LearnerBackgroundCache(() => reply(), 20);
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
});

it('sends a context field only to lesson actions that declare it', async () => {
  const { lessonContextSupport } = await import('./lesson-context-support');
  const support = lessonContextSupport([
    { id: 'new', input_schema: { properties: { tutor_context: {}, learner_context: {} } } },
    { id: 'old', input_schema: { properties: { learner_request: {} } } },
    { id: 'bare', input_schema: {} },
  ] as never);
  expect([...support.get('new')!]).toEqual(['tutor_context', 'learner_context']);
  expect(support.get('old')!.size).toBe(0);
  expect(support.get('bare')!.size).toBe(0);
  expect(support.get('missing')).toBeUndefined();
});
