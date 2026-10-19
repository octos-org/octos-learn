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
      if (url.pathname.endsWith("/relay")) paid.push(url.pathname);
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
  await expect(tts.getByText("Azure Speech")).toHaveCount(0);
  await expect(tts.getByText("鉴权方式", { exact: true })).toHaveCount(0);
  await tts.getByLabel("API Key").fill("synthetic-byok-canary");
  await tts.getByRole("button", { name: "保存配置" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ provider: "volcano", key: "synthetic-byok-canary", expected_revision: null });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.screenshot({ path: "docs/byok-migration-2026-10-19/onboarding-960x540.png", fullPage: true });
  expect(forbidden).toEqual([]); expect(paid).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-byok-canary");
});

test("tests browser Jev through the authenticated BYOK relay with an unsaved own-key draft", async ({ page }) => {
  const relay: unknown[] = [];
  await page.addInitScript(() => { localStorage.setItem("octos_session_token", "test-session"); localStorage.setItem("selected_profile", "learner"); });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/auth/me") body = { user: { id: "learner", name: "Learner" }, portal: { home_profile_id: "learner", accessible_profiles: [{ id: "learner", name: "Learner" }] } };
    if (path === "/api/my/profile") body = { id: "learner", name: "Learner", config: { env_vars: {} } };
    if (path.startsWith("/api/my/client-services")) body = { profile_id: "learner", services: {} };
    if (path === "/api/my/client-services/admission/relay") {
      relay.push(route.request().postDataJSON());
      expect(route.request().headers().authorization).toBe("Bearer test-session");
      body = { status: 200, body: JSON.stringify({ answers: { learning: { noul: 1 } } }), code: null };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://api.typesafe.ai/**", () => { throw new Error("Known CORS-blocked provider must use relay"); });
  await page.goto("/setup");
  const jev = page.getByRole("region", { name: "输入预判（Jev，可选）" });
  await jev.getByText("展开可选配置").click();
  await jev.getByLabel("API Key").fill("synthetic-jev-draft");
  await jev.getByRole("button", { name: "测试 Jev 草稿" }).click();
  await expect(jev.getByText("已成功调用 Jev。测试不会保存或覆盖账号配置。")).toBeVisible();
  expect(relay).toHaveLength(1);
  expect(relay[0]).toMatchObject({ provider: "typesafe", key: "synthetic-jev-draft", payload: { model: "jev-latest" } });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-jev-draft");
});
