import assert from 'node:assert/strict';
import { sha256 } from './learning-performance-control.mjs';

/** Use the same materializer and artifact identity as the full frontend.
 * No model is called. A mismatched or narration-only prefix is inconclusive,
 * rather than allowing an unrelated old node to qualify as the new lesson.
 */
export function firstPlayableTarget(authoring, { filename, sessionId, materializeOllLesson, ollArtifactIdentity }) {
  const identity = ollArtifactIdentity({ filename });
  const events = materializeOllLesson(authoring, {
    lessonId: `learn-${sessionId}-${identity}`, boardId: `learning-board-${sessionId}`,
    baseRevision: authoring.board_context?.revision ?? 0,
    regionIntent: authoring.board_context ? 'continue_topic' : 'new_topic', regionId: `topic-${identity}`,
  });
  const nodeIds = [];
  for (const event of events) {
    if (event.event !== 'lesson.step') continue;
    for (const beat of event.step.beats) {
      for (const action of [...(beat.stage?.before_speech ?? []), ...(beat.stage?.during_speech ?? [])]) {
        if (action.op === 'board.create' && action.node?.id) nodeIds.push(action.node.id);
      }
      if (beat.narration?.text?.trim()) {
        assert.ok(nodeIds.length, 'First narrated prefix has no own course node; sample cannot establish paired audio and visual readiness');
        return { nodeIds: [...new Set(nodeIds)], narrationText: beat.narration.text.trim(), beatId: beat.id, artifactSha256: sha256(JSON.stringify(authoring)) };
      }
    }
  }
  throw Error('First delivered prefix has no narrated beat');
}
