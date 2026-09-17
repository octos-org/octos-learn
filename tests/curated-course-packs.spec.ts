import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.OCTOS_LOCAL_COURSE_PACK_ROOT, "Requires reviewed CoursePack publication");

const courses = [
  { id: "rectangle-area-from-tiles", title: "长方形的面积与周长", beats: 13 },
  { id: "slope-and-intercept", title: "一次函数 y = mx + b 的图像与性质", beats: 13 },
];

async function installTestAccount(page: Page, externalCalls: string[] = []) {
  await page.addInitScript(() => {
    localStorage.setItem("octos_session_token", "curated-course-e2e");
    localStorage.setItem("selected_profile", "curated-learner");
    localStorage.setItem("octos-learn:setup-skipped:curated-learner", "yes");
  });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/"), (socket) => socket.close());
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/api/learn/course-packs")) return route.continue();
    externalCalls.push(route.request().url());
    const responses: Record<string, unknown> = {
      "/api/auth/status": { bootstrap_mode: false, email_login_enabled: true },
      "/api/auth/me": {
        user: { id: "curated-learner", email: "learner@example.test", name: "Learner" },
        portal: { accessible_profiles: [{ id: "curated-learner", name: "Learner" }], home_profile_id: "curated-learner", can_access_admin_portal: false },
      },
      "/api/my/profile": { id: "curated-learner", name: "Learner", config: { llm: { primary: { family_id: "", model_id: "" } } } },
    };
    await route.fulfill({ status: pathname in responses ? 200 : 503, contentType: "application/json", body: JSON.stringify(responses[pathname] ?? {}) });
  });
}

for (const course of courses) {
  test(`${course.id}: independent interactive ink survives return and reload`, async ({ page }) => {
    await installTestAccount(page);
    await page.goto("/");
    const card = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: course.title, exact: true }) });
    await card.getByRole("button", { name: "开始互动", exact: true }).click();
    await expect(page.getByTestId("oll-controls")).toBeVisible();
    const pause = page.getByRole("button", { name: "暂停 OLL 课程" });
    if (await pause.isVisible()) await pause.click();
    await page.getByRole("button", { name: "书写笔迹", exact: true }).click();
    await page.mouse.move(160, 700);
    await page.mouse.down();
    await page.mouse.move(210, 660, { steps: 8 });
    await page.mouse.move(260, 710, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".learning-ink-status")).toContainText("1 项笔迹");
    await page.getByRole("button", { name: "返回首页" }).click();
    const saved = await page.evaluate(() => {
      const entries = JSON.parse(localStorage.getItem("octos_learning_sessions_v2:curated-learner") ?? "[]") as Array<{ id: string; source?: { mode: string } }>;
      const instance = entries.find((entry) => entry.source?.mode === "instance");
      return { id: instance?.id, ink: instance ? localStorage.getItem(`octos-learning-ink:v1:${instance.id}`) : null };
    });
    expect(saved.id).toBeTruthy();
    expect(saved.ink).toContain("oll.student-ink.svg");
    await card.getByRole("link", { name: "继续学习", exact: true }).click();
    await expect(page.locator(".learning-ink-status")).toContainText("1 项笔迹");
    await page.reload();
    await expect(page.locator(".learning-ink-status")).toContainText("1 项笔迹");
    const current = await page.evaluate((id) => localStorage.getItem(`octos-learning-ink:v1:${id}`), saved.id);
    expect(JSON.parse(current!).svg).toBe(JSON.parse(saved.ink!).svg);
    await page.screenshot({ path: `test-results/${course.id}-${process.env.OCTOS_COURSE_TEST_ANDROID === "1" ? "android" : "desktop"}-ink-restored.png` });
  });

  test(`${course.id}: real archive, complete narration and cached replay`, async ({ page }, testInfo) => {
    const externalCalls: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installTestAccount(page, externalCalls);
    await page.addInitScript(() => {
      const observations = { played: [] as string[], ended: [] as string[], webEnded: [] as number[], errors: [] as string[] };
      Object.assign(window, { courseAudioObservations: observations });
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const src = this.currentSrc || this.src;
        this.addEventListener("ended", () => {
          if (src.startsWith("blob:") && !observations.ended.includes(src)) observations.ended.push(src);
        }, { once: true });
        this.addEventListener("error", () => observations.errors.push(this.error?.message ?? "Audio decode failed"), { once: true });
        const result = original.call(this);
        void result.then(() => {
          if (!observations.played.includes(src)) observations.played.push(src);
        }).catch((error: Error) => observations.errors.push(error.message));
        return result;
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        const duration = this.buffer?.duration ?? 0;
        this.addEventListener("ended", () => {
          if (duration > 0.1 && !observations.webEnded.includes(duration)) observations.webEnded.push(duration);
        }, { once: true });
        return start.apply(this, args);
      };
    });
    await page.goto("/");
    const card = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: course.title, exact: true }) });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "预览", exact: true }).click();
    await expect(page.getByTestId("oll-controls")).toBeVisible();
    await expect(page.getByRole("button", { name: "开始互动学习" })).toBeVisible();
    // A real click unlocks narration under browser autoplay policy.
    await page.getByRole("button", { name: "重新播放 OLL 课程" }).click();
    await expect(page.locator(".learning-workspace").getByText("课程完成", { exact: true })).toBeVisible({ timeout: 210_000 });
    const audio = await page.evaluate(() => (window as unknown as {
      courseAudioObservations: { played: string[]; ended: string[]; webEnded: number[]; errors: string[] };
    }).courseAudioObservations);
    expect(audio.errors).toEqual([]);
    expect(process.env.OCTOS_COURSE_TEST_ANDROID === "1" ? audio.ended.length : audio.webEnded.length).toBeGreaterThanOrEqual(course.beats);
    expect(pageErrors).toEqual([]);
    // Readiness polling belongs to optional live voice, not packaged narration.
    // It receives 503 throughout this run, so successful playback cannot depend on it.
    expect(externalCalls.filter((url) => {
      const pathname = new URL(url).pathname;
      return pathname !== "/api/voice/readiness" && /tts|speech|voice|rpc/iu.test(pathname);
    })).toEqual([]);
    await testInfo.attach("packaged-narration-observations", {
      body: JSON.stringify(audio, null, 2), contentType: "application/json",
    });
    const overlaps = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".board-node"));
      const controls = Array.from(document.querySelectorAll<HTMLElement>(
        "[data-interaction-controls-id], [data-interaction-tasks-id]",
      ));
      return controls.flatMap((control) => {
        const a = control.getBoundingClientRect();
        return cards.flatMap((card) => {
          const b = card.getBoundingClientRect();
          const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return width > 2 && height > 2 ? [card.dataset.id] : [];
        });
      });
    });
    expect(overlaps).toEqual([]);
    await page.screenshot({ path: `test-results/${course.id}-${process.env.OCTOS_COURSE_TEST_ANDROID === "1" ? "android" : "desktop"}-complete.png` });
    await page.getByRole("button", { name: "返回首页" }).click();
    await expect(card.getByText("已下载 · 可离线", { exact: true })).toBeVisible();
    await page.route("**/api/learn/course-packs**", (route) => route.abort());
    await page.reload();
    await card.getByRole("link", { name: "预览", exact: true }).click();
    await expect(page.getByTestId("oll-controls")).toBeVisible();
    await expect(page.getByRole("button", { name: "开始互动学习" })).toBeVisible();
  });
}
