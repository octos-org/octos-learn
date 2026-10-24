import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "./store.mjs";
import { dismissSuggestion, querySuggestions } from "./suggestions.mjs";
import { topicStructure } from "./topic-catalog.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

const candidate = TOPIC_MAPPINGS[0];
const approved = [{ ...candidate, status: "approved" }]; // Test content only; no production activation.
const GRAPHS = "mt_WBdHkc2HTf", PLOTTING = "mt_-3udyo6VyB";
const base = (id, run, when) => ({ version: 1, id, occurred_at: when, device_id: "tv", session_id: `board-${run}`, run_id: run, log_id: `log-${run}`, course: candidate.course });
const attempt = (id, run, when, task, hints) => ({ ...base(id, run, when), kind: "task_attempt",
  data: { task_id: task, operation_id: id, result: "succeeded", hints_used: hints, value: 1 } });
const beat = (id, run, when, n) => ({ ...base(id, run, when), kind: "beat_completed",
  data: { step_id: candidate.required_beats[n].split(":beat:")[0], beat_id: candidate.required_beats[n], presentation: "text" } });
let clock = "2026-10-24T02:00:00.000Z";
const open = () => new HistoryStore(":memory:", { now: () => clock });
const query = store => querySuggestions(store, "alice", { utcOffsetMinutes: 480 }, approved).suggestions;
const hardPrerequisites = id => topicStructure().prerequisitesOf(id).filter(edge => edge.strength === "hard").map(edge => edge.prerequisiteId);

test("a topic still being practised suggests another try and one unvisited hard prerequisite", () => {
  const store = open();
  try {
    store.append("alice", [attempt("a1", "r1", "2026-10-22T02:00:00.000Z", "section-03-task-01", 1)]);
    const suggestions = query(store);
    assert.deepEqual(suggestions.map(item => item.type), ["continue", "foundation"]);
    assert.deepEqual([suggestions[0].topic.topic_id, suggestions[0].resume], [GRAPHS, { session_id: "board-r1", run_id: "r1" }]);
    assert.ok(hardPrerequisites(GRAPHS).includes(suggestions[1].target.topic_id));
    assert.equal(suggestions[1].target.strength, "hard");
    assert.match(suggestions[1].target.reason, /\w/);
    assert.deepEqual(querySuggestions(store, "bob", {}, approved).suggestions, []);
  } finally { store.close(); }
});

test("a topic done without hints points onward to an unvisited dependent, never back to its foundations", () => {
  const store = open();
  try {
    store.append("alice", [attempt("a1", "r1", "2026-10-22T02:00:00.000Z", "section-04-task-01", 0), beat("b1", "r1", "2026-10-22T02:05:00.000Z", 0)]);
    const suggestions = query(store);
    const next = suggestions.filter(item => item.type === "next");
    assert.equal(next.length, 1);
    assert.equal(next[0].topic.topic_id, PLOTTING);
    assert.ok(topicStructure().dependentsOf(PLOTTING).some(edge => edge.strength === "hard" && edge.topicId === next[0].target.topic_id));
    assert.ok(suggestions.every(item => item.topic.topic_id !== PLOTTING || item.type !== "foundation"));
    // The explored topic it rests on is recorded, so it is never a foundation target.
    assert.ok(suggestions.every(item => item.target?.topic_id !== GRAPHS));
    assert.ok(suggestions.length <= 3);
  } finally { store.close(); }
});

test("a long gap suggests a revisit by local days; a dismissal hides that suggestion for 14 days", () => {
  const store = open();
  try {
    store.append("alice", [beat("b1", "r1", "2026-10-03T02:00:00.000Z", 3)]);
    const revisit = query(store).find(item => item.type === "revisit");
    assert.deepEqual([revisit.topic.topic_id, revisit.days_away], [GRAPHS, 21]);
    dismissSuggestion(store, "alice", revisit.id);
    assert.equal(query(store).some(item => item.id === revisit.id), false);
    clock = "2026-11-08T03:00:00.000Z";
    assert.equal(query(store).some(item => item.id === revisit.id), true);
  } finally { store.close(); clock = "2026-10-24T02:00:00.000Z"; }
});

test("deleting the lesson removes its suggestions", () => {
  const store = open();
  try {
    store.append("alice", [attempt("a1", "r1", "2026-10-22T02:00:00.000Z", "section-03-task-01", 1)]);
    assert.ok(query(store).length > 0);
    store.deleteRun("alice", "r1");
    assert.deepEqual(query(store), []);
  } finally { store.close(); }
});
