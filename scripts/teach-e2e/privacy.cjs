// Real-browser check of the learner teaching studio; see docs/LEARNER_TEACHING_MODE_HANDOFF.md (E2E).
// Usage: node scripts/teach-e2e/privacy.cjs <work-dir>   (dev server on 127.0.0.1:5217, Octos solo, work-dir from make-speech.sh)
const path = require('path');
const { chromium } = require(path.resolve('node_modules/playwright'));
const SP = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  try {
    await p.addInitScript(() => localStorage.setItem('octos-locale', 'en-US'));
    await p.goto('http://127.0.0.1:5217/login');
    await p.getByRole('button', { name: 'Continue without a password' }).click();
    await p.waitForTimeout(3000);
    await p.goto('http://127.0.0.1:5217/teach');
    await p.getByRole('textbox', { name: 'Topic' }).fill('Plotting points');
    await p.getByRole('button', { name: /teach what I typed|Teach this/ }).first().click();
    await p.getByRole('button', { name: 'Yes, math' }).click();
    await p.getByRole('textbox', { name: 'What the viewer will learn' }).fill('Plot a point');
    await p.getByRole('button', { name: 'Next' }).click();
    for (let i = 4; i > 1; i--) await p.getByRole('button', { name: `Remove card ${i}` }).click().catch(() => {});
    await p.locator('.teach-cards input').nth(0).fill('Plot point A');
    await p.getByRole('button', { name: 'Start recording' }).click();
    await p.waitForURL(/\/teach\/rec-/);
    await p.getByRole('button', { name: /^Record card 1/ }).click();
    await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.getByRole('button', { name: 'Coordinate grid', exact: true }).click();
    await p.getByRole('button', { name: 'Put on the board' }).click();
    await p.getByRole('button', { name: /^Stop/ }).click();
    const words = p.getByRole('textbox', { name: 'What you said on this card' });
    await words.waitFor({ timeout: 60000 });
    await words.fill("Hi, I'm Maya. My friend Sam and I picked point A at 1 comma 2 on this grid.");
    await p.getByRole('button', { name: 'Save captions' }).click();
    await p.getByRole('button', { name: 'Check my lesson' }).first().click();
    await p.waitForFunction(() => !document.querySelector('.teach-check .teach-spinner'), undefined, { timeout: 120000 });
    console.log('check', JSON.stringify(await p.locator('.teach-check-list').innerText()));
    await p.locator('.teach-check').getByRole('button', { name: /^Fix card/ }).first().click();
    const editor = p.getByRole('textbox', { name: /Your words/ });
    await editor.fill('A friend and I picked point A at 1 comma 2 on this grid.');
    await p.getByRole('button', { name: 'Save captions' }).click();
    await p.waitForTimeout(500);
    console.log('after edit fix box', await p.locator('.teach-fix').count(), 'chip', await p.locator('.teach-card-strip button').first().getAttribute('data-state'));
  } catch (e) { console.log('FAIL', e.message.split('\n')[0]); await p.screenshot({ path: path.join(SP, 'privacy-fail.png') }); }
  console.log('errors', JSON.stringify(errors)); await browser.close();
})();
