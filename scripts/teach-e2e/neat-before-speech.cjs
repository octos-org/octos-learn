// Real-browser check of the learner teaching studio; see docs/LEARNER_TEACHING_MODE_HANDOFF.md (E2E).
// Usage: node scripts/teach-e2e/neat-before-speech.cjs <work-dir>   (dev server on 127.0.0.1:5217, Octos solo, work-dir from make-speech.sh)
// Real-browser check of round-2 fixes: laser on one stroke of live writing, the
// microphone meter and status, Make it neat before speaking then Stop (the crash),
// and continuing the draft from the Teach a lesson page.
const path = require('path');
const { chromium } = require(path.resolve('node_modules/playwright'));
const SP = process.argv[2];
const out = (name) => path.join(SP, name);

(async () => {
  const browser = await chromium.launch({ args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${out('speech-late.wav')}`,
  ] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['microphone'] });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.stack || e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/VAD|capture init/.test(m.text())) errors.push(m.text().slice(0, 400)); });
  const step = (name, value) => console.log(name.padEnd(16), typeof value === 'string' ? value : JSON.stringify(value));
  const micText = () => p.locator('.teach-mic [role="status"]').innerText().catch(() => '');
  try {
    await p.addInitScript(() => localStorage.setItem('octos-locale', 'en-US'));
    await p.goto('http://127.0.0.1:5217/login');
    await p.getByRole('button', { name: 'Continue without a password' }).click();
    await p.waitForTimeout(3000);
    await p.goto('http://127.0.0.1:5217/teach');
    await p.getByRole('textbox', { name: 'Topic' }).fill('Rise over run');
    await p.getByRole('button', { name: /teach what I typed|Teach this/ }).first().click();
    await p.getByRole('button', { name: 'Yes, math' }).click();
    await p.getByRole('textbox', { name: 'What the viewer will learn' }).fill('Find slope as rise over run');
    await p.getByRole('button', { name: 'Next' }).click();
    for (let i = 4; i > 1; i--) await p.getByRole('button', { name: `Remove card ${i}` }).click().catch(() => {});
    await p.locator('.teach-cards input').nth(0).fill('Rise over run');
    await p.getByRole('button', { name: 'Start recording' }).click();
    await p.waitForURL(/\/teach\/rec-/);
    const draftUrl = p.url();

    await p.getByRole('button', { name: 'Record this card' }).click();
    step('mic at start', await micText());
    await p.waitForTimeout(1500);
    step('mic listening', await micText());
    step('meter', await p.locator('.teach-mic meter').evaluate((m) => m.value));

    // Two lines with the pen, then the laser on the second.
    await p.getByRole('button', { name: /^Pen$/ }).click();
    await p.waitForTimeout(600);
    const bx = await p.locator('.teach-board').boundingBox();
    const ox = bx.x + 200, oy = bx.y + 150;
    const stroke = async (pts) => { await p.mouse.move(ox + pts[0][0], oy + pts[0][1]); await p.mouse.down(); for (const [x, y] of pts.slice(1)) await p.mouse.move(ox + x, oy + y, { steps: 8 }); await p.mouse.up(); };
    await stroke([[0, 100], [200, 80]]);       // gentle line
    await stroke([[0, 220], [120, 20]]);       // steep line, crossing nowhere near the end of the gentle one
    await p.getByRole('button', { name: /Laser pointer/ }).click();
    await p.mouse.click(ox + 110, oy + 37);    // on the steep line near its top
    await p.waitForTimeout(300);
    step('laser on stroke', await p.evaluate(() => { const el = document.querySelector('.teach-board .teacher-pointer'); const b = el.getBoundingClientRect(); return { hidden: el.hidden, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; }));
    step('tapped at', { x: Math.round(ox + 110), y: Math.round(oy + 37) });
    await p.screenshot({ path: out('r2-laser.png') });

    // Write m = 2 below, circle it, make it neat — all before any speech.
    await p.getByRole('button', { name: /^Pen$/ }).click();
    const wx = ox + 260, wy = oy + 200;
    const w = async (pts) => { await p.mouse.move(wx + pts[0][0], wy + pts[0][1]); await p.mouse.down(); for (const [x, y] of pts.slice(1)) await p.mouse.move(wx + x, wy + y, { steps: 6 }); await p.mouse.up(); };
    await w([[0, 40], [0, 10], [8, 0], [16, 10], [16, 40]]); await w([[16, 10], [24, 0], [32, 10], [32, 40]]);
    await w([[50, 18], [70, 18]]); await w([[50, 30], [70, 30]]);
    await w([[88, 10], [96, 0], [110, 0], [116, 10], [110, 22], [88, 40], [118, 40]]);
    await p.getByRole('button', { name: 'Make it neat' }).click();
    const loop = [[-20, -20], [140, -20], [140, 60], [-20, 60], [-20, -20]];
    await p.mouse.move(wx + loop[0][0], wy + loop[0][1]); await p.mouse.down();
    for (const [x, y] of loop.slice(1)) await p.mouse.move(wx + x, wy + y, { steps: 10 });
    await p.mouse.up();
    await p.getByRole('button', { name: 'Make the circled writing neat' }).click();
    await p.locator('.teach-neat input').waitFor({ timeout: 90000 });
    step('read as', await p.locator('.teach-neat input').inputValue());
    await p.getByRole('button', { name: 'Use this' }).click();
    await p.waitForTimeout(800);
    step('heard yet?', await p.locator('.teach-live-captions p').innerText());

    // Now talk (the audio starts at 25 s), then stop.
    await p.waitForFunction(() => /point/i.test(document.querySelector('.teach-live-captions p')?.textContent ?? ''), undefined, { timeout: 60000 }).catch(() => {});
    step('mic while words', await micText());
    step('live text', await p.locator('.teach-live-captions p').innerText());
    await p.getByRole('button', { name: 'Stop' }).click();
    await p.getByRole('textbox', { name: 'What you said on this card' }).waitFor({ timeout: 60000 });
    await p.waitForTimeout(1500);
    const board = await p.evaluate(() => ({
      math: [...document.querySelectorAll('.teach-board .board-node[data-kind="math"]')].map((el) => el.dataset.id),
      ink: [...document.querySelectorAll('.teach-board .board-node[data-kind="ink"]')].map((el) => el.dataset.id),
      regions: [...document.querySelectorAll('.teach-board .image-region')].map((el) => el.dataset.id),
      alert: document.querySelector('[role="alert"]')?.textContent ?? null,
    }));
    step('after stop', board);
    await p.screenshot({ path: out('r2-stop.png') });

    // Reload, then continue from the Teach a lesson page.
    await p.reload();
    await p.waitForTimeout(1500);
    step('reload ok', await p.locator('h1').innerText());
    await p.goto('http://127.0.0.1:5217/teach');
    const link = p.getByRole('link', { name: /Rise over run/ }).first();
    step('draft listed', await link.innerText());
    await link.click();
    await p.waitForURL(draftUrl);
    step('continued', await p.getByRole('button', { name: 'Re-record this card' }).isVisible());
  } catch (error) {
    console.log('FAIL', error.message.split('\n')[0]);
    await p.screenshot({ path: out('r2-fail.png') });
  }
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
