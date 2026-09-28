import { expect, test } from '@playwright/test';
import { installTestAccount } from './helpers/course-test-account';

for (const width of [1920, 1440, 700]) {
  test(`completion caption does not reframe the course at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1080 });
    await installTestAccount(page);
    await page.goto('/?collection=multivariable-calculus');
    const card = page.locator('.course-launcher-card').filter({
      has: page.getByRole('heading', { name: '水平截线与等高线：以 z=x²+y² 为例', exact: true }),
    });
    await card.getByRole('button', { name: '开始互动', exact: true }).click();
    await expect(page.getByTestId('oll-controls')).toBeAttached();
    const pause = page.getByRole('button', { name: '暂停 OLL 课程', exact: true, includeHidden: true });
    if (await pause.count()) await pause.evaluate((button: HTMLButtonElement) => button.click());
    const next = page.getByRole('button', { name: '下一 OLL Beat', exact: true, includeHidden: true });
    for (let i = 0; i < 80 && await next.isEnabled(); i++) {
      await next.evaluate((button: HTMLButtonElement) => button.click());
      await page.waitForTimeout(120);
    }
    await expect(next).toBeDisabled();
    const caption = page.locator('.octos-teacher-caption');
    await expect(caption).toContainText('这节课讲完了');
    await expect(page.getByRole('button', { name: '查看整课', exact: true })).toHaveCount(0);
    // Allow the single completion transition to finish, then sample every frame
    // through the real six-second caption dismissal (no mocked timer).
    await page.waitForTimeout(800);
    await page.screenshot({ path: info.outputPath('completion-caption.png') });
    const drift = await page.evaluate(async () => {
      const node = document.querySelector<HTMLElement>('.board-node')!;
      const initial = node.getBoundingClientRect();
      let maximum = 0;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const sample = () => {
          const rect = node.getBoundingClientRect();
          maximum = Math.max(maximum, Math.abs(rect.x - initial.x), Math.abs(rect.y - initial.y), Math.abs(rect.width - initial.width));
          if (performance.now() - start >= 6500) resolve();
          else requestAnimationFrame(sample);
        };
        sample();
      });
      return maximum;
    });
    await expect(caption).toHaveCount(0);
    expect(drift).toBeLessThan(0.5);
    await page.screenshot({ path: info.outputPath('completion-dismissed.png') });
  });
}
