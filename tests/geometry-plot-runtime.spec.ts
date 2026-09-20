import { expect, test, type Page } from "@playwright/test";

async function installLearningMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("octos_session_token", "geometry-plot-e2e");
    localStorage.setItem("selected_profile", "geometry-plot-learner");
    localStorage.setItem("octos_learning_auto_camera", "false");
    localStorage.setItem("octos_learning_input_mode", "text");
    localStorage.setItem("octos-learn:setup-skipped:geometry-plot-learner", "yes");
  });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/"), (socket) => socket.close());
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/api/learn/course-packs")) return route.continue();
    const responses: Record<string, unknown> = {
      "/api/auth/status": { bootstrap_mode: false, email_login_enabled: true },
      "/api/auth/me": {
        user: { id: "geometry-plot-learner", email: "learner@example.test", name: "Learner" },
        portal: {
          accessible_profiles: [{ id: "geometry-plot-learner", name: "Learner" }],
          home_profile_id: "geometry-plot-learner",
          can_access_admin_portal: false,
        },
      },
      "/api/my/profile": { id: "geometry-plot-learner", name: "Learner", config: {} },
    };
    await route.fulfill({
      status: pathname in responses ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(responses[pathname] ?? {}),
    });
  });
}

async function wheelInsideGraph(page: Page, selector: string) {
  const graph = page.locator(selector).first();
  const box = await graph.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -180);
  await expect(page.getByRole("button", { name: /恢复课程视图/ }).first()).toBeVisible();
}

async function pauseCourse(page: Page) {
  const pause = page.getByRole("button", { name: "暂停 OLL 课程" });
  if (await pause.isVisible()) await pause.click();
}

test("plot wheel zoom changes ticks without moving the whiteboard", async ({ page }) => {
  await installLearningMocks(page);
  await page.goto("/?oll-fixture=math-two-points");
  await expect(page.locator(".plot-preview").first()).toBeVisible();
  await pauseCourse(page);
  const world = page.locator("[data-oll-board-runtime-world]");
  const beforeTransform = await world.getAttribute("style");
  const beforeLabels = await page.locator(".plot-preview .plot-axis-label").allTextContents();

  await wheelInsideGraph(page, ".plot-preview");

  const afterLabels = await page.locator(".plot-preview .plot-axis-label").allTextContents();
  expect(afterLabels).not.toEqual(beforeLabels);
  expect(await world.getAttribute("style")).toBe(beforeTransform);
  await page.getByRole("button", { name: "放大查看函数图" }).click();
  const dialog = page.locator(".oll-plot-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "恢复课程视图和图层，保留参数" }).click();
  await expect(dialog.getByRole("button", { name: "恢复课程视图和图层，保留参数" })).toBeHidden();
  await dialog.getByRole("button", { name: "关闭大图" }).click();

  await page.locator(".board-node.kind-plot [data-action=explore]").click();
  const box = await page.locator(".plot-preview").first().boundingBox();
  await page.mouse.move(box!.x + box!.width * .55, box!.y + box!.height * .55);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * .7, box!.y + box!.height * .45, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /恢复课程视图/ }).first()).toBeVisible();
  expect(await world.getAttribute("style")).toBe(beforeTransform);
});

test("rectangle geometry uses integer ticks, square units and its own zoom", async ({ page }) => {
  await installLearningMocks(page);
  await page.goto("/board?course-pack=rectangle-area-from-tiles&course-version=0.1.5&course-mode=preview");
  await expect(page.locator(".geometry-preview").first()).toBeVisible({ timeout: 30_000 });
  await pauseCourse(page);
  const labels = await page.locator(".geometry-preview .geometry-label").allTextContents();
  expect(labels).not.toContain("1.63");
  expect(labels).not.toContain("6.38");
  for (const value of ["0", "2", "4", "6", "8"]) expect(labels).toContain(value);
  await expect(page.locator(".geometry-label-leader").first()).toBeVisible();

  const unitPoints = await page.locator(".geometry-polygon-accent").first().getAttribute("points");
  const points = unitPoints!.split(/\s+/u).map((pair) => pair.split(",").map(Number));
  const width = Math.max(...points.map(([x]) => x!)) - Math.min(...points.map(([x]) => x!));
  const height = Math.max(...points.map(([, y]) => y!)) - Math.min(...points.map(([, y]) => y!));
  expect(Math.abs(width - height)).toBeLessThanOrEqual(1);

  const world = page.locator("[data-oll-board-runtime-world]");
  const beforeTransform = await world.getAttribute("style");
  await wheelInsideGraph(page, ".geometry-preview");
  expect(await world.getAttribute("style")).toBe(beforeTransform);
});

test("geometry control points still change lesson variables while exploration is enabled", async ({ page }) => {
  await installLearningMocks(page);
  await page.goto("/?oll-fixture=unit-circle-sine");
  const point = page.locator(".geometry-control-point").first();
  await expect(point).toBeVisible();
  await pauseCourse(page);
  const slider = page.getByRole("slider").first();
  const before = await slider.getAttribute("value");
  await page.locator(".board-node.kind-geometry [data-action=explore]").click();
  const drag = await point.evaluate((element) => {
    const svg = element.closest("svg")!;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const pointX = Number(element.getAttribute("cx"));
    const pointY = Number(element.getAttribute("cy"));
    const centerX = Number((element as SVGElement).dataset.angleCenterX);
    const centerY = Number((element as SVGElement).dataset.angleCenterY);
    const radius = Math.hypot(pointX - centerX, pointY - centerY);
    const screenPoint = (x: number, y: number) => ({
      x: rect.left + (x - viewBox.x) / viewBox.width * rect.width,
      y: rect.top + (y - viewBox.y) / viewBox.height * rect.height,
    });
    return {
      start: screenPoint(pointX, pointY),
      end: screenPoint(centerX, centerY - radius),
    };
  });
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 5 });
  await page.mouse.up();
  await expect(slider).not.toHaveValue(before ?? "");
});
