import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const JSON_TYPE = "application/json; charset=utf-8";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 5_000;

export class HttpError extends Error {
  constructor(status, message, retryAfter = undefined) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function loadConfig(env = process.env) {
  const endpoint = env.VOLC_TTS_ENDPOINT?.trim()
    || "https://openspeech.bytedance.com/api/v1/tts";
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== "https:" || parsedEndpoint.hostname !== "openspeech.bytedance.com") {
    throw new Error("VOLC_TTS_ENDPOINT must be HTTPS on openspeech.bytedance.com");
  }
  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: parseInteger(env.PORT, 50_081, 1, 65_535),
    octosBaseUrl: env.OCTOS_BASE_URL?.trim() || "http://127.0.0.1:50080",
    databasePath: env.DATABASE_PATH?.trim() || "/var/lib/octos-learn/hosted-tts/usage.sqlite",
    appid: env.VOLC_TTS_APPID?.trim() || "",
    token: env.VOLC_TTS_TOKEN?.trim() || "",
    cluster: env.VOLC_TTS_CLUSTER?.trim() || "volcano_tts",
    voice: env.VOLC_TTS_VOICE?.trim() || "BV001_streaming",
    encoding: env.VOLC_TTS_ENCODING?.trim() || "mp3",
    endpoint,
    maxConcurrent: parseInteger(env.HOSTED_TTS_MAX_CONCURRENT, 2, 1, 32),
    queueWaitMs: parseInteger(env.HOSTED_TTS_QUEUE_WAIT_MS, 3_000, 0, 60_000),
    requestsPerMinute: parseInteger(env.HOSTED_TTS_REQUESTS_PER_MINUTE, 60, 1, 10_000),
  };
}

function parseInteger(raw, fallback, min, max) {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid integer setting: ${raw}`);
  }
  return value;
}

export class UsageLedger {
  constructor(path, now = () => new Date()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.now = now;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS limits (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        enabled INTEGER NOT NULL,
        total INTEGER NOT NULL,
        per_user INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO limits VALUES (1, 0, 100000, 10000);
      CREATE TABLE IF NOT EXISTS usage (
        month TEXT NOT NULL,
        profile TEXT NOT NULL,
        chars INTEGER NOT NULL,
        PRIMARY KEY(month, profile)
      );
      CREATE TABLE IF NOT EXISTS dispatch (
        minute INTEGER PRIMARY KEY,
        requests INTEGER NOT NULL
      );
    `);
  }

  month() {
    return this.now().toISOString().slice(0, 7);
  }

  limits() {
    const row = this.db.prepare("SELECT enabled,total,per_user FROM limits WHERE id=1").get();
    return {
      enabled: Boolean(row.enabled),
      platform_monthly_chars: Number(row.total),
      user_monthly_chars: Number(row.per_user),
    };
  }

  setLimits(value) {
    const total = checkedLimit(value.platform_monthly_chars);
    const perUser = checkedLimit(value.user_monthly_chars);
    if (perUser > total) throw new HttpError(400, "每用户额度不能超过平台总额度。");
    this.db.prepare("UPDATE limits SET enabled=?,total=?,per_user=? WHERE id=1")
      .run(value.enabled ? 1 : 0, total, perUser);
    return this.limits();
  }

  usage(profile, month = this.month()) {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(chars),0) AS total,
             COALESCE(SUM(CASE WHEN profile=? THEN chars ELSE 0 END),0) AS user
      FROM usage WHERE month=?
    `).get(profile, month);
    return { total: Number(row.total), user: Number(row.user) };
  }

  reserve(profile, chars, requestsPerMinute) {
    const month = this.month();
    const minute = Math.floor(this.now().getTime() / 60_000);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const limits = this.limits();
      const used = this.usage(profile, month);
      if (!limits.enabled
        || used.total + chars > limits.platform_monthly_chars
        || used.user + chars > limits.user_monthly_chars) {
        throw new HttpError(429, "平台语音额度已用完或已暂停，你仍可阅读文字旁白，也可在设置中配置自己的 TTS。", 60);
      }
      const requests = Number(this.db.prepare(
        "SELECT COALESCE(SUM(requests),0) AS count FROM dispatch WHERE minute=?",
      ).get(minute).count);
      if (requests >= requestsPerMinute) {
        throw new HttpError(429, "平台语音当前请求较多，请稍后再试；文字旁白仍可使用。", 60);
      }
      this.db.prepare("DELETE FROM dispatch WHERE minute < ?").run(minute);
      this.db.prepare(`
        INSERT INTO dispatch VALUES(?,1)
        ON CONFLICT(minute) DO UPDATE SET requests=requests+1
      `).run(minute);
      this.db.prepare(`
        INSERT INTO usage(month,profile,chars) VALUES(?,?,?)
        ON CONFLICT(month,profile) DO UPDATE SET chars=chars+excluded.chars
      `).run(month, profile, chars);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

function checkedLimit(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 100_000_000) {
    throw new HttpError(400, "额度必须是 0 到 100,000,000 之间的整数。");
  }
  return value;
}

class ConcurrencyGate {
  constructor(limit, waitMs) {
    this.limit = limit;
    this.waitMs = waitMs;
    this.active = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, timer: undefined };
      entry.timer = setTimeout(() => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) this.queue.splice(index, 1);
        reject(new HttpError(429, "平台语音正在使用中，你可以继续阅读文字旁白。", 3));
      }, this.waitMs);
      this.queue.push(entry);
    });
  }

  release() {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(() => this.release());
      return;
    }
    this.active -= 1;
  }
}

function forwardedAuthHeaders(request) {
  const headers = {};
  for (const name of ["authorization", "cookie"]) {
    const value = request.headers[name];
    if (typeof value === "string" && value) headers[name] = value;
  }
  return headers;
}

function inheritsPlatform(profile) {
  const config = profile?.profile?.config || profile?.config || {};
  const provider = typeof config.tts_provider === "string" ? config.tts_provider.trim() : "";
  const cloud = config.tts_cloud;
  const token = config.env_vars?.VOLC_TTS_TOKEN;
  return (!provider || provider === "auto")
    && (cloud === null || cloud === undefined)
    && (token === null || token === undefined || String(token).trim() === "");
}

function parseText(value) {
  if (typeof value !== "string") throw new HttpError(400, "text is required");
  const text = value.trim();
  const length = [...text].length;
  if (!length || length > MAX_TEXT_CHARS) {
    throw new HttpError(400, `text must contain 1 to ${MAX_TEXT_CHARS} characters`);
  }
  return { text, length };
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body is too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

async function fetchAuthenticatedUser(request, config, fetchImpl) {
  const response = await fetchImpl(`${config.octosBaseUrl}/api/auth/me`, {
    headers: forwardedAuthHeaders(request),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new HttpError(response.status === 403 ? 403 : 401, "authentication required");
  const me = await response.json();
  if (!me?.user?.id) throw new HttpError(401, "authentication required");
  return me;
}

async function forwardPersonalSynthesis(request, body, config, fetchImpl) {
  const response = await fetchImpl(`${config.octosBaseUrl}/api/voice/synthesize`, {
    method: "POST",
    headers: { "content-type": "application/json", ...forwardedAuthHeaders(request) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(125_000),
  });
  if (!response.ok) {
    const message = (await response.text()).trim() || "个人 TTS 合成失败。";
    throw new HttpError(response.status, message);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    source: "personal",
  };
}

async function synthesizePlatform(text, config, fetchImpl) {
  const reqid = randomUUID();
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer;${config.token}`,
      "content-type": "application/json",
    },
    redirect: "error",
    body: JSON.stringify({
      app: { appid: config.appid, token: config.token, cluster: config.cluster },
      user: { uid: `octos-learn-${createHash("sha256").update(reqid).digest("hex").slice(0, 16)}` },
      audio: { voice_type: config.voice, encoding: config.encoding, speed_ratio: 1.0 },
      request: { reqid, text: ensureTerminal(text), operation: "query", text_type: "plain" },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new HttpError(502, `平台 TTS 返回 HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.code !== 3000 || typeof payload.data !== "string") {
    throw new HttpError(502, "平台 TTS 未能合成语音。");
  }
  const bytes = Buffer.from(payload.data, "base64");
  if (!bytes.length) throw new HttpError(502, "平台 TTS 返回了空音频。");
  return { bytes, contentType: audioContentType(config.encoding), source: "platform" };
}

function ensureTerminal(text) {
  return /[。！？.!?]$/u.test(text) ? text : `${text}。`;
}

function audioContentType(encoding) {
  const value = encoding.toLowerCase();
  if (value === "mp3") return "audio/mpeg";
  if (value === "wav") return "audio/wav";
  if (value === "ogg_opus" || value === "opus") return "audio/ogg";
  return "application/octet-stream";
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, { "content-type": JSON_TYPE, ...extraHeaders });
  response.end(JSON.stringify(payload));
}

export function createHandler({ config, ledger, fetchImpl = fetch, platformSynthesize = synthesizePlatform }) {
  const gate = new ConcurrencyGate(config.maxConcurrent, config.queueWaitMs);
  return async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { ok: true, configured: Boolean(config.appid && config.token) });
      }
      if (!url.pathname.startsWith("/api/learn/tts/")) throw new HttpError(404, "not found");
      const me = await fetchAuthenticatedUser(request, config, fetchImpl);
      const profileId = me.user.id;
      const usesPlatform = inheritsPlatform(me.profile);

      if (request.method === "GET" && url.pathname === "/api/learn/tts/status") {
        const limits = ledger.limits();
        const used = ledger.usage(profileId);
        const configured = Boolean(config.appid && config.token);
        const canManage = me.user.role === "admin";
        return sendJson(response, 200, {
          configured,
          available: configured && limits.enabled
            && used.total < limits.platform_monthly_chars
            && used.user < limits.user_monthly_chars,
          uses_platform: usesPlatform,
          month: ledger.month(),
          limits,
          user_used_chars: used.user,
          ...(canManage ? { platform_used_chars: used.total } : {}),
          can_manage: canManage,
        });
      }

      if (request.method === "PUT" && url.pathname === "/api/learn/tts/limits") {
        if (me.user.role !== "admin") throw new HttpError(403, "administrator access required");
        return sendJson(response, 200, ledger.setLimits(await readJson(request)));
      }

      if (request.method === "POST" && url.pathname === "/api/learn/tts/synthesize") {
        const body = await readJson(request);
        const { text, length } = parseText(body.text);
        if (!usesPlatform) {
          const result = await forwardPersonalSynthesis(request, { text }, config, fetchImpl);
          response.writeHead(200, { "content-type": result.contentType, "x-octos-tts-source": result.source });
          return response.end(result.bytes);
        }
        if (!config.appid || !config.token) throw new HttpError(503, "本站尚未提供默认 TTS。");
        const release = await gate.acquire();
        try {
          // Reserve one extra character because terminal punctuation can be appended.
          ledger.reserve(profileId, length + 1, config.requestsPerMinute);
          const result = await platformSynthesize(text, config, fetchImpl);
          response.writeHead(200, { "content-type": result.contentType, "x-octos-tts-source": result.source });
          return response.end(result.bytes);
        } finally {
          release();
        }
      }

      throw new HttpError(404, "not found");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "平台语音服务暂不可用，请继续阅读文字旁白。";
      if (!(error instanceof HttpError)) console.error("hosted TTS request failed", error);
      const headers = error instanceof HttpError && error.retryAfter
        ? { "retry-after": String(error.retryAfter) }
        : {};
      sendJson(response, status, { error: message }, headers);
    }
  };
}

export function start(env = process.env) {
  const config = loadConfig(env);
  const ledger = new UsageLedger(config.databasePath);
  const server = createServer(createHandler({ config, ledger }));
  server.listen(config.port, config.host, () => {
    console.log(`Octos Learn hosted TTS listening on http://${config.host}:${config.port}`);
  });
  const stop = () => server.close(() => { ledger.close(); process.exit(0); });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) start();
