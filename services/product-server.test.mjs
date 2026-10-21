import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProductServer } from "./product-server.mjs";

test("normal product listener serves both prefixes with the same Octos identity gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "learn-product-"));
  await mkdir(join(root, "profiles"));
  await writeFile(join(root, "profiles/alice.json"), JSON.stringify({ id: "alice", config: { env_vars: {} } }), { mode: 0o600 });
  const server = createProductServer({ registryRoot: root, historyDatabasePath: join(root, "history.sqlite"),
    fetchImpl: async () => Response.json({ profile: { id: "alice", config: { env_vars: {} } } }),
  });
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ["/api/learn/byok", "/api/learn/history/runs"]) {
      const response = await fetch(base + path, { headers: { authorization: "Bearer synthetic" } });
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
    assert.equal((await fetch(base + "/unknown")).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});
