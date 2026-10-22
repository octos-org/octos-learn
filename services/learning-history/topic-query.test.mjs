import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore, HistorySnapshotChanged } from "./store.mjs";
import { queryTopic, queryRunCoverage } from "./topic-query.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";
const candidate = TOPIC_MAPPINGS[0];
const approvedFixture = [{ ...candidate, status: "approved" }]; // Test content only; no production activation.
const beat = (id, index, run = "run-1", course = candidate.course) => ({ version: 1, id, kind: "beat_completed", occurred_at: "2026-10-21T08:00:00.000Z", device_id: "tv", session_id: `board-${run}`, run_id: run, log_id: `log-${run}`, course,
  data: { step_id: candidate.required_beats[index].split(":beat:")[0], beat_id: candidate.required_beats[index], presentation: "text" } });

test("pending editorial mapping never produces zero-looking progress or knowledge evidence", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [beat("b1", 2)]);
    const result = queryTopic(store, "alice", "mt_WBdHkc2HTf");
    assert.equal(result.status, "pending-review"); assert.equal(result.objectives[0].counts, null); assert.deepEqual(result.events, []);
    assert.equal(queryRunCoverage(store, "alice", "run-1").course_playback, null);
    assert.equal(queryTopic(store, "alice", "unknown").status, "unmapped");
  } finally { store.close(); }
});

test("exact course mapping counts distinct observed runs and beats, never skipped intercept or unrelated questions", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [beat("a1", 2), beat("a2", 2), beat("b1", 2, "run-2"), beat("wrong-hash", 7, "wrong", { ...candidate.course, sha256: "b".repeat(64) })]);
    store.append("bob", [beat("bob", 7)]);
    store.append("alice", [{ ...beat("question", 2), kind: "question_submitted", question_id: "q1", data: { text: "这块白板上另一个问题", modality: "text" } }]);
    const result = queryTopic(store, "alice", "mt_WBdHkc2HTf", { limit: 1 }, approvedFixture);
    const gradient = result.objectives.find(item => item.objective_key === "gradient-direction-and-steepness");
    assert.deepEqual(gradient.counts, { played_runs: 2, played_beats: 2, task_attempts: 0, hints: 0, question_count: null });
    assert.equal(result.objectives.find(item => item.objective_key === "vertical-intercept").counts.played_runs, 0);
    assert.equal(result.events.length, 1); assert.notEqual(result.next_after, null);
    store.append("alice", [beat("late", 7)]);
    const page2 = queryTopic(store, "alice", "mt_WBdHkc2HTf", { after: result.next_after, through: result.through }, approvedFixture);
    assert.equal(page2.events.length, 2); assert.equal(page2.events.some(row => row.event.id === "late"), false);
    const coverage = queryRunCoverage(store, "alice", "run-1", { through: result.through }, approvedFixture);
    assert.deepEqual(coverage.course_playback, { required_beats: 13, played_beats: 1, complete: false });
    assert.equal(queryRunCoverage(store, "alice", "wrong", {}, approvedFixture).status, "unmapped");
    store.deleteRun("alice", "run-1");
    assert.throws(() => queryTopic(store, "alice", "mt_WBdHkc2HTf", { through: result.through }, approvedFixture), HistorySnapshotChanged);
    assert.equal(queryTopic(store, "alice", "mt_WBdHkc2HTf", {}, approvedFixture).objectives[1].counts.played_runs, 1);
  } finally { store.close(); }
});

test("course completion needs every required beat; task attempts, hints and UTC time ranges remain separate", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", candidate.required_beats.map((_, i) => beat(`beat-${i}`, i)));
    const attempt = { ...beat("attempt", 7), kind: "task_attempt", data: { task_id: "section-03-task-01", operation_id: "op1", result: "succeeded", hints_used: 1, value: 1 } };
    const hint = { ...beat("hint", 7), kind: "task_hint", data: { task_id: "section-03-task-01", hint_index: 1 } };
    store.append("alice", [attempt, hint]); store.append("alice", [attempt, hint]);
    assert.equal(queryRunCoverage(store, "alice", "run-1", {}, approvedFixture).course_playback.complete, true);
    const result = queryTopic(store, "alice", "mt_WBdHkc2HTf", {}, approvedFixture);
    assert.equal(result.objectives[2].counts.task_attempts, 1); assert.equal(result.objectives[2].counts.hints, 1);
    const filtered = queryTopic(store, "alice", "mt_WBdHkc2HTf", { from: "2026-10-22T00:00:00.000Z" }, approvedFixture);
    assert.equal(filtered.objectives[2].counts.played_runs, 0); assert.equal(filtered.events.length, 0);
  } finally { store.close(); }
});
