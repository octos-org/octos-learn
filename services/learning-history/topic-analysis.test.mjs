import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore, HistorySnapshotChanged } from "./store.mjs";
import { TopicAnalysisStore } from "./topic-analysis-store.mjs";
import { buildAnalysisInput, validateAnalysisResult, analysisHash } from "./topic-analysis.mjs";
import { topicCatalog, topicStructure, TOPIC_TAXONOMY } from "./topic-catalog.mjs";
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
  assert.equal(TOPIC_TAXONOMY.topic_count, 1833);
  assert.equal(TOPIC_TAXONOMY.commit, "c7ed549758d9fb430c4af54886c658e78162a0b1");
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

test("queue (on by default, can be turned off) is idempotent and account scoped; a dispatched job reports back once with its capability, and deleting facts does not refund the start", () => {
  let clock = "2026-10-22T00:00:00.000Z";
  const store = new HistoryStore(":memory:", { now: () => clock });
  try {
    const analysis = new TopicAnalysisStore(store), q = question("first");
    store.append("alice", [q]); store.append("alice", [q]);
    assert.deepEqual(analysis.settings("alice"), { enabled: true, max_daily_tasks: 10 });
    analysis.configure("alice", { enabled: false, max_daily_tasks: 0 });
    assert.equal(analysis.claim("alice").reason, "disabled");
    assert.deepEqual(analysis.status("bob").states, []);
    assert.equal(analysis.status("alice").states[0].count, 1);
    analysis.configure("alice", { enabled: true, max_daily_tasks: 1 });
    const task = analysis.claim("alice").tasks[0];
    assert.equal(task.execution, null);
    assert.equal(analysis.claim("alice").reason, "active-task");
    assert.equal(analysis.dispatch("bob", task.id, task.lease_id).recorded, false);
    const { recorded, capability } = analysis.dispatch("alice", task.id, task.lease_id);
    assert.equal(recorded, true); assert.match(capability, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(analysis.dispatch("alice", task.id, task.lease_id).recorded, false, "a job is dispatched once");
    assert.equal(analysis.claim("alice").reason, "daily-task-limit", "dispatched work does not hold the queue");
    assert.equal(analysis.status("alice").quota_used, 1, "the page can tell the learner the limit is used up");
    // Only the right capability for the right job is accepted, and only once.
    assert.equal(analysis.callback(task.id, "x".repeat(43), { result: mapped(task.input) }).recorded, false);
    assert.equal(analysis.callback("f".repeat(64), capability, { result: mapped(task.input) }).recorded, false);
    assert.deepEqual(analysis.callback(task.id, capability, { result: mapped(task.input) }), { owner: "alice", recorded: true });
    assert.equal(analysis.callback(task.id, capability, { result: mapped(task.input) }).recorded, false);
    assert.equal(store.db.prepare("SELECT state FROM topic_analysis_jobs WHERE id=?").get(task.id).state, "complete");
    store.deleteRun("alice", q.run_id);
    assert.equal(analysis.quotaUsed("alice"), 1);
    store.append("alice", [question("second")]);
    assert.equal(analysis.claim("alice").reason, "daily-task-limit");
    clock = "2026-10-23T00:00:00.000Z";
    assert.equal(analysis.claim("alice").tasks.length, 1);
  } finally { store.close(); }
});

test("a background report that fails validation is set aside with the service reason; a reported failure follows the retry rule", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store);
    store.append("alice", [question("invalid"), question("outage")]);
    const start = () => { const task = analysis.claim("alice").tasks[0]; return { task, capability: analysis.dispatch("alice", task.id, task.lease_id).capability }; };
    const invalid = start();
    const wrong = { ...mapped(invalid.task.input), units: [{ unit_id: "question", status: "mapped", topics: [{ topic_id: slope, quote: "not in the question" }], reason: "x" }] };
    assert.throws(() => analysis.callback(invalid.task.id, invalid.capability, { result: wrong }), /Analysis evidence or catalog reference is invalid/);
    assert.equal(store.db.prepare("SELECT error FROM topic_analysis_jobs WHERE id=?").get(invalid.task.id).error,
      "invalid-analysis-result: Analysis evidence or catalog reference is invalid");
    const outage = start();
    assert.throws(() => analysis.callback(outage.task.id, outage.capability, { failure: "made-up" }), /Unknown analysis rejection reason/);
    // The refused report did not use up the capability; the real one counts.
    assert.deepEqual(analysis.callback(outage.task.id, outage.capability, { failure: "analysis-turn-failed", detail: "fixture outage" }), { owner: "alice", recorded: true, retried: true });
    const again = analysis.claim("alice").tasks[0];
    assert.equal(again.input.source_event_id, "outage"); assert.notEqual(again.id, outage.task.id);
  } finally { store.close(); }
});

test("a background analysis that never reports back counts as a failed turn; one that could not start is returned without counting", () => {
  let clock = "2026-10-22T00:00:00.000Z";
  const store = new HistoryStore(":memory:", { now: () => clock });
  try {
    const analysis = new TopicAnalysisStore(store);
    store.append("alice", [question("silent"), question("unstarted")]);
    const silent = analysis.claim("alice").tasks[0];
    const { capability } = analysis.dispatch("alice", silent.id, silent.lease_id);
    const unstarted = analysis.claim("alice").tasks[0];
    analysis.dispatch("alice", unstarted.id, unstarted.lease_id);
    assert.equal(analysis.quotaUsed("alice"), 2);
    assert.deepEqual(analysis.undispatch("alice", unstarted.id, unstarted.lease_id), { recorded: true });
    assert.equal(analysis.quotaUsed("alice"), 1);
    clock = "2026-10-22T00:10:01.000Z";
    const retry = analysis.claim("alice").tasks[0];
    assert.equal(retry.input.source_event_id, "silent"); assert.notEqual(retry.id, silent.id);
    assert.match(store.db.prepare("SELECT error FROM topic_analysis_jobs WHERE id=?").get(silent.id).error, /^analysis-turn-failed: Background analysis did not report back/);
    assert.equal(analysis.callback(silent.id, capability, { result: mapped(silent.input) }).recorded, false, "an expired capability is refused");
    analysis.dispatch("alice", retry.id, retry.lease_id);
    assert.equal(analysis.claim("alice").tasks[0].input.source_event_id, "unstarted", "the returned job is claimable again");
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
    assert.deepEqual(original.counts, { question_count: 1, played_runs: 1, played_beats: 1, task_attempts: null, task_successes: null, task_hints: null });
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

test("an unresolved page-run execution is replaced by one background retry, which still needs the daily limit", () => {
  let clock = "2026-10-22T00:00:00.000Z";
  const store = new HistoryStore(":memory:", { now: () => clock });
  try {
    const analysis = new TopicAnalysisStore(store);
    analysis.configure("alice", { enabled: true, max_daily_tasks: 2 });
    store.append("alice", [question("first"), question("second")]);
    const first = analysis.claim("alice").tasks[0];
    analysis.execution("alice", first.id, first.lease_id, execution); analysis.pause("alice", first.id, first.lease_id);
    const retry = analysis.claim("alice").tasks[0];
    assert.equal(retry.input.source_event_id, "first"); assert.notEqual(retry.id, first.id); assert.equal(retry.execution, null);
    finish(analysis, retry, mapped(retry.input));
    assert.equal(analysis.quotaUsed("alice"), 2);
    assert.equal(analysis.claim("alice").reason, "daily-task-limit");
    clock = "2026-10-23T00:00:00.000Z";
    assert.equal(analysis.claim("alice").tasks[0].input.source_event_id, "second");
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

test("the pinned catalog keeps every subject and the topic ids used by earlier records", () => {
  const catalog = topicCatalog();
  assert.deepEqual(Object.keys(TOPIC_TAXONOMY.subjects).sort(), ["Computing", "English", "Geography", "History", "Learning to Learn", "Life Skills", "Mathematics", "Personal & Social Development", "Science"]);
  // Ids referenced by the course mapping and earlier analysis fixtures are unchanged.
  for (const id of ["mt_WBdHkc2HTf", "mt_-3udyo6VyB"]) assert.equal(catalog.read([id]).length, 1);
  assert.ok(catalog.search("photosynthesis plants", 12).some(topic => topic.subject === "Science"));
  const structure = topicStructure();
  assert.ok(structure.prerequisitesOf("mt_WBdHkc2HTf").length > 0);
  for (const edge of structure.prerequisitesOf("mt_WBdHkc2HTf")) assert.equal(catalog.read([edge.prerequisiteId]).length, 1);
  assert.ok(structure.clustersOf("Mathematics", "Algebra").length > 0);
});


test("a set-aside analysis keeps its reason; only a turn that ended without a reply gets one retry", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store), failed = question("turn-failed"), invalid = question("invalid");
    analysis.configure("alice", { enabled: true, max_daily_tasks: 5 }); store.append("alice", [failed, invalid]);
    const jobs = source => store.db.prepare("SELECT revision,state,error FROM topic_analysis_jobs WHERE owner='alice' AND source_event_id=? ORDER BY revision").all(source);
    const start = () => { const task = analysis.claim("alice").tasks[0]; analysis.execution("alice", task.id, task.lease_id, execution); return task; };
    assert.throws(() => analysis.reject("alice", "x", "y", "made-up"), /Unknown analysis rejection reason/);
    // The first turn failure is retried once as a new revision; the second is not.
    let task = start();
    assert.deepEqual(analysis.reject("alice", task.id, task.lease_id, "analysis-turn-failed"), { recorded: true, retried: true });
    task = analysis.claim("alice").tasks[0]; assert.equal(task.execution, null);
    analysis.execution("alice", task.id, task.lease_id, execution);
    assert.deepEqual(analysis.reject("alice", task.id, task.lease_id, "analysis-turn-failed"), { recorded: true, retried: false });
    assert.deepEqual(jobs(failed.id).map(row => [row.revision, row.state, row.error]), [[1, "blocked", "analysis-turn-failed"], [2, "blocked", "analysis-turn-failed"]]);
    // A reply the service rejected is not repeated, and keeps the service's reason.
    task = start();
    assert.deepEqual(analysis.reject("alice", task.id, task.lease_id, "invalid-analysis-result", "Analysis evidence or catalog reference is invalid"), { recorded: true, retried: false });
    assert.deepEqual(jobs(invalid.id).map(row => row.error), ["invalid-analysis-result: Analysis evidence or catalog reference is invalid"]);
    assert.equal(analysis.quotaUsed("alice"), 3);
  } finally { store.close(); }
});
