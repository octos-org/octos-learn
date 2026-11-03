import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProductServer } from "../product-server.mjs";
import { makePackage } from "./test-package.mjs";

async function withServer(run) {
  const root = await mkdtemp(join(tmpdir(), "learner-lessons-"));
  const server = createProductServer({ historyDatabasePath: join(root, "history.sqlite"), registryRoot: root,
    fetchImpl: async (_url, init) => init.headers.authorization === "Bearer bob" ? Response.json({ profile: { id: "bob" } })
      : init.headers.authorization ? Response.json({ profile: { id: "alice" } }) : new Response(null, { status: 401 }) });
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, { token = "alice", ...init } = {}) => fetch(base + path, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
    await run(call);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
}
const recording = { schema: "octos.learner-recording.v1", id: "rec-one", topic: { text: "Slope", type: "on_map_lit", starTopicId: "mt_slope" }, goals: [], cards: [] };
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("a learner's lesson is saved, played back, exported and deleted only by its own account", async () => {
  await withServer(async call => {
    assert.equal((await call("/api/learn/lessons", { token: null })).status, 401);
    assert.equal((await call("/api/learn/lessons/rec-one/draft", json("PUT", { base_revision: null, recording, ink: {} }))).status, 200);
    assert.equal((await call("/api/learn/lessons/rec-one/draft", json("PUT", { base_revision: null, recording, ink: {} }))).status, 409);
    assert.equal((await call("/api/learn/lessons/rec-one", { token: "bob" })).status, 404);

    const archive = makePackage();
    assert.equal((await call("/api/learn/lessons/rec-one/package", { method: "PUT", headers: { "content-type": "text/plain" }, body: archive })).status, 415);
    assert.equal((await call("/api/learn/lessons/rec-one/package", { method: "PUT", headers: { "content-type": "application/zip" }, body: makePackage({ lessonId: "rec-two" }) })).status, 422);
    const saved = await (await call("/api/learn/lessons/rec-one/package", { method: "PUT", headers: { "content-type": "application/zip" }, body: archive })).json();
    assert.equal(saved.lesson.state, "submitted");
    assert.equal(saved.history_pending, false);

    const download = await call("/api/learn/lessons/rec-one/package");
    assert.equal(download.headers.get("content-type"), "application/zip");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), archive);
    assert.equal((await call("/api/learn/lessons/rec-one/package", { token: "bob" })).status, 404);

    const runs = await (await call("/api/learn/history/runs")).json();
    assert.deepEqual(runs.runs.map(run => run.run_id), ["taught:rec-one"]);
    const forged = { version: 1, id: "forged", kind: "lesson_taught", occurred_at: "2026-11-02T00:00:00.000Z", device_id: "tv", session_id: "learner-lessons",
      run_id: "taught:rec-x", data: { lesson_id: "rec-x", cards: 1, practice_tasks: 0, content_sha256: "a".repeat(64) } };
    assert.equal((await call("/api/learn/history/events", json("POST", { events: [forged] }))).status, 403);

    const exported = await (await call("/api/learn/lessons/rec-one/export")).json();
    assert.equal(exported.lesson.recording.id, "rec-one");
    assert.deepEqual(exported.log.map(row => row.action), ["save"]);
    assert.equal((await call("/api/learn/lessons/rec-one/approve", { method: "POST" })).status, 404);

    assert.equal((await call("/api/learn/lessons/rec-one", { method: "DELETE" })).status, 200);
    assert.deepEqual((await (await call("/api/learn/lessons")).json()).lessons, []);
    assert.deepEqual((await (await call("/api/learn/history/runs")).json()).runs, []);
    assert.equal((await call("/api/learn/lessons/rec-one/package")).status, 404);
  });
});
