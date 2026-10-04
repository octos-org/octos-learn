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

for (const live of [false, true]) {
  for (const x of [80, 20_000]) {
    test(`${live ? 'live' : 'packaged'} course continues its composition after ink at x=${x}`, async ({page}) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = `/tests/fixtures/android-course-ink.html?course=cosine&progressive${live ? '&live' : ''}`;
      const ready = () => page.waitForFunction(() => (window as unknown as {courseInkTest: {ready: boolean}}).courseInkTest?.ready);
      const invoke = (name: string, argument?: unknown) => page.evaluate(async ({name, argument}) => {
        const api = (window as unknown as {courseInkTest: Record<string, (argument?: unknown) => unknown>}).courseInkTest;
        return await api[name](argument);
      }, {name, argument});
      await page.goto(url);
      await ready();
      await page.evaluate(() => document.fonts.ready);
      const normal = await invoke('snapshot') as {nodes: Record<string, unknown>};
      await page.goto(`${url}&partialRestore`);
      await ready();
      expect(await page.locator('.board-node').count()).toBe(1);
      expect(await invoke('seedRestoreInk', {x, y: 100})).toEqual({components: 1});
      const written = await invoke('playbackState') as {ink: string; mode: string; bounds: {x: number}};
      expect(Math.abs(written.bounds.x - x)).toBeLessThan(20);
      const continued = await invoke('completeCourseRestore') as typeof normal;
      expect(continued.nodes).toEqual(normal.nodes);
      const after = await invoke('playbackState') as typeof written;
      expect(after.ink).toBe(written.ink);
      const playing = await invoke('beginPlayback') as typeof written & {visibility: string; nativeCapture: boolean};
      expect(playing.mode).toBe('navigate');
      expect(playing.visibility).toBe('hidden');
      expect(playing.nativeCapture).toBe(false);
      expect(playing.ink).toBe(written.ink);
      const paused = await invoke('pausePlayback') as typeof playing;
      expect(paused.visibility).toBe('visible');
      expect(paused.ink).toBe(written.ink);
      expect(errors).toEqual([]);
    });
  }
}
