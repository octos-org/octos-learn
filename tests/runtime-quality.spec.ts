import { expect, test } from '@playwright/test';

interface QualityFixture {
  board: { focus: string[]; nodes: Record<string, {content: Record<string, unknown>}> };
  view: { dispose(): void };
  resize(width: number, height: number): void;
  render(): void;
}
declare global { interface Window { quality?: QualityFixture } }


for (const flow of ['reading', 'teaching']) {
test(`${flow}: formula fits its final column, including wrapped fractions`, async ({ page }) => {
  await page.goto(`/tests/fixtures/runtime-quality.html?flow=${flow}`);
  await page.waitForFunction(() => Boolean(window.quality!));
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.locator('[data-id="formula"].board-node').evaluate((card) => {
    const outer = card.getBoundingClientRect();
    const children = [...card.querySelectorAll('.math-fragment')].map(e => e.getBoundingClientRect());
    return {top: outer.top, bottom: outer.bottom, contentTop:Math.min(...children.map(r=>r.top)),contentBottom:Math.max(...children.map(r=>r.bottom)), scroll:card.scrollHeight,client:card.clientHeight};
  });
  expect(metrics.contentTop).toBeGreaterThanOrEqual(metrics.top);
  expect(metrics.contentBottom).toBeLessThanOrEqual(metrics.bottom);
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
});

test(`${flow}: host-only attachment changes keep a visible anchor at the same screen position`, async ({ page }) => {
  await page.goto(`/tests/fixtures/runtime-quality.html?flow=${flow}`);
  await page.waitForFunction(() => Boolean(window.quality!));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const q=window.quality!;
    q.board.focus=['lower']; q.render();
  });
  await page.addStyleTag({content: '.world { transition: none !important; }'});
  const before = await page.locator('[data-id="lower"].board-node').boundingBox();
  await page.evaluate(() => window.quality!.resize(820,350));
  const after = await page.locator('[data-id="lower"].board-node').boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(after!.width).toBeCloseTo(before!.width, 0);
});

test(`${flow}: late font metrics reflow a paused board without another lesson operation`, async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/late-metrics.woff2', async route => {
    await gate;
    await route.fulfill({path:'node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2', contentType:'font/woff2'});
  });
  await page.goto(`/tests/fixtures/runtime-quality.html?flow=${flow}`);
  await page.waitForFunction(() => Boolean(window.quality!));
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({content: `
    @font-face {font-family: LateMetrics; src:url('/late-metrics.woff2'); size-adjust:180%;}
    .kind-math .mathrm {font-family:LateMetrics, monospace !important;}
    .world {transition:none !important;}
  `});
  await page.evaluate(() => {
    const q=window.quality!;
    q.board.nodes.formula.content={latex:'\\mathrm{WWWWWWW}'};
    q.resize(1500,44); q.render();
  });
  const card=page.locator('[data-id="formula"].board-node');
  const before=await card.evaluate(e=>e.offsetWidth);
  release();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(()=>card.evaluate(e=>e.offsetWidth)).toBeGreaterThan(before + 20);
  await page.evaluate(() => window.quality!.view.dispose());
});
}
