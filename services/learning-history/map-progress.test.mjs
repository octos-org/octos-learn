import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "./store.mjs";
import { localDay, queryLearningMap, topicState } from "./map-progress.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

const candidate = TOPIC_MAPPINGS[0];
const approved = [{ ...candidate, status: "approved" }]; // Test content only; no production activation.
const at = (day, hour = 8) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const beat = (id, index, { run = "run-1", day = 21 } = {}) => ({ version: 1, id, kind: "beat_completed", occurred_at: at(day), device_id: "tv",
  session_id: `board-${run}`, run_id: run, log_id: `log-${run}`, course: candidate.course,
  data: { step_id: candidate.required_beats[index].split(":beat:")[0], beat_id: candidate.required_beats[index], presentation: "text" } });
// section-02-task-01 belongs to the gradient objective (mt_WBdHkc2HTf).
const attempt = (id, { result = "failed", hints = 0, day = 21, run = "run-1" } = {}) => ({ ...beat(id, 2, { run, day }), kind: "task_attempt",
  data: { task_id: "section-02-task-01", operation_id: id, result, hints_used: hints, value: 1 } });

test("states rise from explored to practising to did-it, and a hinted success stays practising", () => {
  assert.equal(topicState([]), null);
  assert.equal(topicState([beat("b", 2)]), "explored");
  assert.equal(topicState([beat("b", 2), attempt("a")]), "practising");
  assert.equal(topicState([attempt("a", { result: "succeeded", hints: 1 })]), "practising");
  assert.equal(topicState([attempt("a", { result: "succeeded", hints: 1 }), attempt("b", { result: "succeeded" })]), "did-it");
});

test("the map shows only topics with associated facts, from an approved mapping, with evidence the teacher can quote", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [beat("b1", 2), beat("b2", 2, { run: "run-2", day: 23 }), attempt("a1", { result: "succeeded", hints: 1, day: 23, run: "run-2" })]);
    store.append("bob", [attempt("bob-a", { result: "succeeded" })]);
    // A pending mapping counts nothing: the map stays empty instead of guessing.
    assert.deepEqual(queryLearningMap(store, "alice").topics, []);
    const map = queryLearningMap(store, "alice", {}, approved);
    assert.equal(map.rules_version, "map-states-v1");
    assert.equal(map.taxonomy.commit, "c7ed549758d9fb430c4af54886c658e78162a0b1");
    const slope = map.topics.find(topic => topic.topic_id === "mt_WBdHkc2HTf");
    assert.equal(slope.state, "practising");
    assert.equal(slope.subject, "Mathematics");
    assert.deepEqual(slope.evidence, { played_beats: 2, runs: 2, task_attempts: 1, unassisted_successes: 0, assisted_successes: 1,
      days: ["2026-10-21", "2026-10-23"], first_at: at(21), last_at: at(23) });
    // mt_-3udyo6VyB has mapped beats in section 4 only; none were played.
    assert.equal(map.topics.some(topic => topic.topic_id === "mt_-3udyo6VyB"), false);
    store.append("alice", [attempt("a2", { result: "succeeded", day: 24, run: "run-3" })]);
    assert.equal(queryLearningMap(store, "alice", {}, approved).topics.find(topic => topic.topic_id === "mt_WBdHkc2HTf").state, "did-it");
    assert.equal(queryLearningMap(store, "bob", {}, approved).topics[0].evidence.unassisted_successes, 1);
  } finally { store.close(); }
});

test("days follow the learner's local calendar", () => {
  assert.equal(localDay("2026-10-21T17:30:00.000Z", 480), "2026-10-22");
  assert.equal(localDay("2026-10-21T17:30:00.000Z", 0), "2026-10-21");
});
