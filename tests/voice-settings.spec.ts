import { expect, test } from "@playwright/test";

test("configures Voice through Learning and API Keys without implicit tests or activation", async ({ page }) => {
  const profile = { id: "learner", name: "Learner", enabled: true, config: { llm: { primary: { family_id: "google", model_id: "gemini-test" }, fallbacks: [] }, gateway: {}, env_vars: {} } };
  type Service = { provider: string; enabled: boolean; params: Record<string, string>; key: string; revision: string; execution_target: string };
  const services: Record<string, Service> = {};
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
        body = { status: 200, body: JSON.stringify({ answers: { learning: { noul: 1 } } }), code: null };
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
  await page.goto("/settings?tab=voice");
  const tts = page.getByRole("region", { name: "Text to Speech" });
  await expect(tts).toBeVisible();
  await expect(page.locator('main input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Find a setting" }).fill("learning");
  await expect(page.getByRole("button", { name: "Voice", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Find a setting" }).fill("");
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-settings-desktop.png" });

  await tts.getByRole("link", { name: "Set up API key" }).click();
  const keys = page.getByRole("region", { name: "Speech & Learning" });
  await expect(keys).toBeInViewport();
  await page.getByLabel("Volcano TTS API Key").fill("synthetic-tts-key");
  await page.getByLabel("TypeSafe Jev API Key").fill("synthetic-jev-key");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  expect(writes).toHaveLength(2); expect(relay).toHaveLength(0);
  expect(services.tts.enabled).toBe(false); expect(services.admission.enabled).toBe(false);
  expect(await page.getByLabel("Volcano TTS API Key").inputValue()).toBe("••••••••");
  await keys.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-api-keys-desktop.png" });

  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(tts.getByRole("button", { name: "Test voice" })).toBeEnabled();
  await tts.getByLabel("Voice ID").fill("my-voice");
  await tts.getByRole("switch").check();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  expect(writes).toHaveLength(3);
  expect(writes[2]).not.toHaveProperty("key");
  expect(writes[2]).toMatchObject({ enabled: true, params: { voice: "my-voice" } });
  const jev = page.getByRole("region", { name: "Input Understanding" });
  await jev.getByRole("button", { name: "Test connection" }).click();
  await expect(jev.getByText("Jev connected successfully.")).toBeVisible();
  expect(relay).toHaveLength(1);
  expect(services.admission.enabled).toBe(false);
  expect(writes).toHaveLength(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await tts.scrollIntoViewIfNeeded();
  await expect(tts).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/voice-settings-mobile.png" });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-tts-key");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-jev-key");
});
