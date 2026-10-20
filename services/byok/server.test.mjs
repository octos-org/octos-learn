import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { createByokServer, SERVICE_FIELDS } from "./server.mjs";
let root, server, base, calls, writes, supplierReply;
const key = "synthetic-alice-speech-key";
const otherKey = "synthetic-bob-speech-key";
const params = { auth_mode: "api-key", resource_id: "seed-tts-2.0", voice: "voice-one" };
const digest = value => createHash("sha256").update(value).digest("hex");
const file = owner => join(root, "profiles", `${owner}.json`);
const profile = async owner => JSON.parse(await readFile(file(owner), "utf8"));
async function putProfile(owner, env) { await writeFile(file(owner), JSON.stringify({ id: owner, config: { env_vars: env, unrelated: "retained" } }), { mode: 0o600 }); }
function envFor(ownKey) { return { GEMINI_API_KEY: "synthetic-llm-secret", OCTOS_LEARN_TTS_API_KEY: ownKey, OCTOS_LEARN_TTS_PARAMS: JSON.stringify({ provider: "volcano", params }) }; }
async function call(path = "", method = "GET", body, headers = {}) {
  return fetch(base + "/api/learn/byok" + path, { method, headers: { authorization: "Bearer alice", "content-type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function meta() { return (await (await call()).json()).services.tts; }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "learn-byok-test-")); await mkdir(join(root, "profiles"));
  await putProfile("alice", envFor(key)); await putProfile("bob", envFor(otherKey));
  calls = []; writes = []; supplierReply = undefined;
  server = createByokServer({ registryRoot: root,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, "/api/my/profile");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers["x-profile-id"], undefined);
      const owner = options.headers.authorization?.replace("Bearer ", "");
      if (!["alice", "bob"].includes(owner)) return Response.json({}, { status: 401 });
      const current = { ...await profile(owner), id: owner };
      if (options.method === "PUT") {
        const patch = JSON.parse(options.body); writes.push(patch);
        current.config.env_vars = Object.fromEntries(Object.entries(patch.config.env_vars).map(([k, v]) => [k, v === "********" ? current.config.env_vars[k] : v]));
        await writeFile(file(owner), JSON.stringify(current));
      }
      return Response.json({ profile: { ...current, config: { ...current.config, env_vars: Object.fromEntries(Object.keys(current.config.env_vars).map(k => [k, "********"])) } } });
    },
    supplierFetch: async (url, options) => { calls.push({ url, options }); if (supplierReply) return supplierReply(url, options); return new Response('{"code":0,"data":"bXAz"}', { headers: { "X-Api-Status-Code": "20000000" } }); },
  });
  server.prependListener("request", request => {
    if (request.headers["x-test-http2-authority"] === "yes") { request.headers[":authority"] = request.headers.host; delete request.headers.host; }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });

test("metadata never exports speech or LLM secrets, and raw sync is absent", async () => {
  const response = await call(); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  const text = await response.text(); assert.ok(!text.includes(key)); assert.ok(!text.includes("synthetic-llm-secret"));
  assert.equal(JSON.parse(text).services.tts.has_credential, true);
  assert.equal((await call("/sync", "POST")).status, 404);
});
test("authentication and Octos-resolved owner beat forged profile headers", async () => {
  assert.equal((await call("", "GET", null, { authorization: "" })).status, 401);
  assert.equal((await call("", "GET", null, { authorization: "Bearer invalid" })).status, 401);
  const response = await call("", "GET", null, { "x-profile-id": "bob" });
  assert.equal((await response.json()).profile_id, "alice");
  const own = await meta(); await call("/tts/relay", "POST", { provider: "volcano", params, payload: {}, expected_revision: own.revision });
  assert.equal(calls[0].options.headers["X-Api-Key"], key); assert.ok(!JSON.stringify(calls).includes(otherKey));
});
test("browser relay uses saved own key, fixed URL, and never forwards session authentication", async () => {
  const own = await meta();
  const response = await call("/tts/relay", "POST", { provider: "volcano", params, payload: { req_params: { text: "hello" } }, expected_revision: own.revision }, { cookie: "user-session=private" });
  assert.equal(response.status, 200); assert.equal((await response.json()).status, 200);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, SERVICE_FIELDS.tts.endpoint);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers["X-Api-Key"], key);
  assert.equal(calls[0].options.headers.authorization, undefined); assert.equal(calls[0].options.headers.cookie, undefined);
});
test("ASR and Jev use their own saved credentials and fixed transports", async () => {
  const env = envFor(key);
  env.OCTOS_LEARN_ASR_API_KEY = "synthetic-asr"; env.OCTOS_LEARN_JEV_API_KEY = "synthetic-jev";
  await putProfile("alice", env);
  await call("/asr/relay", "POST", { provider: "volcano", params: { auth_mode: "api-key", resource_id: "volc.bigasr.auc_turbo" }, payload: {} });
  await call("/admission/relay", "POST", { provider: "typesafe", params: { model: "jev-latest" }, payload: {} });
  assert.equal(calls[0].options.headers["X-Api-Sequence"], "-1");
  assert.equal(calls[1].options.headers.authorization, "Bearer synthetic-jev");
  assert.equal(calls[1].url, SERVICE_FIELDS.admission.endpoint);
});
test("explicit unsaved key tests neither persist nor borrow the saved key", async () => {
  const response = await call("/tts/relay", "POST", { provider: "volcano", params, key: "synthetic-draft", payload: {} });
  assert.equal(response.status, 200); assert.equal(calls[0].options.headers["X-Api-Key"], "synthetic-draft");
  assert.equal((await profile("alice")).config.env_vars.OCTOS_LEARN_TTS_API_KEY, key); assert.equal(writes.length, 0);
});
test("saving and parameter-only updates preserve unrelated masked credentials", async () => {
  let current = await meta();
  let response = await call("/tts", "PUT", { provider: "volcano", params: { ...params, voice: "voice-two" }, expected_revision: current.revision });
  assert.equal(response.status, 200); assert.ok(!(await response.text()).includes(key));
  assert.equal(writes[0].config.env_vars.GEMINI_API_KEY, "********");
  assert.equal((await profile("alice")).config.env_vars.GEMINI_API_KEY, "synthetic-llm-secret");
  assert.equal((await profile("alice")).config.unrelated, "retained");
  current = await meta();
  response = await call("/tts", "PUT", { provider: "volcano", params, key: "synthetic-new", expected_revision: current.revision });
  assert.equal(response.status, 200); assert.equal((await profile("alice")).config.env_vars.OCTOS_LEARN_TTS_API_KEY, "synthetic-new");
});
test("stale writes and stale saved-key calls fail without a supplier request", async () => {
  assert.equal((await call("/tts", "PUT", { provider: "volcano", params, key: "changed", expected_revision: "stale" })).status, 409);
  assert.equal((await call("/tts/relay", "POST", { provider: "volcano", params, payload: {}, expected_revision: "stale" })).status, 409);
  assert.equal(calls.length, 0); assert.equal(writes.length, 0);
});
test("new API only: rejects legacy auth, arbitrary targets, header injection and unknown fields", async () => {
  for (const body of [
    { provider: "azure", params }, { provider: "volcano", params: { ...params, app_id: "old" } },
    { provider: "volcano", params: { ...params, resource_id: "bad\nheader" } },
    { provider: "volcano", params, endpoint: "http://attacker.test" },
    { provider: "volcano", params, profile_id: "bob" }, { provider: "volcano", params, key: "bad\r\nheader" },
  ]) assert.equal((await call("/tts/relay", "POST", { ...body, payload: {} })).status, 400);
  assert.equal(calls.length, 0);
});
test("refuses cross-origin mutations", async () => {
  assert.equal((await call("/tts/relay", "POST", { provider: "volcano", params, payload: {} }, { origin: "https://other.test" })).status, 403);
  assert.equal(calls.length, 0);
});
test("refuses a symlinked or permissive private profile", async () => {
  await chmod(file("alice"), 0o644); assert.equal((await call()).status, 503);
  await rm(file("alice")); await symlink(file("bob"), file("alice")); assert.equal((await call()).status, 503);
});
async function legacy(owner, value, aad = owner) {
  const directory = join(root, "client-service-secrets"); await mkdir(directory, { recursive: true });
  const master = randomBytes(32); await writeFile(join(directory, "master.key"), master, { mode: 0o600 });
  const nonce = randomBytes(12); const cipher = createCipheriv("chacha20-poly1305", master, nonce, { authTagLength: 16 }); cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([nonce, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]);
  await writeFile(join(directory, `${digest(owner)}.enc`), encrypted, { mode: 0o600 });
}
test("migrates only caller's previous encrypted configuration through existing profile API", async () => {
  await putProfile("alice", { GEMINI_API_KEY: "synthetic-llm-secret" });
  await legacy("alice", { tts: { provider: "volcano", params, key, enabled: true, revision: "old" } });
  const response = await call("/prepare", "POST"); assert.equal(response.status, 200);
  const text = await response.text(); assert.ok(!text.includes(key)); assert.equal(JSON.parse(text).services.tts.params.voice, "voice-one");
  assert.equal((await profile("alice")).config.env_vars.OCTOS_LEARN_TTS_API_KEY, key);
  assert.equal((await profile("bob")).config.env_vars.OCTOS_LEARN_TTS_API_KEY, otherKey);
});
test("deletion and clearing cannot resurrect a key from the old encrypted vault", async () => {
  await legacy("alice", { tts: { provider: "volcano", params, key: "legacy-key" } });
  const current = await meta(); assert.equal((await call("/tts", "DELETE", { expected_revision: current.revision })).status, 200);
  const response = await call("/prepare", "POST"); assert.equal((await response.json()).services.tts, undefined);
  assert.equal(writes.length, 1);
});
test("migration never replaces newly entered settings, and AAD forbids other owners", async () => {
  await legacy("alice", { tts: { provider: "volcano", params, key: "legacy-key" } });
  assert.equal((await call("/prepare", "POST")).status, 200);
  assert.equal((await profile("alice")).config.env_vars.OCTOS_LEARN_TTS_API_KEY, key);
  await putProfile("alice", {}); await legacy("alice", { tts: { provider: "volcano", params, key } }, "bob");
  const response = await call("/prepare", "POST"); assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(key));
});
test("corrupt service metadata never exports arbitrary raw profile contents", async () => {
  const env = envFor(key); env.OCTOS_LEARN_TTS_PARAMS = JSON.stringify({ provider: "volcano", params: { secret: key } });
  await putProfile("alice", env); const response = await call(); assert.equal(response.status, 400); assert.ok(!(await response.text()).includes(key));
});

test("supplier errors and network failures are sanitized and never retried", async () => {
  supplierReply = async () => new Response(key, { status: 401 });
  let response = await call("/tts/relay", "POST", { provider: "volcano", params, payload: {} });
  assert.deepEqual(await response.json(), { status: 401, body: "", code: null }); assert.equal(calls.length, 1);
  supplierReply = async () => { throw new Error(key); };
  response = await call("/tts/relay", "POST", { provider: "volcano", params, payload: {} });
  assert.equal(response.status, 502); assert.ok(!(await response.text()).includes(key)); assert.equal(calls.length, 2);
});
test("client cancellation aborts the supplier request", async () => {
  let started, cancelled;
  const ready = new Promise(resolve => { started = resolve; });
  const ended = new Promise(resolve => { cancelled = resolve; });
  supplierReply = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => { cancelled(); reject(new Error("cancelled")); }, { once: true }); started();
  });
  const controller = new AbortController();
  const result = fetch(base + "/api/learn/byok/tts/relay", { method: "POST", headers: { authorization: "Bearer alice" }, signal: controller.signal, body: JSON.stringify({ provider: "volcano", params, payload: {} }) });
  await ready; controller.abort(); await assert.rejects(result, { name: "AbortError" });
  await Promise.race([ended, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Supplier was not cancelled")), 1000).unref())]);
  assert.equal(calls.length, 1);
});

test("HTTPS development accepts same-origin HTTP/2 authority without a Host header", async () => {
  const response = await call("/prepare", "POST", null, { origin: base, "x-test-http2-authority": "yes" });
  assert.equal(response.status, 200); assert.equal((await response.json()).profile_id, "alice");
});
