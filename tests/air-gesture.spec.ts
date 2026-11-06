import { expect, test, type Page } from "@playwright/test";

async function hand(page: Page, x: number, y: number, closed: boolean, count = 4) {
  await page.evaluate(async args => {
    const feed = (window as unknown as { hand: (x: number, y: number, closed: boolean, count: number) => Promise<void> }).hand;
    await feed(...args);
  }, [x, y, closed, count] as const);
}
async function pinchButton(page: Page, command: string) {
  const button = page.locator(`[data-air-command="${command}"]`).first();
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  await hand(page, box.x + box.width / 2, box.y + box.height / 2, false, 24);
  await expect(button).toHaveAttribute("data-air-hover", "");
  await hand(page, box.x + box.width / 2, box.y + box.height / 2, true);
  await hand(page, box.x + box.width / 2, box.y + box.height / 2, false);
}

test("hand input switches tools, writes, undoes, selects and asks once through the real whiteboard", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/tests/fixtures/air-gesture.html");
  await page.getByRole("button", { name: "隔空书写（试用）" }).waitFor();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await page.getByRole("button", { name: "隔空书写（试用）" }).click();
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
  await pinchButton(page, "draw");
  await expect(page.locator('[data-air-command="draw"]')).toHaveAttribute('aria-pressed','true');
  await hand(page, 400, 240, false, 24);
  await hand(page, 400, 240, true);
  await hand(page, 500, 280, true, 20);
  await hand(page, 500, 280, false);
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
  await pinchButton(page, "undo");
  await expect(page.locator('.learning-ink-status')).toContainText('0 项笔迹');
  await pinchButton(page, "redo");
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
  await pinchButton(page, "select");
  await hand(page, 350, 190, false, 24);
  await hand(page, 350, 190, true);
  await hand(page, 550, 330, true, 24);
  await hand(page, 550, 330, false);
  await expect(page.locator('.learning-ink-status')).toContainText('已选 1');
  // An interrupted second selection must not leave a selection to send.
  await hand(page, 350, 190, false, 24);
  await hand(page, 350, 190, true);
  await page.evaluate(() => (window as unknown as { loseHand: () => void }).loseHand());
  await expect(page.locator('.learning-ink-status')).not.toContainText('已选');
  await hand(page, 350, 190, false, 24);
  await hand(page, 350, 190, true);
  await hand(page, 550, 330, true, 24);
  await hand(page, 550, 330, false);
  await expect(page.locator('.learning-ink-status')).toContainText('已选 1');
  await pinchButton(page, "selection-action");
  await expect.poll(() => page.evaluate(() => (window as unknown as { asked: string[] }).asked.length)).toBe(1);
  expect(errors).toEqual([]);
});


test("hand navigation and zoom retain capture, while physical input takes over", async ({ page }) => {
  await page.goto("/tests/fixtures/air-gesture.html");
  await page.getByRole("button", { name: "隔空书写（试用）" }).waitFor();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await page.getByRole("button", { name: "隔空书写（试用）" }).click();
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
  await hand(page, 400, 240, false, 24);
  await hand(page, 400, 240, true);
  await hand(page, 500, 280, true, 20);
  await hand(page, 500, 280, false);
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
  await expect(page.locator('.learning-ink-status')).toContainText('0 项笔迹');
  await pinchButton(page, "zoom-in");
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
  await page.mouse.click(300, 200);
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'paused');
});
