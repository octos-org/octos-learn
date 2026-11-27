import { expect, test, type Page } from '@playwright/test';

// The place-value compare card (OLL decision 0029, need 35P-06) in Learn's lesson board, on a desktop window (the
// card has no phone layout). The learner works the task's own pair by real clicks: "Same" or "Different" under each
// column, judged from the left, then the sign in the sentence under the chart. There is no "done": the true sign ends
// the task. Unlike the trade, make-ten and times-ten cards, nothing is typed under the card, so the task is the
// lesson's only one and the card stays framed from its top while it is worked. The card draws its own how-to line, so
// Learn shows no second one. The lessons are OLL's own test fixtures (see the page).
//
// A known gap at 1024 × 768: at natural size the card is 582 to 660 px tall on these pairs (seven columns, 608), its
// top 152 px down, so its signs end 674 to 752 px down, under the band Learn keeps for the input dock (120 px from the
// bottom, from 648 px down at 768 tall). The fixture page has no dock, so the clicks below reach them there; in the
// app the learner would have to move the board to choose the sign. At 1440 × 900 (the band ends 780 px down) they are
// clear, and asserted.

/** Waits until the card's animations have finished (its endless ring aside). */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations()
  .every((animation) => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity));

/** Clicks the middle of what the selector finds, as a pointer does (the card's buttons are SVG). */
async function click(page: Page, selector: string): Promise<void> {
  await settled(page);
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** A tap names a place index: the place plus three (thousands 6, ones 3, tenths 2); the signs are 10 to 12. */
const judge = (page: Page, judgement: 'same' | 'different', place: number) => click(page, `[data-oll-tap="${judgement}:${place + 3}"]`);
const sign = (page: Page, chosen: '>' | '=' | '<') => click(page, `[data-oll-tap="sign:${10 + ['>', '=', '<'].indexOf(chosen)}"]`);
const notice = (page: Page) => page.locator('.place-value-compare-notice');
const succeeded = (page: Page) => page.getByTestId('oll-student-tasks').locator('.learning-student-task.is-succeeded');

/** The disks' size at one unit a pixel, and the card's drawn scale (its width on screen over its own width). */
const cardScale = (page: Page) => page.evaluate(() => {
  const card = document.querySelector('svg.place-value-compare')!.closest<HTMLElement>('.board-node')!;
  return {
    scale: card.getBoundingClientRect().width / card.offsetWidth,
    natural: Number(document.querySelector('.place-value-compare-disk circle')?.getAttribute('r')) * 2,
  };
});

/** Waits for the camera to settle with the card at its natural size or larger (desktop), and returns the sizes. */
async function atNaturalSize(page: Page) {
  await expect.poll(async () => (await cardScale(page)).scale).toBeGreaterThanOrEqual(0.995);
  return cardScale(page);
}

/** A screenshot once the card's animations and the camera's move have finished. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `test-results/${name}.png` });
}

type Lesson = 'whole' | 'zh' | 'equal' | 'widest';

async function open(page: Page, lesson: Lesson) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/tests/fixtures/place-value-compare.html?lesson=${lesson}&key=compare-${lesson}-${Date.now()}`);
  // Live: its buttons are tappable (the card marks each tappable element, not the chart).
  await expect(page.locator('svg.place-value-compare .place-value-compare-live').first()).toBeVisible();
  return errors;
}

/** The task's card before any tap: no "done", one how-to line (the card's), the hint, nothing typed under it. */
async function expectOpened(page: Page) {
  const tasks = page.getByTestId('oll-student-tasks');
  await expect(tasks).toBeVisible();
  await expect(page.locator('.learning-card-done')).toHaveCount(0);
  await expect(page.locator('.learning-card-howto')).toHaveCount(0);
  // No control of its own for any variable bound to the card's fields.
  await expect(page.locator('[data-course-controls-id]')).toHaveCount(0);
  await expect(page.locator('.place-value-compare-howto')).toHaveCount(1);
  // No attempt is recorded before the completing tap, so the hint is offered from the start.
  await expect(tasks.getByRole('button', { name: /Give me a hint|给我一个提示/ })).toBeVisible();
  await expect(tasks.getByRole('button', { name: /Start again|重新开始/ })).toHaveCount(0);
  await expect(page.getByTestId('oll-answer-task')).toHaveCount(0);
}

/** Learn's desktop floor for the band under the board kept for the input dock. */
const DOCK_BAND = 120;

/** The card across the window, its problem and its own line in view. */
async function expectCardInView(page: Page, viewport: { width: number }) {
  const card = (await page.locator('.board-node', { has: page.locator('svg.place-value-compare') }).boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
  await expect(page.locator('.place-value-compare-given')).toBeInViewport();
  await expect(page.locator('.place-value-compare-howto')).toBeInViewport();
}

/** The three signs (at the card's bottom) in the window and above the dock's band: asserted at 1440 × 900 only. */
async function expectSignsAboveDock(page: Page, viewport: { height: number }) {
  for (const each of await page.locator('.place-value-compare-sign').all()) await expect(each).toBeInViewport({ ratio: 1 });
  const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.place-value-compare-sign')].map((sign) => sign.getBoundingClientRect().bottom)));
  expect(bottom).toBeLessThanOrEqual(viewport.height - DOCK_BAND);
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('6,281 and 6,218 by real clicks: judged from the left, a wrong sign refused, the true sign ends it', async ({ page }) => {
      const size = `${viewport.width}x${viewport.height}`;
      const errors = await open(page, 'whole');
      // The task's own pair, never the lesson's 4,530 and 4,503.
      await expect(page.locator('.place-value-compare-given')).toHaveText('Compare 6,281 and 6,218.');
      await expectOpened(page);
      await expect(page.locator('.place-value-compare-howto')).toHaveText('From the left, judge each place until one is different.');
      // Worked at its natural size (34 px disks, four columns) or larger, the whole card across the window; the
      // greyed sentence under the chart is above the dock's band at 1440 × 900 (see the top of the file).
      expect((await atNaturalSize(page)).natural).toBe(34);
      await expectCardInView(page, viewport);
      if (viewport.height >= 900) await expectSignsAboveDock(page, viewport);
      await shot(page, `compare-open-${size}`);
      // A column right of an unjudged one is refused with a fact; nothing changes.
      await judge(page, 'same', 0);
      await expect(notice(page)).toHaveText("Ones: 1 and 8. The thousands haven't been compared yet.");
      await expect(page.locator('.place-value-compare-mark')).toHaveCount(0);
      // Judged from the left: the thousands and hundreds the same, the tens different.
      await judge(page, 'same', 3);
      await expect(notice(page)).toHaveText('Thousands: 6 and 6, the same.');
      await judge(page, 'same', 2);
      await judge(page, 'different', 1);
      await expect(notice(page)).toHaveText('Tens: 8 and 1, the first place that differs. 6,281 has more tens.');
      await expect(page.locator('.place-value-compare-howto')).toHaveText('Choose >, = or < between the two numbers below.');
      await expect(page.locator('.place-value-compare-sign[data-oll-tap]')).toHaveCount(3);
      await expect(succeeded(page)).toHaveCount(0);
      // The sentence opens at the card's bottom while its task is still open; the camera stays where it was, the
      // card framed from its top (the signs above the dock's band at 1440 × 900 only).
      await atNaturalSize(page);
      await expectCardInView(page, viewport);
      if (viewport.height >= 900) await expectSignsAboveDock(page, viewport);
      await shot(page, `compare-decided-${size}`);
      // A wrong sign is a fact; the signs stay and the task stays open.
      await sign(page, '<');
      await expect(notice(page)).toHaveText('“6,281 < 6,218” is not true.');
      await expect(page.locator('.place-value-compare-sign[data-oll-tap]')).toHaveCount(3);
      await expect(succeeded(page)).toHaveCount(0);
      // The true sign ends the task, with no "done"; nothing on the card is tappable after it.
      await sign(page, '>');
      await expect(succeeded(page)).toHaveCount(1);
      await expect(notice(page)).toHaveText('✓ 6,281 > 6,218: the tens decide; the places after them don\'t matter.');
      await expect(page.locator('svg.place-value-compare [data-oll-tap]')).toHaveCount(0);
      await expect(page.locator('.learning-card-done')).toHaveCount(0);
      await shot(page, `compare-done-${size}`);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('1024×768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('0.625 and 0.7 in Chinese: one how-to line, the points lined up, the tenths decide, "<"', async ({ page }) => {
    const errors = await open(page, 'zh');
    await expect(page.locator('.place-value-compare-given')).toHaveText('比较 0.625 和 0.7。');
    await expectOpened(page);
    await expect(page.locator('.place-value-compare-howto')).toHaveText('从左边起，一位一位判断，直到有一位不一样。');
    await atNaturalSize(page);
    // The two numbers written as given, their points lined up.
    const points = await page.evaluate(() => [...document.querySelectorAll('.place-value-compare-frac')]
      .map((part) => ({ text: part.textContent, left: part.getBoundingClientRect().left })));
    expect(points.map((point) => point.text)).toEqual(['.625', '.7']);
    expect(Math.abs(points[0]!.left - points[1]!.left)).toBeLessThanOrEqual(1);
    await judge(page, 'same', 0);
    await judge(page, 'different', -1);
    await expect(notice(page)).toHaveText('十分位：6 和 7，第一位不同。0.7 的 0.1 多。');
    await expectCardInView(page, { width: 1024 });
    await sign(page, '>');
    await expect(notice(page)).toHaveText('「0.625 > 0.7」不成立。');
    await sign(page, '<');
    await expect(succeeded(page)).toHaveCount(1);
    await expect(notice(page)).toHaveText('✓ 0.625 < 0.7：由十分位决定，后面的数位不影响。');
    await shot(page, 'compare-zh-done');
    expect(errors).toEqual([]);
  });

  test('2.50 and 2.5: "Same" all the way, then "="', async ({ page }) => {
    const errors = await open(page, 'equal');
    await expect(page.locator('.place-value-compare-given')).toHaveText('Compare 2.50 and 2.5.');
    await expectOpened(page);
    await atNaturalSize(page);
    for (const place of [0, -1, -2]) await judge(page, 'same', place);
    await expect(notice(page)).toHaveText('Hundredths: 0 and 0, the same. Every place is the same.');
    await expectCardInView(page, { width: 1024 });
    await sign(page, '=');
    await expect(succeeded(page)).toHaveCount(1);
    await expect(notice(page)).toHaveText('✓ 2.50 = 2.5: every place is the same.');
    expect(errors).toEqual([]);
  });
});

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test.describe(`widest ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('3,456.789 and 3,456.798: seven columns at natural size across the window, no horizontal scroll', async ({ page }) => {
      const size = `${viewport.width}x${viewport.height}`;
      const errors = await open(page, 'widest');
      await expect(page.locator('.place-value-compare-given')).toHaveText('Compare 3,456.789 and 3,456.798.');
      await expectOpened(page);
      await expect(page.locator('.place-value-compare-column')).toHaveCount(7);
      // Seven columns: 28 px disks (OLL's sizes at the pin: 34, 31, 30, 28 px for four to seven columns).
      expect((await atNaturalSize(page)).natural).toBe(28);
      await expectCardInView(page, viewport);
      if (viewport.height >= 900) await expectSignsAboveDock(page, viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await shot(page, `compare-widest-open-${size}`);
      for (const place of [3, 2, 1, 0, -1]) await judge(page, 'same', place);
      await judge(page, 'different', -2);
      await expect(notice(page)).toContainText('the first place that differs');
      await atNaturalSize(page);
      await expectCardInView(page, viewport);
      if (viewport.height >= 900) await expectSignsAboveDock(page, viewport);
      await sign(page, '<');
      await expect(succeeded(page)).toHaveCount(1);
      await shot(page, `compare-widest-done-${size}`);
      expect(errors).toEqual([]);
    });
  });
}
