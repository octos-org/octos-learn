import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
