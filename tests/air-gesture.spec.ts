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

async function startHandInput(page: Page) {
  const toggle = page.getByRole("button", { name: "隔空书写（试用）" });
  await toggle.waitFor();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await toggle.click();
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
}
async function rawHand(page: Page, x: number, y: number, score: number, count = 25) {
  await page.evaluate(async args => {
    await (window as unknown as { handRaw: (x: number, y: number, score: number, count: number) => Promise<void> }).handRaw(...args);
  }, [x, y, score, count] as const);
}
test("personal pinch and comfort region are saved and restored", async ({ page }) => {
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  await page.getByRole('button', { name: '校准捏合', exact: true }).click();
  await rawHand(page, 0.4, 0.4, 0.8);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await rawHand(page, 0.4, 0.4, 0.1);
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.getByRole('button', { name: '设置活动范围', exact: true }).click();
  await rawHand(page, 0.2, 0.2, 0.8);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await rawHand(page, 0.8, 0.8, 0.8);
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  const value = await page.evaluate(() => JSON.parse(localStorage.getItem('octos-learn-air-gesture-preferences-v1')!));
  expect(value.pinch.up).toBeGreaterThan(value.pinch.down);
  expect(value.region.left).toBeCloseTo(0.2); expect(value.region.bottom).toBeCloseTo(0.8);
  await page.reload(); await startHandInput(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('octos-learn-air-gesture-preferences-v1')!))).toEqual(value);
  await pinchButton(page, 'draw');
  await expect(page.locator('[data-air-command="draw"]')).toHaveAttribute('aria-pressed','true');
});
test("guided practice finishes without adding learner ink", async ({ page }) => {
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  await page.getByRole('button', { name: '手势练习', exact: true }).click();
  const viewport = (await page.locator('.learning-oll-board').boundingBox())!;
  const x = viewport.x + viewport.width * 0.3, y = viewport.y + viewport.height * 0.4;
  await hand(page, x, y, false, 24); await hand(page, x, y, true);
  await hand(page, x + 90, y, true, 24); await hand(page, x + 90, y, false);
  await hand(page, viewport.x + viewport.width * 0.6, y, false, 24);
  await page.getByRole('button', { name: '开始使用', exact: true }).click();
  await expect(page.locator('.learning-ink-status')).toContainText('0 项笔迹');
  await expect(page.locator('.board-handwriting-practice')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('octos-learn-air-gesture-preferences-v1')!).tutorialDone)).toBe(true);
});
test("course sliders and geometry points commit once and roll back when tracking is lost", async ({ page }) => {
  await page.goto('/tests/fixtures/air-gesture.html?course');
  const slider = page.locator('input[data-air-variable]').first(); await expect(slider).toBeVisible();
  await startHandInput(page);
  const before = await slider.inputValue();
  const box = (await slider.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await hand(page, x, y, false, 24); await hand(page, x, y, true);
  await hand(page, x - box.width * 0.25, y, true, 24);
  await expect(slider).not.toHaveValue(before);
  await page.evaluate(() => (window as unknown as { loseHand: () => void }).loseHand());
  await expect(slider).toHaveValue(before);
  await expect.poll(() => page.evaluate(() => (window as unknown as { airRuntime: { studentOperations: unknown[] } }).airRuntime.studentOperations.length)).toBe(0);
  await hand(page, x, y, false, 24); await hand(page, x, y, true);
  await hand(page, x - box.width * 0.25, y, true, 24); await hand(page, x - box.width * 0.25, y, false);
  await expect.poll(() => page.evaluate(() => (window as unknown as { airRuntime: { studentOperations: unknown[] } }).airRuntime.studentOperations.length)).toBe(1);
  const geometry = page.locator('[data-oll-variable-control]').first(); await expect(geometry).toBeVisible();
  const pointBox = (await geometry.boundingBox())!;
  const px = pointBox.x + pointBox.width / 2, py = pointBox.y + pointBox.height / 2;
  const valueBeforePoint = await slider.inputValue();
  await hand(page, px, py, false, 24); await hand(page, px, py, true);
  await hand(page, px - 50, py - 50, true, 24);
  await expect(slider).not.toHaveValue(valueBeforePoint);
  await page.evaluate(() => (window as unknown as { loseHand: () => void }).loseHand());
  await expect(slider).toHaveValue(valueBeforePoint);
  await expect.poll(() => page.evaluate(() => (window as unknown as { airRuntime: { studentOperations: unknown[] } }).airRuntime.studentOperations.length)).toBe(1);
  const nextBox = (await geometry.boundingBox())!;
  const nx = nextBox.x + nextBox.width / 2, ny = nextBox.y + nextBox.height / 2;
  await hand(page, nx, ny, false, 24); await hand(page, nx, ny, true);
  await hand(page, nx - 50, ny - 50, true, 24); await hand(page, nx - 50, ny - 50, false);
  await expect.poll(() => page.evaluate(() => (window as unknown as { airRuntime: { studentOperations: unknown[] } }).airRuntime.studentOperations.length)).toBe(2);
});

test("portrait layout leaves tools and practice targets reachable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  for (const command of ['draw', 'erase', 'select', 'undo', 'redo']) {
    const button = page.locator(`[data-air-command="${command}"]`).first();
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
    const exposed = await button.evaluate(element => {
      const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    });
    expect(exposed).toBe(true);
  }
  await page.getByRole('button', { name: '手势练习', exact: true }).click();
  const circles = page.locator('.board-handwriting-practice circle');
  for (let i = 0; i < 2; i++) {
    const box = (await circles.nth(i).boundingBox())!;
    const panel = (await page.locator('.board-handwriting-controls').boundingBox())!;
    expect(box.y + box.height).toBeLessThan(panel.y);
  }
  await page.screenshot({ path: testInfo.outputPath('portrait-practice.png') });
});
