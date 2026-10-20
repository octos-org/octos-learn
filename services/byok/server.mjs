import { createServer } from "node:http";
import { createHash, createDecipheriv, randomUUID } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";

export const SERVICE_FIELDS = {
  asr: { key: "OCTOS_LEARN_ASR_API_KEY", params: "OCTOS_LEARN_ASR_PARAMS", provider: "volcano", endpoint: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash" },
  tts: { key: "OCTOS_LEARN_TTS_API_KEY", params: "OCTOS_LEARN_TTS_PARAMS", provider: "volcano", endpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional" },
  admission: { key: "OCTOS_LEARN_JEV_API_KEY", params: "OCTOS_LEARN_JEV_PARAMS", provider: "typesafe", endpoint: "https://api.typesafe.ai/v1/systemone" },
};
const PREFIX = "/api/learn/byok";
const VERSION = "OCTOS_LEARN_BYOK_VERSION";
const hash = value => createHash("sha256").update(value).digest("hex");
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const object = value => value && typeof value === "object" && !Array.isArray(value);
function unwrap(value) {
  const profile = value?.profile?.profile ?? value?.profile ?? value;
  if (!profile?.id || !object(profile.config?.env_vars)) throw new HttpError(502, "Octos profile response unavailable.");
  return profile;
}
function fields(capability) {
  if (!Object.hasOwn(SERVICE_FIELDS, capability)) throw new HttpError(404, "Unknown service.");
  return SERVICE_FIELDS[capability];
}
function validateDraft(capability, draft, allowMissingKey = true) {
  const definition = fields(capability);
  if (!object(draft) || draft.provider !== definition.provider || !object(draft.params)
    || Object.keys(draft).some(k => !["provider", "enabled", "params", "key", "expected_revision"].includes(k))
    || Object.keys(draft.params).some(k => !(capability === "admission" ? ["model"] : ["auth_mode", "resource_id", "voice"]).includes(k))
    || Object.entries(draft.params).some(([k, v]) => k.length > 80 || typeof v !== "string" || v.length > 1024 || /[\r\n]/.test(v))
    || (draft.key !== undefined && (typeof draft.key !== "string" || draft.key.length > 8192 || /[\r\n]/.test(draft.key)))) {
    throw new HttpError(400, "Invalid service configuration.");
  }
  if (!allowMissingKey && !draft.key?.trim()) throw new HttpError(400, "Enter your own service key.");
  if (capability !== "admission" && ((draft.params.auth_mode && draft.params.auth_mode !== "api-key") || draft.params.app_id)) {
    throw new HttpError(400, "Use the new Volcano speech API Key.");
  }
  return draft;
}
function savedService(env, capability) {
  const definition = fields(capability);
  const key = typeof env[definition.key] === "string" ? env[definition.key].trim() : "";
  let record;
  try { record = JSON.parse(env[definition.params] || "null"); } catch { /* reported as unsupported metadata, never leak content */ }
  if (!key && !record) return undefined;
  if (key.startsWith("keychain:")) throw new HttpError(503, "This service credential uses an unsupported secret-store reference. Enter a speech API Key in settings.");
  const defaults = capability === "admission" ? { model: "jev-latest" } : { auth_mode: "api-key", resource_id: capability === "tts" ? "seed-tts-2.0" : "volc.bigasr.auc_turbo", ...(capability === "tts" ? { voice: "" } : {}) };
  const provider = record?.provider ?? definition.provider;
  const params = object(record?.params) ? record.params : defaults;
  validateDraft(capability, { provider, params, key });
  return { provider, params, key, enabled: !!key, execution_target: "client",
    credential_revision: key ? hash(key) : "", revision: hash(JSON.stringify({ provider, params, key })) };
}
function metadata(profileId, env) {
  const services = {};
  for (const capability of Object.keys(SERVICE_FIELDS)) {
    const saved = savedService(env, capability);
    if (saved) { const { key, ...rest } = saved; services[capability] = { ...rest, has_credential: !!key }; }
  }
  return { profile_id: profileId, services };
}
function authHeaders(request) {
  const headers = {};
  for (const field of ["authorization", "cookie"]) {
    if (typeof request.headers[field] === "string") headers[field] = request.headers[field];
  }
  if (!headers.authorization && !headers.cookie) throw new HttpError(401, "Authentication required.");
  return headers;
}
async function limitedText(response, limit, signal) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new HttpError(502, "Request cancelled.");
      if (done) break;
      size += value.length;
      if (size > limit) throw new HttpError(502, "Supplier response too large.");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  return Buffer.concat(chunks).toString("utf8");
}
async function readJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new HttpError(413, "Request too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new HttpError(400, "Invalid JSON request."); }
}
async function privateBytes(file, maxBytes) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes || (stat.mode & 0o077) !== 0) throw new Error("Unsafe credential file");
    return await handle.readFile();
  } finally { await handle.close(); }
}

/** Product-only adapter. Octos stays unmodified; no endpoint exports saved keys. */
export function createByokHandler({ octosBaseUrl = "http://127.0.0.1:50080", registryRoot = join(homedir(), ".octos"), fetchImpl = fetch, supplierFetch = fetch, migrateLegacy = true } = {}) {
  const base = new URL(octosBaseUrl).origin;
  const locks = new Map();
  const perOwner = new Map(); let active = 0;
  async function octos(request, method = "GET", body) {
    const response = await fetchImpl(`${base}/api/my/profile`, { method, redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { ...authHeaders(request), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new HttpError([401, 403].includes(response.status) ? response.status : 502, "Octos profile request failed.");
    return unwrap(JSON.parse(await limitedText(response, 2 * 1024 * 1024)));
  }
  async function readEnv(owner) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(owner)) throw new HttpError(403, "Invalid profile identity.");
    try {
      const directory = await realpath(join(resolve(registryRoot), "profiles"));
      const bytes = await privateBytes(join(directory, `${owner}.json`), 2 * 1024 * 1024);
      const profile = JSON.parse(bytes.toString("utf8"));
      if (profile.id !== owner || !object(profile.config?.env_vars)) throw new Error("Invalid profile");
      return profile.config.env_vars;
    } catch { throw new HttpError(503, "Cannot read the authenticated profile's service configuration. Check the product service registry path and file permissions."); }
  }
  async function serial(owner, run) {
    const previous = locks.get(owner) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(run);
    locks.set(owner, next);
    try { return await next; } finally { if (locks.get(owner) === next) locks.delete(owner); }
  }
  async function persist(request, profile, envPatch) {
    // Keep Octos's masked values for unrelated fields; never copy LLM secrets
    // out of the registry into this request, response or provider transport.
    const fresh = await octos(request);
    if (fresh.id !== profile.id) throw new HttpError(409, "Account changed. Reload settings.");
    const env = { ...fresh.config.env_vars, [VERSION]: "1" };
    for (const [key, value] of Object.entries(envPatch)) { if (value === null) delete env[key]; else env[key] = value; }
    await octos(request, "PUT", { config: { env_vars: env } });
    return metadata(profile.id, await readEnv(profile.id));
  }
  async function migrate(request, profile, env) {
    if (!migrateLegacy || env[VERSION]) return metadata(profile.id, env);
    const directory = join(resolve(registryRoot), "client-service-secrets");
    let encrypted;
    try { encrypted = await privateBytes(join(directory, `${hash(profile.id)}.enc`), 128 * 1024); }
    catch (error) { if (error.code === "ENOENT") return metadata(profile.id, env); throw new HttpError(503, "Previous service settings could not be migrated. They have not been deleted."); }
    try {
      const master = await privateBytes(join(directory, "master.key"), 32);
      const decipher = createDecipheriv("chacha20-poly1305", master, encrypted.subarray(0, 12), { authTagLength: 16 });
      decipher.setAAD(Buffer.from(profile.id)); decipher.setAuthTag(encrypted.subarray(-16));
      const legacy = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]).toString("utf8"));
      const patch = {};
      for (const capability of Object.keys(SERVICE_FIELDS)) {
        const saved = legacy[capability]; const definition = fields(capability);
        if (!saved?.key?.trim() || env[definition.key]) continue;
        validateDraft(capability, { provider: saved.provider, params: saved.params, key: saved.key });
        patch[definition.key] = saved.key.trim(); patch[definition.params] = JSON.stringify({ provider: saved.provider, params: saved.params });
      }
      // Mark even an empty migration so deleting a key cannot resurrect it.
      return await persist(request, profile, patch);
    } catch { throw new HttpError(503, "Previous service settings could not be migrated. They have not been deleted."); }
  }
  return async function handle(request, response) {
    const pathname = new URL(request.url, "http://local").pathname;
    if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return false;
    const send = (status, value) => {
      if (response.destroyed) return;
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0", pragma: "no-cache", vary: "Authorization, Cookie" });
      response.end(JSON.stringify(value));
    };
    try {
      const origin = request.headers.origin;
      const host = request.headers.host ?? request.headers[":authority"];
      if (origin && new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request refused.");
      const profile = await octos(request);
      const suffix = pathname.slice(PREFIX.length).split("/").filter(Boolean);
      if (request.method === "GET" && suffix.length === 0) { send(200, metadata(profile.id, await readEnv(profile.id))); return true; }
      if (request.method === "POST" && suffix[0] === "prepare" && suffix.length === 1) {
        send(200, await serial(profile.id, async () => migrate(request, profile, await readEnv(profile.id)))); return true;
      }
      const capability = suffix[0]; fields(capability);
      if (suffix.length === 1 && ["PUT", "DELETE"].includes(request.method)) {
        const body = await readJson(request);
        send(200, await serial(profile.id, async () => {
          const env = await readEnv(profile.id); const definition = fields(capability);
          const current = savedService(env, capability);
          if ((body.expected_revision ?? null) !== (current?.revision ?? null)) throw new HttpError(409, "Configuration changed. Reload settings.");
          if (request.method === "DELETE") {
            if (Object.keys(body).some(k => k !== "expected_revision")) throw new HttpError(400, "Invalid deletion.");
            return persist(request, profile, { [definition.key]: null, [definition.params]: null });
          }
          const draft = validateDraft(capability, body);
          return persist(request, profile, { [definition.key]: draft.key === undefined ? current?.key || null : draft.key.trim() || null, [definition.params]: JSON.stringify({ provider: draft.provider, params: draft.params }) });
        }));
        return true;
      }
      if (request.method === "POST" && suffix.length === 2 && suffix[1] === "relay") {
        const body = await readJson(request);
        if (!object(body) || Object.keys(body).some(k => !["provider", "params", "key", "payload", "expected_revision"].includes(k))) throw new HttpError(400, "Invalid relay request.");
        const saved = savedService(await readEnv(profile.id), capability);
        if (!body.key && body.expected_revision && body.expected_revision !== saved?.revision) throw new HttpError(409, "Configuration changed. Reload Voice.");
        const draft = validateDraft(capability, { provider: body.provider, params: body.params, key: body.key === undefined ? saved?.key : body.key }, false);
        if (capability !== "admission" && !draft.params.resource_id?.trim()) throw new HttpError(400, "Enter a resource ID.");
        if (active >= 16 || (perOwner.get(profile.id) ?? 0) >= 4) throw new HttpError(429, "Service relay busy. Try again later.");
        active++; perOwner.set(profile.id, (perOwner.get(profile.id) ?? 0) + 1);
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 30000);
        const cancelled = () => { if (!response.writableEnded) controller.abort(); };
        response.on("close", cancelled);
        try {
          const headers = { "content-type": "application/json" };
          if (capability === "admission") headers.authorization = `Bearer ${draft.key.trim()}`;
          else {
            headers["X-Api-Key"] = draft.key.trim(); headers["X-Api-Resource-Id"] = draft.params.resource_id;
            headers["X-Api-Request-Id"] = randomUUID();
            if (capability === "asr") headers["X-Api-Sequence"] = "-1";
          }
          const upstream = await supplierFetch(fields(capability).endpoint, { method: "POST", headers, body: JSON.stringify(body.payload), redirect: "error", signal: controller.signal });
          const code = upstream.headers.get("X-Api-Status-Code");
          const text = upstream.ok ? await limitedText(upstream, 12 * 1024 * 1024, controller.signal) : "";
          if (!upstream.ok) await upstream.body?.cancel().catch(() => {});
          send(200, { status: upstream.status, body: text, code: code && /^\d{7,8}$/.test(code) ? code : null });
        } finally {
          clearTimeout(deadline); response.off("close", cancelled);
          active--;
          const remaining = (perOwner.get(profile.id) ?? 1) - 1;
          if (remaining > 0) perOwner.set(profile.id, remaining); else perOwner.delete(profile.id);
        }
        return true;
      }
      throw new HttpError(404, "Unknown service endpoint.");
    } catch (error) { send(error instanceof HttpError ? error.status : 502, { error: error instanceof HttpError ? error.message : "Service request failed. Check configuration and connection." }); }
    return true;
  };
}

export function createByokServer(options) {
  const handle = createByokHandler(options);
  return createServer(async (request, response) => {
    if (!await handle(request, response)) { response.writeHead(404); response.end(); }
  });
}
