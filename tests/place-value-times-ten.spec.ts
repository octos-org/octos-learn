import { expect, test, type Page } from '@playwright/test';

// The place-value times-ten card (OLL decision 0028, need 35P-04) in Learn's lesson board, on a desktop window (the
// card has no phone layout). The learner works the task's own problem by real clicks: a count (5 ones = ? hundredths)
// and a times pair (4,000 is ? times 400). There is no "done": the tap that completes the chart ends the task. The
// card's answer row (one blank for a count, two for a times pair) shows from the start, disabled, and opens on that
// tap. The card draws its own how-to line, so Learn shows no second one. The lessons are OLL's own test fixtures (see
// the page).

/** Waits until the card's moves have finished animating (a moving piece is clicked where it lands). */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations()
  .every((animation) => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity));

/** Clicks the middle of what the selector finds, as a pointer does (the card's parts are SVG). */
async function click(page: Page, selector: string): Promise<void> {
  await settled(page);
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** A row's tap: its disk, row of ten or square moves one place toward the target column. */
const move = (page: Page, row: number) => click(page, `[data-oll-tap="move:${row}"]`);
const things = (page: Page, place: number, kind: 'disk' | 'ten' | 'square') =>
  page.locator(`.place-value-times-ten-things[data-place="${place}"] > .place-value-times-ten-${kind}`);

/** The disks' size at one unit a pixel, and the card's drawn scale (its width on screen over its own width). */
const cardScale = (page: Page) => page.evaluate(() => {
  const card = document.querySelector('svg.place-value-times-ten')!.closest<HTMLElement>('.board-node')!;
  return {
    scale: card.getBoundingClientRect().width / card.offsetWidth,
    natural: Number(document.querySelector('.place-value-times-ten-disk circle')?.getAttribute('r')) * 2,
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

type Lesson = 'count' | 'times' | 'widest-count' | 'widest-times';

async function open(page: Page, lesson: Lesson) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/tests/fixtures/place-value-times-ten.html?lesson=${lesson}&key=times-ten-${lesson}-${Date.now()}`);
  await expect(page.locator('svg.place-value-times-ten.place-value-times-ten-live')).toBeVisible();
  return errors;
}

/** The task's card and its row before any tap: no "done", one how-to line (the card's), the hint, the row waiting. */
async function expectOpened(page: Page, blanks: number) {
  const tasks = page.getByTestId('oll-student-tasks');
  await expect(tasks).toBeVisible();
  await expect(page.locator('.learning-card-done')).toHaveCount(0);
  await expect(page.locator('.learning-card-howto')).toHaveCount(0);
  // No control of its own for any variable bound to the card's fields (OLL, player 0.18.0 and up).
  await expect(page.locator('[data-course-controls-id]')).toHaveCount(0);
  await expect(page.locator('.place-value-times-ten-howto')).toHaveCount(1);
  // No attempt is recorded before the completing tap, so the hint is offered from the start; there is nothing to
  // start again yet.
  await expect(tasks.getByRole('button', { name: 'Give me a hint' })).toBeVisible();
  await expect(tasks.getByRole('button', { name: 'Start again' })).toHaveCount(0);
  const row = page.getByTestId('oll-answer-task').filter({ hasText: /How many/ });
  await expect(row.locator('input')).toHaveCount(blanks);
  await expect(row.locator('.learning-student-task.is-waiting')).toHaveCount(1);
  for (const input of await row.locator('input').all()) await expect(input).toBeDisabled();
  await expect(row.locator('button[type="submit"]')).toBeDisabled();
  await expect(row).not.toContainText(/Complete the previous practice|先完成前面的练习/);
  return row;
}

/**
 * The card's answer element (OLL #126: a count's target column, a times pair's copy numbers 1 to 10), which the camera
 * frames down from to the row once the row opens: drawn once, and in view down to its bottom edge (a times pair's
 * 10). Not all of it: at natural size, from its top to the row's Submit is about 640 px on a count and 940 px on
 * 4,000 is ? times 400, more than the band between the chrome at 1024 × 768 or 1440 × 900, and the frame keeps the
 * row in view, so the top of a tall answer element (a times pair's first copies) is above the window.
 */
async function expectAnswerInView(page: Page) {
  const answer = page.locator('svg.place-value-times-ten .place-value-times-ten-answer');
  await expect(answer).toHaveCount(1);
  await expect(answer).toBeInViewport();
  await expect.poll(() => answer.evaluate((element) => {
    const { bottom, height } = element.getBoundingClientRect();
    return height > 0 && bottom > 0 && bottom <= window.innerHeight;
  })).toBe(true);
}

/** The task ended by the completing tap; the row open, in view with its Submit, and the card's answer element. */
async function expectRowOpen(page: Page, row: ReturnType<Page['getByTestId']>) {
  await expect(page.getByTestId('oll-student-tasks').locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await expect(page.locator('svg.place-value-times-ten.place-value-times-ten-live')).toHaveCount(0);
  await expect(row.locator('.learning-student-task.is-waiting')).toHaveCount(0);
  for (const input of await row.locator('input').all()) {
    await expect(input).toBeEnabled();
    await expect(input).toBeInViewport();
  }
  await expect(row.locator('button[type="submit"]')).toBeInViewport();
  await atNaturalSize(page);
  await expectAnswerInView(page);
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    const size = `${viewport.width}x${viewport.height}`;

    test('a count by real clicks: 5 ones = ? hundredths, no done, the row waits, then opens and is answered', async ({ page }) => {
      const errors = await open(page, 'count');
      // The task's own problem, never the lesson's 0.3 = ? thousandths.
      await expect(page.locator('.place-value-times-ten-given')).toHaveText('5 ones = ? hundredths');
      const row = await expectOpened(page, 1);
      await expect(page.locator('.place-value-times-ten-howto')).toHaveText('Tap a one to break it into ten tenths.');
      expect((await atNaturalSize(page)).natural).toBe(30);
      const card = (await page.locator('.board-node', { has: page.locator('svg.place-value-times-ten') }).boundingBox())!;
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
      await expect(page.locator('.place-value-times-ten-given')).toBeInViewport();
      await shot(page, `times-ten-count-open-${size}`);
      // A one breaks into a row of ten tenths; tapped again, the row breaks into a square of a hundred hundredths.
      await move(page, 3);
      await expect(things(page, -1, 'ten')).toHaveCount(1);
      await expect(page.locator('.place-value-times-ten-howto')).toHaveText('Tap a one to break it into ten tenths. Tap a row of ten tenths to break it into a hundred hundredths.');
      await move(page, 3);
      await expect(things(page, -2, 'square')).toHaveCount(1);
      // A tap on the target column is refused with a fact.
      await click(page, '.place-value-times-ten-square[data-i="3"] rect');
      await expect(page.locator('.place-value-times-ten-notice')).toHaveText('These are hundredths already.');
      for (const input of await row.locator('input').all()) await expect(input).toBeDisabled();
      // The other four ones, each twice; the last tap completes the chart and ends the task, with no "done".
      for (const i of [0, 4, 1, 2]) await move(page, i);
      for (const i of [2, 0, 1]) await move(page, i);
      for (const input of await row.locator('input').all()) await expect(input).toBeDisabled();
      await move(page, 4);
      await expect(things(page, -2, 'square')).toHaveCount(5);
      await expectRowOpen(page, row);
      await shot(page, `times-ten-count-row-open-${size}`);
      // Once the camera has settled: the row and the hundredths it counts are in view.
      await expect(row.locator('input')).toBeInViewport();
      for (const square of await things(page, -2, 'square').all()) await expect(square).toBeInViewport();
      await row.locator('input').fill('50');
      await row.locator('button[type="submit"]').click();
      await expect(row.locator('.learning-student-task-feedback small')).toContainText('1');
      await row.locator('input').fill('500');
      await row.locator('button[type="submit"]').click();
      await expect(row.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
      await shot(page, `times-ten-count-answered-${size}`);
      expect(errors).toEqual([]);
    });

    test('a times pair by real clicks: 4,000 is ? times 400, each thousand dealt into the copies, then the row of two', async ({ page }) => {
      const errors = await open(page, 'times');
      await expect(page.locator('.place-value-times-ten-given')).toHaveText('4,000 is ? times 400');
      const row = await expectOpened(page, 2);
      await expect(page.locator('.place-value-times-ten-howto')).toHaveText('Tap a thousand to break it into ten hundreds, one into each 400.');
      await atNaturalSize(page);
      await expect(page.locator('.place-value-times-ten-given')).toBeInViewport();
      await expect(page.locator('[data-oll-tap="move:0"]')).toBeInViewport();
      await shot(page, `times-ten-times-open-${size}`);
      const copies = page.locator('.place-value-times-ten-things .place-value-times-ten-copy');
      await expect(copies).toHaveCount(10);
      // Each thousand broken deals one hundred into every copy.
      for (const [i, have] of [[0, 1], [2, 2], [1, 3]] as const) {
        await move(page, i);
        for (const copy of await copies.all()) await expect(copy.locator('.place-value-times-ten-disk')).toHaveCount(have);
        for (const input of await row.locator('input').all()) await expect(input).toBeDisabled();
      }
      // A copy's fact, said beside that copy; a tap on a copy is always refused, and is not an attempt.
      await click(page, '[data-oll-tap="copy:4"]');
      await expect(page.locator('.place-value-times-ten-colnote')).toContainText('This 400 has 3 hundreds; 400 is 4 hundreds.');
      await move(page, 3);
      await expect(page.locator('.place-value-times-ten-things .place-value-times-ten-copy.place-value-times-ten-copy-full')).toHaveCount(10);
      await expectRowOpen(page, row);
      await shot(page, `times-ten-times-row-open-${size}`);
      // 4 thousands = [40] hundreds; 4,000 is [10] times 400.
      const blanks = row.locator('input');
      await blanks.nth(0).fill('400');
      await blanks.nth(1).fill('10');
      await row.locator('button[type="submit"]').click();
      await expect(row.locator('.learning-student-task-feedback small')).toContainText('1');
      await blanks.nth(0).fill('40');
      await row.locator('button[type="submit"]').click();
      await expect(row.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
      await shot(page, `times-ten-times-answered-${size}`);
      expect(errors).toEqual([]);
    });

    test('the largest cards: drawn at natural size, the whole width in the window, the problem and the first row in view', async ({ page }) => {
      for (const lesson of ['widest-count', 'widest-times'] as const) {
        const errors = await open(page, lesson);
        await expectOpened(page, lesson === 'widest-count' ? 1 : 2);
        expect((await atNaturalSize(page)).natural).toBe(30);
        const card = (await page.locator('.board-node', { has: page.locator('svg.place-value-times-ten') }).boundingBox())!;
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
        await expect(page.locator('.place-value-times-ten-given')).toBeInViewport();
        await expect(page.locator('.place-value-times-ten-howto')).toBeInViewport();
        await expect(page.locator('[data-oll-tap="move:0"]')).toBeInViewport();
        await shot(page, `times-ten-${lesson}-${size}`);
        expect(errors).toEqual([]);
      }
    });
  });
}
