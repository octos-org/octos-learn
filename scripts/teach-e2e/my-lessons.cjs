// Real-browser check of M6: save a lesson to My lessons, play it from the
// saved package with no speech or model calls, see it on the star map and
// in achievements, then delete it everywhere. See docs/LEARNER_TEACHING_MODE_HANDOFF.md (E2E).
// Usage: node scripts/teach-e2e/my-lessons.cjs <work-dir>   (TEACH_E2E_BASE, default http://127.0.0.1:5217; Octos solo)
// Model calls: one Octo question per recorded card and one lesson review (3). Speech: one clip per card with the learner's key.
const path = require('path');
const { chromium } = require(path.resolve('node_modules/playwright'));
const SP = process.argv[2];
const BASE = process.env.TEACH_E2E_BASE || 'http://127.0.0.1:5217';
const shot = (p, name) => p.screenshot({ path: path.join(SP, `ml-${name}.png`) });
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await context.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  const requests = []; p.on('request', (r) => requests.push(r.url()));
  const frames = []; p.on('websocket', (ws) => ws.on('framesent', (f) => { const t = String(f.payload); if (t.includes('skill/action')) frames.push(t.slice(0, 120)); }));
  const api = (route, init) => p.evaluate(async ([route, init]) => {
    const token = localStorage.getItem('octos_session_token') || localStorage.getItem('octos_auth_token');
    const response = await fetch(route, { ...init, headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, [route, init]);
  try {
    await p.addInitScript(() => localStorage.setItem('octos-locale', 'en-US'));
    await p.goto(`${BASE}/login`);
    await p.getByRole('button', { name: 'Continue without a password' }).click();
    await p.waitForTimeout(3000);
    await p.goto(`${BASE}/teach`);
    await p.getByRole('link', { name: 'My lessons' }).waitFor();
    await p.getByRole('textbox', { name: 'Topic' }).fill('linear function');
    const star = p.locator('.teach-suggestions button').first();
    console.log('star topic', JSON.stringify(await star.innerText()));
    await star.click();
    await p.getByRole('textbox', { name: 'What the viewer will learn' }).fill('Find the slope from two points');
    await p.getByRole('button', { name: 'Next' }).click();
    for (let i = 4; i > 2; i--) await p.getByRole('button', { name: `Remove card ${i}` }).click().catch(() => {});
    await p.locator('.teach-cards input').nth(0).fill('The grid');
    await p.locator('.teach-cards input').nth(1).fill('Two points');
    await p.getByRole('button', { name: 'Start recording' }).click();
    await p.waitForURL(/\/teach\/rec-/);
    const url = p.url(), id = url.split('/teach/')[1];
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
    await say('Point A is at 1, 2 and point B is at 4, 8. The slope is eight minus two over four minus one, which is two.');
    await p.getByRole('button', { name: 'Check my lesson' }).first().click();
    await p.waitForFunction(() => !document.querySelector('.teach-check .teach-spinner'), undefined, { timeout: 120000 });
    console.log('check', JSON.stringify(await p.locator('.teach-check-summary').innerText()));
    await p.waitForTimeout(5000); // the studio keeps the draft with the account a few seconds after the last change
    const draftOnServer = await api(`/api/learn/lessons/${id}`);
    console.log('draft kept with the account', draftOnServer.status, draftOnServer.body?.lesson?.state, 'revision', draftOnServer.body?.lesson?.revision);

    await p.goto(url + '/watch');
    await p.getByRole('button', { name: 'Save to My lessons' }).waitFor({ timeout: 30000 });
    console.log('save panel', JSON.stringify(await p.locator('.teach-package').innerText()));
    const savingFrom = Date.now();
    await p.getByRole('button', { name: 'Save to My lessons' }).click();
    await p.getByRole('link', { name: 'Go to My lessons' }).waitFor({ timeout: 180000 });
    console.log('saved in', Math.round((Date.now() - savingFrom) / 1000), 's:', JSON.stringify(await p.locator('.teach-package p').first().innerText()));
    const ceremony = p.locator('.award-ceremony');
    await ceremony.waitFor({ timeout: 20000 }).catch(() => {});
    console.log('ceremony', await ceremony.count() ? JSON.stringify((await ceremony.innerText()).replace(/\s+/g, ' ').slice(0, 200)) : 'none');
    await shot(p, '1-saved');
    if (await ceremony.count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(1500); }

    await p.goto(`${BASE}/teach/lessons`);
    const row = p.locator('.teach-lessons > li').filter({ hasText: 'Saved · only you can see it' }).first();
    await row.waitFor({ timeout: 20000 });
    console.log('my lessons row', JSON.stringify((await row.innerText()).replace(/\s+/g, ' ')));
    await shot(p, '2-my-lessons');

    await row.getByRole('link', { name: 'Play' }).click();
    await p.getByRole('button', { name: 'Play this lesson' }).waitFor({ timeout: 30000 });
    const before = requests.length, framesBefore = frames.length;
    await p.getByRole('button', { name: 'Play this lesson' }).click();
    const started = Date.now();
    while (Date.now() - started < 120000) {
      if (await p.getByRole('button', { name: 'Watch again' }).count()) break;
      await p.waitForTimeout(500);
    }
    const during = requests.slice(before).filter((u) => !u.startsWith('blob:') && !u.startsWith('data:') && !u.includes('/@') && !u.includes('/node_modules/') && !u.includes('/src/'));
    console.log('played to the end', await p.getByRole('button', { name: 'Watch again' }).count() > 0, 'in', Math.round((Date.now() - started) / 1000), 's');
    console.log('requests while playing', JSON.stringify(during), 'skill frames', frames.length - framesBefore);
    await shot(p, '3-played');

    await p.goto(`${BASE}/atlas`);
    await p.locator('.star-atlas-tally').waitFor({ timeout: 30000 });
    console.log('atlas tally', JSON.stringify((await p.locator('.star-atlas-tally').innerText()).replace(/\s+/g, ' ')));
    await p.waitForTimeout(3000);
    await shot(p, '4-atlas');
    const achievements = await api('/api/learn/history/achievements');
    console.log('teaching awards', JSON.stringify(achievements.body?.achievements?.filter((a) => ['first-lesson', 'teach-a-star', 'teach-lit-star', 'your-turn'].includes(a.achievement_id)).map((a) => a.achievement_id)));

    await p.goto(`${BASE}/teach/lessons`);
    const target = p.locator('.teach-lessons > li').filter({ hasText: 'Saved · only you can see it' }).first();
    await target.waitFor({ timeout: 20000 });
    await target.locator('summary').click();
    await target.getByRole('button', { name: 'Delete' }).click();
    await p.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await p.waitForTimeout(2000);
    const lessons = await api('/api/learn/lessons');
    const runs = await api('/api/learn/history/runs');
    const after = await api('/api/learn/history/achievements');
    console.log('after delete: lessons', JSON.stringify(lessons.body?.lessons?.map((l) => l.lesson_id)), 'taught runs', JSON.stringify(runs.body?.runs?.filter((r) => r.run_id.startsWith('taught:')).map((r) => r.run_id)),
      'teaching awards', JSON.stringify(after.body?.achievements?.filter((a) => ['first-lesson', 'teach-a-star'].includes(a.achievement_id)).map((a) => a.achievement_id)));
    await shot(p, '5-deleted');
  } catch (e) { console.log('FAIL', e.message.split('\n')[0]); await shot(p, 'fail'); }
  console.log('errors', JSON.stringify(errors)); await browser.close();
})();
