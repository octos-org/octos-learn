import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// A lesson without drawing: words, a note and a table whose cells are filled
// while talking, recorded in the studio and shown on the board.

const now = "2026-11-06T08:00:00.000Z";

test("a card of words: a text card, a table filled cell by cell while talking, and a note", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-words", createdAt: now, updatedAt: now,
    topic: { text: "物质的三种状态", type: "other" }, goals: ["分清固体、液体和气体"],
    cards: [{ key: "card-1", title: "三种状态", kind: "teach", takes: [] }],
  };
  await page.addInitScript((value) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem("octos-learn:learner-recordings:v1:curated-learner", JSON.stringify([value]));
  }, draft);
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();

  // Words.
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "文字" }).click();
  await page.getByRole("textbox", { name: "要写的话" }).fill("物质有三种状态。");
  await page.getByRole("button", { name: "放到白板上" }).click();
  await expect(page.locator(".teach-studio .board-node.kind-text")).toContainText("物质有三种状态。");

  // A table, with the examples left to fill in.
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "表格" }).click();
  await page.getByRole("textbox", { name: "第 1 列的标题" }).fill("状态");
  await page.getByRole("textbox", { name: "第 2 列的标题" }).fill("例子");
  await page.getByRole("textbox", { name: "第 1 行第 1 列" }).fill("固体");
  await page.getByRole("textbox", { name: "第 2 行第 1 列" }).fill("液体");
  await page.getByRole("button", { name: "放到白板上" }).click();
  const table = page.locator(".teach-studio .board-node.kind-table");
  await expect(table).toContainText("固体");
  await expect(page.getByText("点白板上表格里的格子，就能把你说的话填进去。")).toBeVisible();

  // Fill the first example while talking.
  await table.locator("td").nth(1).click();
  await page.getByRole("textbox", { name: "格子里写什么" }).fill("冰");
  await page.getByRole("button", { name: "填好了" }).click();
  await expect(table.locator("td").nth(1)).toHaveText("冰");

  // A conclusion.
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "提示" }).click();
  await page.getByRole("radio", { name: "结论" }).click();
  await page.getByRole("textbox", { name: "提示的内容" }).fill("加热或冷却会改变状态。");
  await page.getByRole("button", { name: "放到白板上" }).click();
  await expect(page.locator(".teach-studio .board-node.kind-note")).toContainText("加热或冷却会改变状态。");
  await expect(page.locator(".teach-studio .board-node.kind-note")).toContainText("结论");
  await expect(page.locator(".teach-studio .board-node.kind-note")).not.toContainText("conclusion");

  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem("octos-learn:learner-recordings:v1:curated-learner")!)[0].cards[0].takes.at(-1).events
    .map((event: { type: string; panel?: string }) => event.panel ?? event.type));
  expect(events).toEqual(["text", "table", "table.fill", "note"]);
  await expect(table.locator("td").nth(1)).toHaveText("冰");
  if (process.env.WORDS_SHOT) await page.locator(".teach-stage").screenshot({ path: process.env.WORDS_SHOT });
});
