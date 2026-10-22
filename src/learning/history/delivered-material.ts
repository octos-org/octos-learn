import type { CanonicalEvent } from 'octos-lesson-language';
import type { LearningHistoryRecorder } from './recorder';

/** A request can have multiple executions, and a failed execution may already
 * have delivered useful material. Keep its
 * terminal observation separate from those deliveries, without copying errors
 * or provider responses into learning history or Octos dialogue. */
export function recordFailedRequest(recorder: LearningHistoryRecorder | undefined, questionId: string,
  executionId = questionId, status: 'failed' | 'cancelled' = 'failed',
  reason: 'request-error' | 'job-ended' | 'missing-artifact' = 'request-error') {
  recorder?.record({ kind: 'request_failed', runKey: `question:${questionId}`, questionId,
    stableKey: JSON.stringify(['failure', questionId, executionId]), data: { execution_id: executionId, status, reason } });
}

export function historyTextParts(text: string): string[] {
  const parts: string[] = []; let part = ''; let size = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    const bytes = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (size + bytes > 60000) { parts.push(part); part = ''; size = 0; }
    part += character; size += bytes;
  }
  if (part.trim()) parts.push(part);
  return parts;
}
export function recordTeacherText(recorder: LearningHistoryRecorder, questionId: string, key: string, text: string, media: string[] = []) {
  historyTextParts(text).forEach((part, index) => recorder.record({
    kind: 'answer_delivered', runKey: `question:${questionId}`, questionId,
    stableKey: JSON.stringify(['answer', questionId, key, index, part]), data: { text: part, media },
  }));
}
export function recordDeliveredLesson(recorder: LearningHistoryRecorder, questionId: string, artifact: string, events: CanonicalEvent[], snapshotJson = JSON.stringify(events)) {
  const context = { runKey: `question:${questionId}`, questionId, course: { kind: 'generated' as const, id: questionId, version: questionId } };
  const complete = events.some(event => event.event === 'lesson.close');
  recorder.record({ ...context, kind: 'course_delivered', stableKey: JSON.stringify(['course', questionId, artifact, events.length, complete]),
    snapshotJson, data: { artifact, status: complete ? 'complete' : 'partial', event_count: events.length } });
  for (const event of events) {
    if (event.event !== 'lesson.step' || !event.step) continue;
    // The course delivery owns the artifact reference. A streamed part and
    // its completed file can contain the same spoken beat; changing that
    // reference must not change or conflict with the original spoken message.
    for (const beat of event.step.beats) if (beat.narration?.text.trim()) recordTeacherText(recorder, questionId, `narration:${event.lesson_id}:${event.step.id}:${beat.id}`, beat.narration.text);
  }
}
