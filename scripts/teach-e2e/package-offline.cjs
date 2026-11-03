// Real-browser check of the learner teaching studio; see docs/LEARNER_TEACHING_MODE_HANDOFF.md (E2E).
// Usage: node scripts/teach-e2e/package-offline.cjs <work-dir>   (dev server on 127.0.0.1:5217, Octos solo, work-dir from make-speech.sh)
const path = require('path');
const { chromium } = require(path.resolve('node_modules/playwright'));
const SP = process.argv[2];
const shot = (p, name) => p.screenshot({ path: path.join(SP, `pk-${name}.png`) });
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const p = await context.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  const requests = []; p.on('request', (r) => requests.push(r.url()));
  const frames = []; p.on('websocket', (ws) => ws.on('framesent', (f) => { const t = String(f.payload); if (t.includes('skill/action')) frames.push(t.slice(0, 120)); }));
  try {
    await p.addInitScript(() => localStorage.setItem('octos-locale', 'en-US'));
    await p.goto('http://127.0.0.1:5217/login');
    await p.getByRole('button', { name: 'Continue without a password' }).click();
    await p.waitForTimeout(3000);
    await p.goto('http://127.0.0.1:5217/teach');
    await p.getByRole('textbox', { name: 'Topic' }).fill('Plotting two points');
    await p.getByRole('button', { name: /teach what I typed|Teach this/ }).first().click();
    await p.getByRole('button', { name: 'Yes, math' }).click();
    await p.getByRole('textbox', { name: 'What the viewer will learn' }).fill('Plot two points on a grid');
    await p.getByRole('button', { name: 'Next' }).click();
    for (let i = 4; i > 2; i--) await p.getByRole('button', { name: `Remove card ${i}` }).click().catch(() => {});
    await p.locator('.teach-cards input').nth(0).fill('The grid');
    await p.locator('.teach-cards input').nth(1).fill('The points');
    await p.getByRole('button', { name: 'Start recording' }).click();
    await p.waitForURL(/\/teach\/rec-/);
    const url = p.url();
    const add = async (kind) => { await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.getByRole('button', { name: kind, exact: true }).click(); };
    const say = async (text) => { const box = p.getByRole('textbox', { name: 'What you said on this card' }); await box.waitFor({ timeout: 60000 }); await box.fill(text); await p.getByRole('button', { name: 'Save captions' }).click(); };
    await p.getByRole('button', { name: /^Record card 1/ }).click();
    await add('Coordinate grid');
    const r = p.locator('.teach-range input'); await r.nth(0).fill('-1'); await r.nth(1).fill('6'); await r.nth(2).fill('-1'); await r.nth(3).fill('9');
    await p.getByRole('button', { name: 'Put on the board' }).click();
    await p.getByRole('button', { name: /^Stop/ }).click();
    await say('This is a coordinate grid. The x axis goes from minus one to six, and the y axis from minus one to nine.');
    await p.getByRole('button', { name: /Next: card 2/ }).click();
    await p.getByRole('button', { name: /^Record card 2/ }).click();
    for (const [x, y] of [['1', '2'], ['4', '8']]) { await add('Place a point'); const f = p.locator('.teach-range input'); await f.nth(0).fill(x); await f.nth(1).fill(y); await p.getByRole('button', { name: 'Put on the board' }).click(); }
    await p.getByRole('button', { name: /^Stop/ }).click();
    await say('Point A is one across and two up, at 1, 2. Point B is four across and eight up, at 4, 8.');
    await p.getByRole('button', { name: 'Check my lesson' }).first().click();
    await p.waitForFunction(() => !document.querySelector('.teach-check .teach-spinner'), undefined, { timeout: 120000 });
    console.log('check', JSON.stringify(await p.locator('.teach-check-summary').innerText()));
    await p.goto(url + '/watch');
    await p.waitForTimeout(2500);
    console.log('package panel', JSON.stringify(await p.locator('.teach-package').innerText()));
    await p.getByRole('button', { name: 'Get ready to share' }).click();
    await p.getByRole('button', { name: 'Download the lesson package' }).waitFor({ timeout: 120000 });
    console.log('ready', JSON.stringify(await p.locator('.teach-package p').innerText()));
    const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download the lesson package' }).click()]);
    const saved = path.join(SP, 'lesson.olesson'); await download.saveAs(saved);
    console.log('downloaded', download.suggestedFilename(), require('fs').statSync(saved).size, 'bytes');
    await shot(p, '1-ready');

    // Offline: reload from the dev server first, then cut the network and play.
    await p.reload(); await p.waitForTimeout(3000);
    await context.setOffline(true);
    const before = requests.length, framesBefore = frames.length;
    await p.getByRole('button', { name: 'Play', exact: true }).click();
    const started = Date.now();
    while (Date.now() - started < 90000) {
      if (await p.getByRole('button', { name: 'Watch again' }).count()) break;
      await p.waitForTimeout(500);
    }
    const after = requests.slice(before);
    console.log('completed', await p.getByRole('button', { name: 'Watch again' }).count() > 0, 'in', Math.round((Date.now() - started) / 1000), 's');
    console.log('offline requests', JSON.stringify(after.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))), 'skill frames', frames.length - framesBefore);
    console.log('notices', JSON.stringify(await p.locator('.teach-notice').allInnerTexts()));
    await shot(p, '2-offline-end');
  } catch (e) { console.log('FAIL', e.message.split('\n')[0]); await shot(p, 'fail'); }
  console.log('errors', JSON.stringify(errors)); await browser.close();
})();
