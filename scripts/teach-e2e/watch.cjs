// Real-browser check of the learner teaching studio; see docs/LEARNER_TEACHING_MODE_HANDOFF.md (E2E).
// Usage: node scripts/teach-e2e/watch.cjs <work-dir>   (dev server on 127.0.0.1:5217, Octos solo, work-dir from make-speech.sh)
const path = require('path');
const { chromium } = require(path.resolve('node_modules/playwright'));
const SP = process.argv[2];
const shot = (p, name) => p.screenshot({ path: path.join(SP, `w-${name}.png`) });
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.join(SP, 'speech.wav')}`] });
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['microphone'] })).newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/VAD|capture init/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  const tts = []; p.on('request', (r) => { if (r.url().includes('/byok/tts/relay')) tts.push(Date.now()); });
  try {
    await p.addInitScript(() => localStorage.setItem('octos-locale', 'en-US'));
    await p.goto('http://127.0.0.1:5217/login');
    await p.getByRole('button', { name: 'Continue without a password' }).click();
    await p.waitForTimeout(3000);
    await p.goto('http://127.0.0.1:5217/teach');
    await p.getByRole('textbox', { name: 'Topic' }).fill('Two points');
    await p.getByRole('button', { name: /teach what I typed|Teach this/ }).first().click();
    await p.getByRole('button', { name: 'Yes, math' }).click();
    await p.getByRole('textbox', { name: 'What the viewer will learn' }).fill('Plot two points');
    await p.getByRole('button', { name: 'Next' }).click();
    for (let i = 4; i > 2; i--) await p.getByRole('button', { name: `Remove card ${i}` }).click().catch(() => {});
    await p.locator('.teach-cards input').nth(0).fill('The grid');
    await p.locator('.teach-cards input').nth(1).fill('The points');
    await p.getByRole('button', { name: 'Start recording' }).click();
    await p.waitForURL(/\/teach\/rec-/);
    const url = p.url();
    const add = async (kind) => { await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.getByRole('button', { name: kind, exact: true }).click(); };
    await p.getByRole('button', { name: /^Record card 1/ }).click();
    await add('Coordinate grid');
    const r = p.locator('.teach-range input'); await r.nth(0).fill('-1'); await r.nth(1).fill('6'); await r.nth(2).fill('-1'); await r.nth(3).fill('9');
    await p.getByRole('button', { name: 'Put on the board' }).click();
    await p.waitForFunction(() => /point/i.test(document.querySelector('.teach-live-captions p')?.textContent ?? ''), undefined, { timeout: 30000 });
    await p.getByRole('button', { name: /^Stop/ }).click();
    await p.getByRole('button', { name: 'Re-record my words' }).waitFor({ timeout: 60000 });
    await p.getByRole('button', { name: /Next: card 2/ }).click();
    await p.getByRole('button', { name: /^Record card 2/ }).click();
    for (const [x, y] of [['1', '2'], ['4', '8']]) { await add('Place a point'); const f = p.locator('.teach-range input'); await f.nth(0).fill(x); await f.nth(1).fill(y); await p.getByRole('button', { name: 'Put on the board' }).click(); }
    await p.waitForTimeout(6000);
    await p.getByRole('button', { name: /^Stop/ }).click();
    await p.getByRole('button', { name: 'Re-record my words' }).waitFor({ timeout: 60000 });

    await p.goto(url + '/watch');
    await p.waitForTimeout(2500);
    await shot(p, '1-open');
    await p.getByRole('button', { name: 'Play', exact: true }).click();
    const seen = new Set(); const started = Date.now();
    while (Date.now() - started < 90000) {
      const caption = await p.locator('.teach-watch-caption').innerText().catch(() => '');
      const progress = await p.locator('.teach-studio-head .teach-group-label').innerText().catch(() => '');
      seen.add(`${progress} | ${caption.slice(0, 70)}`);
      if (seen.size === 2) await shot(p, '2-playing');
      if (await p.getByRole('button', { name: 'Watch again' }).count()) break;
      await p.waitForTimeout(700);
    }
    console.log('frames', JSON.stringify([...seen], null, 0));
    console.log('tts requests', tts.length, 'nodes', await p.locator('.board-node').count(), 'ink missing', await p.locator('.lesson-ink-missing').count());
    await shot(p, '3-end');
  } catch (e) { console.log('FAIL', e.message.split('\n')[0]); await shot(p, 'fail'); }
  console.log('errors', JSON.stringify(errors)); await browser.close();
})();
