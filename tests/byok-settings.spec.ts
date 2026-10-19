import { expect, test } from "@playwright/test";

test("saves optional BYOK services without requesting platform grants or paid tests", async ({ page }) => {
  const forbidden: string[] = [];
  const paid: string[] = [];
  const writes: unknown[] = [];
  const profile = { id: "learner", name: "Learner", enabled: true, config: { llm: { primary: { family_id: "google", model_id: "gemini-test" }, fallbacks: [] }, env_vars: {} } };
  await page.addInitScript(() => { localStorage.setItem("octos_session_token", "test-session"); localStorage.setItem("selected_profile", "learner"); });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const url = new URL(route.request().url());
    if (/\/api\/(learn\/(tts|asr)|systemone|voice\/synthesize|private-asr)/.test(url.pathname)) { forbidden.push(url.pathname); return route.abort(); }
    let body: unknown = {};
    if (url.pathname === "/api/auth/me") body = { user: { id: "learner", name: "Learner", email: "learner@example.test" }, portal: { home_profile_id: "learner", accessible_profiles: [{ id: "learner", name: "Learner" }], can_access_admin_portal: false } };
    if (url.pathname === "/api/auth/status") body = { bootstrap_mode: false, email_login_enabled: true };
    if (url.pathname === "/api/my/profile") body = profile;
    if (url.pathname.startsWith("/api/my/client-services")) {
      body = { profile_id: "learner", services: {} };
      if (route.request().method() === "PUT") writes.push(route.request().postDataJSON());
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route(/https:\/\/(.*speech\.microsoft\.com|api\.typesafe\.ai|openspeech\.bytedance\.com)\//, route => { paid.push(route.request().url()); return route.abort(); });
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "把白板准备好，就可以开始了" })).toBeVisible();
  await expect(page.getByRole("region", { name: "输入预判（Jev，可选）" })).toBeVisible();
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/onboarding-desktop.png", fullPage: true });
  const tts = page.getByRole("region", { name: "听讲解" });
  await tts.getByText("展开可选配置").click();
  await tts.getByLabel("API Key").fill("synthetic-byok-canary");
  await tts.getByRole("button", { name: "保存配置" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ provider: "azure", key: "synthetic-byok-canary", expected_revision: null });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/onboarding-960x540.png", fullPage: true });
  expect(forbidden).toEqual([]); expect(paid).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-byok-canary");
});
