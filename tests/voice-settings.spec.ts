import { expect, test, type Page } from "@playwright/test";
import zh from "../src/i18n/messages/zh.json" with { type: "json" };

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Settings labels are written in English source text; the suite runs in the
// Chinese UI, so resolve them through the same catalog the app uses.
const t = (source: keyof typeof zh) => zh[source];

const microphoneFile = join(tmpdir(), `octos-learn-test-microphone-${process.pid}.wav`);
test.beforeAll(() => {
  // A continuous, deterministic tone avoids Chromium's intermittent fake-mic beeps.
  const rate = 48000;
  const wav = Buffer.alloc(44 + rate * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(rate * 2, 40);
  for (let i = 0; i < rate; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8000), 44 + i * 2);
  writeFileSync(microphoneFile, wav);
});
test.afterAll(() => rmSync(microphoneFile, { force: true }));
test.use({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${microphoneFile}`] } });

type Service = { provider: string; enabled: boolean; params: Record<string, string>; key: string; revision: string; execution_target: string };
async function mockVoiceAccount(page: Page, initial: Record<string, Service> = {}, lessonConfigured = false) {
  const profile = { id: "learner", name: "Learner", enabled: true, config: { llm: { primary: { family_id: "google", model_id: "gemini-test" }, fallbacks: [] }, gateway: {}, env_vars: lessonConfigured ? { GEMINI_API_KEY: "********" } : {} } };
  const services = { ...initial };
  const writes: Array<Record<string, unknown>> = [];
  const relay: unknown[] = [];
  let revision = 0;
  await page.addInitScript(() => { localStorage.setItem("octos_session_token", "test-session"); localStorage.setItem("selected_profile", "learner"); });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/auth/me") body = { user: { id: "learner", name: "Learner" }, portal: { home_profile_id: "learner", accessible_profiles: [{ id: "learner", name: "Learner" }], can_access_admin_portal: false } };
    if (path === "/api/auth/status") body = { email_login_enabled: true };
    if (path === "/api/my/profile") body = profile;
    if (path.startsWith("/api/learn/byok")) {
      const capability = path.split("/")[4];
      if (path.endsWith("/relay")) {
        const draft = route.request().postDataJSON();
        expect(draft).not.toHaveProperty("key");
        relay.push(draft);
        body = capability === "asr"
          ? { status: 200, body: JSON.stringify({ result: { text: "synthetic microphone recognized" } }), code: "20000000" }
          : capability === "tts"
          ? { status: 200, body: JSON.stringify({ code: 0, data: readFileSync(microphoneFile).toString("base64") }) + "\n" + JSON.stringify({ code: 20000000 }), code: null }
          : { status: 200, body: JSON.stringify({ answers: { learning: { noul: 1 } } }), code: null };
      } else {
        if (route.request().method() === "PUT") {
          const draft = route.request().postDataJSON(); writes.push(draft);
          services[capability] = { ...draft, key: draft.key ?? services[capability]?.key ?? "", revision: `r${++revision}`, execution_target: "client" };
        }
        const values = Object.fromEntries(Object.entries(services).map(([id, value]) => {
          const { key, ...metadata } = value; return [id, { ...metadata, has_credential: !!key }];
        }));
        body = { profile_id: "learner", services: values };
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { services, writes, relay };
}

test("saving a key connects Voice without another switch or an implicit supplier test", async ({ page }) => {
  const { services, writes, relay } = await mockVoiceAccount(page);
  await page.goto("/settings?tab=voice");
  const tts = page.getByRole("region", { name: t("Text to Speech") });
  await expect(tts).toBeVisible();
  await expect(page.locator('main input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: t("Save Changes") })).toBeDisabled();
  await page.getByRole("textbox", { name: t("Find a setting") }).fill("learning");
  await expect(page.getByRole("button", { name: t("Voice"), exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: t("Find a setting") }).fill("");

  await tts.getByRole("link", { name: t("Set up API key") }).click();
  const keys = page.getByRole("region", { name: t("Speech & Learning") });
  await expect(keys).toBeInViewport();
  await page.getByLabel(t("Volcano TTS API Key")).fill("synthetic-tts-key");
  await page.getByLabel(t("TypeSafe Jev API Key")).fill("synthetic-jev-key");
  await page.getByRole("button", { name: t("Save Changes") }).click();
  await expect(page.getByRole("button", { name: t("Saved") })).toBeVisible();
  expect(writes).toHaveLength(2); expect(relay).toHaveLength(0);
  expect(services.tts.enabled).toBe(true); expect(services.admission.enabled).toBe(true);
  expect(await page.getByLabel(t("Volcano TTS API Key")).inputValue()).toBe("••••••••");
  await keys.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-api-keys-desktop.png" });

  await page.getByRole("button", { name: t("Voice"), exact: true }).click();
  await expect(tts.getByRole("button", { name: t("Test voice") })).toBeDisabled();
  await expect(tts.getByText(t("Voice required"), { exact: true })).toBeVisible();
  await expect(tts.getByLabel(t("Voice ID"), { exact: true })).toBeEnabled();
  await expect(tts.getByRole("option", { name: "Vivi 2.0", exact: true })).toHaveCount(1);
  await tts.getByLabel(t("Voice ID"), { exact: true }).selectOption("zh_female_vv_uranus_bigtts");
  await expect(tts.getByRole("switch")).toHaveCount(0);
  await tts.getByRole("button", { name: t("Test voice") }).click();
  await expect(tts.getByText(t("Voice synthesized and played successfully."))).toBeVisible();
  await expect(tts.getByText(t("Unsaved changes. Tests preview these edits; lessons still use your saved settings."))).toBeVisible();
  expect(writes).toHaveLength(2); expect(services.tts.params.voice).toBe("");
  await tts.getByRole("button", { name: t("Save voice for lessons") }).click();
  await expect(page.getByRole("button", { name: t("Saved") })).toBeVisible();
  await expect(tts.getByText(t("Voice required"), { exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(3);
  expect(writes[2]).not.toHaveProperty("key");
  expect(writes[2]).toMatchObject({ enabled: true, params: { voice: "zh_female_vv_uranus_bigtts" } });
  await tts.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-settings-desktop.png" });
  const jev = page.getByRole("region", { name: t("Input Understanding") });
  await jev.getByRole("button", { name: t("Test connection") }).click();
  await expect(jev.getByText(t("Jev connected successfully."))).toBeVisible();
  expect(relay).toHaveLength(2);
  expect(services.admission.enabled).toBe(true);
  expect(writes).toHaveLength(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await tts.scrollIntoViewIfNeeded();
  await expect(tts).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-settings-mobile.png" });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-tts-key");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-jev-key");
});

test("plays course narration through saved BYOK TTS without enabling microphone input", async ({ page }) => {
  const { relay } = await mockVoiceAccount(page, { tts: { provider: "volcano", enabled: true, key: "synthetic-tts-key", revision: "r1", execution_target: "client", params: { auth_mode: "api-key", resource_id: "seed-tts-2.0", voice: "zh_female_vv_uranus_bigtts" } } });
  await page.addInitScript(() => {
    localStorage.setItem("octos-learn:setup-skipped:learner", "yes");
    const tracked = window as unknown as { narrationStarts: number; narrationStops: number };
    tracked.narrationStarts = 0; tracked.narrationStops = 0;
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) { tracked.narrationStarts++; return start.apply(this, args); };
    AudioBufferSourceNode.prototype.stop = function (...args) { tracked.narrationStops++; return stop.apply(this, args); };
  });
  await page.goto("/board?oll-fixture=unit-circle-sine");
  await page.getByRole("button", { name: "暂停 OLL 课程", exact: true }).click();
  await page.getByRole("button", { name: "播放 OLL 课程", exact: true }).click();
  await expect.poll(() => relay.length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { narrationStarts: number }).narrationStarts)).toBeGreaterThan(0);
  expect(relay[0]).toMatchObject({ expected_revision: "r1", payload: { req_params: { speaker: "zh_female_vv_uranus_bigtts", text: expect.any(String) } } });
  await expect(page.getByRole("button", { name: "启用语音", exact: true }).first()).toBeVisible();
});

for (const savedVoice of ["zh_female_vv_uranus_bigtts", ""]) {
  test(`newly generated course ${savedVoice ? "plays saved BYOK narration" : "explains the missing saved voice instead of silently skipping TTS"}`, async ({ page }) => {
    const { relay } = await mockVoiceAccount(page, { tts: { provider: "volcano", enabled: true, key: "synthetic-tts-key", revision: "r1", execution_target: "client", params: { auth_mode: "api-key", resource_id: "seed-tts-2.0", voice: savedVoice } } }, true);
    let turnId = "";
    await page.routeWebSocket(url => url.pathname === "/api/ui-protocol/ws", socket => {
      socket.onMessage(raw => {
        const message = JSON.parse(String(raw));
        const params = message.params ?? {};
        let result: unknown = {};
        if (message.method === "session/open") result = { opened: { session_id: params.session_id, capabilities: { supported_features: ["projection.envelope.v2"] } } };
        if (message.method === "session/hydrate") result = { messages: [], active_turn: null };
        if (message.method === "session/list") result = { sessions: [] };
        if (message.method === "skill/action/job/list") result = { jobs: [] };
        if (message.method === "session/files.list") result = { files: turnId ? [{ filename: `${turnId}.octos-lesson.json`, path: `study/oll/${turnId}.octos-lesson.json`, size_bytes: 512, modified_at: new Date().toISOString() }] : [] };
        if (message.method === "skill/action/invoke") {
          turnId = params.arguments.turn_id;
          result = { action_id: params.action_id, ok: true, jobs: [] };
        }
        if (message.id) socket.send(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
      });
    });
    await page.route(url => url.pathname === "/api/files" || url.pathname.startsWith("/api/files/"), route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      dsl: "octos.lesson", version: "0.1", profile: "authoring",
      lesson: { mode: "explain", language: "zh-CN", title: "实时课程旁白回归", goals: ["理解公式"] },
      steps: [{ key: "explain", purpose: "解释", beats: [{ key: "intro", say: "我们来看这节实时生成的课程。", actions: [{ do: "write", as: "formula", kind: "math", role: "concept", content: { latex: "y=x^2" }, place: { relation: "new_region" } }] }] }],
      close: { summary: "总结", focus: ["formula"] },
    }) }));
    await page.addInitScript(() => {
      localStorage.setItem("octos-learn:setup-skipped:learner", "yes");
      const tracked = window as unknown as { narrationStarts: number };
      tracked.narrationStarts = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) { tracked.narrationStarts++; return start.apply(this, args); };
    });
    await page.goto("/board?new-board=1");
    await page.getByLabel("输入学习问题").fill("请解释二次函数");
    await page.getByRole("button", { name: "发送问题", exact: true }).click();
    await expect.poll(() => turnId).not.toBe("");
    if (!savedVoice) {
      await expect(page.getByRole("alert")).toContainText("尚未保存课程音色");
      await expect(page.getByRole("button", { name: "检查旁白设置" })).toBeVisible();
      expect(relay).toHaveLength(0);
      return;
    }
    await expect.poll(() => relay.length).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { narrationStarts: number }).narrationStarts)).toBeGreaterThan(0);
    expect(relay[0]).toMatchObject({ expected_revision: "r1", payload: { req_params: { speaker: "zh_female_vv_uranus_bigtts", text: "我们来看这节实时生成的课程。" } } });
  });
}


test.describe("browser microphone runtime", () => {

  test("a saved ASR key opens whiteboard voice even with a legacy off flag", async ({ page }) => {
    const { relay } = await mockVoiceAccount(page, { asr: { provider: "volcano", enabled: false, key: "synthetic-asr-key", revision: "r1", execution_target: "client", params: { auth_mode: "api-key", resource_id: "volc.bigasr.auc_turbo" } } });
    await page.addInitScript(() => {
      localStorage.setItem("octos-learn:setup-skipped:learner", "yes");
      const state = window as unknown as { openedServiceSetup: boolean };
      state.openedServiceSetup = false;
      window.addEventListener("octos:configure-service", () => { state.openedServiceSetup = true; });
    });
    const synced = page.waitForResponse(response => new URL(response.url()).pathname === "/api/learn/byok/prepare");
    await page.goto("/board?new-board=1"); await synced;
    await page.getByRole("button", { name: "启用语音", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "关闭语音", exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { openedServiceSetup: boolean }).openedServiceSetup)).toBe(false);
    await page.getByRole("button", { name: "关闭语音", exact: true }).first().click();
    expect(relay).toHaveLength(0);
  });

  test("initializes the real ONNX/worklet runtime and releases a synthetic microphone", async ({ page }) => {
    const { relay } = await mockVoiceAccount(page, { asr: { provider: "volcano", enabled: false, key: "synthetic-asr-key", revision: "r1", execution_target: "client", params: { auth_mode: "api-key", resource_id: "volc.bigasr.auc_turbo" } } });
    await page.addInitScript(() => {
      const tracked = window as unknown as { testMicTracks: MediaStreamTrack[] };
      tracked.testMicTracks = [];
      const getStream = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        const stream = await getStream(constraints); tracked.testMicTracks.push(...stream.getTracks()); return stream;
      };
    });
    const failures: string[] = [];
    page.on("console", message => { if (message.type() === "error" && message.text().includes("[voice]")) failures.push(message.text()); });
    await page.goto("/settings?tab=voice");
    const asr = page.getByRole("region", { name: t("Speech Recognition") });
    await expect(asr.getByRole("button", { name: t("Test microphone") })).toBeEnabled();
    await page.waitForLoadState("networkidle");
    const started = page.waitForEvent("console", { predicate: message => message.text().includes("started micVAD"), timeout: 20_000 });
    await asr.getByRole("button", { name: t("Test microphone") }).click();
    await started.catch(error => { throw new Error(`${String(error)}; capture errors: ${failures.join("; ")}`); });
    await expect(asr.getByText(t("Listening — speak now."))).toBeVisible();
    await expect(asr.getByRole("button", { name: t("Finish and recognize") })).toBeEnabled();
    await expect.poll(() => asr.getByLabel(t("Microphone input level")).evaluate(meter => (meter as HTMLMeterElement).value), { timeout: 5000 }).toBeGreaterThan(0);
    await expect(asr.getByText(t("Waiting for microphone audio…"))).toHaveCount(0);
    await asr.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-microphone-test-desktop.png" });
    await asr.getByRole("button", { name: t("Stop test") }).click();
    await expect(asr.getByText(t("Test canceled."))).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const tracks = (window as unknown as { testMicTracks: MediaStreamTrack[] }).testMicTracks;
      return tracks.length > 0 && tracks.every(track => track.readyState === "ended");
    })).toBe(true);
    expect(failures).toEqual([]); expect(relay).toHaveLength(0);
  });
  test("can explicitly submit microphone PCM without waiting for a detected sentence", async ({ page }) => {
    const { relay } = await mockVoiceAccount(page, { asr: { provider: "volcano", enabled: false, key: "synthetic-asr-key", revision: "r1", execution_target: "client", params: { auth_mode: "api-key", resource_id: "volc.bigasr.auc_turbo" } } });
    await page.goto("/settings?tab=voice"); await page.waitForLoadState("networkidle");
    const asr = page.getByRole("region", { name: t("Speech Recognition") });
    await asr.getByRole("button", { name: t("Test microphone") }).click();
    const finish = asr.getByRole("button", { name: t("Finish and recognize") });
    await expect(finish).toBeEnabled();
    await expect.poll(() => asr.getByLabel(t("Microphone input level")).evaluate(meter => (meter as HTMLMeterElement).value), { timeout: 5000 }).toBeGreaterThan(0);
    await finish.click();
    await expect(asr.getByText("synthetic microphone recognized")).toBeVisible();
    expect(relay).toHaveLength(1);
    const request = relay[0] as { expected_revision: string; payload: { audio: { data: string } } };
    expect(request).not.toHaveProperty("key");
    expect(request.expected_revision).toBe("r1");
    const wav = Buffer.from(request.payload.audio.data, "base64");
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.length).toBeGreaterThanOrEqual(16044);
    expect(wav.subarray(44).some(byte => byte !== 0)).toBe(true);
    await expect(asr.getByRole("button", { name: t("Test microphone") })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-asr-key");
  });
});
