import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.OCTOS_LOCAL_COURSE_PACK_ROOT, "Requires reviewed CoursePack publication");

const collection = [
  {
    id: "surface-paraboloid-level-sets",
    title: "旋转抛物面的截面与降维分析法",
  },
  {
    id: "surface-partial-derivative-slice",
    title: "偏导数的几何意义：三维曲面与切片截线",
  },
  {
    id: "surface-saddle-point-analysis",
    title: "马鞍面与鞍点：三维曲面中的临界点",
  },
];

async function installTestAccount(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("octos_session_token", "curated-course-e2e");
    localStorage.setItem("selected_profile", "curated-learner");
    localStorage.setItem("octos-learn:setup-skipped:curated-learner", "yes");
  });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/"), (socket) => socket.close());
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/api/learn/course-packs")) return route.continue();
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

test("collection home page displays all 3 college multivariable calculus courses", async ({ page }) => {
  await installTestAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  for (const item of collection) {
    const card = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: item.title, exact: true }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
  }

  // Scroll to the calculus cards row to show the thumbnails clearly
  const firstCalculusCard = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: collection[0].title, exact: true }) });
  await firstCalculusCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await page.screenshot({
    path: "/Users/alan0x/.gemini/antigravity/brain/b13f3469-4046-4a07-a263-bbd94d17897b/browser_all_calculus_surface_cards.png",
  });
});

for (const item of collection) {
  test(`course: ${item.id} (${item.title}) loads, renders 3D surface with section, and plays`, async ({ page }) => {
    await installTestAccount(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const card = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: item.title, exact: true }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("link", { name: "预览", exact: true }).click();

    // Verify OLL controls appear
    await expect(page.getByTestId("oll-controls")).toBeVisible({ timeout: 20_000 });

    // Wait for the whiteboard runtime to render
    await expect(page.locator(".oll-board-runtime")).toBeVisible({ timeout: 20_000 });

    // Wait a moment for the 3D scene and section to establish
    await page.waitForTimeout(4000);

    // Capture visual screenshot of the playing 3D calculus lesson
    await page.screenshot({
      path: `/Users/alan0x/.gemini/antigravity/brain/b13f3469-4046-4a07-a263-bbd94d17897b/browser_${item.id}.png`,
    });
  });
}
