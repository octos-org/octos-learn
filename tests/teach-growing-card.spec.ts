import { expect, test, type Page } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// A worked solution grows in one card: writing under an earlier card's
// handwriting or math continues that card where it was written, at its
// drawn size, and neat math lines its "=" up with the line above.

const now = "2026-11-06T08:00:00.000Z";
const RECORDINGS = "octos-learn:learner-recordings:v1:curated-learner";
const INK = "octos-learn:learner-ink:v1:curated-learner";

async function open(page: Page, draft: unknown, ink: Record<string, unknown> = {}) {
  await installTestAccount(page);
  await page.addInitScript(({ draft, ink, keys }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(keys.recordings, JSON.stringify([draft]));
    localStorage.setItem(keys.ink, JSON.stringify(ink));
  }, { draft, ink, keys: { recordings: RECORDINGS, ink: INK } });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
}

/** A card's box on the board, in screen pixels. */
const cardBox = async (page: Page, alias: string) => (await page.locator(`.teach-studio .board-node[data-id$=":node:${alias}"]`).boundingBox())!;

async function drawLine(page: Page, from: { x: number; y: number }, length: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(from.x + (length * step) / 8, from.y + (step % 2 ? 3 : -3));
  await page.mouse.up();
}

test("writing under an earlier card's handwriting continues that card where it was written", async ({ page }) => {
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-grow", createdAt: now, updatedAt: now,
    topic: { text: "解方程", type: "math_off_map" }, goals: ["一步一步解"],
    cards: [{ key: "card-1", title: "题目", kind: "teach", takes: [] }, { key: "card-2", title: "先减 5", kind: "teach", takes: [] }],
  };
  await open(page, draft);
  await page.goto(`/teach/${draft.id}`);

  // Card 1: a line of writing in the middle of the board.
  await page.getByRole("button", { name: "录第 1 张" }).click();
  await page.getByRole("button", { name: /^笔/ }).click();
  const board = (await page.locator(".teach-stage").boundingBox())!;
  await drawLine(page, { x: board.x + board.width * 0.35, y: board.y + board.height * 0.3 }, 220);
  await drawLine(page, { x: board.x + board.width * 0.35, y: board.y + board.height * 0.3 + 30 }, 220);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();

  // Card 2: write just below card 1's handwriting, where it shows now.
  await page.getByRole("button", { name: /^2 · / }).click();
  await page.getByRole("button", { name: "录第 2 张" }).click();
  await page.getByRole("button", { name: /^笔/ }).click();
  // The camera settles on the card being recorded before writing.
  await page.waitForTimeout(1_200);
  const first = await cardBox(page, "ink-card-1");
  const start = { x: first.x + 20, y: first.y + first.height + 40 };
  await drawLine(page, start, 160);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[1].ink[0], RECORDINGS);
  console.log(JSON.stringify({ continues: saved.continues, drawnSize: saved.drawnSize }));
  expect(saved.continues).toMatchObject({ node: "ink-card-1" });
  expect(saved.drawnSize.width).toBeGreaterThan(100);

  // Written below card 1's handwriting, a little in from its left edge (board units at the board's zoom).
  const zoom = first.width / (await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[0].ink[0].drawnSize.width, RECORDINGS));
  expect(saved.continues.y * zoom).toBeGreaterThan(first.height);
  expect(Math.abs(saved.continues.x * zoom - (start.x - first.x))).toBeLessThan(12);

  // The board shows card 2's writing exactly at that offset from card 1's, at its drawn size, in one frame.
  const after1 = await cardBox(page, "ink-card-1");
  const after2 = await cardBox(page, "ink-card-2");
  const scale = after2.width / saved.drawnSize.width;
  expect(Math.abs((after2.y - after1.y) / scale - saved.continues.y)).toBeLessThan(2);
  expect(Math.abs((after2.x - after1.x) / scale - saved.continues.x)).toBeLessThan(2);
  expect(Math.abs(after2.height / scale - saved.drawnSize.height)).toBeLessThan(2);
  await expect(page.locator(".teach-studio .board-continued")).toHaveCount(1);
  const frame = (await page.locator(".teach-studio .board-continued").boundingBox())!;
  for (const card of [after1, after2]) {
    expect(card.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(card.y + card.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }
  if (process.env.GROWING_CARD_SHOTS) await page.locator(".teach-stage").screenshot({ path: `${process.env.GROWING_CARD_SHOTS}/${test.info().title.slice(0, 24)}.png` });
});

test("neat math under a worked line lines its '=' up with the formula above", async ({ page }) => {
  const svg = (width: number, height: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g data-oll-stroke="0"><path d="M4 ${height / 2} L${width - 4} ${height / 2}" stroke="#123" stroke-width="3" fill="none"/></g></svg>`;
  const take = (text: string, events: unknown[] = []) => ({ take: 1, status: "kept", startedAt: now, durationMs: 4_000, asrText: text, text, speechSpanMs: [0, 3_000],
    segments: [{ startMs: 0, endMs: 3_000, text }], events });
  const ink = (snapshotId: string, selections: string[], size: { width: number; height: number }, continues?: unknown) => ({
    snapshotId, sha256: "", selections, take: 1, drawnSize: size, ...(continues ? { continues } : {}) });
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-equals", createdAt: now, updatedAt: now,
    topic: { text: "解方程 3x + 5 = 20", type: "math_off_map" }, goals: ["一步一步解"],
    cards: [
      { key: "card-1", title: "题目", kind: "teach", takes: [take("这是题目。", [{ t: 1_000, type: "make_neat.confirmed", selection: "sel-c1", latex: "3x+5=20", alias: "problem", replacesInk: true }])],
        ink: [ink("ink-snap:rec-equals-card-1-t1@v1", ["sel-c1"], { width: 300, height: 70 })] },
      { key: "card-2", title: "先减 5", kind: "teach", takes: [take("两边同时减五。")],
        ink: [ink("ink-snap:rec-equals-card-2-t1@v1", [], { width: 260, height: 60 }, { node: "problem", x: 10, y: 96 })] },
      { key: "card-3", title: "再除以 3", kind: "teach", takes: [take("两边同时除以三。", [{ t: 1_000, type: "make_neat.confirmed", selection: "sel-c3", latex: "x=5", alias: "answer", replacesInk: true }])],
        ink: [ink("ink-snap:rec-equals-card-3-t1@v1", ["sel-c3"], { width: 140, height: 60 }, { node: "ink-card-2", x: 150, y: 80 })] },
    ],
  };
  const snapshots = Object.fromEntries(draft.cards.map((card) => [card.ink[0]!.snapshotId, { svg: svg(card.ink[0]!.drawnSize.width, card.ink[0]!.drawnSize.height), ...card.ink[0]!.drawnSize }]));
  // Checksums are those of the stored writing, as the studio computes them.
  for (const card of draft.cards) {
    const bytes = new TextEncoder().encode(snapshots[card.ink[0]!.snapshotId]!.svg);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    card.ink[0]!.sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  await open(page, draft, snapshots);
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: /^3 · / }).click();
  await expect(page.locator(`.teach-studio .board-node[data-id$=":node:answer"]`)).toBeVisible();
  await page.waitForTimeout(500);
  const equals = async (alias: string) => page.locator(`.teach-studio .board-node[data-id$=":node:${alias}"] .katex-html .mrel`).first().boundingBox();
  const top = (await equals("problem"))!, bottom = (await equals("answer"))!;
  console.log(JSON.stringify({ top, bottom }));
  expect(Math.abs((top.x + top.width / 2) - (bottom.x + bottom.width / 2))).toBeLessThan(2);
  const problem = await cardBox(page, "problem"), line = await cardBox(page, "ink-card-2"), answer = await cardBox(page, "answer");
  expect(line.y).toBeGreaterThan(problem.y + problem.height - 20);
  expect(answer.y).toBeGreaterThan(line.y);
  await expect(page.locator(".teach-studio .board-continued")).toHaveCount(1);
  if (process.env.GROWING_CARD_SHOTS) await page.locator(".teach-stage").screenshot({ path: `${process.env.GROWING_CARD_SHOTS}/${test.info().title.slice(0, 24)}.png` });
});
