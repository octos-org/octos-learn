// Real-browser check of the learner teaching studio; see docs/LEARNER_TEACHING_MODE_HANDOFF.md (E2E).
// Usage: node scripts/teach-e2e/studio-flow.cjs <work-dir>   (dev server on 127.0.0.1:5217, Octos solo, work-dir from make-speech.sh)
const path = require('path');
const { chromium } = require(path.resolve('node_modules/playwright'));
const SP = process.argv[2];
const shot = (p, name) => p.screenshot({ path: path.join(SP, `rd-${name}.png`) });
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.join(SP, 'speech.wav')}`] });
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['microphone'] })).newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/VAD|capture init/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  try {
    await p.addInitScript(() => localStorage.setItem('octos-locale', 'en-US'));
    await p.goto('http://127.0.0.1:5217/login');
    await p.getByRole('button', { name: 'Continue without a password' }).click();
    await p.waitForTimeout(3000);
    await p.goto('http://127.0.0.1:5217/teach');
    await p.getByRole('textbox', { name: 'Topic' }).fill('Finding slope from two points');
    await p.getByRole('button', { name: /teach what I typed|Teach this/ }).first().click();
    await p.getByRole('button', { name: 'Yes, math' }).click();
    await p.getByRole('textbox', { name: 'What the viewer will learn' }).fill('Find the slope of a line from two points');
    await p.getByRole('button', { name: 'Next' }).click();
    for (let i = 4; i > 2; i--) await p.getByRole('button', { name: `Remove card ${i}` }).click().catch(() => {});
    await p.locator('.teach-cards input').nth(0).fill('Pick two points');
    await p.locator('.teach-cards input').nth(1).fill('Check it on a graph');
    await p.getByRole('button', { name: 'Start recording' }).click();
    await p.waitForURL(/\/teach\/rec-/);
    await p.waitForTimeout(800);
    await shot(p, '1-ready');

    await p.getByRole('button', { name: /^Record card 1/ }).click();
    const add = async (kind) => { await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.getByRole('button', { name: kind, exact: true }).click(); };
    await add('Coordinate grid');
    const r = p.locator('.teach-range input'); await r.nth(0).fill('-1'); await r.nth(1).fill('6'); await r.nth(2).fill('-1'); await r.nth(3).fill('9');
    await p.getByRole('button', { name: 'Put on the board' }).click();
    for (const [x, y] of [['1', '2'], ['4', '8']]) { await add('Place a point'); const f = p.locator('.teach-range input'); await f.nth(0).fill(x); await f.nth(1).fill(y); await p.getByRole('button', { name: 'Put on the board' }).click(); }
    await p.getByRole('button', { name: /Laser pointer/ }).click();
    await p.locator('.teach-board [data-id$=":fragment:point-a"]').first().click({ force: true });
    await p.waitForTimeout(2500);
    await shot(p, '2-recording');
    await p.getByRole('button', { name: /^Stop/ }).click();
    await p.getByRole('button', { name: 'Re-record my words' }).waitFor({ timeout: 60000 });
    await p.waitForFunction(() => !document.body.innerText.includes('thinking of a question'), undefined, { timeout: 60000 }).catch(() => {});
    await shot(p, '4-after-card'); console.log('card1 captions', JSON.stringify(await p.getByRole('textbox', { name: 'What you said on this card' }).inputValue()));

    await p.getByRole('button', { name: /Next: card 2/ }).click();
    await p.getByRole('button', { name: /^Record card 2/ }).click();
    await add('Graph');
    await p.locator('.teach-add input').first().fill('2*x');
    const rows = await p.locator('.teach-next-to label').allInnerTexts();
    console.log('next-to choices', JSON.stringify(rows));
    await p.locator('.teach-next-to label').filter({ hasText: 'Grid' }).click();
    await shot(p, '3-add');
    await p.getByRole('button', { name: 'Put on the board' }).click();
    await p.waitForTimeout(1500);
    const pos = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.teach-board .board-node')].map((n) => [n.dataset.id, [Math.round(parseFloat(n.style.left)), Math.round(parseFloat(n.style.top))]])));
    console.log('positions', JSON.stringify(pos));
    await p.getByRole('button', { name: /Arrow/ }).click();
    await p.locator('.teach-board [data-id$=":fragment:point-a"]').first().click({ force: true });
    await p.locator('.teach-board .board-node[data-kind="plot"]').first().click({ force: true });
    await p.waitForTimeout(2000);
    await p.getByRole('button', { name: /^Stop/ }).click();
    await p.getByRole('button', { name: 'Re-record my words' }).waitFor({ timeout: 60000 });
    await p.waitForTimeout(1000);

    await p.getByRole('button', { name: 'Check my lesson' }).first().click();
    await p.waitForFunction(() => !document.querySelector('.teach-check .teach-spinner'), undefined, { timeout: 120000 });
    await p.waitForTimeout(500);
    console.log('check', JSON.stringify(await p.locator('.teach-check').innerText()));
    await shot(p, '5-check');
    const fix = p.locator('.teach-check').getByRole('button', { name: /^Fix card/ }).first();
    if (await fix.count()) { await fix.click(); await p.waitForTimeout(800); await shot(p, '6-fix'); console.log('fix panel', JSON.stringify(await p.locator('.teach-panel').innerText())); }
  } catch (e) { console.log('FAIL', e.message.split('\n')[0]); await shot(p, 'fail'); }
  console.log('errors', JSON.stringify(errors)); await browser.close();
})();
