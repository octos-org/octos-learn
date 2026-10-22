import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore, HistorySnapshotChanged } from "./store.mjs";
import { TopicAnalysisStore } from "./topic-analysis-store.mjs";
import { buildAnalysisInput, validateAnalysisResult, analysisHash } from "./topic-analysis.mjs";
import { topicCatalog, TOPIC_TAXONOMY } from "./topic-catalog.mjs";
import { parseTopicAnalysisResponse } from "./topic-analysis-response.mjs";
import { queryTopic } from "./topic-query.mjs";

const slope = "mt_WBdHkc2HTf", plotting = "mt_-3udyo6VyB";
const question = (id, text = "斜率为什么会改变直线的方向？") => ({ version: 1, id, kind: "question_submitted", occurred_at: "2026-10-22T00:00:00.000Z", device_id: "fixture", session_id: "board", question_id: id, run_id: `run-${id}`, data: { text, modality: "text" } });
const snapshot = text => JSON.stringify([{ event: "lesson.step", lesson_id: "test", step: { id: "step-one", beats: [{ id: "beat-one", narration: { text } }] } }]);
const course = (id, q, json) => ({ ...q, id, kind: "course_delivered", course: { kind: "generated", id: q.question_id, version: q.question_id }, data: { artifact: "same.jsonl", status: "partial", snapshot_sha256: analysisHash(json), event_count: 1 } });
const execution = { session_id: `learn-topic-${"a".repeat(32)}#peer-topics-test`, turn_id: "12345678-1234-4234-8234-123456789abc" };
const mapped = (input, topic = slope) => ({ schema: 1, input_sha256: input.input_sha256, units: input.units.map(unit => ({ unit_id: unit.unit_id, status: "mapped", topics: [{ topic_id: topic, quote: unit.content.includes("斜率") ? "斜率" : unit.content.slice(0, 12) }], reason: "Fixture association for mechanical verification" })) });
const finish = (analysis, task, result) => {
  assert.equal(analysis.execution("alice", task.id, task.lease_id, execution).recorded, true);
  assert.equal(analysis.complete("alice", task.id, task.lease_id, result).recorded, true);
};

test("pinned catalog provides scoped definitions, and lexical lookup never becomes a semantic or Chinese-keyword classifier", () => {
  const catalog = topicCatalog();
  assert.equal(TOPIC_TAXONOMY.topic_count, 529);
  assert.equal(catalog.read([slope])[0].name, "Linear Function Graphs");
  assert.ok(catalog.search("linear gradient intercept", 12).some(item => item.id === slope));
  assert.deepEqual(catalog.search("斜率"), []);
  assert.deepEqual(catalog.read(["invented"]), []);
  assert.throws(() => catalog.search("linear", 100));
});

test("question input excludes the generated explanation; unknown, missing media and unverified claims cannot turn into counts", () => {
  const store = new HistoryStore(":memory:");
  try {
    const q = question("q1"), json = snapshot("补充讲解：纵截距是直线与纵轴的交点。");
    store.append("alice", [q, course("course", q, json)], [{ event_id: "course", snapshot_json: json }]);
    const input = buildAnalysisInput(store, "alice", q.id);
    assert.ok(!JSON.stringify(input).includes("纵截距是"));
    const result = mapped(input);
    assert.deepEqual(validateAnalysisResult(input, result), result);
    const unknown = { ...result, units: [{ unit_id: "question", status: "unknown", topics: [], reason: "Missing explicit context" }] };
    assert.equal(validateAnalysisResult(input, unknown).units[0].status, "unknown");
    for (const bad of [
      { ...result, input_sha256: "0".repeat(64) },
      { ...result, units: [] },
      { ...result, mastered: true },
      { ...result, units: [{ ...result.units[0], confidence: 1 }] },
      { ...result, units: [{ ...result.units[0], topics: [{ topic_id: "not-in-taxonomy", quote: "斜率" }] }] },
      { ...result, units: [{ ...result.units[0], topics: [{ topic_id: slope, quote: "不存在的原文" }] }] },
    ]) assert.throws(() => validateAnalysisResult(input, bad));
    const image = { ...question("image"), data: { text: "这张图是什么意思？", modality: "image", media: ["uploads/image.png"] } };
    store.append("alice", [image]);
    const imageInput = buildAnalysisInput(store, "alice", image.id);
    assert.throws(() => validateAnalysisResult(imageInput, mapped(imageInput)));
    assert.throws(() => buildAnalysisInput(store, "bob", q.id));
  } finally { store.close(); }
});

test("default-off queue is idempotent, account scoped, reconciles expired executions, and does not refund reservations when facts are deleted", () => {
  let clock = "2026-10-22T00:00:00.000Z";
  const store = new HistoryStore(":memory:", { now: () => clock });
  try {
    const analysis = new TopicAnalysisStore(store), q = question("first");
    store.append("alice", [q]); store.append("alice", [q]);
    assert.equal(analysis.claim("alice").reason, "disabled");
    assert.deepEqual(analysis.status("bob").states, []);
    assert.equal(analysis.status("alice").states[0].count, 1);
    analysis.configure("alice", { enabled: true, max_daily_tasks: 1 });
    let task = analysis.claim("alice").tasks[0];
    assert.equal(task.execution, null);
    assert.equal(analysis.claim("alice").reason, "active-task");
    assert.equal(analysis.execution("bob", task.id, task.lease_id, execution).recorded, false);
    assert.equal(analysis.execution("alice", task.id, task.lease_id, execution).recorded, true);
    const oldLease = task.lease_id;
    clock = "2026-10-22T00:03:01.000Z";
    task = analysis.claim("alice").tasks[0];
    assert.deepEqual(task.execution, execution);
    assert.equal(analysis.complete("alice", task.id, oldLease, mapped(task.input)).recorded, false);
    assert.equal(analysis.complete("alice", task.id, task.lease_id, mapped(task.input)).recorded, true);
    assert.equal(analysis.complete("alice", task.id, task.lease_id, mapped(task.input)).recorded, true);
    assert.throws(() => analysis.complete("alice", task.id, task.lease_id, mapped(task.input, plotting)));
    store.deleteRun("alice", q.run_id);
    assert.equal(analysis.quotaUsed("alice"), 1);
    store.append("alice", [question("second")]);
    assert.equal(analysis.claim("alice").reason, "daily-task-limit");
    clock = "2026-10-23T00:00:00.000Z";
    assert.equal(analysis.claim("alice").tasks.length, 1);
  } finally { store.close(); }
});

test("question counts and exact-version playback have separate evidence; replays, late revisions and missing bindings cannot fabricate progress", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store); analysis.configure("alice", { enabled: true, max_daily_tasks: 20 });
    const q = question("q1"), first = snapshot("斜率描述直线的方向和陡缓。"), revised = snapshot("纵截距描述直线与纵轴的交点。");
    const a = course("course-a", q, first), b = course("course-b", q, revised);
    store.append("alice", [q, a], [{ event_id: a.id, snapshot_json: first }]);
    let task = analysis.claim("alice").tasks[0]; finish(analysis, task, mapped(task.input));
    task = analysis.claim("alice").tasks[0]; finish(analysis, task, mapped(task.input));
    const playback = (id, digest) => ({ ...q, id, kind: "beat_completed", course: a.course, log_id: "log", data: { step_id: "step-one", beat_id: "beat-one", presentation: "text", ...(digest ? { delivery_sha256: digest } : {}) } });
    store.append("alice", [playback("played", a.data.snapshot_sha256), playback("replayed", a.data.snapshot_sha256), playback("legacy-no-version")]);
    const original = queryTopic(store, "alice", slope, { limit: 1 }).automatic;
    assert.deepEqual(original.counts, { question_count: 1, played_runs: 1, played_beats: 1 });
    assert.equal(original.coverage.unassociated_played_beats, 1);
    assert.ok(original.events[0].associations[0].quote.includes("斜率"));
    store.append("alice", [b], [{ event_id: b.id, snapshot_json: revised }]);
    task = analysis.claim("alice").tasks[0]; finish(analysis, task, mapped(task.input, plotting));
    // The revised content was delivered but not played. It does not relabel
    // the earlier playback just because the beat ID stayed the same.
    assert.equal(queryTopic(store, "alice", plotting).automatic.counts.played_runs, 0);
    const oldFacts = store.runEvents("alice", q.run_id).events;
    analysis.reanalyze("alice", q.id);
    task = analysis.claim("alice").tasks[0]; finish(analysis, task, mapped(task.input, plotting));
    assert.equal(queryTopic(store, "alice", slope).automatic.counts.question_count, 0);
    assert.equal(queryTopic(store, "alice", slope, { analysis_through: original.analysis_through }).automatic.counts.question_count, 1);
    assert.deepEqual(store.runEvents("alice", q.run_id).events, oldFacts);
    assert.equal(queryTopic(store, "bob", slope).automatic.counts.question_count, null);
    const through = store.upperBound("alice"); store.deleteSession("alice", q.session_id);
    assert.deepEqual(analysis.status("alice").states, []);
    assert.throws(() => queryTopic(store, "alice", slope, { through }), HistorySnapshotChanged);
    assert.equal(queryTopic(store, "alice", slope).automatic.events.length, 0);
  } finally { store.close(); }
});

test("explicit reanalysis can replace an uncertain execution without rewriting facts or refunding the first reservation", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store), q = question("uncertain");
    analysis.configure("alice", { enabled: true, max_daily_tasks: 2 }); store.append("alice", [q]);
    const first = analysis.claim("alice").tasks[0];
    analysis.execution("alice", first.id, first.lease_id, execution); analysis.pause("alice", first.id, first.lease_id);
    const replacement = analysis.reanalyze("alice", q.id), second = analysis.claim("alice").tasks[0];
    assert.equal(second.id, replacement.id); assert.notEqual(second.id, first.id); assert.equal(second.execution, null);
    assert.equal(analysis.complete("alice", first.id, first.lease_id, mapped(first.input)).recorded, false);
    finish(analysis, second, mapped(second.input)); assert.equal(analysis.quotaUsed("alice"), 2);
    assert.deepEqual(store.runEvents("alice", q.run_id).events.map(row => row.event), [q]);
  } finally { store.close(); }
});

test("an unresolved old execution cannot starve new sources, and quota exhaustion still allows reconciliation", () => {
  let clock = "2026-10-22T00:00:00.000Z";
  const store = new HistoryStore(":memory:", { now: () => clock });
  try {
    const analysis = new TopicAnalysisStore(store);
    analysis.configure("alice", { enabled: true, max_daily_tasks: 2 });
    store.append("alice", [question("first"), question("second")]);
    const first = analysis.claim("alice").tasks[0];
    analysis.execution("alice", first.id, first.lease_id, execution); analysis.pause("alice", first.id, first.lease_id);
    clock = "2026-10-22T00:05:01.000Z";
    const second = analysis.claim("alice").tasks[0];
    assert.equal(second.input.source_event_id, "second"); finish(analysis, second, mapped(second.input));
    store.append("alice", [question("third")]);
    const retry = analysis.claim("alice").tasks[0];
    assert.equal(retry.id, first.id); assert.deepEqual(retry.execution, execution);
    analysis.pause("alice", retry.id, retry.lease_id);
    clock = "2026-10-22T00:10:02.000Z";
    assert.equal(analysis.claim("alice").tasks[0].id, first.id);
    assert.equal(analysis.quotaUsed("alice"), 2);
  } finally { store.close(); }
});


test("response parsing accepts only bare JSON or a complete JSON block, retaining strict evidence validation", () => {
  const store = new HistoryStore(":memory:");
  try {
    const q = question("response-format"); store.append("alice", [q]);
    const input = buildAnalysisInput(store, "alice", q.id), result = mapped(input), json = JSON.stringify(result);
    for (const text of [json, `  ${json} \n`, "```json\n" + json + "\n```", "```\n" + json + "\n```", " ```JSON\r\n" + json + "\r\n``` "]) {
      assert.deepEqual(validateAnalysisResult(input, parseTopicAnalysisResponse(text)), result);
    }
    for (const text of ["Here is the result: " + json, json + " done", "```json\n" + json, "```js\n" + json + "\n```", "```json\n{}\n```\n```json\n{}\n```", "```json\ninvalid\n```", "before\n```json\n" + json + "\n```", "```json\n" + json + "\n```\nafter"]) {
      assert.throws(() => parseTopicAnalysisResponse(text));
    }
    for (const bad of [
      { ...result, input_sha256: "0".repeat(64) },
      { ...result, mastered: true },
      { ...result, units: [{ ...result.units[0], topics: [{ topic_id: "invented", quote: "斜率" }] }] },
      { ...result, units: [{ ...result.units[0], topics: [{ topic_id: slope, quote: "不存在的原文" }] }] },
    ]) assert.throws(() => validateAnalysisResult(input, parseTopicAnalysisResponse("```json\n" + JSON.stringify(bad) + "\n```")));
  } finally { store.close(); }
});
