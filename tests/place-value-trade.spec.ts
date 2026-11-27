import { expect, test, type Page } from '@playwright/test';

// The place-value trade card (OLL decision 0026, need 35P-07) in Learn's lesson board, on a desktop window (the card
// has no phone layout). The learner works the task's own pair by real clicks; there is no "done": the tap that
// completes the chart ends the task. The typed answer shows from the start, disabled, and opens on that tap. The card
// draws its own how-to line, so Learn shows no second one. The lessons are OLL's own test fixtures (see the page).

const index = (place: number) => place + 3;

/** Clicks the middle of what the selector finds, as a pointer does (the card's parts are SVG). */
async function click(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const column = (place: number) => `.place-value-trade-place[data-place="${place}"]`;
const disks = (page: Page, place: number, row: string) =>
  page.locator(`${column(place)} .place-value-trade-disks .place-value-trade-disk[data-row="${row}"]`);
const down = (page: Page, place: number) => click(page, `.place-value-trade-down[data-oll-tap="down:${index(place)}"] circle`);
const ring = (page: Page, place: number) => click(page, `${column(place)} .place-value-trade-ten[data-oll-tap] rect`);
const marked = (page: Page) => click(page, '.place-value-trade-can-break[data-oll-tap] circle');

/** The smallest disk drawn and the size the card draws it at one unit a pixel. */
const diskSize = (page: Page) => page.evaluate(() => {
  const faces = [...document.querySelectorAll('.place-value-trade-disk-face')];
  return {
    drawn: Math.min(...faces.map((face) => face.getBoundingClientRect().width)),
    natural: Number(faces[0]?.getAttribute('r')) * 2,
  };
});

/** Waits for the camera to settle with the card at its natural size or larger (desktop), and returns the sizes. */
async function atNaturalSize(page: Page) {
  await expect.poll(async () => {
    const { drawn, natural } = await diskSize(page);
    return drawn - natural;
  }).toBeGreaterThanOrEqual(-0.5);
  return diskSize(page);
}

/** A screenshot once the card's animations and the camera's move have finished. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `test-results/${name}.png` });
}

async function open(page: Page, lesson: 'add' | 'sub' | 'wide' | 'rows') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/tests/fixtures/place-value-trade.html?lesson=${lesson}&key=trade-${lesson}-${Date.now()}`);
  await expect(page.locator('.place-value-trade-live').first()).toBeVisible();
  return errors;
}

/** The task's card and its typed answer before any tap: no "done", one how-to line (the card's), the answer waiting. */
async function expectOpened(page: Page, answerPrompt: RegExp) {
  const tasks = page.getByTestId('oll-student-tasks');
  await expect(tasks).toBeVisible();
  await expect(page.locator('.learning-card-done')).toHaveCount(0);
  await expect(page.locator('.learning-card-howto')).toHaveCount(0);
  await expect(page.locator('.place-value-trade-howto')).toHaveCount(1);
  // No attempt is recorded before the completing tap, so the hint is offered from the start; there is nothing to
  // start again yet.
  await expect(tasks.getByRole('button', { name: 'Give me a hint' })).toBeVisible();
  await expect(tasks.getByRole('button', { name: 'Start again' })).toHaveCount(0);
  const answer = page.getByTestId('oll-answer-task').filter({ hasText: answerPrompt });
  await expect(answer.locator('input')).toBeDisabled();
  await expect(answer.locator('button[type="submit"]')).toBeDisabled();
  await expect(answer).not.toContainText(/Complete the previous practice|先完成前面的练习/);
  return answer;
}

/** An answer shown where it goes, greyed and disabled, without the "complete the previous practice" lock. */
async function expectWaiting(answer: ReturnType<Page['getByTestId']>) {
  await expect(answer.locator('.learning-student-task.is-waiting')).toHaveCount(1);
  for (const input of await answer.locator('input').all()) await expect(input).toBeDisabled();
  await expect(answer.locator('button[type="submit"]')).toBeDisabled();
  await expect(answer).not.toContainText(/Complete the previous practice|先完成前面的练习/);
}

/** An answer open to type into, in view with its Submit. */
async function expectOpen(answer: ReturnType<Page['getByTestId']>) {
  await expect(answer.locator('.learning-student-task.is-waiting')).toHaveCount(0);
  for (const input of await answer.locator('input').all()) {
    await expect(input).toBeEnabled();
    await expect(input).toBeInViewport();
  }
  await expect(answer.locator('button[type="submit"]')).toBeInViewport();
}

test.use({ viewport: { width: 1024, height: 768 } });

test('adding by real clicks: no done, the answer waits, then opens and is accepted', async ({ page }) => {
  const errors = await open(page, 'add');
  // The task's own pair, never the lesson's 3,486 + 2,739.
  await expect(page.locator('.place-value-trade-given')).toHaveText('4,658 + 1,573');
  const answer = await expectOpened(page, /What is the total/);
  await expect(page.locator('.place-value-trade-howto')).toHaveText('Tap ↓ to put a column together.');
  // The card is worked at its natural size or larger on desktop.
  await atNaturalSize(page);
  await shot(page, 'place-value-trade-add-open');
  // Ones, tens, hundreds: bring down, then trade the ringed ten for one of the next place.
  for (const place of [0, 1, 2]) {
    await down(page, place);
    await expect(page.locator(`${column(place)} .place-value-trade-ten[data-oll-tap]`)).toHaveCount(1);
    await ring(page, place);
    await expect(disks(page, place + 1, 'carry')).toHaveCount(1);
    await expect(answer.locator('input')).toBeDisabled();
  }
  await expect(page.locator('.place-value-trade-howto')).toHaveText('Tap ↓ to put a column together.');
  await shot(page, 'place-value-trade-add-three-columns');
  // The thousands complete the chart: the task ends on that tap, the card goes inert, the answer opens.
  await down(page, 3);
  await expect(page.getByTestId('oll-student-tasks').locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await expect(page.locator('.place-value-trade-live')).toHaveCount(0);
  await expect(answer.locator('input')).toBeEnabled();
  await expect(answer.locator('.learning-student-task.is-waiting')).toHaveCount(0);
  for (const [place, count] of [[3, 6], [2, 2], [1, 3], [0, 1]] as const) await expect(disks(page, place, 'answer')).toHaveCount(count);
  // The camera has moved down to the answer row and the box, still at natural size.
  await expect(answer.locator('input')).toBeInViewport();
  // The answer row is read off the card: every column's answer disks are in view.
  for (const place of [3, 2, 1, 0]) await expect(disks(page, place, 'answer').first()).toBeInViewport();
  await atNaturalSize(page);
  await answer.locator('input').fill('6230');
  await answer.locator('button[type="submit"]').click();
  await expect(answer.locator('.learning-student-task-feedback small')).toContainText('1');
  await answer.locator('input').fill('6,231');
  await answer.locator('button[type="submit"]').click();
  await expect(answer.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await expect(answer).toContainText('6,231');
  await shot(page, 'place-value-trade-add-answered');
  expect(errors).toEqual([]);
});

test('subtracting across zeros by real clicks: a short column, the chain of breaks, then the difference', async ({ page }) => {
  const errors = await open(page, 'sub');
  await expect(page.locator('.place-value-trade-given')).toHaveText('40,002 − 3,585');
  const answer = await expectOpened(page, /What is left/);
  await atNaturalSize(page);
  // The ones are short: the card says so at the column and marks the disks that can break.
  await down(page, 0);
  await expect(page.locator('.place-value-trade-colnote')).toHaveText('This column has 2; taking away 5 needs more.');
  await expect(page.locator(`${column(4)} .place-value-trade-can-break`)).toHaveCount(4);
  await shot(page, 'place-value-trade-sub-short');
  // Break across the zeros, one marked disk at a time, each seen before the next.
  for (const place of [3, 2, 1, 0]) {
    await marked(page);
    await expect(disks(page, place, 'top')).toHaveCount(place === 0 ? 12 : 10);
  }
  await expect(answer.locator('input')).toBeDisabled();
  // Then the columns in any order; the last ↓ completes the chart and ends the task.
  for (const [place, left] of [[4, 3], [3, 6], [1, 1], [2, 4], [0, 7]] as const) {
    await down(page, place);
    await expect(disks(page, place, 'answer')).toHaveCount(left);
  }
  await expect(page.getByTestId('oll-student-tasks').locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await expect(answer.locator('input')).toBeEnabled();
  await expect(answer.locator('input')).toBeInViewport();
  for (const place of [4, 3, 2, 1, 0]) await expect(disks(page, place, 'answer').first()).toBeInViewport();
  await shot(page, 'place-value-trade-sub-complete');
  await answer.locator('input').fill('36417');
  await answer.locator('button[type="submit"]').click();
  await expect(answer.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await shot(page, 'place-value-trade-sub-answered');
  expect(errors).toEqual([]);
});

test('six columns at 1024 px: drawn at natural size, the whole width in the window', async ({ page }) => {
  const errors = await open(page, 'wide');
  await expectOpened(page, /What is the total/);
  expect((await atNaturalSize(page)).natural).toBe(24);
  const card = (await page.locator('.board-node', { has: page.locator('.place-value-trade') }).boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(1024);
  await expect(page.locator('.place-value-trade-given')).toBeInViewport();
  await expect(page.locator(`.place-value-trade-down[data-oll-tap="down:${index(0)}"]`)).toBeInViewport();
  await shot(page, 'place-value-trade-wide-1024');
  expect(errors).toEqual([]);
});

test('a row of blanks and two typed answers on the card: all wait, then open one by one; the hint from the start', async ({ page }) => {
  const errors = await open(page, 'rows');
  await expect(page.locator('.place-value-trade-given')).toHaveText('4,658 + 1,573');
  const tasks = page.getByTestId('oll-student-tasks');
  await expect(tasks).toBeVisible();
  await expect(page.locator('.learning-card-done')).toHaveCount(0);
  const answers = page.getByTestId('oll-answer-task');
  const row = answers.filter({ hasText: /Read the answer row/ });
  const total = answers.filter({ hasText: /What is the total/ });
  const hundreds = answers.filter({ hasText: /How many hundreds/ });
  // The row, then both answers, greyed where they go from the start, not locked.
  await expect(row.locator('input')).toHaveCount(4);
  for (const answer of [row, total, hundreds]) await expectWaiting(answer);
  await atNaturalSize(page);
  // The card task's hint, before any tap: offered, opened, and the chart is still worked at natural size. The task
  // panel sits under the card, below the fold at natural size (as in #254); a pointer click here would first scroll
  // the board's own element to it, which a learner panning the board does not, so the click is dispatched.
  await tasks.getByRole('button', { name: 'Give me a hint' }).dispatchEvent('click');
  await expect(tasks.locator('.learning-student-task-hint')).toHaveText('Start with any column.');
  await expect(tasks.getByRole('button', { name: /hint/ })).toHaveCount(0);
  await expect(page.locator('.place-value-trade-live').first()).toBeVisible();
  await atNaturalSize(page);
  await shot(page, 'place-value-trade-rows-open');
  for (const place of [0, 1, 2]) {
    await down(page, place);
    await ring(page, place);
    await expect(disks(page, place + 1, 'carry')).toHaveCount(1);
  }
  await down(page, 3);
  await expect(tasks.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  // The completing tap opens the row, the first after the card, and the camera moves to it at natural size; the
  // two answers stay greyed until their turn.
  await expectOpen(row);
  for (const place of [3, 2, 1, 0]) await expect(disks(page, place, 'answer').first()).toBeInViewport();
  await atNaturalSize(page);
  for (const answer of [total, hundreds]) await expectWaiting(answer);
  await shot(page, 'place-value-trade-rows-row-open');
  for (const [label, digit] of [['thousands', '6'], ['hundreds', '2'], ['tens', '3'], ['ones', '1']] as const) {
    await row.getByRole('textbox', { name: label }).fill(digit);
  }
  await row.locator('button[type="submit"]').click();
  await expect(row.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await expectOpen(total);
  await expectWaiting(hundreds);
  await total.locator('input').fill('6231');
  await total.locator('button[type="submit"]').click();
  await expect(total.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await expectOpen(hundreds);
  await hundreds.locator('input').fill('62');
  await hundreds.locator('button[type="submit"]').click();
  await expect(hundreds.locator('.learning-student-task.is-succeeded')).toHaveCount(1);
  await shot(page, 'place-value-trade-rows-answered');
  expect(errors).toEqual([]);
});
