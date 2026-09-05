import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createServer } from "node:http";
import { createHandler, UsageLedger } from "./server.mjs";

function fixture(now = () => new Date("2026-09-05T12:00:00Z")) {
  const directory = mkdtempSync(join(tmpdir(), "octos-learn-tts-"));
  const ledger = new UsageLedger(join(directory, "usage.sqlite"), now);
  ledger.setLimits({ enabled: true, platform_monthly_chars: 100, user_monthly_chars: 60 });
  return { ledger, cleanup: () => { ledger.close(); rmSync(directory, { recursive: true }); } };
}

test("ledger persists usage and enforces both caps", () => {
  const { ledger, cleanup } = fixture();
  try {
    ledger.reserve("alice", 50, 60);
    assert.deepEqual(ledger.usage("alice"), { total: 50, user: 50 });
    assert.throws(() => ledger.reserve("alice", 11, 60), /额度/);
    ledger.reserve("bob", 50, 60);
    assert.throws(() => ledger.reserve("carol", 1, 60), /额度/);
    assert.deepEqual(ledger.usage("carol"), { total: 100, user: 0 });
  } finally { cleanup(); }
});

test("hosted synthesis authenticates, meters, and never exposes the credential", async () => {
  const { ledger, cleanup } = fixture();
  const config = {
    octosBaseUrl: "http://octos.test", appid: "app", token: "secret", endpoint: "https://openspeech.bytedance.com/api/v1/tts",
    cluster: "volcano_tts", voice: "voice", encoding: "mp3", maxConcurrent: 2, queueWaitMs: 10, requestsPerMinute: 60,
  };
  const fetchImpl = async (url) => {
    assert.equal(url, "http://octos.test/api/auth/me");
    return new Response(JSON.stringify({ user: { id: "alice", role: "user" }, profile: { profile: { config: {} } } }), { status: 200 });
  };
  const platformSynthesize = async () => ({ bytes: Buffer.from("audio"), contentType: "audio/mpeg", source: "platform" });
  const server = createServer(createHandler({ config, ledger, fetchImpl, platformSynthesize }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/learn/tts/synthesize`, {
      method: "POST", headers: { authorization: "Bearer session", "content-type": "application/json" }, body: JSON.stringify({ text: "你好" }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-octos-tts-source"), "platform");
    assert.equal(await response.text(), "audio");
    assert.deepEqual(ledger.usage("alice"), { total: 3, user: 3 });
    const status = await fetch(`http://127.0.0.1:${server.address().port}/api/learn/tts/status`, { headers: { authorization: "Bearer session" } });
    const json = await status.json();
    assert.equal(json.user_used_chars, 3);
    assert.equal(JSON.stringify(json).includes("secret"), false);
  } finally { server.close(); cleanup(); }
});

test("a personal TTS configuration bypasses platform metering", async () => {
  const { ledger, cleanup } = fixture();
  const config = { octosBaseUrl: "http://octos.test", appid: "app", token: "secret", maxConcurrent: 2, queueWaitMs: 10, requestsPerMinute: 60 };
  const fetchImpl = async (url) => {
    if (url.endsWith("/api/auth/me")) return new Response(JSON.stringify({
      user: { id: "alice", role: "user" },
      profile: { profile: { config: { tts_provider: "cloud", tts_cloud: { appid: "mine" }, env_vars: { VOLC_TTS_TOKEN: "***" } } } },
    }), { status: 200 });
    if (url.endsWith("/api/voice/synthesize")) return new Response("personal", { status: 200, headers: { "content-type": "audio/mpeg" } });
    throw new Error(`unexpected URL ${url}`);
  };
  const server = createServer(createHandler({ config, ledger, fetchImpl }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/learn/tts/synthesize`, {
      method: "POST", headers: { authorization: "Bearer session", "content-type": "application/json" }, body: JSON.stringify({ text: "你好" }),
    });
    assert.equal(response.headers.get("x-octos-tts-source"), "personal");
    assert.equal(await response.text(), "personal");
    assert.deepEqual(ledger.usage("alice"), { total: 0, user: 0 });
  } finally { server.close(); cleanup(); }
});
