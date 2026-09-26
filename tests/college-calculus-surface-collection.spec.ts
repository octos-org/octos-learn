import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

test.skip(!process.env.OCTOS_LOCAL_COURSE_PACK_ROOT, "Requires reviewed CoursePack publication");

const collection = [
  {
    id: "surface-paraboloid-level-sets",
    title: "水平截线与等高线：以 z=x²+y² 为例",
    beats: 11,
  },
  {
    id: "surface-partial-derivative-slice",
    title: "偏导数：固定输入，求截线斜率",
    beats: 11,
  },
  {
    id: "surface-saddle-point-analysis",
    title: "马鞍面与鞍点：梯度为零不一定是极值点",
    beats: 15,
  },
];


test("collection home page displays all 3 college multivariable calculus courses", async ({ page }, testInfo) => {
  await installTestAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  for (const item of collection) {
    const card = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: item.title, exact: true }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(card).toContainText('0.2.3');
  }

  // Scroll to the calculus cards row to show the thumbnails clearly
  const firstCalculusCard = page.locator(".course-launcher-card").filter({ has: page.getByRole("heading", { name: collection[0].title, exact: true }) });
  await firstCalculusCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await page.screenshot({
    path: testInfo.outputPath("browser_all_calculus_surface_cards.png"),
  });
});

for (const item of collection) {
  test(`course: ${item.id} (${item.title}) loads, renders 3D surface with section, and plays`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
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

    if (item.id === 'surface-partial-derivative-slice') {
      await expect(page.locator('.board-node.kind-math')).toBeVisible({timeout: 3000});
    }
    // Wait a moment for the 3D scene and section to establish
    await page.waitForTimeout(4000);

    // Capture visual screenshot of the playing 3D calculus lesson
    await page.screenshot({
      path: testInfo.outputPath(`browser_${item.id}.png`),
    });
    const pause = page.getByRole('button', { name: '暂停 OLL 课程' });
    if (await pause.isVisible()) await pause.click();
    const next = page.getByRole('button', { name: '下一 OLL Beat', exact: true });
    for (let i = 0; i <= item.beats; i++) await next.click();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator('.board-node.kind-math').evaluateAll(cards => cards.every(card => {
      const frame = card.getBoundingClientRect();
      return [...card.querySelectorAll('.math-fragment')].every(fragment => {
        const r = fragment.getBoundingClientRect();
        return r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1;
      });
    }))).toBe(true);
    if (item.id === 'surface-partial-derivative-slice') {
      await expect(page.locator('.board-node.kind-plot .plot-axis-label').filter({hasText: /^z$/})).toHaveCount(1);
      await expect(page.locator('.board-node.kind-plot .plot-legend')).not.toContainText('y = 2x');
      await expect(page.getByRole('slider')).toHaveValue('0');
    }
    if (item.id === 'surface-saddle-point-analysis') {
      await expect(page.locator('.board-node.kind-scene3d')).toHaveCount(2);
      const tops = await page.locator('.board-node.kind-scene3d').evaluateAll(nodes => nodes.map(node => parseFloat((node as HTMLElement).style.top)));
      expect(Math.abs(tops[0] - tops[1])).toBeLessThan(1);
      await expect(page.locator('.board-node.kind-plot')).toHaveCount(1);
      await expect(page.locator('.board-node.kind-plot .plot-axis-label').filter({hasText: /^t$/})).toHaveCount(1);
      await expect(page.locator('.board-node.kind-plot .plot-axis-label').filter({hasText: /^z$/})).toHaveCount(1);
      await expect(page.getByRole('slider')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`complete_${item.id}.png`) });
  });
}
