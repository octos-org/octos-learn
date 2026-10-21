import type { CanonicalEvent } from 'octos-lesson-language';
import type { LearningHistoryRecorder } from './recorder';

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
export function recordDeliveredLesson(recorder: LearningHistoryRecorder, questionId: string, artifact: string, events: CanonicalEvent[]) {
  const context = { runKey: `question:${questionId}`, questionId, course: { kind: 'generated' as const, id: questionId, version: questionId } };
  const complete = events.some(event => event.event === 'lesson.close');
  recorder.record({ ...context, kind: 'course_delivered', stableKey: JSON.stringify(['course', questionId, artifact, events.length, complete]),
    data: { artifact, status: complete ? 'complete' : 'partial' } });
  for (const event of events) {
    if (event.event !== 'lesson.step' || !event.step) continue;
    for (const beat of event.step.beats) if (beat.narration?.text.trim()) recordTeacherText(recorder, questionId, `narration:${event.lesson_id}:${event.step.id}:${beat.id}`, beat.narration.text, [artifact]);
  }
}
