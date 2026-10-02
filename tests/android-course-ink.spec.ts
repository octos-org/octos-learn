import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 4 });

test('writing in a completed course gap keeps every stroke and the camera in place', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/tests/fixtures/android-course-ink.html');
  await page.waitForFunction(() => (window as unknown as {courseInkTest?: {ready: boolean}}).courseInkTest?.ready);
  const setup = await page.evaluate(() => (window as unknown as {courseInkTest: {setup(): Promise<{point: {x: number; y: number}}>}}).courseInkTest.setup());
  expect(setup.point.x).toBeGreaterThan(0); expect(setup.point.x).toBeLessThan(960); expect(setup.point.y).toBeGreaterThan(0); expect(setup.point.y).toBeLessThan(540);
  expect(pageErrors).toEqual([]);
  const before = await page.evaluate(() => (window as unknown as {courseInkTest: {snapshot(): unknown}}).courseInkTest.snapshot());
  const expectedStarts: {x: number; y: number}[] = [];
  for (let count = 1; count <= 3; count++) {
    const after = await page.evaluate(() => (window as unknown as {courseInkTest: {commit(): Promise<{expected: {x: number; y: number}; starts: {x: number; y: number}[]; camera: unknown; nodes: unknown}>}}).courseInkTest.commit());
    expect({camera: after.camera, nodes: after.nodes}).toEqual(before);
    expect(pageErrors).toEqual([]);
    expectedStarts.push(after.expected);
    expect(after.starts).toHaveLength(count);
    after.starts.forEach((start, index) => {
      expect(Math.abs(start.x - expectedStarts[index]!.x)).toBeLessThan(.01);
      expect(Math.abs(start.y - expectedStarts[index]!.y)).toBeLessThan(.01);
    });
  }
});
