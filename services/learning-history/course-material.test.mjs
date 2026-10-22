import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HistoryStore } from "./store.mjs";
import { HistoryValidationError } from "./event-contract.mjs";
import { backupHistoryDatabase } from "./backup.mjs";

const material = text => JSON.stringify([{ event: "lesson.open", lesson_id: "one" }, { event: "lesson.step", lesson_id: "one", step: { id: "step-one", beats: [{ id: "beat-one", narration: { text } }] } }]);
const delivery = (id, snapshot) => ({ version: 1, id, kind: "course_delivered", occurred_at: "2026-10-22T00:00:00.000Z", device_id: "tv", session_id: "board", question_id: "q1", run_id: "run-one", course: { kind: "generated", id: "q1", version: "q1" },
  data: { artifact: "lesson.jsonl", status: "partial", snapshot_sha256: createHash("sha256").update(snapshot).digest("hex"), event_count: 2 } });
const pair = (event, snapshot) => ({ event_id: event.id, snapshot_json: snapshot });

test("preserves exact partial and revised bytes across restart and backup; retries do not substitute a later artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "course-material-"));
  let store = new HistoryStore(join(root, "live.sqlite"));
  try {
    const first = material("直线的斜率"), second = material("直线的纵截距");
    const a = delivery("first", first), b = delivery("second", second);
    store.append("alice", [a], [pair(a, first)]);
    store.append("alice", [b], [pair(b, second)]);
    assert.equal(store.append("alice", [a], [pair(a, first)]).results[0].status, "exists");
    assert.equal(store.courseMaterial("bob", a.id), null);
    await backupHistoryDatabase(join(root, "live.sqlite"), join(root, "copy.sqlite"));
    store.close(); store = new HistoryStore(join(root, "copy.sqlite"));
    assert.equal(store.courseMaterial("alice", a.id).snapshot_json, first);
    assert.equal(store.courseMaterial("alice", b.id).snapshot_json, second);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM course_materials").get().n, 2);
    store.deleteRun("alice", a.run_id);
    assert.equal(store.courseMaterial("alice", a.id), null);
    assert.equal(store.append("alice", [a], [pair(a, first)]).results[0].status, "deleted");
    assert.equal(store.courseMaterial("alice", a.id), null);
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
});

test("rejects a changed snapshot, missing delivery, invalid count, and rolls back material writes together with facts", () => {
  const store = new HistoryStore(":memory:");
  try {
    const snapshot = material("实际讲解"), event = delivery("one", snapshot);
    for (const [events, materials] of [
      [[event], [pair(event, material("被替换的讲解"))]],
      [[event], [{ event_id: "missing", snapshot_json: snapshot }]],
      [[{ ...event, data: { ...event.data, event_count: 3 } }], [pair(event, snapshot)]],
      [[event], [pair(event, snapshot), pair(event, snapshot)]],
      [[event, { ...event, data: { ...event.data, artifact: "other.jsonl" } }], [pair(event, snapshot)]],
    ]) assert.throws(() => store.append("alice", events, materials), HistoryValidationError);
    assert.equal(store.upperBound("alice"), 0);
    store.db.exec("CREATE TRIGGER fail_material BEFORE INSERT ON course_materials BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.throws(() => store.append("alice", [event], [pair(event, snapshot)]));
    assert.equal(store.upperBound("alice"), 0);
    assert.equal(store.courseMaterial("alice", event.id), null);
    store.db.exec("DROP TRIGGER fail_material");
    // Old clients can still send facts without a snapshot. A later identical
    // delivery may fill in the bytes without changing the original fact.
    store.append("alice", [event]);
    store.append("alice", [event], [pair(event, snapshot)]);
    store.deleteSession("alice", "board");
    assert.equal(store.courseMaterial("alice", event.id), null);
  } finally { store.close(); }
});
