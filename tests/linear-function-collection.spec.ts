import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

test.skip(!process.env.OCTOS_LOCAL_COURSE_PACK_ROOT, "Requires reviewed CoursePack publication");

const collection = [
  {
    id: "linear-intro-and-slope",
    title: "正比例函数 y = kx 与斜率的几何意义",
  },
  {
    id: "slope-and-intercept",
    title: "一次函数 y = mx + b 的图像与性质",
  },
  {
    id: "linear-simultaneous-intersections",
    title: "二元一次方程组与一次函数的几何意义",
  },
];


test("collection home page displays all 3 linear function courses", async ({ page }, testInfo) => {
  await installTestAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  for (const item of collection) {
    const card = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: item.title, exact: true }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
  }

  await page.screenshot({
    path: testInfo.outputPath("browser_all_linear_cards.png"),
  });
});

for (const item of collection) {
  test(`course: ${item.id} (${item.title}) loads, renders plot visual and plays`, async ({ page }, testInfo) => {
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

    // Wait a brief moment for the visual beat to establish
    await page.waitForTimeout(3000);

    // Capture visual screenshot of the playing lesson
    await page.screenshot({
      path: testInfo.outputPath(`browser_${item.id}.png`),
    });
  });
}
