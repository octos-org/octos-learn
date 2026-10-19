import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
async function mockVoiceAccount(page: Page, initial: Record<string, Service> = {}) {
  const profile = { id: "learner", name: "Learner", enabled: true, config: { llm: { primary: { family_id: "google", model_id: "gemini-test" }, fallbacks: [] }, gateway: {}, env_vars: {} } };
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
    if (path.startsWith("/api/my/client-services")) {
      const capability = path.split("/")[4];
      if (path.endsWith("/relay")) {
        relay.push(route.request().postDataJSON());
        body = capability === "asr"
          ? { status: 200, body: JSON.stringify({ result: { text: "synthetic microphone recognized" } }), code: "20000000" }
          : { status: 200, body: JSON.stringify({ answers: { learning: { noul: 1 } } }), code: null };
      } else {
        if (route.request().method() === "PUT") {
          const draft = route.request().postDataJSON(); writes.push(draft);
          services[capability] = { ...draft, key: draft.key ?? services[capability]?.key ?? "", revision: `r${++revision}`, execution_target: "client" };
        }
        const values = path.endsWith("/sync") ? services : Object.fromEntries(Object.entries(services).map(([id, value]) => {
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
  const tts = page.getByRole("region", { name: "Text to Speech" });
  await expect(tts).toBeVisible();
  await expect(page.locator('main input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Find a setting" }).fill("learning");
  await expect(page.getByRole("button", { name: "Voice", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Find a setting" }).fill("");

  await tts.getByRole("link", { name: "Set up API key" }).click();
  const keys = page.getByRole("region", { name: "Speech & Learning" });
  await expect(keys).toBeInViewport();
  await page.getByLabel("Volcano TTS API Key").fill("synthetic-tts-key");
  await page.getByLabel("TypeSafe Jev API Key").fill("synthetic-jev-key");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  expect(writes).toHaveLength(2); expect(relay).toHaveLength(0);
  expect(services.tts.enabled).toBe(true); expect(services.admission.enabled).toBe(true);
  expect(await page.getByLabel("Volcano TTS API Key").inputValue()).toBe("••••••••");
  await keys.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-api-keys-desktop.png" });

  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(tts.getByRole("button", { name: "Test voice" })).toBeEnabled();
  await expect(tts.getByLabel("Voice ID", { exact: true })).toBeEnabled();
  await expect(tts.getByRole("option", { name: "Vivi 2.0", exact: true })).toHaveCount(1);
  await tts.getByLabel("Voice ID", { exact: true }).selectOption("zh_female_vv_uranus_bigtts");
  await expect(tts.getByRole("switch")).toHaveCount(0);
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  expect(writes).toHaveLength(3);
  expect(writes[2]).not.toHaveProperty("key");
  expect(writes[2]).toMatchObject({ enabled: true, params: { voice: "zh_female_vv_uranus_bigtts" } });
  await tts.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-settings-desktop.png" });
  const jev = page.getByRole("region", { name: "Input Understanding" });
  await jev.getByRole("button", { name: "Test connection" }).click();
  await expect(jev.getByText("Jev connected successfully.")).toBeVisible();
  expect(relay).toHaveLength(1);
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


test.describe("browser microphone runtime", () => {

  test("a saved ASR key opens whiteboard voice even with a legacy off flag", async ({ page }) => {
    const { relay } = await mockVoiceAccount(page, { asr: { provider: "volcano", enabled: false, key: "synthetic-asr-key", revision: "r1", execution_target: "client", params: { auth_mode: "api-key", resource_id: "volc.bigasr.auc_turbo" } } });
    await page.addInitScript(() => {
      localStorage.setItem("octos-learn:setup-skipped:learner", "yes");
      const state = window as unknown as { openedServiceSetup: boolean };
      state.openedServiceSetup = false;
      window.addEventListener("octos:configure-service", () => { state.openedServiceSetup = true; });
    });
    const synced = page.waitForResponse(response => new URL(response.url()).pathname === "/api/my/client-services/sync");
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
    const asr = page.getByRole("region", { name: "Speech Recognition" });
    await expect(asr.getByRole("button", { name: "Test microphone" })).toBeEnabled();
    await page.waitForLoadState("networkidle");
    const started = page.waitForEvent("console", { predicate: message => message.text().includes("started micVAD"), timeout: 20_000 });
    await asr.getByRole("button", { name: "Test microphone" }).click();
    await started.catch(error => { throw new Error(`${String(error)}; capture errors: ${failures.join("; ")}`); });
    await expect(asr.getByText("Listening — speak now.")).toBeVisible();
    await expect(asr.getByRole("button", { name: "Finish and recognize" })).toBeEnabled();
    await expect.poll(() => asr.getByLabel("Microphone input level").evaluate(meter => (meter as HTMLMeterElement).value), { timeout: 5000 }).toBeGreaterThan(0);
    await expect(asr.getByText("Waiting for microphone audio…")).toHaveCount(0);
    await asr.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-microphone-test-desktop.png" });
    await asr.getByRole("button", { name: "Stop test" }).click();
    await expect(asr.getByText("Test canceled.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const tracks = (window as unknown as { testMicTracks: MediaStreamTrack[] }).testMicTracks;
      return tracks.length > 0 && tracks.every(track => track.readyState === "ended");
    })).toBe(true);
    expect(failures).toEqual([]); expect(relay).toHaveLength(0);
  });
  test("can explicitly submit microphone PCM without waiting for a detected sentence", async ({ page }) => {
    const { relay } = await mockVoiceAccount(page, { asr: { provider: "volcano", enabled: false, key: "synthetic-asr-key", revision: "r1", execution_target: "client", params: { auth_mode: "api-key", resource_id: "volc.bigasr.auc_turbo" } } });
    await page.goto("/settings?tab=voice"); await page.waitForLoadState("networkidle");
    const asr = page.getByRole("region", { name: "Speech Recognition" });
    await asr.getByRole("button", { name: "Test microphone" }).click();
    const finish = asr.getByRole("button", { name: "Finish and recognize" });
    await expect(finish).toBeEnabled();
    await expect.poll(() => asr.getByLabel("Microphone input level").evaluate(meter => (meter as HTMLMeterElement).value), { timeout: 5000 }).toBeGreaterThan(0);
    await finish.click();
    await expect(asr.getByText("synthetic microphone recognized")).toBeVisible();
    expect(relay).toHaveLength(1);
    const request = relay[0] as { key: string; payload: { audio: { data: string } } };
    expect(request.key).toBe("synthetic-asr-key");
    const wav = Buffer.from(request.payload.audio.data, "base64");
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.length).toBeGreaterThanOrEqual(16044);
    expect(wav.subarray(44).some(byte => byte !== 0)).toBe(true);
    await expect(asr.getByRole("button", { name: "Test microphone" })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-asr-key");
  });
});
