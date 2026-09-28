import { expect, test, type Page } from '@playwright/test';
import { installTestAccount } from './helpers/course-test-account';
import { readLearningDocument } from './helpers/learning-documents';

async function openCourse(page: Page) {
  await installTestAccount(page);
  await page.goto('/?collection=multivariable-calculus');
  const card = page.locator('.course-launcher-card').filter({ has: page.getByRole('heading', { name: '水平截线与等高线：以 z=x²+y² 为例', exact: true }) });
  await card.getByRole('button', { name: '开始互动', exact: true }).click();
  await page.getByRole('button', { name: '暂停 OLL 课程', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放 OLL 课程', exact: true })).toBeVisible();
}

async function draw(page: Page) {
  await page.getByRole('button', { name: '书写笔迹', exact: true }).click();
  await page.mouse.move(160, 700);
  await page.mouse.down();
  await page.mouse.move(260, 680, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
}

async function finishCourse(page: Page) {
  const next = page.getByRole('button', { name: '下一 OLL Beat', exact: true });
  for (let i = 0; i < 80 && await next.isEnabled(); i++) {
    await next.evaluate((button: HTMLButtonElement) => button.click());
    await page.waitForTimeout(120);
  }
  await expect(next).toBeDisabled();
}

test('legacy course quota is released without clearing login or preferences', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('octos-learning-oll:v4:legacy:none', 'x'.repeat(4_900_000));
    localStorage.setItem('octos-learning-ink:v1:legacy', 'old');
    localStorage.setItem('storage-test-preference', 'keep');
    sessionStorage.setItem('seeded', 'yes');
  });
  await openCourse(page);
  expect(await page.evaluate(() => ({ old: localStorage.getItem('octos-learning-oll:v4:legacy:none'), preference: localStorage.getItem('storage-test-preference'), token: Boolean(localStorage.getItem('octos_session_token')) }))).toEqual({ old: null, preference: 'keep', token: true });
  await draw(page);
  await expect(page.locator('.learning-ink-status')).toContainText('已保存');
  await page.reload();
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
});

test('quota failure retries the same ink write and replay restores once across reloads', async ({ page }) => {
  await openCourse(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.assign(window, { failInkWrite: true });
    IDBObjectStore.prototype.put = function (value, key) {
      if ((window as unknown as { failInkWrite: boolean }).failInkWrite && String(key).startsWith('octos-learning-ink:v1:')) throw new DOMException('test quota', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  await draw(page);
  await expect(page.getByRole('alert')).toContainText('本地保存失败');
  await expect(page.locator('.learning-ink-status')).not.toContainText('已保存');
  await page.evaluate(() => { Object.assign(window, { failInkWrite: false }); });
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.learning-ink-status')).toContainText('已保存');
  await page.getByRole('button', { name: '重新播放 OLL 课程', exact: true }).click();
  const pause = page.getByRole('button', { name: '暂停 OLL 课程', exact: true });
  if (await pause.isVisible()) await pause.click();
  await finishCourse(page);
  await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
  await expect(page.locator('.learning-ink-status')).toContainText('已保存');
  const id = await page.evaluate(() => Object.keys(localStorage).find(key => key.startsWith('octos-learning-ink-run:v2:'))?.slice('octos-learning-ink-run:v2:'.length));
  expect(id).toBeTruthy();
  expect(await readLearningDocument(page, `octos-learning-ink:v1:${id}:replay:1`)).toBeTruthy();
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.locator('.learning-ink-status')).toContainText('1 项笔迹');
    await expect(page.locator('.learning-ink-status')).toContainText('已保存');
  }
});
