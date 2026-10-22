// Phase-one diagnostic only. It never invokes a skill/model or submits valid
// classroom/memory writes. --live logs into the existing loopback solo account.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--live") options.live = true;
  else if (["--output", "--taxonomy-topics", "--installed-skill"].includes(arg)) {
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${arg}`);
    options[arg.slice(2)] = resolve(args[++i]);
  } else throw new Error(`Unknown option: ${arg}`);
}

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function check(condition, label) {
  if (!condition) throw new Error(label);
}
function revision(repo) {
  return execFileSync("git", ["-C", resolve(root, "..", repo), "rev-parse", "HEAD"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}
function summarizeActions(manifest) {
  return manifest.actions.filter((action) => action.id.startsWith("learning.lesson.generate"))
    .map(({ id, input_schema: schema }) => ({
      id,
      learner_context: Object.hasOwn(schema.properties, "learner_context"),
      tutor_context: Object.hasOwn(schema.properties, "tutor_context"),
      accepts_extra_fields: schema.additionalProperties !== false,
    }));
}

async function inspectMapping() {
  const mapping = await json(resolve(root, "docs/personalized-teachers-phase1/topic-mapping.draft.json"));
  const courseRoot = resolve(root, "../octos-course-library/courses", mapping.pack_id);
  const manifest = await json(resolve(courseRoot, "manifest.json"));
  check(manifest.packId === mapping.pack_id, "Mapping course identity changed; review required");
  check(manifest.version === mapping.pack_version, "Mapping course version changed; review required");
  const bytes = await readFile(resolve(courseRoot, manifest.entry));
  check(sha256(bytes) === mapping.entry_sha256, "Mapping course content changed; review required");
  const events = bytes.toString("utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const steps = events.filter((event) => event.event === "lesson.step").map((event) => event.step);
  const tasks = events.find((event) => event.event === "lesson.open").lesson.tasks ?? [];
  const stepIds = new Set(steps.map((step) => step.id));
  const taskIds = new Set(tasks.map((task) => task.as));
  for (const item of mapping.coverage) {
    check(item.step_ids.length > 0, "Coverage must name actual steps");
    check(item.step_ids.every((id) => stepIds.has(id)), "Mapping references an unknown step");
    check(item.task_ids.every((id) => taskIds.has(id)), "Mapping references an unknown task");
    check(item.topic_coverage === "partial", "Draft mapping cannot certify whole-topic mastery");
  }
  const allTaskIds = mapping.coverage.flatMap((item) => item.task_ids);
  check([...taskIds].every((id) => allTaskIds.includes(id)), "Mapping omits a course task");
  const result = {
    status: mapping.review_status,
    pack_id: manifest.packId,
    version: manifest.version,
    entry_sha256: mapping.entry_sha256,
    steps: steps.length,
    beats: steps.reduce((count, step) => count + step.beats.length, 0),
    tasks: tasks.length,
    references_valid: true,
    taxonomy_ids_verified: false,
  };
  if (options["taxonomy-topics"]) {
    const topicsBytes = await readFile(options["taxonomy-topics"]);
    check(sha256(topicsBytes) === mapping.taxonomy.topics_sha256, "Taxonomy snapshot hash mismatch");
    const ids = new Set(JSON.parse(topicsBytes).topics.map((topic) => topic.id));
    check(mapping.coverage.every((item) => ids.has(item.topic_id)), "Unknown taxonomy topic ID");
    result.taxonomy_ids_verified = true;
    result.taxonomy_commit = mapping.taxonomy.commit;
  }
  return result;
}

async function inspectLive() {
  // Fixed loopback address: never accept a URL/token that could accidentally
  // target a hosted account. Tokens and personal response text stay in memory.
  const base = "http://127.0.0.1:50080";
  async function request(path, init) {
    const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(8000) });
    check(response.ok, `Local ${path} returned HTTP ${response.status}`);
    return response.json();
  }
  const health = await request("/health");
  const status = await request("/api/auth/status");
  check(status.local_solo_enabled && status.solo_profile_exists, "Existing local solo account required");
  const login = await request("/api/auth/solo", { method: "POST" });
  check(typeof login.token === "string" && login.token.length > 0, "Solo login returned no token");
  const url = new URL("ws://127.0.0.1:50080/api/ui-protocol/ws");
  url.searchParams.set("token", login.token);
  url.searchParams.append("ui_feature", "auxiliary.rest_to_ws.v1");
  const ws = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  ws.addEventListener("message", ({ data }) => {
    if (typeof data !== "string") return;
    let envelope;
    try { envelope = JSON.parse(data); } catch { return; }
    const resolveResponse = pending.get(envelope.id);
    if (resolveResponse) resolveResponse(envelope);
  });
  function rpc(method, params) {
    const id = `memory-audit-${++sequence}`;
    return new Promise((resolveResponse, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 8000);
      pending.set(id, (envelope) => { clearTimeout(timer); pending.delete(id); resolveResponse(envelope); });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }
  const cases = [];
  try {
    await new Promise((resolveOpen, reject) => {
      const timer = setTimeout(() => reject(new Error("Local WebSocket open timeout")), 8000);
      ws.addEventListener("open", () => { clearTimeout(timer); resolveOpen(); }, { once: true });
      ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Local WebSocket unavailable")); }, { once: true });
    });
    const overview = await rpc("memory/overview", {});
    check(!overview.error && overview.result?.overview?.ok === true,
      `Memory overview unavailable: ${JSON.stringify({
        code: overview.error?.code, kind: overview.error?.data?.kind,
        result_keys: Object.keys(overview.result ?? {}),
        overview_ok: overview.result?.overview?.ok,
      })}`);
    cases.push({ method: "memory/overview", outcome: "ok", refresh_enabled: overview.result.overview.refresh_enabled });
    // Intentionally invalid DTOs: rejection happens before any store write
    // or embedding/model call. No valid mutation payload is ever sent.
    for (const [method, params] of [
      ["session/append_message", {}],
      ["memory/search", { query: "" }],
      ["memory/load", {}],
      ["memory/ingest", { records: [{}], embed: false }],
      ["memory/request", { request_id: "memory-audit-invalid", operation: "remember", content: "" }],
      ["memory/promote", { limit: 0 }],
    ]) {
      const response = await rpc(method, params);
      check(response.error?.code === -32602, `Expected invalid_params from ${method}`);
      cases.push({ method, outcome: "invalid_params", code: response.error.code });
    }
    return { version: health.version, existing_solo_account: true, cases };
  } finally {
    ws.close();
  }
}

const report = {
  schema_version: 1,
  recorded_at: new Date().toISOString(),
  diagnostic_script_sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  mode: options.live ? "source-and-local-runtime" : "source-only",
  revisions: Object.fromEntries(["octos-learn", "octos", "learning-coach", "octos-lesson-language", "octos-course-library"]
    .map((repo) => [repo, revision(repo)])),
  source_actions: summarizeActions(await json(resolve(root, "../learning-coach/manifest.json"))),
  mapping: await inspectMapping(),
};
if (options["installed-skill"]) {
  const installed = resolve(options["installed-skill"]);
  report.installed_actions = summarizeActions(await json(resolve(installed, "manifest.json")));
  report.installed_skill_instructions_match_source =
    sha256(await readFile(resolve(installed, "SKILL.md"))) ===
    sha256(await readFile(resolve(root, "../learning-coach/SKILL.md")));
}
if (options.live) report.runtime = await inspectLive();
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (options.output) await writeFile(options.output, serialized);
process.stdout.write(serialized);
