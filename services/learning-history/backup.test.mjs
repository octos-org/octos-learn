import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backupHistoryDatabase } from "./backup.mjs";
import { HistoryStore } from "./store.mjs";

test("backup includes committed WAL rows and deletion receipts; existing files are never replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "learn-history-backup-"));
  const source = join(root, "source.sqlite"), destination = join(root, "backup.sqlite");
  const live = new HistoryStore(source);
  const e = (id, run) => ({ version: 1, id, run_id: run, kind: "question_submitted", occurred_at: "2026-10-21T08:00:00.000Z", device_id: "tv", session_id: "board", question_id: id, data: { text: "学习记录", modality: "text" } });
  try {
    live.append("alice", [e("keep", "live"), e("remove", "deleted")]);
    live.deleteRun("alice", "deleted");
    await backupHistoryDatabase(source, destination);
    const restored = new HistoryStore(destination);
    try {
      assert.equal(restored.runEvents("alice", "live").events.length, 1);
      assert.equal(restored.append("alice", [e("remove", "deleted")]).results[0].status, "deleted");
      assert.equal(restored.append("alice", [e("late", "deleted")]).results[0].status, "deleted");
    } finally { restored.close(); }
    await assert.rejects(backupHistoryDatabase(source, destination), error => error.code === "EEXIST");
    await assert.rejects(backupHistoryDatabase(source, source));
    if (process.platform !== "win32") assert.equal((await stat(destination)).mode & 0o777, 0o600);
  } finally { live.close(); await rm(root, { recursive: true, force: true }); }
});
