import assert from 'node:assert/strict';
import { analysisHash } from '../../services/learning-history/topic-analysis.mjs';

// Expectations stay in the trial report; never send them to the model.
export function stageTopicCase(store, owner, sample) {
  const common = { version: 1, id: sample.id, device_id: 'topic-accuracy-trial', session_id: 'learn-topic-accuracy-trial',
    occurred_at: '2026-10-22T00:00:00.000Z', question_id: 'trial-question', run_id: `trial-${sample.id}` };
  if (sample.kind === 'question') {
    store.append(owner, [{ ...common, question_id: sample.id, kind: 'question_submitted', data: { text: sample.text, modality: sample.modality } }]);
  } else {
    const versions = sample.id.startsWith('course-version-');
    common.question_id = versions ? 'trial-course-versions' : `trial-${sample.id}`;
    common.run_id = versions ? 'trial-course-versions' : `trial-${sample.id}`;
    const snapshot = JSON.stringify(sample.events);
    const appended = store.append(owner, [{ ...common, kind: 'course_delivered', course: { kind: 'generated', id: common.question_id, version: 'one' },
      data: { artifact: 'fixed-trial.jsonl', status: 'partial', snapshot_sha256: analysisHash(snapshot), event_count: sample.events.length } }],
    [{ event_id: sample.id, snapshot_json: snapshot }]);
    assert.equal(appended.results[0].status, 'accepted', 'Fixed source must belong to its original question/run');
  }
}

export function inspectTopicCandidate(sample, result) {
  const issues = [];
  for (const [unitId, expected] of Object.entries(sample.expectations)) {
    const actual = result?.units?.find(unit => unit.unit_id === unitId);
    if (!actual || actual.status !== expected.status) { issues.push({ unit_id: unitId, issue: 'status-does-not-match-predeclared-expectation' }); continue; }
    if (actual.status === 'mapped') {
      const ids = actual.topics.map(topic => topic.topic_id);
      if (!ids.length || ids.some(id => !expected.acceptable_topics.includes(id))) issues.push({ unit_id: unitId, issue: 'topic-needs-manual-scope-review' });
    }
  }
  // Matching the predeclared IDs is not a semantic review of the quotations.
  return { expectation_issues: issues, human_review_required: true, semantic_pass: null };
}

// Save raw terminal output before the product validates and purges its private
// namespace. Only transcript fields needed to judge the answer are retained;
// never copy RPC authorization, profile config or model reasoning metadata.
export function retainTopicTrialOutput(row, sessionId, page) {
  if (!row || !sessionId?.includes('#peer-') || !page.turns?.some(turn => ['completed', 'errored', 'interrupted'].includes(turn.state))) return false;
  row.octos_observation = { session_id: sessionId,
    turns: page.turns.map(turn => ({ turn_id: turn.turn_id, state: turn.state })),
    messages: (page.messages ?? []).map(message => ({ role: message.role, content: message.content,
      ...(message.turn_id ? { turn_id: message.turn_id } : {}) })) };
  return true;
}

export function requireAllStagedJobs(store, owner, sample) {
  const job = store.db.prepare('SELECT id,input_json FROM topic_analysis_jobs WHERE owner=? AND source_event_id=?').get(owner, sample.id);
  assert.ok(job, 'Fixed trial source did not create its analysis job'); return job;
}

export function stageObservedTrialPlayback(store, owner) {
  for (const [sourceId, beatId] of [['course-supplement', 'direction'], ['course-version-a', 'same-beat']]) {
    const source = JSON.parse(store.db.prepare('SELECT body FROM events WHERE owner=? AND event_id=?').get(owner, sourceId).body);
    store.append(owner, [{ ...source, id: `played-${sourceId}`, kind: 'beat_completed', log_id: 'trial-playback-log',
      data: { step_id: 'step-one', beat_id: beatId, presentation: 'text', delivery_sha256: source.data.snapshot_sha256 } }]);
  }
}
