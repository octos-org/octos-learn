import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, chmod, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnalysisControlStore } from "./analysis-control.mjs";

const id = "a".repeat(64);
const control = { host: `learn-topic-${"b".repeat(32)}`, peer: "topics-fixture", session: `learn-topic-${"b".repeat(32)}#peer-topics-fixture`,
  token: "synthetic-host-capability", namespace: "app/learning-topics/topics-fixture", turn: "12345678-1234-4234-8234-123456789abc" };

test("host controls survive a new device, stay private, and cannot be replaced or read through another account", async () => {
  const root = await mkdtemp(join(tmpdir(), "analysis-control-"));
  try {
    const directory = join(root, "controls"), store = new AnalysisControlStore(directory);
    assert.deepEqual(await store.list("alice"), []);
    await Promise.all([store.put("alice", id, control), store.put("alice", id, control)]);
    assert.equal((await stat(join(directory, "alice", `${id}.json`))).mode & 0o777, 0o600);
    assert.equal((await stat(join(directory, "alice"))).mode & 0o777, 0o700);
    assert.deepEqual(await new AnalysisControlStore(directory).list("alice"), [{ id, control }]);
    assert.deepEqual(await store.list("bob"), []);
    await assert.rejects(store.put("alice", id, { ...control, token: "conflicting-replacement" }), /conflicting/);
    assert.deepEqual(await store.read("alice", id), control);
    await assert.rejects(store.put("../bob", id, control));
    await assert.rejects(store.put("alice", id, { ...control, provider_key: "forbidden" }));
    await chmod(join(directory, "alice", `${id}.json`), 0o644);
    await assert.rejects(store.read("alice", id), /Unsafe/);
    await chmod(join(directory, "alice", `${id}.json`), 0o600);
    await symlink(join(directory, "alice", `${id}.json`), join(directory, "alice", `${"c".repeat(64)}.json`));
    await assert.rejects(store.read("alice", "c".repeat(64)));
    await mkdir(join(directory, "bob"));
    await symlink(join(directory, "bob"), join(directory, "mallory"));
    await assert.rejects(store.list("mallory"), /escapes account scope/);
    await store.remove("alice", id); await store.remove("alice", id);
  } finally { await rm(root, { recursive: true, force: true }); }
});
