import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { materializeOllLessonWithReport } from '../src/learning/oll/oll-materialization';
import type { AuthoringLesson } from 'octos-lesson-language';

const root = resolve(process.argv[2] ?? '../octos-course-library/courses');
const ids = ['surface-paraboloid-level-sets', 'surface-partial-derivative-slice', 'surface-saddle-point-analysis'];
const reports = ids.map((id, index) => {
  const dir = resolve(root, id);
  const source = JSON.parse(readFileSync(resolve(dir, 'course.authoring.json'), 'utf8')) as AuthoringLesson;
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const lessonId = `${id}-${manifest.version}`;
  const result = materializeOllLessonWithReport(source, { lessonId, boardId: id, baseRevision: 0, regionIntent: 'new_topic', regionId: `${lessonId}-region` });
  const stored = readFileSync(resolve(dir, 'course.oll.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(result.events, stored, `${id}: shared realtime materializer parity`);
  const actions = source.steps.flatMap(step => step.beats).flatMap(beat => beat.actions);
  const tasks = source.lesson.tasks ?? [];
  const writes = actions.filter(action => action.do === 'write');
  if (index === 0) {
    const circle = writes.find(action => action.kind === 'geometry')!;
    assert.equal(circle.content.bindings?.[0]?.expression, 'sqrt(number_01)');
    assert.equal(circle.content.bindings?.[0]?.allow_zero, true);
    assert.deepEqual(actions.filter(action => action.do === 'animate').map(action => action.value), [4, 0]);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].completion.value, 3);
    assert.equal(source.lesson.variables?.[0].initial, 1);
  } else if (index === 1) {
    const plot = writes.find(action => action.kind === 'plot')!;
    assert.equal(plot.content.axes?.y?.label, 'z');
    assert.equal(plot.content.curves?.length, 2);
    assert.equal(plot.content.points, undefined);
    assert.deepEqual(actions.filter(action => action.do === 'animate').map(action => action.value), [1]);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].completion.value, 1);
    assert.equal(source.lesson.variables?.[0].initial, 0);
  } else {
    const scenes = writes.filter(action => action.kind === 'scene3d');
    assert.deepEqual(scenes.map(action => action.content.sections?.[0]?.axis), ['y', 'x']);
    assert.deepEqual(scenes.map(action => action.content.sections?.[0]?.value), [0, 0]);
    assert.equal(tasks.length, 0);
    assert.equal(source.lesson.variables?.length ?? 0, 0);
  }
  for (const task of tasks) assert.equal(task.start?.kind, 'practice');
  const narrations = result.events.flatMap(event => event.step?.beats ?? []).map(beat => beat.narration).filter(Boolean);
  assert.equal(manifest.narration.segments.length, narrations.length);
  narrations.forEach((narration, i) => {
    assert.equal(manifest.narration.segments[i].textSha256, createHash('sha256').update(narration!.text.trim()).digest('hex'));
  });
  const thumbnail = readFileSync(resolve(dir, 'thumbnail.svg'), 'utf8');
  assert.ok(thumbnail.includes('<polyline'));
  assert.ok(!thumbnail.includes('4 × 3 = 12'));
  return { id, version: manifest.version, parity: true, pedagogicalStructure: true, narrationSegments: narrations.length, durationSeconds: manifest.durationSeconds, diagnostics: result.diagnostics };
});
console.log(JSON.stringify(reports, null, 2));
