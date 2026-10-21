// Isolated local HTTP fixture: storage impact on the existing shared speech
// relay process. This does not measure paid model course generation or real
// supplier TTS latency and must not be reported as that performance gate.
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { HistoryStore } from "../services/learning-history/store.mjs";
import { createProductServer } from "../services/product-server.mjs";
import { createByokServer } from "../services/byok/server.mjs";

const root = await mkdtemp(join(tmpdir(), "history-relay-benchmark-"));
const file = join(root, "history.sqlite");
const params = { auth_mode: "api-key", resource_id: "seed-tts-2.0", voice: "fixture" };
let suppliers = 0;
const headers = { authorization: "Bearer fixture", "content-type": "application/json" };
const fact = n => ({ version: 1, id: `e-${n}`, kind: "question_submitted", occurred_at: "2026-10-21T08:00:00.000Z", device_id: "fixture", session_id: "fixture", run_id: `run-${n % 1000}`, question_id: `q-${n}`, data: { text: "Synthetic benchmark", modality: "text" } });
const options = { registryRoot: root, historyDatabasePath: file,
  fetchImpl: async () => Response.json({ profile: { id: "fixture", config: { env_vars: {} } } }),
  supplierFetch: async () => { suppliers++; await new Promise(resolve => setTimeout(resolve, 5)); return new Response('{"code":0,"data":"bXAz"}', { headers: { "X-Api-Status-Code": "20000000" } }); },
};
const legacy = createByokServer(options), candidate = createProductServer(options);
const store = new HistoryStore(file);
let blocker;
async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); return `http://127.0.0.1:${server.address().port}`;
}
async function relay(base, revision) {
  const begin = performance.now();
  const response = await fetch(`${base}/api/learn/byok/tts/relay`, { method: "POST", headers, body: JSON.stringify({ provider: "volcano", params, expected_revision: revision, payload: {} }) });
  assert.equal(response.status, 200); await response.arrayBuffer(); return performance.now() - begin;
}
try {
  await mkdir(join(root, "profiles"));
  await writeFile(join(root, "profiles/fixture.json"), JSON.stringify({ id: "fixture", config: { env_vars: { OCTOS_LEARN_TTS_API_KEY: "synthetic-key", OCTOS_LEARN_TTS_PARAMS: JSON.stringify({ provider: "volcano", params }) } } }), { mode: 0o600 });
  for (let i = 0; i < 10000; i += 100) store.append("fixture", Array.from({ length: 100 }, (_, j) => fact(i + j)));
  const base = await listen(legacy), next = await listen(candidate);
  const metadata = await (await fetch(`${base}/api/learn/byok`, { headers })).json();
  if (!metadata.services) throw new Error(metadata.error?.message ?? JSON.stringify(metadata.error));
  const revision = metadata.services.tts.revision;
  // Open/migrate the candidate handle before taking an independent writer lock.
  assert.equal((await fetch(`${next}/api/learn/history/runs`, { headers })).status, 200);
  blocker = new DatabaseSync(file); blocker.exec("BEGIN IMMEDIATE");
  const samples = { legacy_byok_idle: [], product_idle: [], product_with_history_query_and_busy_write: [] };
  const loaded = async n => {
    const speech = relay(next, revision);
    const [query, busy, elapsed] = await Promise.all([
      fetch(`${next}/api/learn/history/runs`, { headers }),
      fetch(`${next}/api/learn/history/events`, { method: "POST", headers, body: JSON.stringify({ events: [fact(10000 + n)] }) }), speech,
    ]);
    assert.equal(query.status, 200); assert.equal(busy.status, 503);
    await Promise.all([query.arrayBuffer(), busy.arrayBuffer()]); return elapsed;
  };
  const cases = {
    legacy_byok_idle: () => relay(base, revision),
    product_idle: () => relay(next, revision),
    product_with_history_query_and_busy_write: loaded,
  };
  const names = Object.keys(cases);
  for (let i = 0; i < 21; i++) {
    // Rotate all three cases: compare history load against the same product
    // handler at idle, while retaining the legacy process as a separate control.
    for (let offset = 0; offset < names.length; offset++) {
      const name = names[(i + offset) % names.length];
      samples[name].push(await cases[name](i));
    }
  }
  const summary = values => { const sorted = [...values].sort((a, b) => a - b); return { p50_ms: sorted[Math.floor(sorted.length / 2)], max_ms: sorted.at(-1) }; };
  assert.equal(suppliers, 63);
  console.log(JSON.stringify({ scope: "synthetic local shared-process speech relay only; not the course-generation latency gate", node: process.version,
    fixture_events: 10000, triplets: 21, interleaved: true, supplier_delay_ms: 5, supplier_requests: suppliers,
    ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summary(values)])),
  }, null, 2));
} finally {
  if (blocker) { blocker.exec("ROLLBACK"); blocker.close(); }
  await Promise.all([legacy, candidate].map(server => server.listening ? new Promise(resolve => server.close(resolve)) : undefined));
  store.close(); await rm(root, { recursive: true, force: true });
}
