import { webcrypto } from 'node:crypto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserLessonSession, parseCanonicalJsonl } from 'octos-lesson-language/web-runtime';
import source from '../oll/fixtures/unit-circle-sine.canonical.jsonl?raw';
import { historySha256 } from './identifiers';

beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function classroom() {
  const { DeviceHistoryQueue } = await import('./device-queue');
  const { LearningHistoryRecorder } = await import('./recorder');
  const { PlaybackHistoryCapture } = await import('./playback-recorder');
  const { createIndexedPlaybackStore } = await import('../learning-document-store');
  const queue = new DeviceHistoryQueue();
  const recorder = new LearningHistoryRecorder('session-one', Promise.resolve({ owner: 'alice', token: 'credential' }), queue);
  const context = { runKey: 'course-one', course: { kind: 'generated' as const, id: 'unit-circle', version: 'one' } };
  const capture = new PlaybackHistoryCapture('recorded', { recorder, forStep: () => context, forTask: () => context });
  const store = await createIndexedPlaybackStore('recorded', { onWrite: capture.write });
  const runtime = new BrowserLessonSession(parseCanonicalJsonl(source), store, 'recorded', { reducedMotion: true });
  capture.bind(runtime);
  return { queue, recorder, runtime, store, capture, context, createIndexedPlaybackStore, LearningHistoryRecorder, PlaybackHistoryCapture };
}
it('exports completed coverage from timed playback with its saved checkpoint, not from restoring an end position', async () => {
  const c = await classroom();
  vi.useFakeTimers(); c.runtime.play(); vi.runAllTimers(); vi.useRealTimers();
  await c.recorder.flush();
  const rows = await c.queue.list('alice');
  expect(rows.filter(row => row.event.kind === 'beat_completed')).toHaveLength(c.runtime.outline.flatMap(step => step.beats).length);
  expect(rows.filter(row => row.event.kind === 'run_started')).toHaveLength(1);
  const restoredStore = await c.createIndexedPlaybackStore('recorded');
  const restored = new BrowserLessonSession(parseCanonicalJsonl(source), restoredStore, 'recorded');
  expect(restored.projection.cursor).toBe(c.runtime.projection.cursor);
  const before = rows.length;
  restored.pause();
  expect(await c.queue.list('alice')).toHaveLength(before);
});
it('seeking, viewing and manual next-beat movement never become completed coverage', async () => {
  const c = await classroom();
  c.runtime.advanceBeat(); c.runtime.seekToStep(c.runtime.outline.at(-1)!.id, 'end');
  await c.recorder.flush();
  const rows = await c.queue.list('alice');
  expect(rows.filter(row => row.event.kind === 'beat_completed')).toHaveLength(0);
  expect(rows.filter(row => row.event.kind === 'run_started')).toHaveLength(0);
});
it('pins a completed beat to the delivery present at its beginning, across a streamed course update', async () => {
  const c = await classroom();
  const original = JSON.stringify(parseCanonicalJsonl(source));
  const revised = `${original} `;
  let sourceSnapshotJson = original;
  const binding = () => ({ recorder: c.recorder, forStep: () => ({ ...c.context, sourceSnapshotJson }), forTask: () => c.context });
  c.capture.updateBinding(binding());
  vi.useFakeTimers(); c.runtime.play();
  // Observe a genuine beat.begin before updating the delivered material.
  for (let n = 0; n < 200 && c.runtime.currentOperation?.type !== 'beat.begin'; n++) vi.advanceTimersToNextTimer();
  expect(c.runtime.currentOperation?.type).toBe('beat.begin');
  sourceSnapshotJson = revised; c.capture.updateBinding(binding());
  vi.runAllTimers(); vi.useRealTimers(); await c.recorder.flush();
  const rows = (await c.queue.list('alice')).filter(row => row.event.kind === 'beat_completed');
  expect(rows).toHaveLength(1);
  expect(rows[0].event.data.delivery_sha256).toBe(await historySha256(original));
  c.capture.withReason('seek', () => c.runtime.reset());
  vi.useFakeTimers(); c.runtime.play(); vi.runAllTimers(); vi.useRealTimers(); await c.recorder.flush();
  const replayed = (await c.queue.list('alice')).filter(row => row.event.kind === 'beat_completed');
  expect(replayed).toHaveLength(2);
  expect(replayed.map(row => row.event.data.delivery_sha256)).toEqual(expect.arrayContaining([await historySha256(original), await historySha256(revised)]));
});
it('saves a review reconstruction without exporting a position for every restored operation', async () => {
  const c = await classroom();
  c.capture.withReason('restore', () => {
    c.runtime.pause();
    while (c.runtime.advance()) { /* Rebuild the whole review board as the hook does. */ }
  });
  await c.recorder.flush();
  const rows = await c.queue.list('alice');
  expect(rows.filter(row => row.event.kind === 'playback_position')).toHaveLength(0);
  expect(rows.filter(row => row.event.kind === 'beat_completed')).toHaveLength(0);
  const restoredStore = await c.createIndexedPlaybackStore('recorded');
  expect(restoredStore.load('recorded')?.cursor).toBe(c.runtime.projection.cursor);
});
it('records one final position for a multi-operation skip and none for a task-only checkpoint', async () => {
  const c = await classroom();
  c.capture.withReason('skip', () => c.runtime.advanceBeat());
  await c.recorder.flush();
  const positions = (await c.queue.list('alice')).filter(row => row.event.kind === 'playback_position');
  expect(positions).toHaveLength(1);
  expect(positions[0].event.data).toMatchObject({ reason: 'skip', cursor: c.runtime.projection.cursor });
  c.capture.withReason('restore', () => c.runtime.seek(c.runtime.projection.total_operations));
  c.runtime.requestStudentTaskHint(c.runtime.studentTasks[0].task_id);
  const operation = c.runtime.beginStudentVariableOperation('theta', { control: 'slider', input: 'mouse' });
  c.runtime.commitStudentVariableOperation(operation, Math.PI / 2);
  await c.recorder.flush();
  expect((await c.queue.list('alice')).filter(row => row.event.kind === 'playback_position')).toHaveLength(1);
  expect((await c.queue.list('alice')).filter(row => row.event.kind === 'task_attempt')).toHaveLength(1);
});
it('keeps the first start fact when a reopened learning instance is played again', async () => {
  const c = await classroom();
  vi.useFakeTimers(); c.runtime.play(); vi.runAllTimers(); vi.useRealTimers();
  await c.recorder.flush();
  const before = (await c.queue.list('alice')).find(row => row.event.kind === 'run_started')!;
  const recorder = new c.LearningHistoryRecorder('session-one', Promise.resolve({ owner: 'alice', token: 'credential' }), c.queue);
  const capture = new c.PlaybackHistoryCapture('recorded', { recorder, forStep: () => c.context, forTask: () => c.context });
  const adapter = await c.createIndexedPlaybackStore('recorded', { onWrite: capture.write });
  const reopened = new BrowserLessonSession(parseCanonicalJsonl(source), adapter, 'recorded', { reducedMotion: true });
  capture.bind(reopened);
  capture.withReason('seek', () => reopened.reset());
  vi.useFakeTimers(); reopened.play(); vi.runAllTimers(); vi.useRealTimers();
  await recorder.flush();
  expect((await c.queue.list('alice')).filter(row => row.event.kind === 'run_started')).toEqual([before]);
});
it('records actual attempts and hints, atomically saves their logs, and does not import old attempts after refresh', async () => {
  const c = await classroom();
  c.runtime.seek(c.runtime.projection.total_operations);
  const task = c.runtime.studentTasks[0];
  c.runtime.requestStudentTaskHint(task.task_id);
  const id = c.runtime.beginStudentVariableOperation('theta', { control: 'slider', input: 'mouse' });
  c.runtime.commitStudentVariableOperation(id, Math.PI / 2);
  await c.recorder.flush();
  const rows = await c.queue.list('alice');
  const attempts = rows.filter(row => row.event.kind === 'task_attempt');
  expect(attempts).toHaveLength(1);
  expect(attempts[0].event.data).toMatchObject({ hints_used: 1, result: 'succeeded', operation_id: id });
  expect(rows.filter(row => row.event.kind === 'task_hint')).toHaveLength(1);
  const recorder = new c.LearningHistoryRecorder('session-one', Promise.resolve({ owner: 'alice', token: 'credential' }), c.queue);
  const capture = new c.PlaybackHistoryCapture('recorded', { recorder, forStep: () => c.context, forTask: () => c.context });
  const adapter = await c.createIndexedPlaybackStore('recorded', { onWrite: capture.write });
  const reopened = new BrowserLessonSession(parseCanonicalJsonl(source), adapter, 'recorded');
  capture.bind(reopened); reopened.pause(); await recorder.flush();
  expect(reopened.studentTasks[0].attempts).toHaveLength(1);
  expect((await c.queue.list('alice')).filter(row => row.event.kind === 'task_attempt')).toHaveLength(1);
});
it('a failed local commit holds newer checkpoints and facts for retry without claiming saved progress', async () => {
  const c = await classroom();
  const put = IDBObjectStore.prototype.put;
  const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (this.name === 'documents') throw new DOMException('quota', 'QuotaExceededError');
    return put.apply(this, args);
  });
  c.runtime.seek(c.runtime.projection.total_operations);
  await expect(c.recorder.flush()).rejects.toThrow('尚未保存');
  expect(c.recorder.getSnapshot().pendingWrites).toBeGreaterThan(0);
  expect(await c.queue.list('alice')).toHaveLength(0);
  const old = await c.createIndexedPlaybackStore('recorded');
  expect(old.load('recorded')).toBeUndefined();
  failure.mockRestore(); await c.recorder.retry();
  expect(c.recorder.getSnapshot()).toEqual({ pendingWrites: 0, error: '' });
  const saved = await c.createIndexedPlaybackStore('recorded');
  expect(saved.load('recorded')?.cursor).toBe(c.runtime.projection.cursor);
});
it('stable delivery fragments keep their original event and time when a file is restored again', async () => {
  const c = await classroom();
  const draft = { ...c.context, questionId: 'q-one', kind: 'answer_delivered' as const, stableKey: 'answer:original:part-one', data: { text: '原来的旁白' } };
  c.recorder.record(draft); await c.recorder.flush();
  const first = (await c.queue.list('alice'))[0].event;
  c.recorder.record({ ...draft, occurredAt: '2026-10-21T03:00:00.000Z' }); await c.recorder.flush();
  expect((await c.queue.list('alice')).map(row => row.event)).toEqual([first]);
});
it('offline ownership is recovered only for the previously verified credential and never for a newly selected account', async () => {
  const { DeviceHistoryQueue } = await import('./device-queue'); const queue = new DeviceHistoryQueue();
  const { resolveHistoryIdentity } = await import('./synchronize');
  expect(await resolveHistoryIdentity('', 'credential-a', queue, vi.fn(async () => Response.json({ profile: { id: 'alice' } })))).toEqual({ owner: 'alice', token: 'credential-a' });
  const offline = vi.fn(async () => { throw new TypeError('offline'); });
  localStorage.setItem('selected_profile', 'bob');
  expect(await resolveHistoryIdentity('', 'credential-a', queue, offline)).toEqual({ owner: 'alice', token: 'credential-a' });
  await expect(resolveHistoryIdentity('', 'credential-b', queue, offline)).rejects.toThrow('offline');
  await expect(resolveHistoryIdentity('', 'credential-a', queue, vi.fn(async () => new Response(null, { status: 401 })))).rejects.toThrow('登录');
});
it('a fresh course instance starts with fresh practice, while reopening the original retains its own work', async () => {
  const c = await classroom();
  c.runtime.seek(c.runtime.projection.total_operations);
  c.runtime.requestStudentTaskHint(c.runtime.studentTasks[0].task_id);
  const operation = c.runtime.beginStudentVariableOperation('theta', { control: 'slider', input: 'mouse' });
  c.runtime.commitStudentVariableOperation(operation, Math.PI / 2);
  await c.recorder.flush();
  const { createCoursePackLearningInstance } = await import('../learning-session-store');
  const pack = { packId: 'slope-and-intercept', version: '0.1.8', archiveSha256: 'a'.repeat(64) };
  const first = createCoursePackLearningInstance(pack, '重新学习');
  const second = createCoursePackLearningInstance(pack, '重新学习');
  expect(first.id).not.toBe(second.id);
  const freshStore = await c.createIndexedPlaybackStore(`instance:${second.id}`);
  const fresh = new BrowserLessonSession(parseCanonicalJsonl(source), freshStore, `instance:${second.id}`);
  fresh.seek(fresh.projection.total_operations);
  expect(fresh.studentTasks[0].attempts).toHaveLength(0);
  expect(fresh.studentTasks[0].hints_revealed).toBe(0);
  const old = new BrowserLessonSession(parseCanonicalJsonl(source), await c.createIndexedPlaybackStore('recorded'), 'recorded');
  expect(old.studentTasks[0].attempts[0].succeeded).toBe(true);
  expect(old.studentTasks[0].hints_revealed).toBe(1);
});
it('pins delivered generated content even if the same artifact later has different content with the same event count', async () => {
  const c = await classroom();
  const { recordDeliveredLesson } = await import('./delivered-material');
  const first = parseCanonicalJsonl(source);
  recordDeliveredLesson(c.recorder, 'q-generated', 'lesson.jsonl', first);
  await c.recorder.flush();
  const revised = structuredClone(first);
  const step = revised.find(event => event.event === 'lesson.step')!;
  step.step!.beats[0].narration!.text = 'Actual revised narration';
  recordDeliveredLesson(c.recorder, 'q-generated', 'lesson.jsonl', revised);
  await c.recorder.flush();
  const deliveries = (await c.queue.list('alice')).filter(row => row.event.kind === 'course_delivered');
  expect(deliveries).toHaveLength(2);
  expect(deliveries[0].event.id).not.toBe(deliveries[1].event.id);
  expect(deliveries[0].event.data.snapshot_sha256).not.toBe(deliveries[1].event.data.snapshot_sha256);
  expect(deliveries.map(row => row.snapshotJson).sort()).toEqual([JSON.stringify(first), JSON.stringify(revised)].sort());
  expect(deliveries[0].event.data.event_count).toBe(first.length);
  recordDeliveredLesson(c.recorder, 'q-generated', 'lesson.jsonl', revised); await c.recorder.flush();
  expect((await c.queue.list('alice')).filter(row => row.event.kind === 'course_delivered')).toHaveLength(2);
});
it('captures durable playback on older Android WebViews without crypto.randomUUID', async () => {
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: webcrypto.subtle });
  const c = await classroom();
  vi.useFakeTimers(); c.runtime.play(); vi.runAllTimers(); vi.useRealTimers();
  await c.recorder.flush();
  const rows = await c.queue.list('alice');
  expect(rows.some(row => row.event.kind === 'beat_completed')).toBe(true);
  expect(rows.every(row => /^[a-f0-9-]{36}$/.test(row.event.device_id))).toBe(true);
});
it('retains streamed and final course references without duplicating or conflicting on unchanged teacher narration', async () => {
  const c = await classroom();
  const { recordDeliveredLesson } = await import('./delivered-material');
  const full = parseCanonicalJsonl(source);
  const firstStepIndex = full.findIndex(event => event.event === 'lesson.step');
  const partial = full.slice(0, firstStepIndex + 1);
  const spoken = partial[firstStepIndex].step!.beats[0].narration!.text;
  recordDeliveredLesson(c.recorder, 'q-streamed', 'lesson.part-01.oll.jsonl', partial);
  await c.recorder.flush();
  recordDeliveredLesson(c.recorder, 'q-streamed', 'lesson.oll.jsonl', full);
  await c.recorder.flush();
  expect(c.recorder.getSnapshot().error).toBe('');
  const rows = await c.queue.list('alice');
  expect(rows.filter(row => row.event.kind === 'answer_delivered' && row.event.data.text === spoken)).toHaveLength(1);
  expect(rows.filter(row => row.event.kind === 'course_delivered').map(row => row.event.data.artifact).sort()).toEqual(['lesson.oll.jsonl', 'lesson.part-01.oll.jsonl']);
});


it('durably deduplicates request failure callbacks and keeps delivered content as separate evidence', async () => {
  const c = await classroom();
  const { recordDeliveredLesson, recordFailedRequest } = await import('./delivered-material');
  const partial = parseCanonicalJsonl(source).filter(event => event.event !== 'lesson.close');
  recordDeliveredLesson(c.recorder, 'q-partial', 'part.jsonl', partial);
  recordFailedRequest(c.recorder, 'q-partial', 'job-one');
  recordFailedRequest(c.recorder, 'q-partial', 'job-one');
  recordFailedRequest(c.recorder, 'q-partial', 'job-two', 'cancelled', 'job-ended');
  await c.recorder.flush();
  const reopened = new (await import('./device-queue')).DeviceHistoryQueue();
  const rows = await reopened.list('alice');
  const failures = rows.filter(row => row.event.kind === 'request_failed');
  expect(failures).toHaveLength(2);
  expect(failures[0].event.data).toEqual({ execution_id: 'job-one', status: 'failed', reason: 'request-error' });
  expect(failures[1].event.data.status).toBe('cancelled');
  expect(rows.filter(row => row.event.kind === 'course_delivered' && row.event.data.status === 'partial')).toHaveLength(1);
  expect(failures.every(row => row.event.question_id === 'q-partial')).toBe(true);
});


it('pins attempts and hints to the task definition bound to the Runtime, including across later delivery changes', async () => {
  const c = await classroom();
  const original = JSON.stringify(parseCanonicalJsonl(source)), later = original + ' ';
  let sourceSnapshotJson = original;
  const binding = () => ({ recorder: c.recorder, forStep: () => c.context,
    forTask: () => ({ ...c.context, questionId: 'task-question', sourceSnapshotJson, sourceTaskId: 'reach-sine-maximum' }) });
  c.capture.updateBinding(binding()); c.capture.bind(c.runtime);
  c.capture.withReason('restore', () => c.runtime.seek(c.runtime.projection.total_operations));
  const operation = c.runtime.beginStudentVariableOperation('theta', { control: 'slider', input: 'mouse' });
  sourceSnapshotJson = later; c.capture.updateBinding(binding());
  c.runtime.requestStudentTaskHint(c.runtime.studentTasks[0].task_id);
  c.runtime.commitStudentVariableOperation(operation, Math.PI / 2);
  await c.recorder.flush();
  const tasks = (await c.queue.list('alice')).filter(row => ['task_attempt', 'task_hint'].includes(row.event.kind));
  expect(tasks).toHaveLength(2);
  expect(tasks.every(row => row.event.data.delivery_sha256 === undefined || row.event.data.delivery_sha256 === '')).toBe(false);
  for (const row of tasks) expect(row.event.data).toMatchObject({ source_task_id: 'reach-sine-maximum', delivery_sha256: await historySha256(original) });
});
