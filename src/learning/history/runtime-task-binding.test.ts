import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import source from '../oll/fixtures/unit-circle-sine.canonical.jsonl?raw';
import { historySha256 } from './identifiers';

beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

it('freezes task sources from the binding of the render that rebuilt the Runtime, not the previous commit', async () => {
  const { DeviceHistoryQueue } = await import('./device-queue');
  const { LearningHistoryRecorder } = await import('./recorder');
  const { useOllLessonRuntime } = await import('../oll/use-oll-lesson-runtime');
  const queue = new DeviceHistoryQueue();
  const recorder = new LearningHistoryRecorder('session-one', Promise.resolve({ owner: 'alice', token: 'credential' }), queue);
  const [open, ...rest] = source.trimEnd().split('\n');
  // A revised delivery changes lesson.open, so the Runtime is rebuilt for it.
  const revisedOpen = JSON.parse(open);
  revisedOpen.lesson.title = `${revisedOpen.lesson.title}（修订）`;
  const revised = [JSON.stringify(revisedOpen), ...rest].join('\n');
  const binding = (snapshot: string) => {
    const context = { runKey: 'question:q', questionId: 'q', course: { kind: 'generated' as const, id: 'q', version: 'q' }, sourceSnapshotJson: snapshot };
    return { recorder, forStep: () => context, forTask: () => ({ ...context, sourceTaskId: 'reach-sine-maximum' }) };
  };
  const { result, rerender } = renderHook(({ lesson, history }) => useOllLessonRuntime({ source: lesson, storageKey: 'task-binding', history, startAtEnd: true }),
    { initialProps: { lesson: source, history: binding('original') } });
  await waitFor(() => expect(result.current).not.toBeNull());
  const first = result.current!.studentTasks;
  rerender({ lesson: revised, history: binding('revised') });
  await waitFor(() => expect(result.current!.studentTasks).not.toBe(first));
  const taskId = result.current!.studentTasks[0].task_id;
  act(() => { result.current!.requestStudentTaskHint(taskId); });
  await recorder.flush();
  const hints = (await queue.list('alice')).filter(row => row.event.kind === 'task_hint');
  expect(hints).toHaveLength(1);
  expect(hints[0].event.data).toMatchObject({ source_task_id: 'reach-sine-maximum', delivery_sha256: await historySha256('revised') });
});

it('records task progress from the committed Runtime under StrictMode', async () => {
  const { StrictMode, createElement } = await import('react');
  const { DeviceHistoryQueue } = await import('./device-queue');
  const { LearningHistoryRecorder } = await import('./recorder');
  const { useOllLessonRuntime } = await import('../oll/use-oll-lesson-runtime');
  const queue = new DeviceHistoryQueue();
  const recorder = new LearningHistoryRecorder('session-one', Promise.resolve({ owner: 'alice', token: 'credential' }), queue);
  const context = { runKey: 'question:q', questionId: 'q', course: { kind: 'generated' as const, id: 'q', version: 'q' } };
  const history = { recorder, forStep: () => context, forTask: () => ({ ...context, sourceTaskId: 'reach-sine-maximum' }) };
  // StrictMode builds the Runtime twice and commits only one of them.
  const { result } = renderHook(() => useOllLessonRuntime({ source, storageKey: 'task-strict', history, startAtEnd: true }),
    { wrapper: ({ children }) => createElement(StrictMode, null, children) });
  await waitFor(() => expect(result.current).not.toBeNull());
  act(() => { result.current!.requestStudentTaskHint(result.current!.studentTasks[0].task_id); });
  await recorder.flush();
  expect((await queue.list('alice')).filter(row => row.event.kind === 'task_hint')).toHaveLength(1);
});
