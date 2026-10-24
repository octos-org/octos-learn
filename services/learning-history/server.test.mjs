import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createHistoryHandler } from "./server.mjs";
let root, handler, server, base;
const event = id => ({ version: 1, id, kind: "question_submitted", occurred_at: "2026-10-21T08:00:00.000Z", device_id: "tv", session_id: "learn-board", run_id: "run-one", question_id: `q-${id}`, data: { text: "斜率是什么", modality: "text" } });
const call = (path, method = "GET", body, headers = {}) => fetch(`${base}/api/learn/history${path}`, {
  method, headers: { authorization: "Bearer alice", "content-type": "application/json", ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "learn-history-http-"));
  handler = createHistoryHandler({ databasePath: join(root, "history.sqlite"), fetchImpl: async (url, options) => {
    assert.equal(url, "http://127.0.0.1:50080/api/my/profile");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["x-profile-id"], undefined);
    const owner = options.headers.authorization?.replace("Bearer ", "");
    return ["alice", "bob"].includes(owner) ? Response.json({ profile: { id: owner } }) : Response.json({}, { status: 401 });
  } });
  server = createServer(async (request, response) => { if (!await handler(request, response)) { response.writeHead(404); response.end(); } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); handler.close(); await rm(root, { recursive: true, force: true }); });

test("analysis HTTP operations require the authenticated owner and current task; source deletion leaves cleanup authorization only", async () => {
  await call("/events", "POST", { events: [event("analysis-question")] });
  assert.equal((await (await call("/analysis")).json()).enabled, false);
  assert.deepEqual((await (await call("/analysis/claim", "POST", {})).json()).tasks, []);
  assert.equal((await call("/analysis/settings", "POST", { enabled: true, max_daily_tasks: 0 })).status, 400);
  assert.equal((await call("/analysis/settings", "POST", { enabled: true, max_daily_tasks: 1, owner: "bob" })).status, 400);
  await call("/analysis/settings", "POST", { enabled: true, max_daily_tasks: 1 });
  const task = (await (await call("/analysis/claim", "POST", {})).json()).tasks[0];
  const control = { host: `learn-topic-${"b".repeat(32)}`, peer: "topics-http", session: `learn-topic-${"b".repeat(32)}#peer-topics-http`,
    token: "synthetic-host-capability", namespace: "app/learning-topics/topics-http", turn: "12345678-1234-4234-8234-123456789abc" };
  const path = `/analysis/controls/${task.id}`;
  assert.equal((await call(path, "POST", { lease_id: task.lease_id, control }, { authorization: "Bearer bob" })).status, 409);
  assert.equal((await call(path, "POST", { lease_id: "stale", control })).status, 409);
  assert.equal((await call(path, "POST", { lease_id: task.lease_id, control })).status, 200);
  const execution = { session_id: control.session, turn_id: control.turn };
  await call(`/analysis/jobs/${task.id}/execution`, "POST", { lease_id: task.lease_id, execution });
  const result = { schema: 1, input_sha256: task.input.input_sha256, units: [{ unit_id: "question", status: "mapped", topics: [{ topic_id: "mt_WBdHkc2HTf", quote: "斜率" }], reason: "HTTP fixture" }] };
  assert.equal((await call(`/analysis/jobs/${task.id}/result`, "POST", { lease_id: task.lease_id, result: { ...result, mastered: true } })).status, 400);
  assert.equal((await call(`/analysis/jobs/${task.id}/result`, "POST", { lease_id: task.lease_id, result })).status, 200);
  assert.equal((await call("/analysis/results/1", "GET", undefined, { authorization: "Bearer bob" })).status, 404);
  assert.equal((await (await call("/analysis/results/1")).json()).result.units[0].status, "mapped");
  assert.deepEqual((await (await call("/analysis/controls", "GET", undefined, { authorization: "Bearer bob" })).json()).controls, []);
  assert.equal((await call("/analysis/catalog?query=slope&ids=mt_WBdHkc2HTf")).status, 400);
  assert.equal((await call("/analysis/catalog?query=slope&limit=100")).status, 400);
  assert.equal((await (await call("/analysis/catalog?ids=mt_WBdHkc2HTf")).json()).topics[0].name, "Linear Function Graphs");
  await call("/runs/run-one", "DELETE");
  assert.equal((await call(`/analysis/jobs/${task.id}`)).status, 404);
  assert.equal((await call("/analysis/results/1")).status, 404);
  assert.equal((await (await call("/analysis/controls")).json()).controls.length, 1);
  await call(path, "DELETE");
  assert.deepEqual((await (await call("/analysis/controls")).json()).controls, []);
});

test("course bytes require their exact delivery and the authenticated owner, and disappear on deletion", async () => {
  const snapshot = JSON.stringify([{ event: "lesson.open", lesson_id: "one" }]);
  const delivered = { ...event("course"), kind: "course_delivered", course: { kind: "generated", id: "q-course", version: "q-course" },
    data: { artifact: "one.jsonl", status: "partial", snapshot_sha256: createHash("sha256").update(snapshot).digest("hex"), event_count: 1 } };
  const payload = { events: [delivered], materials: [{ event_id: delivered.id, snapshot_json: snapshot }] };
  assert.equal((await call("/events", "POST", { ...payload, materials: [{ event_id: delivered.id, snapshot_json: "[]" }] })).status, 400);
  assert.equal((await call("/events", "POST", payload)).status, 200);
  assert.equal((await call("/materials/course", "GET", undefined, { authorization: "Bearer bob" })).status, 404);
  assert.equal((await (await call("/materials/course")).json()).material.snapshot_json, snapshot);
  assert.equal((await call("/materials/course?owner=alice")).status, 400);
  assert.equal((await call("/runs/run-one", "DELETE")).status, 200);
  assert.equal((await call("/materials/course")).status, 404);
});

test("requires Octos authentication and ignores forged profile routing", async () => {
  assert.equal((await call("/runs", "GET", undefined, { authorization: "" })).status, 401);
  assert.equal((await call("/runs", "GET", undefined, { authorization: "Bearer invalid" })).status, 401);
  const accepted = await call("/events", "POST", { events: [event("one")] }, { "x-profile-id": "bob" });
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get("cache-control"), /no-store/);
  assert.equal((await (await call("/runs")).json()).runs.length, 1);
  assert.equal((await (await call("/runs", "GET", undefined, { authorization: "Bearer bob" })).json()).runs.length, 0);
  assert.equal((await call("/events", "POST", { events: [event("two")], profile_id: "bob" })).status, 400);
});

test("refuses a stale queue owner before writing under the next login", async () => {
  const response = await call("/events", "POST", { events: [event("old-alice-question")] }, {
    authorization: "Bearer bob", "x-learning-owner": "alice",
  });
  assert.equal(response.status, 409);
  assert.equal((await (await call("/runs", "GET", undefined, { authorization: "Bearer bob" })).json()).runs.length, 0);
  assert.equal((await (await call("/runs")).json()).runs.length, 0);
  const accepted = await call("/events", "POST", { events: [event("own-question")] }, { "x-learning-owner": "alice" });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).profile_id, "alice");
});

test("rejects cross-origin writes, invalid payloads and ambiguous pagination", async () => {
  assert.equal((await call("/events", "POST", { events: [event("one")] }, { origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await call("/events", "POST", { events: [{ ...event("one"), origin: "host" }] })).status, 400);
  assert.equal((await call("/runs?limit=0")).status, 400);
  assert.equal((await call("/runs?after=1&after=2")).status, 400);
  assert.equal((await call("/runs?owner=bob")).status, 400);
  assert.equal((await call("/events", "POST", { events: [] })).status, 400);
});

test("returns replay/deletion states and increments changes without retaining event bodies", async () => {
  for (const expected of ["accepted", "exists"]) assert.equal((await (await call("/events", "POST", { events: [event("one")] })).json()).results[0].status, expected);
  const detail = await (await call("/runs/run-one")).json();
  assert.equal(detail.events[0].event.question_id, "q-one");
  const removed = await (await call("/runs/run-one", "DELETE")).json();
  assert.equal(removed.status, "deleted");
  assert.equal((await (await call("/events", "POST", { events: [event("late")] })).json()).results[0].status, "deleted");
  const changes = await (await call(`/changes?after=${detail.through}`)).json();
  assert.equal(changes.changes.length, 1);
  assert.equal(changes.changes[0].change_kind, "deleted");
  assert.ok(!JSON.stringify(changes).includes("斜率是什么"));
});

test("delivery leases stay account-scoped, bind original questions, and cannot acknowledge a cancelled task", async () => {
  const question = event('delivery');
  const route = { ...question, id: 'delivery-route', kind: 'question_routed', data: { conversation_route: 'direct-action', media: ['uploads/original.png'] } };
  const answer = { ...question, id: 'delivery-answer', kind: 'answer_delivered', data: { text: '实际旁白', part_id: 'part-one' } };
  assert.equal((await call('/events', 'POST', { events: [answer, route, question] })).status, 200);
  assert.equal((await call('/deliveries/claim', 'POST', { limit: 0 })).status, 400);
  assert.equal((await (await call('/deliveries/claim', 'POST', { limit: 10 }, { authorization: 'Bearer bob' })).json()).tasks.length, 0);
  assert.equal((await (await call('/deliveries')).json()).probe_session_id, 'learn-board');
  const claimed = await (await call('/deliveries/claim', 'POST', { limit: 10 })).json();
  assert.equal(claimed.profile_id, 'alice'); assert.equal(claimed.tasks.length, 1);
  const user = claimed.tasks[0];
  assert.equal(user.message.content, question.data.text); assert.deepEqual(user.message.media, ['uploads/original.png']);
  assert.equal(user.message.role, 'user');
  assert.equal((await (await call(`/deliveries/${user.id}/receipt`, 'POST', { lease_id: user.lease_id, seq: 0 }, { authorization: 'Bearer bob' })).json()).recorded, false);
  assert.equal((await (await call(`/deliveries/${user.id}/receipt`, 'POST', { lease_id: user.lease_id, seq: 0 })).json()).recorded, true);
  const teacher = (await (await call('/deliveries/claim', 'POST', { limit: 10 })).json()).tasks[0];
  assert.equal(teacher.message.role, 'assistant'); assert.equal(teacher.message.thread_id, user.message.client_message_id);
  await call('/runs/run-one', 'DELETE');
  assert.equal((await (await call(`/deliveries/${teacher.id}/receipt`, 'POST', { lease_id: teacher.lease_id, seq: 1 })).json()).recorded, false);
  assert.equal((await (await call('/deliveries')).json()).probe_session_id, null);
  assert.deepEqual((await (await call('/deliveries')).json()).states, [{ state: 'cancelled', count: 2 }]);
});

test("whiteboard deletion is durable, rejects unknown offline runs and separately tracks the Octos cleanup receipt", async () => {
  await call('/events', 'POST', { events: [event('board')] });
  assert.equal((await call('/sessions/learn-board', 'DELETE', { delete_octos_session: true }, { 'x-learning-owner': 'bob' })).status, 409);
  const result = await (await call('/sessions/learn-board', 'DELETE', { delete_octos_session: true })).json();
  assert.equal(result.octos_cleanup, 'pending');
  assert.equal((await (await call('/events', 'POST', { events: [{ ...event('unknown-run-event'), run_id: 'unknown-offline-run' }] })).json()).results[0].status, 'deleted');
  const task = (await (await call('/session-deletions/claim', 'POST', { limit: 10 })).json()).tasks[0];
  assert.equal(task.session_id, 'learn-board');
  assert.equal((await (await call(`/session-deletions/${task.session_id}/receipt`, 'POST', { lease_id: task.lease_id }, { authorization: 'Bearer bob' })).json()).recorded, false);
  assert.equal((await (await call(`/session-deletions/${task.session_id}/receipt`, 'POST', { lease_id: task.lease_id })).json()).recorded, true);
  assert.equal((await (await call('/deliveries')).json()).pending_session_deletions, 0);
});

test("topic queries expose pending mappings honestly and reject ambiguous time ranges", async () => {
  const topic = await call('/topics/mt_WBdHkc2HTf');
  assert.equal(topic.status, 200);
  const body = await topic.json();
  assert.equal(body.status, 'pending-review'); assert.equal(body.objectives[0].counts, null);
  assert.equal((await call('/topics/mt_WBdHkc2HTf?from=2026-10-21')).status, 400);
  assert.equal((await call('/topics/mt_WBdHkc2HTf?from=2026-10-22T00:00:00.000Z&until=2026-10-21T00:00:00.000Z')).status, 400);
  assert.equal((await call('/topics/mt_WBdHkc2HTf?limit=0')).status, 400);
  assert.equal((await call('/topics/mt_WBdHkc2HTf?approved=true')).status, 400);
  assert.equal((await (await call('/runs/nonexistent/coverage')).json()).status, 'unmapped');
});

test("teacher choice belongs to the authenticated account and keeps a later choice over a stale replay", async () => {
  assert.equal((await (await call("/teacher-choice")).json()).choice, null);
  const first = await (await call("/teacher-choice", "PUT", { teacher_id: "doudou" })).json();
  assert.equal(first.status, "saved");
  assert.deepEqual([first.choice.teacher_id, first.choice.revision], ["doudou", 1]);
  assert.equal((await (await call("/teacher-choice", "GET", undefined, { authorization: "Bearer bob" })).json()).choice, null);
  // Another device replays an offline choice made before revision 1.
  const stale = await (await call("/teacher-choice", "PUT", { teacher_id: "alan", base_revision: 0 })).json();
  assert.deepEqual([stale.status, stale.choice.teacher_id], ["conflict", "doudou"]);
  const current = await (await call("/teacher-choice", "PUT", { teacher_id: "alan", base_revision: 1 })).json();
  assert.deepEqual([current.status, current.choice.teacher_id, current.choice.revision], ["saved", "alan", 2]);
  assert.equal((await call("/teacher-choice", "PUT", { teacher_id: "Alan Smith" })).status, 400);
  assert.equal((await call("/teacher-choice", "PUT", { teacher_id: "alan", owner: "bob" })).status, 400);
  assert.equal((await call("/teacher-choice", "PUT", { teacher_id: "alan", base_revision: -1 })).status, 400);
  assert.equal((await call("/teacher-choice", "PUT", { teacher_id: "alan" }, { "x-learning-owner": "bob" })).status, 409);
  assert.equal((await call("/teacher-choice", "POST", { teacher_id: "alan" })).status, 404);
  assert.equal((await (await call("/teacher-choice")).json()).choice.teacher_id, "alan");
});

test("learning map and achievements are per account, start empty, and validate the offset", async () => {
  await call("/events", "POST", { events: [event("map-question")] });
  const map = await (await call("/map?utc_offset_minutes=480")).json();
  assert.deepEqual([map.profile_id, map.rules_version, map.utc_offset_minutes, map.topics], ["alice", "map-states-v1", 480, []]);
  const achievements = await (await call("/achievements")).json();
  assert.deepEqual([achievements.rules_version, achievements.achievements], ["achievements-v1", []]);
  assert.equal((await call("/map?utc_offset_minutes=900")).status, 400);
  assert.equal((await call("/map?utc_offset_minutes=8.5")).status, 400);
  assert.equal((await call("/map?owner=bob")).status, 400);
  assert.equal((await call("/achievements", "POST", {})).status, 404);
});
