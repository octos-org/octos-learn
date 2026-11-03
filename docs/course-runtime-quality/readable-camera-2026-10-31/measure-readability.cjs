// Plays published courses beat by beat in the real Learn app and records the
// on-screen text size of the focused cards after each Beat settles.
// Usage (cwd = octos-learn): node measure-readability.cjs <out.json> [packId,...]
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.resolve(process.cwd(), 'node_modules/playwright'));
const { install } = require(path.resolve(process.cwd(), 'docs/course-runtime-quality/whiteboard-closeout-2026-09-27/auth.cjs'));

const baseUrl = process.env.OCTOS_CAPTURE_URL || 'http://127.0.0.1:5217';
const out = process.argv[2];
const only = process.argv[3]?.split(',');
const sizes = (process.env.SIZES || '1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));

async function measure(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.board-viewport, [data-testid="oll-board"], .infinite-board') || document.body;
    const vr = viewport.getBoundingClientRect();
    let focused = [...document.querySelectorAll('.board-node.focused')];
    if (!focused.length) {
      const groups = [...document.querySelectorAll('.board-group.focused')].map((g) => g.getBoundingClientRect());
      focused = [...document.querySelectorAll('.board-node')].filter((n) => {
        const r = n.getBoundingClientRect();
        return groups.some((g) => r.left >= g.left - 2 && r.right <= g.right + 2 && r.top >= g.top - 2 && r.bottom <= g.bottom + 2);
      });
    }
    let source = 'focus';
    if (!focused.length) {
      source = 'on-screen';
      focused = [...document.querySelectorAll('.board-node')].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      });
    }
    const scaleOf = (el) => (el instanceof HTMLElement && el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1);
    let minFont = null;
    for (const node of focused) {
      const candidates = node.querySelectorAll('.node-title, .content-list, .content-table, .diagram-sequence, .math-render, :scope > div:not(.node-caption):not(.node-title)');
      for (const el of candidates) {
        if (!el.textContent?.trim()) continue;
        const size = parseFloat(getComputedStyle(el).fontSize) * scaleOf(el);
        if (Number.isFinite(size)) minFont = minFont === null ? size : Math.min(minFont, size);
      }
    }
    const world = focused[0]?.closest('.board-world, .world') ?? null;
    const transform = world ? getComputedStyle(world).transform : 'none';
    const scale = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).a : null;
    return {
      source,
      focused: focused.map((n) => n.getAttribute('data-id')),
      min_font: minFont === null ? null : Math.round(minFont * 100) / 100,
      scale: scale === null ? null : Math.round(scale * 100) / 100,
      viewport: { w: Math.round(vr.width), h: Math.round(vr.height) },
      controls: document.querySelector('[data-testid="oll-controls"]')?.innerText?.slice(0, 80),
    };
  });
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  let prev = '';
  let stable = 0;
  for (let k = 0; k < 40 && stable < 3; k++) {
    const s = await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.board-node')].map((e) => {
      const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)];
    })));
    stable = s === prev ? stable + 1 : 0;
    prev = s;
    await page.waitForTimeout(150);
  }
}

(async () => {
  const catalog = await (await fetch(baseUrl + '/api/learn/course-packs')).json();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  for (const pack of catalog.packs) {
    if (only && !only.includes(pack.packId)) continue;
    for (const [width, height] of sizes) {
      const row = { pack: pack.packId, version: pack.version, width, height, beats: [] };
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await install(page);
        await page.goto(`${baseUrl}/course/${pack.packId}?version=${pack.version}&title=${encodeURIComponent(pack.title)}&mode=learn`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('oll-controls').waitFor({ state: 'attached', timeout: 30000 });
        const pause = page.getByRole('button', { name: '暂停 OLL 课程', exact: true, includeHidden: true });
        if (await pause.count()) await pause.evaluate((e) => e.click());
        const next = page.getByRole('button', { name: '下一 OLL Beat', exact: true, includeHidden: true });
        for (let i = 0; i < 80 && (await next.isEnabled()); i++) {
          await next.evaluate((e) => e.click());
          await settle(page);
          row.beats.push({ index: i + 1, ...(await measure(page)) });
        }
      } catch (error) {
        row.error = String(error);
        await page.screenshot({ path: out.replace(/\.json$/, `-${pack.packId}-${width}-error.png`) });
      }
      results.push(row);
      const fonts = row.beats.map((b) => b.min_font);
      console.log(pack.packId, `${width}x${height}`, 'beats', row.beats.length, 'under14', fonts.filter((f) => f !== null && f < 14).length, row.error ?? '');
      await page.close();
    }
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
})();
