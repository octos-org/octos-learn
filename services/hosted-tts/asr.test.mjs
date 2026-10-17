import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler, loadConfig, UsageLedger } from "./server.mjs";
import { loadAsrConfig, asrConfigured, validateAsrAudio, transcribeAsr } from "./asr.mjs";

function wav(seconds = 1) {
  const b = Buffer.alloc(44 + 32000 * seconds);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(b.length - 44, 40);
  return b;
}

test("ASR requires opt-in and can reuse server-side TTS credentials", () => {
  assert.equal(asrConfigured(loadAsrConfig({ VOLC_TTS_APPID: "app", VOLC_TTS_TOKEN: "token" })), false);
  const config = loadAsrConfig({ HOSTED_ASR_ENABLED: "1", VOLC_TTS_APPID: "app", VOLC_TTS_TOKEN: "token" });
  assert.equal(asrConfigured(config), true); assert.equal(config.token, "token");
});
test("WAV validation rejects corrupt, multi-channel, compressed and overlong input", () => {
  assert.equal(validateAsrAudio(wav()).seconds, 1);
  for (const offset of [0, 4, 8, 16, 20, 22, 24, 28, 32, 34, 36, 40]) {
    const bad = wav(); bad[offset] ^= 0xff;
    assert.throws(() => validateAsrAudio(bad), /WAV/);
  }
  assert.throws(() => validateAsrAudio(wav(61)), /60 秒/);
});
test("provider request contains bounded audio and resource headers, never an arbitrary URL", async () => {
  const result = await transcribeAsr(validateAsrAudio(wav()), { appid: "app", token: "token" }, async (url, options) => {
    assert.equal(url, "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash");
    assert.equal(options.headers["X-Api-Resource-Id"], "volc.bigasr.auc_turbo");
    assert.equal(options.headers["X-Api-Access-Key"], "token");
    assert.equal(options.redirect, "error");
    assert.deepEqual(Buffer.from(JSON.parse(options.body).audio.data, "base64"), wav());
    return new Response(JSON.stringify({ result: { text: "解释这个公式" } }), { headers: { "X-Api-Status-Code": "20000000" } });
  });
  assert.deepEqual(result, { status: "speech", transcript: "解释这个公式" });
});
test("silence is not an error and never becomes a question", async () => {
  assert.deepEqual(await transcribeAsr(validateAsrAudio(wav()), {}, async () => new Response("", {
    headers: { "X-Api-Status-Code": "20000003" },
  })), { status: "no_speech", transcript: "" });
});
test("new voice-console API key is supported without leaking upstream error content", async () => {
  await assert.rejects(transcribeAsr(validateAsrAudio(wav()), { apiKey: "secret-key" }, async (_url, options) => {
    assert.equal(options.headers["X-Api-Key"], "secret-key");
    assert.equal(options.headers["X-Api-Access-Key"], undefined);
    return new Response("secret-key upstream error", { status: 403 });
  }), error => error.status === 503 && !error.message.includes("secret-key"));
});

async function withService(fn, { authenticated = true, enabled = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "octos-asr-test-"));
  const ledger = new UsageLedger(join(directory, "usage.sqlite"));
  ledger.setLimits({ enabled: true, platform_monthly_chars: 1000, user_monthly_chars: 1000 });
  const config = loadConfig({ HOSTED_ASR_ENABLED: enabled ? "1" : "0", VOLC_TTS_APPID: "app", VOLC_TTS_TOKEN: "private-token", HOSTED_ASR_USER_DAILY_SECONDS: "2" });
  let providerCalls = 0;
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/api/auth/me")) return new Response(JSON.stringify({ user: { id: "alice" }, profile: { config: { tts_provider: "local" } } }), { status: authenticated && options.headers.authorization === "Bearer session" ? 200 : 401 });
    providerCalls++;
    return new Response(JSON.stringify({ result: { text: "已识别" } }), { headers: { "X-Api-Status-Code": "20000000" } });
  };
  const server = createServer(createHandler({ config, ledger, fetchImpl, platformSynthesize: async () => ({ bytes: Buffer.from("cloud audio"), contentType: "audio/mpeg", source: "platform" }) }));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await fn(`http://127.0.0.1:${server.address().port}`, () => providerCalls); }
  finally { await new Promise(resolve => server.close(resolve)); ledger.close(); rmSync(directory, { recursive: true }); }
}

test("ASR status never exposes credentials and POST authenticates before dispatch", async () => {
  await withService(async (base, calls) => {
    const headers = { authorization: "Bearer session" };
    const status = await fetch(`${base}/api/learn/asr/batch/status`, { headers });
    assert.equal(status.status, 200); assert.equal(status.headers.get("cache-control"), "no-store");
    const body = await status.text(); assert.equal(JSON.parse(body).available, true); assert.equal(body.includes("private-token"), false);
    const anonymous = await fetch(`${base}/api/learn/asr/batch/transcribe`, { method: "POST", body: wav() });
    assert.equal(anonymous.status, 401); assert.equal(calls(), 0);
    const transcribed = await fetch(`${base}/api/learn/asr/batch/transcribe`, { method: "POST", headers, body: wav() });
    assert.equal(transcribed.status, 200); assert.equal(calls(), 1);
    assert.deepEqual(await transcribed.json(), { status: "speech", transcript: "已识别" });
  });
});
test("batch ASR does not take over the separately deployed streaming endpoints", async () => {
  await withService(async (base, calls) => {
    for (const path of ["status", "sessions", "ws"]) {
      const response = await fetch(`${base}/api/learn/asr/${path}`);
      assert.equal(response.status, 404);
    }
    assert.equal(calls(), 0);
  });
});
test("daily ASR quota survives requests and blocks additional provider spending", async () => {
  await withService(async (base, calls) => {
    const options = { method: "POST", headers: { authorization: "Bearer session" }, body: wav(2) };
    assert.equal((await fetch(`${base}/api/learn/asr/batch/transcribe`, options)).status, 200);
    assert.equal((await fetch(`${base}/api/learn/asr/batch/transcribe`, options)).status, 429);
    assert.equal(calls(), 1);
    const status = await fetch(`${base}/api/learn/asr/batch/status`, { headers: options.headers });
    assert.equal((await status.json()).available, false);
  });
});
test("disabled service and invalid input do not contact the provider", async () => {
  await withService(async (base, calls) => {
    const response = await fetch(`${base}/api/learn/asr/batch/transcribe`, { method: "POST", headers: { authorization: "Bearer session" }, body: wav() });
    assert.equal(response.status, 503); assert.equal(calls(), 0);
  }, { enabled: false });
  await withService(async (base, calls) => {
    const response = await fetch(`${base}/api/learn/asr/batch/transcribe`, { method: "POST", headers: { authorization: "Bearer session" }, body: "invalid WAV" });
    assert.equal(response.status, 400); assert.equal(calls(), 0);
  });
});


test("explicit cloud TTS fallback does not loop back into a user's broken local provider", async () => {
  await withService(async (base, calls) => {
    const response = await fetch(`${base}/api/learn/tts/cloud-synthesize`, {
      method: "POST", headers: { authorization: "Bearer session", "content-type": "application/json" },
      body: JSON.stringify({ text: "继续讲解" }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-octos-tts-source"), "platform");
    assert.equal(await response.text(), "cloud audio");
    assert.equal(calls(), 0); // No call to the failing local synthesizer.
  });
});
