import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 4 });

test('restored ink does not split a packaged course comparison during history hydration', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => (window as unknown as {courseInkTest: {ready: boolean}}).courseInkTest?.ready);
  const invoke = (name: string) => page.evaluate(async name => {
    return await (window as unknown as {courseInkTest: Record<string, () => unknown>}).courseInkTest[name]();
  }, name);
  await page.goto('/tests/fixtures/android-course-ink.html?course=cosine');
  await ready();
  expect(await invoke('seedRestoreInk')).toEqual({components: 1});
  const normal = await invoke('snapshot') as {nodes: Record<string, {top: string;left: string}>};
  await page.goto('/tests/fixtures/android-course-ink.html?course=cosine&partialRestore');
  await ready();
  expect(await invoke('awaitInkRestore')).toEqual({components: 1});
  expect(await page.locator('.board-node').count()).toBe(1);
  const restored = await invoke('completeCourseRestore') as typeof normal;
  expect(restored.nodes).toEqual(normal.nodes);
  expect(await invoke('awaitInkRestore')).toEqual({components: 1});
  expect(errors).toEqual([]);
});
