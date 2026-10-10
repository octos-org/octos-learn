// Measure the installed OLL scheduler with a deterministic clock and real session.
// Usage: node scripts/measure-slider-checkpoint-cadence.mjs <unit-circle.canonical.jsonl> <output.json>
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { BrowserLessonSession, parseCanonicalJsonl } from 'octos-lesson-language/web-runtime';

const [fixture, output] = process.argv.slice(2);
if (!fixture || !output) throw Error('Provide the unit-circle canonical fixture and output JSON');
const events = parseCanonicalJsonl(await readFile(fixture, 'utf8'));
test('observe continuous drag, pause, commit and checkpoint restoration', async context => {
  const epoch = 1_000_000;
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: epoch });
  const values = new Map(), writes = [];
  const store = {
    load: key => structuredClone(values.get(key)),
    save: (key, checkpoint) => {
      values.set(key, structuredClone(checkpoint));
      writes.push({ timeMs: Date.now() - epoch, value: checkpoint.projection.board?.variables?.theta?.value });
    },
    remove: key => values.delete(key),
  };
  const session = new BrowserLessonSession(events, store, 'cadence-probe');
  while (!session.activeVariableAnimation) assert.ok(session.advance());
  writes.length = 0;
  const gesture = session.beginStudentVariableOperation('theta', { control: 'slider', input: 'mouse' });
  // Run beyond 10 seconds and leave a pending latest value for the pause check.
  for (let frame = 1; frame <= 638; frame++) {
    session.updateStudentVariableOperation(gesture, 1 + frame / 1000);
    context.mock.timers.tick(16);
  }
  const duringContinuousDrag = structuredClone(writes);
  assert.ok(duringContinuousDrag.length >= 24 && duringContinuousDrag.length <= 26);
  for (const write of duringContinuousDrag) {
    assert.equal(write.value, 1 + Math.ceil(write.timeMs / 16) / 1000);
  }
  for (let i = 1; i < duringContinuousDrag.length; i++) {
    assert.equal(duringContinuousDrag[i].timeMs - duringContinuousDrag[i - 1].timeMs, 400);
  }
  context.mock.timers.tick(500);
  const afterPause = structuredClone(writes);
  assert.equal(values.get('cadence-probe').projection.board.variables.theta.value, 1.638);
  session.updateStudentVariableOperation(gesture, 2.5);
  session.commitStudentVariableOperation(gesture, 2.5);
  assert.equal(values.get('cadence-probe').projection.board.variables.theta.value, 2.5);
  const restored = new BrowserLessonSession(events, store, 'cadence-probe');
  assert.equal(restored.projection.board.variables.theta.value, 2.5);
  const result = {
    fixture, clock: 'node:test mock Date/setTimeout', frameIntervalMs: 16, dragDurationMs: 10208,
    duringContinuousDrag, afterPause, afterCommit: writes,
    periodic400msObserved: duringContinuousDrag.length >= 24,
    pauseSavesFinalValue: true, commitSavesImmediately: true, restoredValue: 2.5,
  };
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
});
