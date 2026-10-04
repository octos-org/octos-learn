import { expect, test } from '@playwright/test';

test('live slider changes update 2D/3D graphs, retain static layers and restore the exact graph', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/slider-rendering.html');
  await page.waitForFunction(() => (window as unknown as { sliderTest?: { ready: boolean } }).sliderTest?.ready);
  const update = (value: number) => page.evaluate(value => {
    return (window as unknown as { sliderTest: { update: (value: number) => Promise<{
      sceneRetained: boolean; plotRetained: boolean; surfaceRetained: boolean; axesRetained: boolean;
      intersection: string; curve: string; cells: number; cards: object[]; sceneMarkup: string; plotMarkup: string;
    }> } }).sliderTest.update(value);
  }, value);
  const before = await update(0);
  for (const value of [.2, .6, 1.2, -.6]) {
    const state = await update(value);
    expect(state).toMatchObject({ sceneRetained: true, plotRetained: true, surfaceRetained: true, axesRetained: true, cells: 144 });
    expect(state.cards).toEqual(before.cards);
    expect(state.intersection).not.toBe(before.intersection);
    expect(state.curve).not.toBe(before.curve);
  }
  const restored = await update(0);
  expect(restored.intersection).toBe(before.intersection);
  expect(restored.curve).toBe(before.curve);
  expect(restored.sceneMarkup).toBe(before.sceneMarkup);
  expect(restored.plotMarkup).toBe(before.plotMarkup);
  expect(errors).toEqual([]);
});


test('3D pointer orbit, wheel, presets and reset preserve card placement and final views', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/slider-rendering.html');
  await page.waitForFunction(() => Boolean((window as unknown as { sliderTest?: { ready: boolean } }).sliderTest?.ready));
  const state = () => page.evaluate(() => (window as unknown as { sliderTest: { orbitState: () => {
    inputs: Array<{ phase: string; control: string; operation_id?: string }>;
    view: { yaw: number; pitch: number; zoom: number }; retained: boolean; cards: object[];
  } } }).sliderTest.orbitState());
  const before = await state();
  const scene = page.locator('.scene3d-runtime');
  const svg = scene.locator('svg');
  const bounds = (await svg.boundingBox())!;
  const x = bounds.x + bounds.width * .4, y = bounds.y + bounds.height * .4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 20, { steps: 12 });
  await page.mouse.up();
  const orbit = await state();
  expect(orbit.view.yaw).toBeCloseTo(.72 + 50 * .012);
  expect(orbit.view.pitch).toBeCloseTo(.55 - 20 * .01);
  expect(orbit.inputs.filter(i => i.control === 'orbit' && i.phase === 'commit')).toHaveLength(1);
  expect(orbit.inputs.at(-1)?.operation_id).toBe('browser-orbit');
  expect(orbit.retained).toBe(true);
  expect(orbit.cards).toEqual(before.cards);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await state()).inputs.at(-1)?.phase).toBe('commit');
  expect((await state()).view.zoom).toBeCloseTo(Math.exp(.15));
  await scene.getByRole('button', { name: '正视', exact: true }).click();
  expect((await state()).view).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
  await scene.getByRole('button', { name: '复位', exact: true }).click();
  expect((await state()).view).toEqual({ yaw: .72, pitch: .55, zoom: 1 });
  expect((await state()).cards).toEqual(before.cards);
  expect(errors).toEqual([]);
});
