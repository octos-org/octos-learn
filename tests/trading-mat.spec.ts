import { expect, test } from '@playwright/test';

// The trading mat (decision 0023) in Learn's lesson board: the learner trades on the practice pile, says
// done, then answers the number and two rows of blanks (decision 0023 amendment 1).
test('trade, say done, then answer the number and two rows of blanks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/tests/fixtures/trading-mat.html?key=trading-${Date.now()}`);
  const mat = page.locator('.base-ten-mat');
  await expect(mat).toBeVisible();
  const done = page.locator('.learning-card-done button');
  await expect(done).toBeVisible();
  await expect(page.locator('.base-ten-mat .base-ten-live').first()).toBeVisible();
  const looseOnes = page.locator('.base-ten-unit[data-place="0"]:not(.base-ten-in-tray):not(.base-ten-leaving)');
  await expect(looseOnes).toHaveCount(17);
  // Saying done with a trade left: not yet.
  await done.click();
  await expect(page.getByTestId('oll-student-tasks')).toContainText(/Look at the mat again|再看看摆面/);
  for (let i = 0; i < 10; i += 1) await looseOnes.first().click({ force: true });
  await expect(page.locator('.base-ten-unit.base-ten-in-tray')).toHaveCount(10);
  await page.locator('.base-ten-button[data-oll-tap="make:0"]').click({ force: true });
  await expect(page.locator('.base-ten-unit[data-place="1"]:not(.base-ten-leaving)')).toHaveCount(3);
  await expect(looseOnes).toHaveCount(7);
  await page.screenshot({ path: 'test-results/trading-mat-traded.png' });
  // The last 7 ones go in the tray too: they do not make a ten, and "I'm done" still succeeds (OLL #93).
  for (let i = 0; i < 7; i += 1) await looseOnes.first().click({ force: true });
  await page.locator('.base-ten-button[data-oll-tap="make:0"]').click({ force: true });
  await expect(page.locator('.base-ten-notice')).toHaveText('This tray does not hold a ten: a ten is ten ones.');
  await done.click();
  // The mat is laid tidy for the questions: 3 tens and 7 ones, the tray empty.
  await expect(page.locator('.base-ten-unit.base-ten-in-tray')).toHaveCount(0);
  await expect(looseOnes).toHaveCount(7);
  // The mat is inert once the learner has said done.
  await expect(page.locator('.base-ten-mat .base-ten-live')).toHaveCount(0);
  const answer = page.getByTestId('oll-answer-task').filter({ hasText: /How many marbles/ });
  await answer.locator('input').fill('37');
  await answer.locator('button[type="submit"]').click();
  const counts = page.getByTestId('oll-answer-task').filter({ hasText: /How many of each/ });
  const countBoxes = counts.locator('.learning-answer-row-blank input');
  await expect(countBoxes).toHaveCount(2);
  // One box left empty: not an attempt, and the empty box is marked.
  await countBoxes.nth(0).fill('3');
  await counts.locator('button[type="submit"]').click();
  await expect(countBoxes.nth(1)).toHaveClass(/is-missing/);
  // A wrong row: told only that it is not right yet, never which box.
  await countBoxes.nth(1).fill('17');
  await counts.locator('button[type="submit"]').click();
  await expect(countBoxes.nth(0)).not.toHaveClass(/is-missing/);
  // The wrong row counted as one try, and the feedback names no box.
  await expect(counts.locator('.learning-student-task-feedback small')).toContainText('1');
  await expect(counts.locator('.learning-answer-row-blank input.is-missing')).toHaveCount(0);
  await countBoxes.nth(1).fill('7');
  await counts.locator('button[type="submit"]').click();
  const parts = page.getByTestId('oll-answer-task').filter({ hasText: /What are the tens and the ones worth/ });
  const partBoxes = parts.locator('.learning-answer-row-blank input');
  await expect(partBoxes).toHaveCount(2);
  await expect(parts.locator('.learning-answer-row-blank small')).toHaveText(['the tens are worth', 'the ones are worth']);
  await page.screenshot({ path: 'test-results/trading-mat-row.png' });
  await partBoxes.nth(0).fill('30');
  await partBoxes.nth(1).fill('7');
  await parts.locator('button[type="submit"]').click();
  await expect(parts).toContainText('37 = 30 + 7');
  await page.screenshot({ path: 'test-results/trading-mat-done.png', fullPage: true });
  expect(errors).toEqual([]);
});
