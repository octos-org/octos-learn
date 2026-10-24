import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "./store.mjs";
import { TopicAnalysisStore } from "./topic-analysis-store.mjs";
import { buildAnalysisInput, analysisHash, validateAnalysisResult } from "./topic-analysis.mjs";
import { queryTopic } from "./topic-query.mjs";
import { TOPIC_RULES_VERSION } from "./topic-catalog.mjs";
const plotting = "mt_-3udyo6VyB", triangle = "mt_cdMlC7EpTJ";
const q = { version: 1, id: "question", kind: "question_submitted", occurred_at: "2026-10-22T00:00:00.000Z", device_id: "tv", session_id: "board", run_id: "run", question_id: "q", data: { text: "三角形的第三个角是多少？", modality: "text" } };
const task = { as: "compute-slope", prompt: "由点(1,3)和(4,9)求斜率，调整m到计算结果", allowed_operations: [{ kind: "variable_change", variable: "m" }], completion: { kind: "expression_target", expression: "m", value: 2, tolerance: 0.01 } };
function deliver(store, id, changedTask = task) {
  const json = JSON.stringify([{ event: "lesson.open", lesson_id: "lesson", lesson: { variables: [{ as: "m", initial: 0 }], tasks: [changedTask] } },
    { event: "lesson.step", lesson_id: "lesson", step: { id: "section", beats: [{ id: "beat", narration: { text: "三角形内角和是180度。" } }] } }]);
  const hash = analysisHash(json);
  const event = { ...q, id, kind: "course_delivered", course: { kind: "generated", id: "course", version: "one" }, data: { artifact: "lesson.jsonl", status: "partial", snapshot_sha256: hash, event_count: 2 } };
  store.append("alice", [event], [{ event_id: id, snapshot_json: json }]); return { event, hash };
}
const execution = { session_id: `learn-topic-${"a".repeat(32)}#peer-topics-test`, turn_id: "12345678-1234-4234-8234-123456789abc" };
function finish(analysis, job, unknownTask = false) {
  const result = { schema: 1, input_sha256: job.input.input_sha256, units: job.input.units.map(unit => ({ unit_id: unit.unit_id,
    status: unknownTask && unit.kind === "task" ? "unknown" : "mapped", topics: unknownTask && unit.kind === "task" ? [] : [{ topic_id: unit.kind === "task" ? plotting : triangle, quote: unit.kind === "task" ? "由点(1,3)和(4,9)求斜率" : unit.kind === "question" ? "三角形" : "三角形内角和是180度。" }], reason: "Synthetic scope association, not model quality" })) };
  analysis.execution("alice", job.id, job.lease_id, execution); analysis.complete("alice", job.id, job.lease_id, result); return result;
}
function attempt(store, delivery, id, result = "failed", source = true) {
  const event = { ...delivery.event, id, kind: "task_attempt", log_id: "log", data: { task_id: "namespaced:compute-slope", operation_id: id, result, hints_used: 1,
    ...(source ? { source_task_id: "compute-slope", delivery_sha256: delivery.hash } : {}) } };
  store.append("alice", [event]); return event;
}

test("task units carry their exact definition and variable context, independent of the question and nearby narration", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [q]); const delivered = deliver(store, "course");
    const input = buildAnalysisInput(store, "alice", delivered.event.id);
    assert.deepEqual(input.units.map(u => u.kind), ["beat", "task"]);
    assert.equal(input.units[1].task_id, "compute-slope");
    assert.ok(input.units[1].content.includes(task.prompt) && input.units[1].content.includes('"variables"'));
    const result = { schema: 1, input_sha256: input.input_sha256, units: input.units.map(unit => ({ unit_id: unit.unit_id, status: "mapped", topics: [{ topic_id: plotting, quote: "由点(1,3)和(4,9)求斜率" }], reason: "Test" })) };
    assert.throws(() => validateAnalysisResult(input, result)); // Task quotation cannot stand in for a beat quotation.
    deliver(store, "duplicate-tasks", { ...task });
    const duplicate = JSON.parse(store.courseMaterial("alice", "duplicate-tasks").snapshot_json);
    duplicate[0].lesson.tasks.push(task);
    const json = JSON.stringify(duplicate), hash = analysisHash(json);
    store.append("alice", [{ ...delivered.event, id: "duplicate-source", data: { ...delivered.event.data, snapshot_sha256: hash } }], [{ event_id: "duplicate-source", snapshot_json: json }]);
    assert.throws(() => buildAnalysisInput(store, "alice", "duplicate-source"));
  } finally { store.close(); }
});

test("question/beat topics never classify task attempts; exact task/version evidence counts attempts, success and hints separately", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store); analysis.configure("alice", { enabled: true, max_daily_tasks: 20 });
    store.append("alice", [q]); const delivered = deliver(store, "source");
    finish(analysis, analysis.claim("alice").tasks[0]); finish(analysis, analysis.claim("alice").tasks[0]);
    const failed = attempt(store, delivered, "failed"), passed = attempt(store, delivered, "passed", "succeeded");
    const hint = { ...failed, id: "hint", kind: "task_hint", data: { task_id: "namespaced:compute-slope", source_task_id: "compute-slope", delivery_sha256: delivered.hash, hint_index: 1 } };
    store.append("alice", [failed, passed, hint, hint]);
    attempt(store, delivered, "legacy", "succeeded", false);
    let result = queryTopic(store, "alice", plotting);
    assert.equal(result.automatic.counts.task_attempts, 2); assert.equal(result.automatic.counts.task_successes, 1); assert.equal(result.automatic.counts.task_hints, 1);
    assert.equal(result.automatic.counts.question_count, 0); assert.equal(result.automatic.counts.played_beats, null);
    assert.equal(result.automatic.coverage.unassociated_task_attempts, 1);
    assert.equal(result.automatic.events.length, 3);
    assert.ok(result.automatic.events.every(row => row.associations[0].unit_id === JSON.stringify(["task", "compute-slope"])));
    assert.equal(queryTopic(store, "alice", triangle).automatic.counts.task_attempts, 0);
    assert.equal(queryTopic(store, "bob", plotting).automatic.counts.task_attempts, null);
    const through = result.through, analysisThrough = result.automatic.analysis_through;
    const revised = deliver(store, "revised", { ...task, prompt: "不同的新练习" });
    finish(analysis, analysis.claim("alice").tasks[0], true);
    attempt(store, revised, "unknown-new-task", "succeeded");
    result = queryTopic(store, "alice", plotting);
    assert.equal(result.automatic.counts.task_attempts, 2); assert.equal(result.automatic.coverage.unassociated_task_attempts, 2);
    assert.equal(queryTopic(store, "alice", plotting, { through, analysis_through: analysisThrough }).automatic.coverage.unassociated_task_attempts, 1);
    store.deleteRun("alice", "run"); assert.equal(queryTopic(store, "alice", plotting).automatic.events.length, 0);
  } finally { store.close(); }
});

test("an unresolved page-run execution from the previous rules is replaced by one retry under the current rules", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store); analysis.configure("alice", { enabled: true, max_daily_tasks: 20 }); store.append("alice", [q]);
    const job = analysis.claim("alice").tasks[0];
    analysis.execution("alice", job.id, job.lease_id, execution);
    store.db.prepare("UPDATE topic_analysis_jobs SET rules_version=?,lease_until=0 WHERE id=?").run("separate-question-and-delivered-units-v1", job.id);
    const retry = analysis.claim("alice").tasks[0]; assert.equal(retry.execution, null); assert.notEqual(retry.id, job.id);
    assert.equal(retry.input.rules_version, TOPIC_RULES_VERSION);
    assert.match(store.db.prepare("SELECT error FROM topic_analysis_jobs WHERE id=?").get(job.id).error, /^analysis-turn-failed: Page-run analysis replaced/);
    assert.equal(analysis.quotaUsed("alice"), 1);
    finish(analysis, retry);
  } finally { store.close(); }
});

test("hints without exact task evidence are disclosed as unresolved instead of silently dropped", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store); analysis.configure("alice", { enabled: true, max_daily_tasks: 20 });
    store.append("alice", [q]); const delivered = deliver(store, "source");
    finish(analysis, analysis.claim("alice").tasks[0]); finish(analysis, analysis.claim("alice").tasks[0]);
    const hint = { ...delivered.event, id: "hint", kind: "task_hint", log_id: "log", data: { task_id: "namespaced:compute-slope", source_task_id: "compute-slope", delivery_sha256: delivered.hash, hint_index: 1 } };
    store.append("alice", [hint]);
    let result = queryTopic(store, "alice", plotting).automatic;
    assert.equal(result.counts.task_hints, 1); assert.equal(result.counts.task_attempts, null);
    assert.equal(result.coverage.unassociated_task_hints, 0);
    store.append("alice", [{ ...hint, id: "legacy-hint", data: { task_id: "namespaced:compute-slope", hint_index: 2 } }]);
    result = queryTopic(store, "alice", plotting).automatic;
    assert.equal(result.counts.task_hints, 1); assert.equal(result.coverage.generated_task_hints, 2);
    assert.equal(result.coverage.unassociated_task_hints, 1); assert.equal(result.status, "partial");
  } finally { store.close(); }
});

test("unstarted jobs from previous rules are reported as superseded, not as pending work clients must retry", () => {
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store); analysis.configure("alice", { enabled: true, max_daily_tasks: 20 });
    store.append("alice", [q]); store.append("alice", [{ ...q, id: "second", question_id: "q2" }]);
    const started = analysis.claim("alice").tasks[0];
    analysis.execution("alice", started.id, started.lease_id, execution);
    store.db.prepare("UPDATE topic_analysis_jobs SET rules_version=?").run("separate-question-and-delivered-units-v1");
    const states = Object.fromEntries(analysis.status("alice").states.map(row => [row.state, row.count]));
    assert.deepEqual(states, { leased: 1, superseded: 1 });
    store.db.prepare("UPDATE topic_analysis_jobs SET lease_until=0").run();
    // Only the started execution gets a retry, under the current rules.
    const retry = analysis.claim("alice").tasks[0];
    assert.equal(retry.input.source_event_id, started.input.source_event_id); assert.notEqual(retry.id, started.id);
    store.db.prepare("UPDATE topic_analysis_jobs SET taxonomy_sha256='other-catalog' WHERE id=?").run(retry.id);
    assert.deepEqual(analysis.status("alice").states.map(row => row.state).sort(), ["blocked", "superseded"]); // Another taxonomy is never claimable.
  } finally { store.close(); }
});

test("the learning map reads automatic associations: a hinted success is practising and an asked-only topic stays off the map", async () => {
  const { queryLearningMap } = await import("./map-progress.mjs");
  const store = new HistoryStore(":memory:");
  try {
    const analysis = new TopicAnalysisStore(store); analysis.configure("alice", { enabled: true, max_daily_tasks: 20 });
    store.append("alice", [q]); const delivered = deliver(store, "source");
    finish(analysis, analysis.claim("alice").tasks[0]); finish(analysis, analysis.claim("alice").tasks[0]);
    attempt(store, delivered, "failed"); attempt(store, delivered, "passed", "succeeded");
    const map = queryLearningMap(store, "alice");
    // The question and beat were linked to the triangle topic, but the beat was never played.
    assert.deepEqual(map.topics.map(topic => [topic.topic_id, topic.state]), [[plotting, "practising"]]);
    assert.equal(map.topics[0].evidence.assisted_successes, 1);
  } finally { store.close(); }
});
