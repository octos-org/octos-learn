import { expect, test, type Page } from '@playwright/test';

// The make-ten card (OLL decision 0027, need K2N-19) in Learn's lesson board, on a desktop window (the card has no
// phone layout). The learner moves the smaller addend's counters across by real clicks to fill the bigger addend's
// frame; there is no "done": the click that makes the ten ends the task. The row of four blanks shows from the start,
// disabled, and opens on that click. The card draws its own how-to line, so Learn shows no second one. The lessons
// are OLL's own test fixtures (see the page).

/** Waits until the card's moves have finished animating (a moving counter is clicked where it lands). */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations()
  .every((animation) => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity));

/** Clicks the middle of what the selector finds, as a pointer does (the card's counters are SVG). */
async function click(page: Page, selector: string): Promise<void> {
  await settled(page);
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** A counter of one colour (0 red, 1 blue) in one frame (0 the first addend's, 1 the second's). */
const counter = (frame: 0 | 1, colour: 0 | 1, nth = 0) => `.make-ten-counter[data-frame="${frame}"].make-ten-c${colour} >> nth=${nth}`;
const counters = (page: Page, frame: 0 | 1) => page.locator(`.make-ten-counter[data-frame="${frame}"]`);
const caption = (page: Page, frame: 0 | 1) => page.locator(`.make-ten-caption[data-frame="${frame}"]`);

/** The smallest counter drawn and the size the card draws it at one unit a pixel. */
const counterSize = (page: Page) => page.evaluate(() => {
  const faces = [...document.querySelectorAll('.make-ten-counter-face')];
  return {
    drawn: Math.min(...faces.map((face) => face.getBoundingClientRect().width)),
    natural: Number(faces[0]?.getAttribute('r')) * 2,
  };
});

/** Waits for the camera to settle with the card at its natural size or larger (desktop), and returns the sizes. */
async function atNaturalSize(page: Page) {
  await expect.poll(async () => {
    const { drawn, natural } = await counterSize(page);
    return drawn - natural;
  }).toBeGreaterThanOrEqual(-0.5);
  return counterSize(page);
}

/** A screenshot once the card's animations and the camera's move have finished. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `test-results/${name}.png` });
}

async function open(page: Page, lesson: 'en' | 'zh') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/tests/fixtures/make-ten.html?lesson=${lesson}&key=make-ten-${lesson}-${Date.now()}`);
  await expect(page.locator('svg.make-ten.make-ten-live, svg.make-ten [data-oll-tap]').first()).toBeVisible();
  return errors;
}

/** The task's card and its row before any click: no "done", one how-to line (the card's), the hint, the row waiting. */
async function expectOpened(page: Page, rowPrompt: RegExp) {
  const tasks = page.getByTestId('oll-student-tasks');
  await expect(tasks).toBeVisible();
  await expect(page.locator('.learning-card-done')).toHaveCount(0);
  await expect(page.locator('.learning-card-howto')).toHaveCount(0);
  // No control of its own for any variable bound to the card's fields (OLL, player 0.18.0 and up).
  await expect(page.locator('[data-course-controls-id]')).toHaveCount(0);
  await expect(page.locator('.make-ten-howto')).toHaveCount(1);
  // No attempt is recorded before the completing click, so the hint is offered from the start; there is nothing to
  // start again yet.
  await expect(tasks.getByRole('button', { name: /Give me a hint|给我一个提示/ })).toBeVisible();
  await expect(tasks.getByRole('button', { name: /Start again|重新开始/ })).toHaveCount(0);
  const row = page.getByTestId('oll-answer-task').filter({ hasText: rowPrompt });
  await expect(row.locator('input')).toHaveCount(4);
  await expect(row.locator('.learning-student-task.is-waiting')).toHaveCount(1);
  for (const input of await row.locator('input').all()) await expect(input).toBeDisabled();
  await expect(row.locator('button[type="submit"]')).toBeDisabled();
  await expect(row).not.toContainText(/Complete the previous practice|先完成前面的练习/);
  return row;
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('7 + 5 by real clicks: no done, the row waits, the ten opens it, and it is answered', async ({ page }) => {
      const size = `${viewport.width}x${viewport.height}`;
      const errors = await open(page, 'en');
      // The task's own pair, never the lesson's 8 + 6.
      await expect(page.locator('.make-ten-given')).toHaveText('7 + 5');
      const row = await expectOpened(page, /Write it as a number sentence/);
      await expect(page.locator('.make-ten-howto')).toHaveText('Make a ten: tap a blue counter to fill the empty places.');
      // The card is worked at its natural size (50 px counters) or larger on desktop, the whole card in the window.
      expect((await atNaturalSize(page)).natural).toBe(50);
      const card = (await page.locator('.board-node', { has: page.locator('svg.make-ten') }).boundingBox())!;
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
      await expect(page.locator('.make-ten-given')).toBeInViewport();
      for (const frame of [0, 1] as const) await expect(caption(page, frame)).toBeInViewport();
      await shot(page, `make-ten-open-${size}`);
      // A red counter stays: the card says so at its frame; nothing moves.
      await click(page, counter(0, 0, 2));
      await expect(page.locator('.make-ten-note')).toHaveText('Red counters stay in their frame.');
      await expect(counters(page, 0)).toHaveCount(7);
      // The blue counter clicked crosses into the 7's frame; clicked again it comes back.
      const blue = await page.locator(counter(1, 1, 2)).getAttribute('data-piece');
      await click(page, counter(1, 1, 2));
      await expect(caption(page, 0)).toHaveText('8');
      await expect(caption(page, 1)).toHaveText('4');
      // Once a counter has crossed, the card's own line says it goes back when tapped (OLL #125): Learn shows no fixed
      // how-to beside the task to say so.
      await expect(page.locator('.make-ten-howto')).toHaveText('Keep tapping blue counters until the frame is full. A counter that crossed goes back when tapped.');
      await click(page, `.make-ten-counter[data-piece="${blue}"]`);
      await expect(caption(page, 0)).toHaveText('7');
      // Three blue counters fill the frame; the third click makes the ten and ends the task, with no "done".
      for (const expected of ['8', '9']) {
        await click(page, counter(1, 1, 0));
        await expect(caption(page, 0)).toHaveText(expected);
        for (const input of await row.locator('input').all()) await expect(input).toBeDisabled();
      }
      await click(page, counter(1, 1, 0));
      await expect(page.getByTestId('oll-student-tasks').locator('.learning-student-task.is-succeeded')).toHaveCount(1);
      await expect(caption(page, 0)).toHaveText('10');
      await expect(caption(page, 1)).toHaveText('2');
      await expect(page.locator('svg.make-ten [data-oll-tap]')).toHaveCount(0);
      // The row opens; the camera moves to it at natural size, with the two frames' counts still in view to read.
      await expect(row.locator('.learning-student-task.is-waiting')).toHaveCount(0);
      for (const input of await row.locator('input').all()) {
        await expect(input).toBeEnabled();
        await expect(input).toBeInViewport();
      }
      await expect(row.locator('button[type="submit"]')).toBeInViewport();
      await atNaturalSize(page);
      await shot(page, `make-ten-row-open-${size}`);
      // Once the camera has settled: the row, and the counters that crossed (the part that made ten) above it. At
      // 1440 × 900 the two counts (10 and 2) are in view too. At 1024 × 768 they are not: the card, the task panel
      // between it and the row, and the row are about 660 px from the counts to Submit at natural size, and the
      // band between the chrome is 524 px (a known limit, as for the trade card's answer box in #254).
      for (const input of await row.locator('input').all()) await expect(input).toBeInViewport();
      await expect(page.locator('.make-ten-counter[data-frame="0"].make-ten-c1')).toHaveCount(3);
      for (const moved of await page.locator('.make-ten-counter[data-frame="0"].make-ten-c1').all()) await expect(moved).toBeInViewport();
      if (viewport.width >= 1440) for (const frame of [0, 1] as const) await expect(caption(page, frame)).toBeInViewport();
      // 7 + 5 = 7 + [3] + [2] = 10 + [2] = [12]: the blank beside the 7 is the part that makes ten.
      const blanks = row.locator('input');
      await expect(row.getByRole('textbox', { name: 'to make ten' })).toHaveCount(1);
      for (const [nth, value] of [[0, '2'], [1, '3'], [2, '2'], [3, '12']] as const) await blanks.nth(nth).fill(value);
      await row.locator('button[type="submit"]').click();
      await expect(row.locator('.learning-student-task-feedback small')).toContainText('1');
      for (const [nth, value] of [[0, '3'], [1, '2']] as const) await blanks.nth(nth).fill(value);
      await row.locator('button[type="submit"]').click();
      await expect(row.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
      await shot(page, `make-ten-answered-${size}`);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('Chinese', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('3 + 8: the card speaks Chinese, one how-to line, no done, the row waits, the hint from the start', async ({ page }) => {
    const errors = await open(page, 'zh');
    await expect(page.locator('.make-ten-given')).toHaveText('3 + 8');
    await expectOpened(page, /Write it as a number sentence/);
    await expect(page.locator('.make-ten-howto')).toHaveText('凑成十：点红色的圆片，把空位填满。');
    await atNaturalSize(page);
    await shot(page, 'make-ten-zh-open');
    expect(errors).toEqual([]);
  });
});
