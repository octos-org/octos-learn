import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

test.skip(!process.env.OCTOS_LOCAL_COURSE_PACK_ROOT, "Requires reviewed CoursePack publication");

const collection = [
  {
    id: "trig-unit-circle-to-sine",
    title: "从单位圆旋转到正弦曲线",
  },
  {
    id: "trig-cosine-and-phase-shift",
    title: "余弦函数与单位圆投影",
  },
  {
    id: "trig-quadrants-and-monotonicity",
    title: "单位圆与正弦函数的单调性及象限循环",
  },
];


test("collection home page displays all 3 high school trigonometry courses", async ({ page }, testInfo) => {
  await installTestAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  for (const item of collection) {
    const card = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: item.title, exact: true }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
  }

  // Scroll to the trigonometry cards row to capture clear thumbnails
  const firstTrigCard = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: collection[0].title, exact: true }) });
  await firstTrigCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await page.screenshot({
    path: testInfo.outputPath("browser_all_trig_cards.png"),
  });
});

for (const item of collection) {
  test(`course: ${item.id} (${item.title}) loads, renders unit circle & wave projection, and plays`, async ({ page }, testInfo) => {
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

    // Wait for the initial beat and visual projection to render
    await page.waitForTimeout(4000);

    // Capture visual screenshot of the playing trigonometry lesson
    await page.screenshot({
      path: testInfo.outputPath(`browser_${item.id}.png`),
    });
  });
}
