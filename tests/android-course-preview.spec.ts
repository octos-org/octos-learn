import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 4 });

test('camera previews contain real pixels and restore the original SVG and camera', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/android-course-ink.html?course=cosine');
  await page.waitForFunction(() => (window as unknown as {courseInkTest: {ready: boolean}}).courseInkTest?.ready);
  const invoke = (method: string) => page.evaluate(async method => {
    const api = (window as unknown as {courseInkTest: Record<string, () => unknown>}).courseInkTest;
    return await api[method]();
  }, method);
  await invoke('setup');
  expect(await invoke('checkNativeExclusions')).toEqual({outsideAllowed: true,cardExcluded: true,fullViewport: false});
  expect(await invoke('checkPreviewFallback')).toEqual({active: false,canvases: 0});
  const before = await invoke('snapshot');
  const active = await invoke('previewNavigation') as {active: boolean;canvases: number;svgHidden: boolean;worldPromoted: boolean;nonempty: boolean};
  expect(active).toMatchObject({autoReleased: true,idlePromoted: true,active: true,svgHidden: true,worldPromoted: true,nonempty: true});
  expect(active.canvases).toBeGreaterThan(1);
  expect(await invoke('rewritePreviewAttributes')).toEqual({active: true,canvases: active.canvases});
  expect(await invoke('panPauseZoomPreview')).toEqual({minimum: active.canvases,count: active.canvases,layoutUnchanged: true,aligned: true});
  expect(await invoke('finishPreview')).toEqual({active: false,canvases: 0,svgVisible: true,worldPromoted: true,layerReleased: true});
  expect(await invoke('snapshot')).toEqual(before);

  const next = await invoke('previewNavigation') as {active: boolean;canvases: number};
  expect(next.active).toBe(true);
  expect(await invoke('invalidatePreview')).toEqual({canvases: next.canvases - 1,svgVisible: true});
  expect(await invoke('suspendPreview')).toEqual({active: false,layerReleased: true,svgVisible: true});
  await invoke('finishPreview');
  const ink = await invoke('commit') as {expected: {x: number;y: number};starts: {x: number;y: number}[];camera: unknown;nodes: unknown};
  expect(ink.starts).toHaveLength(1);
  expect(ink.starts[0].x).toBeCloseTo(ink.expected.x, 2);
  expect(ink.starts[0].y).toBeCloseTo(ink.expected.y, 2);
  expect({camera: ink.camera,nodes: ink.nodes}).toEqual(before);
  expect(errors).toEqual([]);
});
