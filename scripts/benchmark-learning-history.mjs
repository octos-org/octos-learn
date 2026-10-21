// Synthetic local storage benchmark, not the course-generation latency gate.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { HistoryStore } from "../services/learning-history/store.mjs";

const root = await mkdtemp(join(tmpdir(), "learning-history-bench-"));
const file = join(root, "history.sqlite");
const store = new HistoryStore(file);
const samples = [];
try {
  const started = performance.now();
  for (let start = 0; start < 10000; start += 100) {
    store.append("fixture", Array.from({ length: 100 }, (_, index) => {
      const n = start + index;
      return { version: 1, id: `event-${n}`, kind: "question_submitted", occurred_at: "2026-10-21T08:00:00.000Z",
        device_id: "fixture-device", session_id: "fixture-board", run_id: `run-${n % 1000}`, question_id: `question-${n}`,
        data: { text: "Synthetic question without account data", modality: "text" } };
    }));
  }
  const admission = performance.now() - started;
  for (let i = 0; i < 21; i++) {
    const begin = performance.now();
    const tick = new Promise(resolve => setTimeout(() => resolve(performance.now() - begin), 0));
    store.listRuns("fixture", { limit: 20 });
    samples.push({ query_ms: performance.now() - begin, timer_ms: await tick });
  }
  const blocker = new DatabaseSync(file);
  let busy;
  try {
    blocker.exec("BEGIN IMMEDIATE");
    const begin = performance.now();
    try { store.deleteRun("fixture", "blocked"); }
    catch (error) { busy = { sqlite_code: error.errcode & 255, elapsed_ms: performance.now() - begin }; }
    blocker.exec("ROLLBACK");
  } finally { blocker.close(); }
  const query = samples.map(item => item.query_ms).sort((a, b) => a - b);
  console.log(JSON.stringify({ node: process.version, fixture_events: 10000, fixture_runs: 1000, admission_ms: admission,
    history_list_p50_ms: query[10], history_list_max_ms: query.at(-1), timer_max_ms: Math.max(...samples.map(item => item.timer_ms)),
    write_lock: busy, scope: "synthetic local storage only; not course/TTS latency or production capacity" }, null, 2));
} finally { store.close(); await rm(root, { recursive: true, force: true }); }
