import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { HistoryStore, HistorySnapshotChanged } from "./store.mjs";
import { validateHistoryEvent, canonicalHistoryJson } from "./event-contract.mjs";

let root, file, store;
const course = { kind: "course-pack", id: "slope-and-intercept", version: "0.1.8", sha256: "a".repeat(64) };
const event = (id, overrides = {}) => ({ version: 1, id, kind: "question_submitted", occurred_at: "2026-10-21T08:00:00.000Z", device_id: "tv", session_id: "learn-board", run_id: "run-one", question_id: `q-${id}`, data: { text: "请解释斜率", modality: "text" }, ...overrides });
const played = (id, overrides = {}) => event(id, { kind: "beat_completed", question_id: undefined, log_id: "log-one", course, data: { step_id: "step-1", beat_id: "beat-1", presentation: "text" }, ...overrides });
// JSON transport omits undefined optional fields.
const wire = value => JSON.parse(JSON.stringify(value));
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "learn-history-")); file = join(root, "history.sqlite"); store = new HistoryStore(file); });
afterEach(async () => { store.close(); await rm(root, { recursive: true, force: true }); });

test("replay survives reopening; same id with different content conflicts without overwriting", () => {
  assert.equal(store.append("alice", [event("one")]).results[0].status, "accepted");
  store.close(); store = new HistoryStore(file);
  assert.equal(store.append("alice", [event("one")]).results[0].status, "exists");
  assert.equal(store.append("alice", [event("one", { data: { text: "改变内容", modality: "text" } })]).results[0].status, "conflict");
  assert.equal(store.runEvents("alice", "run-one").events.length, 1);
  assert.equal(store.append("bob", [event("one")]).results[0].status, "accepted");
  assert.equal(store.listRuns("bob").runs.length, 1);
});

test("generated material and duplicate beat playback are not new independent studies", () => {
  store.append("alice", [event("question")]);
  assert.equal(store.listRuns("alice").runs[0].start_recorded, false);
  store.append("alice", [wire(played("beat-one")), wire(played("beat-repeat"))]);
  const run = store.listRuns("alice").runs[0];
  assert.equal(run.question_count, 1);
  assert.equal(run.completed_beats, 1);
});

test("answers completing out of order stay bound to their original question and run", () => {
  store.append("alice", [event("a", { run_id: "run-a" }), event("b", { run_id: "run-b" })]);
  const answer = (id, question, run) => event(id, { kind: "answer_delivered", run_id: run, question_id: question, data: { text: "实际回复", part_id: "part-one" } });
  assert.equal(store.append("alice", [answer("answer-b", "q-b", "run-b"), answer("answer-a", "q-a", "run-a")]).results.every(row => row.status === "accepted"), true);
  assert.equal(store.append("alice", [answer("wrong", "q-a", "run-b")]).results[0].status, "conflict");
  assert.equal(store.runEvents("alice", "run-a").events[1].event.question_id, "q-a");
});

test("task identity includes the run and persistent log, and conflicting re-labels reject", () => {
  const attempt = (id, log, run = "run-one") => event(id, { kind: "task_attempt", run_id: run, log_id: log, course,
    data: { task_id: "task", operation_id: "lesson:student-operation:1", result: "succeeded", hints_used: 1 } });
  store.append("alice", [attempt("a", "log-a"), attempt("b", "log-b"), attempt("c", "log-a", "run-two")]);
  assert.equal(store.listRuns("alice").runs.find(run => run.run_id === "run-one").task_attempts, 2);
  assert.equal(store.append("alice", [attempt("different-id", "log-a")]).results[0].status, "conflict");
});

test("deletion removes bodies and rejects old and previously unknown child events after restart", () => {
  store.append("alice", [event("one")]);
  const deleted = store.deleteRun("alice", "run-one");
  assert.deepEqual(store.deleteRun("alice", "run-one"), deleted);
  store.close(); store = new HistoryStore(file);
  assert.equal(store.append("alice", [event("one")]).results[0].status, "deleted");
  assert.equal(store.append("alice", [event("late")]).results[0].status, "deleted");
  assert.equal(store.runEvents("alice", "run-one").events.length, 0);
  assert.equal(store.listRuns("alice").runs.length, 0);
  assert.equal(store.changes("alice").changes.at(-1).change_kind, "deleted");
  assert.equal(store.append("bob", [event("late")]).results[0].status, "accepted");
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE owner='alice'").get().n, 0);
});

test("snapshot pagination excludes later arrivals and keeps runs ordered across an intervening update", () => {
  for (let i = 0; i < 4; i++) store.append("alice", [event(`e${i}`, { run_id: `run-${i}` })]);
  const first = store.listRuns("alice", { limit: 2 });
  store.append("alice", [event("new", { run_id: "run-0" })]);
  const second = store.listRuns("alice", { limit: 2, through: first.through, before: first.next_before });
  assert.deepEqual([...first.runs, ...second.runs].map(run => run.run_id), ["run-3", "run-2", "run-1", "run-0"]);
  assert.equal(second.next_before, null);
});

test("invalid batches never partially commit, and owner/course cannot be silently changed", () => {
  assert.throws(() => store.append("alice", [event("good"), event("bad", { profile_id: "bob" })]));
  assert.equal(store.upperBound("alice"), 0);
  store.append("alice", [wire(played("first"))]);
  assert.equal(store.append("alice", [wire(played("wrong-course", { course: { ...course, sha256: "b".repeat(64) } }))]).results[0].status, "conflict");
  assert.equal(store.append("alice", [event("wrong-board", { session_id: "other" })]).results[0].status, "conflict");
});

test("deleting during a paged query invalidates its snapshot, while deletion still reaches the change feed", () => {
  store.append("alice", [event("a", { run_id: "run-a" }), event("b", { run_id: "run-b" })]);
  const page = store.listRuns("alice", { limit: 1 });
  store.deleteRun("alice", "run-a");
  assert.throws(() => store.listRuns("alice", { through: page.through, before: page.next_before }), HistorySnapshotChanged);
  assert.equal(store.listRuns("alice").runs.length, 1);
  assert.equal(store.changes("alice", { after: page.through }).changes[0].change_kind, "deleted");
});

test("write-lock contention is bounded and leaves no receipt until retry succeeds", () => {
  const other = new DatabaseSync(file);
  try {
    other.exec("BEGIN IMMEDIATE");
    assert.throws(() => store.append("alice", [event("blocked")]), error => (error.errcode & 255) === 5);
    other.exec("ROLLBACK");
    assert.equal(store.append("alice", [event("blocked")]).results[0].status, "accepted");
  } finally { other.close(); }
});

test("a storage failure rolls back events, receipts and the change stream together", () => {
  store.db.exec(`CREATE TRIGGER fail_second BEFORE INSERT ON events WHEN NEW.event_id='fail' BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END`);
  assert.throws(() => store.append("alice", [event("first"), event("fail")]));
  assert.equal(store.upperBound("alice"), 0);
  assert.equal(store.runEvents("alice", "run-one").events.length, 0);
  store.db.exec("DROP TRIGGER fail_second");
  assert.equal(store.append("alice", [event("first")]).results[0].status, "accepted");
});

test("contract rejects unsupported kinds, missing run/log identity and synthetic completion causes", () => {
  for (const candidate of [event("unknown", { kind: "mastered" }), event("no-run", { run_id: undefined }),
    wire(played("no-log", { log_id: undefined })), wire(played("bad-cause", { data: { step_id: "s", beat_id: "b", presentation: "failed" } }))]) {
    assert.throws(() => validateHistoryEvent(candidate));
  }
  const original = event("one");
  const checked = validateHistoryEvent(original); original.data.text = "later mutation";
  assert.equal(checked.data.text, "请解释斜率");
  assert.equal(canonicalHistoryJson({ b: 2, a: 1 }), canonicalHistoryJson({ a: 1, b: 2 }));
});

test("direct question delivery survives lost receipts and restart, answers wait for their original user, and deletion cancels raw copies", () => {
  let now = '2026-10-21T00:00:00.000Z';
  let store = new HistoryStore(join(root, 'delivery.sqlite'), { now: () => now });
  const user = { ...event('direct-user'), data: { text: '原问题', modality: 'text' } };
  const answer = { ...user, id: 'direct-answer', kind: 'answer_delivered', data: { text: '实际答复', part_id: 'one' } };
  const route = { ...user, id: 'route', kind: 'question_routed', data: { conversation_route: 'direct-action' } };
  store.append('alice', [answer, route, user]);
  assert.equal(store.claimDeliveries('bob').tasks.length, 0);
  let claim = store.claimDeliveries('alice');
  assert.equal(claim.tasks.length, 1);
  assert.equal(claim.tasks[0].message.role, 'user');
  const firstLease = claim.tasks[0].lease_id;
  assert.equal(store.claimDeliveries('alice').tasks.length, 0);
  store.close();
  now = '2026-10-21T00:00:31.000Z';
  store = new HistoryStore(join(root, 'delivery.sqlite'), { now: () => now });
  claim = store.claimDeliveries('alice');
  assert.equal(claim.tasks[0].message.client_message_id, 'learn:user:q-direct-user');
  assert.equal(store.acknowledgeDelivery('alice', user.id, firstLease, 0).recorded, false);
  assert.equal(store.acknowledgeDelivery('alice', user.id, claim.tasks[0].lease_id, 0).recorded, true);
  const answerClaim = store.claimDeliveries('alice').tasks[0];
  assert.equal(answerClaim.message.thread_id, claim.tasks[0].message.client_message_id);
  assert.equal(answerClaim.message.content, '实际答复');
  store.deleteRun('alice', user.run_id);
  assert.equal(store.acknowledgeDelivery('alice', answer.id, answerClaim.lease_id, 1).recorded, false);
  assert.equal(store.claimDeliveries('alice').tasks.length, 0);
  assert.equal(store.db.prepare('SELECT payload FROM delivery_tasks WHERE owner=?').all('alice').every(row => row.payload === null), true);
  store.close();
});

test("schema 1 upgrades transactionally without changing raw records or durable replay receipts", () => {
  const legacyFile = join(root, 'legacy.sqlite');
  let legacy = new HistoryStore(legacyFile);
  legacy.append('alice', [event('legacy')]); legacy.close();
  const raw = new DatabaseSync(legacyFile);
  raw.exec('DROP INDEX events_owner_delivery');
  for (const column of ['occurred_at', 'question_preview', 'beat_id', 'task_id', 'operation_id', 'delivery_digest']) raw.exec(`ALTER TABLE events DROP COLUMN ${column}`);
  raw.exec('UPDATE history_schema SET version=1'); raw.close();
  legacy = new HistoryStore(legacyFile);
  assert.equal(legacy.db.prepare('SELECT version FROM history_schema').get().version, 5);
  assert.equal(legacy.append('alice', [event('legacy')]).results[0].status, 'exists');
  assert.equal(legacy.listRuns('alice').runs[0].question_preview, '请解释斜率');
  assert.equal(legacy.runEvents('alice', 'run-one').events[0].event.id, 'legacy');
  legacy.close();
});

test("turn-routed questions never become duplicate Octos delivery tasks", () => {
  const question = event('normal-turn');
  const route = { ...question, id: 'normal-route', kind: 'question_routed', data: { conversation_route: 'turn', media: ['uploads/photo.png'] } };
  const answer = { ...question, id: 'normal-answer', kind: 'answer_delivered', data: { text: '实际答复', part_id: 'one' } };
  store.append('alice', [answer, route, question]);
  assert.equal(store.claimDeliveries('alice').tasks.length, 0);
  assert.equal(store.runEvents('alice', question.run_id).events.length, 3);
});

test("deleting a whole whiteboard blocks unknown future runs, cancels dialogue copies and retains an account-scoped cleanup task", () => {
  store.append('alice', [event('first'), event('second', { run_id: 'run-two' })]);
  const deleted = store.deleteSession('alice', 'learn-board', true);
  assert.equal(deleted.octos_cleanup, 'pending');
  assert.equal(store.append('alice', [event('unknown', { run_id: 'unknown-run' })]).results[0].status, 'deleted');
  assert.equal(store.append('bob', [event('unknown', { run_id: 'unknown-run' })]).results[0].status, 'accepted');
  assert.equal(store.listRuns('alice').runs.length, 0);
  assert.equal(store.changes('alice').changes.at(-1).session_id, 'learn-board');
  store.close(); store = new HistoryStore(file);
  assert.equal(store.claimSessionDeletions('bob').tasks.length, 0);
  const task = store.claimSessionDeletions('alice').tasks[0];
  assert.equal(task.session_id, 'learn-board');
  assert.equal(store.acknowledgeSessionDeletion('bob', task.session_id, task.lease_id).recorded, false);
  assert.equal(store.acknowledgeSessionDeletion('alice', task.session_id, task.lease_id).recorded, true);
  assert.equal(store.claimSessionDeletions('alice').tasks.length, 0);
  assert.equal(store.deleteSession('alice', 'learn-board', true).seq, deleted.seq);
});


test("request failures survive restart without replacing partial deliveries, adding dialogue, or changing learning counts", () => {
  const q = event("source"), route = event("route", { kind: "question_routed", question_id: q.question_id, data: { conversation_route: "direct-action", media: [] } });
  const partial = event("partial", { kind: "course_delivered", question_id: q.question_id, course: { kind: "generated", id: "source", version: "one" }, data: { artifact: "first.jsonl", status: "partial" } });
  store.append("alice", [q, route, partial]);
  const failure = event("failure", { kind: "request_failed", question_id: q.question_id, data: { execution_id: "job-one", status: "failed", reason: "job-ended" } });
  const dialogueCount = store.db.prepare("SELECT COUNT(*) n FROM delivery_tasks").get().n;
  const analysisCount = store.db.prepare("SELECT COUNT(*) n FROM topic_analysis_jobs WHERE source_event_id='source'").get().n;
  assert.equal(store.append("alice", [failure]).results[0].status, "accepted");
  store.close(); store = new HistoryStore(file);
  assert.equal(store.append("alice", [failure]).results[0].status, "exists");
  assert.equal(store.append("alice", [{ ...failure, id: "duplicate-execution" }]).results[0].status, "conflict");
  assert.equal(store.append("alice", [{ ...failure, id: "wrong-run", run_id: "other-run", data: { ...failure.data, execution_id: "job-two" } }]).results[0].status, "conflict");
  store.append("alice", [event("second-question", { run_id: "other-question-run" })]);
  assert.equal(store.append("alice", [{ ...failure, id: "relabeled-job", question_id: "q-second-question", run_id: "other-question-run" }]).results[0].status, "conflict");
  const rows = store.runEvents("alice", "run-one").events;
  assert.equal(rows.filter(row => row.event.kind === "course_delivered" && row.event.data.status === "partial").length, 1);
  assert.deepEqual(rows.find(row => row.event.kind === "request_failed").event.data, failure.data);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM delivery_tasks").get().n, dialogueCount);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM topic_analysis_jobs WHERE source_event_id='source'").get().n, analysisCount);
  const run = store.listRuns("alice").runs.find(row => row.run_id === "run-one"); assert.equal(run.question_count, 1); assert.equal(run.completed_beats, 0); assert.equal(run.start_recorded, false);
  assert.equal(store.runEvents("bob", "run-one").events.length, 0);
  for (const data of [{ ...failure.data, error: "provider response must not be retained" }, { ...failure.data, status: "complete" }, { status: "failed", reason: "job-ended" }]) {
    assert.throws(() => validateHistoryEvent({ ...failure, data }));
  }
});

test("a direct answer delivered to Octos names the preset teacher, while the recorded answer stays verbatim", () => {
  const store = new HistoryStore(':memory:');
  try {
    const user = { ...event('teacher-user'), data: { text: '什么是斜率？', modality: 'text' } };
    const answer = { ...user, id: 'teacher-answer', kind: 'answer_delivered', data: { text: '我们先看两个变化量。', part_id: 'one' } };
    const route = { ...user, id: 'teacher-route', kind: 'question_routed', data: { conversation_route: 'direct-action', media: [], teacher_id: 'alan', teacher_name: '阿澜' } };
    store.append('alice', [user, route, answer]);
    const first = store.claimDeliveries('alice').tasks[0];
    assert.equal(first.message.content, '什么是斜率？');
    store.acknowledgeDelivery('alice', user.id, first.lease_id, 0);
    const reply = store.claimDeliveries('alice').tasks[0].message;
    assert.equal(reply.content, '我们先看两个变化量。'); assert.equal(reply.participant, '阿澜老师');
    assert.equal(JSON.parse(store.db.prepare("SELECT body FROM events WHERE event_id=?").get(answer.id).body).data.text, '我们先看两个变化量。');
    const { teacher_id: _id, teacher_name: _name, ...plain } = route.data;
    for (const teacher of [{ teacher_id: 'alan' }, { teacher_name: '阿澜' }, { teacher_id: 'has space', teacher_name: '阿澜' }, { teacher_id: 'alan', teacher_name: '' }, { teacher_id: 'alan', teacher_name: '阿澜', teacher_voice: 'x' }])
      assert.throws(() => validateHistoryEvent({ ...route, data: { ...plain, ...teacher } }));
  } finally { store.close(); }
});
