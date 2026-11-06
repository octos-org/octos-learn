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
  await page.getByRole("button", { name: "启用手势" }).waitFor();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await page.getByRole("button", { name: "启用手势" }).click();
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
  await hand(page, 350, 220, false, 24);
  await hand(page, 350, 220, true);
  await hand(page, 550, 330, true, 24);
  await hand(page, 550, 330, false);
  await expect(page.locator('.learning-ink-status')).toContainText('已选 1');
  // An interrupted second selection must not leave a selection to send.
  await hand(page, 350, 220, false, 24);
  await hand(page, 350, 220, true);
  await page.evaluate(() => (window as unknown as { loseHand: () => void }).loseHand());
  await expect(page.locator('.learning-ink-status')).not.toContainText('已选');
  await hand(page, 350, 220, false, 24);
  await hand(page, 350, 220, true);
  await hand(page, 550, 330, true, 24);
  await hand(page, 550, 330, false);
  await expect(page.locator('.learning-ink-status')).toContainText('已选 1');
  await pinchButton(page, "selection-action");
  await expect.poll(() => page.evaluate(() => (window as unknown as { asked: string[] }).asked.length)).toBe(1);
  expect(errors).toEqual([]);
});


test("hand navigation and zoom retain capture, while physical input takes over", async ({ page }) => {
  await page.goto("/tests/fixtures/air-gesture.html");
  await page.getByRole("button", { name: "启用手势" }).waitFor();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await page.getByRole("button", { name: "启用手势" }).click();
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
  const toggle = page.getByRole("button", { name: "启用手势" });
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
  await page.getByRole('button', { name: '手势设置', exact: true }).click();
  await page.getByRole('menuitem', { name: '校准捏合', exact: true }).click();
  await rawHand(page, 0.4, 0.4, 0.8);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await rawHand(page, 0.4, 0.4, 0.1);
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.getByRole('button', { name: '手势设置', exact: true }).click();
  await page.getByRole('menuitem', { name: '设置活动范围', exact: true }).click();
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

test("portrait layout keeps the compact gesture panel and tools reachable", async ({ page }, testInfo) => {
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
  const panel = (await page.locator('.board-handwriting-controls').boundingBox())!;
  expect(panel.width).toBeLessThan(250); expect(panel.height).toBeLessThan(300);
  expect(panel.y + panel.height).toBeLessThanOrEqual(844);
  await page.getByRole('button', { name: '手势设置', exact: true }).click();
  const menu = (await page.getByRole('menu', { name: '手势设置' }).boundingBox())!;
  expect(menu.y).toBeGreaterThanOrEqual(0); expect(menu.y + menu.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath('portrait-gesture-panel.png') });
});


test("pad pinches are accepted from different hand orientations despite one noisy depth estimate", async ({ page }) => {
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  for (const [yaw, pitch] of [[0, 0], [Math.PI / 3, 0], [Math.PI / 2, Math.PI / 6], [-Math.PI / 3, -Math.PI / 4]]) {
    for (const closed of [false, true, false]) {
      await page.evaluate(async args => {
        await (window as unknown as { handAtAngle: (yaw: number, pitch: number, closed: boolean, noisyWorld: boolean) => Promise<void> }).handAtAngle(...args);
      }, [yaw!, pitch!, closed, true] as const);
      await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-phase', closed ? 'drawing' : 'ready');
    }
  }
});

async function moveBoardCamera(page: Page) {
  await page.locator('.learning-oll-board').evaluate(async viewport => {
    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -80, clientX: 600, clientY: 350 }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
test("a recognized tool pinch activates immediately and stays captured through camera movement", async ({ page }) => {
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  const pen = page.locator('[data-air-command="draw"]');
  const box = (await pen.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await hand(page, x, y, false, 24); await hand(page, x, y, true);
  await expect(pen).toHaveAttribute('aria-pressed', 'true');
  await moveBoardCamera(page);
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
  await hand(page, 400, 240, true, 20); await hand(page, 400, 240, false);
  await expect(page.locator('.learning-ink-status')).toContainText('0 项笔迹');
  await hand(page, 400, 240, true); await hand(page, 500, 280, true, 20); await hand(page, 500, 280, false);
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
});
test("an undo click survives camera movement and slight release drift", async ({ page }) => {
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  await pinchButton(page, 'draw');
  await hand(page, 400, 240, false, 24); await hand(page, 400, 240, true);
  await hand(page, 500, 280, true, 20); await hand(page, 500, 280, false);
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
  const undo = page.locator('[data-air-command="undo"]');
  const box = (await undo.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await hand(page, x, y, false, 24); await hand(page, x, y, true);
  await moveBoardCamera(page);
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
  await hand(page, x, box.y - 6, true, 20); await hand(page, x, box.y - 6, false);
  await expect(page.locator('.learning-ink-status')).toContainText('0 项笔迹');
  await pinchButton(page, 'redo');
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
});

test("the gesture cursor stays above floating panels without creating ink", async ({ page }, testInfo) => {
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  await expect(page.locator('.learning-ink-toolbar .learning-gesture-toggle')).toHaveCount(0);
  await expect(page.locator('#input-methods .learning-gesture-toggle')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '手势练习', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const viewport = document.querySelector('.learning-oll-board')!.getBoundingClientRect();
    const panel = document.createElement('div'); panel.id = 'floating-gesture-test'; panel.dataset.learningBoardOcclusion = '';
    Object.assign(panel.style, { position: 'fixed', left: `${viewport.left + 300}px`, top: `${viewport.top + 200}px`, width: '220px', height: '150px', zIndex: '100000', borderRadius: '16px', background: '#eef4f0', border: '1px solid #c8d9cc' });
    document.body.append(panel);
  });
  const box = (await page.locator('#floating-gesture-test').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await hand(page, x, y, false, 24);
  const cursor = page.locator('body > .board-handwriting-cursor');
  await expect(cursor.locator('i')).toBeVisible();
  await expect(cursor).toHaveAttribute('data-phase', 'blocked');
  const topmost = await cursor.evaluate(element => {
    const dot = element.querySelector('i')!.getBoundingClientRect();
    (element as HTMLElement).style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(dot.left + dot.width / 2, dot.top + dot.height / 2);
    (element as HTMLElement).style.pointerEvents = '';
    return Boolean(hit && element.contains(hit));
  });
  expect(topmost).toBe(true);
  await hand(page, x, y, true); await hand(page, x, y, false);
  await expect(cursor.locator('i')).toBeVisible();
  await expect(page.locator('.learning-ink-status')).toContainText('0 项笔迹');
  await page.screenshot({ path: testInfo.outputPath('cursor-above-floating-panel.png') });
});
test("gesture settings are compact, dismissible, and keyboard accessible", async ({ page }, testInfo) => {
  await page.goto('/tests/fixtures/air-gesture.html'); await startHandInput(page);
  await expect(page.getByRole('menuitem', { name: '校准捏合', exact: true })).toHaveCount(0);
  await pinchButton(page, 'gesture-settings');
  await expect(page.getByRole('menuitem', { name: '校准捏合', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: '设置活动范围', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: '手势设置' })).toHaveCount(0);
  await expect(page.locator('.board-handwriting-state')).toHaveAttribute('data-state', 'active');
  await page.screenshot({ path: testInfo.outputPath('desktop-gesture-panel.png') });
});


test("calibrated hand input reaches page navigation and composer controls without writing behind them", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('octos-learn-air-gesture-preferences-v1', JSON.stringify({
    version: 1, pinchMetric: 2, pinch: { down: 0.28, up: 0.42 },
    region: { left: 0.3, top: 0.25, right: 0.7, bottom: 0.75 }, tutorialDone: true,
  })));
  await page.goto('/tests/fixtures/air-gesture.html?workspace'); await startHandInput(page);
  for (const command of ['home', 'history', 'toggle-voice', 'toggle-camera', 'dock-camera', 'dock-microphone']) await pinchButton(page, command);
  await pinchButton(page, 'question-input');
  await expect(page.getByRole('textbox', { name: '输入学习问题' })).toBeFocused();
  await page.keyboard.type('handwritten question');
  await pinchButton(page, 'send-question');
  await expect(page.getByRole('textbox', { name: '输入学习问题' })).toHaveValue('');
  expect(await page.evaluate(() => (window as unknown as { controlActions: string[] }).controlActions)).toEqual([
    'home', 'history', 'toggle-voice', 'toggle-camera', 'camera', 'mic', 'handwritten question',
  ]);
  await pinchButton(page, 'question-suggestion');
  await expect(page.getByRole('textbox', { name: '输入学习问题' })).toHaveValue('测试问题');
  await pinchButton(page, 'upload-image');
  await expect(page.getByText('请用鼠标或触屏选择图片')).toBeVisible();
  await pinchButton(page, 'cancel-image-picker');
  await expect(page.getByText('请用鼠标或触屏选择图片')).toHaveCount(0);
  await expect(page.locator('.learning-ink-status')).toContainText('0 项笔迹');
  await pinchButton(page, 'toggle-gestures');
  await expect(page.getByRole('button', { name: '启用手势' })).toBeVisible();
});
