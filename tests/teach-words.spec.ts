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
  await expect(page.locator(".teach-studio .board-node.kind-text")).not.toContainText("observation");
  await expect(page.locator(".teach-studio .board-node.kind-text")).not.toContainText("text");

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
  await expect(page.getByText("点表格里的格子可以填写，点图示可以再加一步。")).toBeVisible();

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

test("a cycle diagram grows a box at a time while talking", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-cycle", createdAt: now, updatedAt: now,
    topic: { text: "水的循环", type: "other" }, goals: ["说出水的循环"],
    cards: [{ key: "card-1", title: "转一圈", kind: "teach", takes: [] }],
  };
  await page.addInitScript((value) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem("octos-learn:learner-recordings:v1:curated-learner", JSON.stringify([value]));
  }, draft);
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "图示" }).click();
  await page.getByRole("radio", { name: "转一圈" }).click();
  await page.getByRole("textbox", { name: "第 1 个框" }).fill("海洋");
  await page.getByRole("textbox", { name: "第 2 个框" }).fill("水蒸气");
  await page.getByRole("button", { name: "加一个框" }).click();
  await page.getByRole("textbox", { name: "第 3 个框" }).fill("云");
  await page.getByRole("button", { name: "放到白板上" }).click();
  const diagram = page.locator(".teach-studio .board-node.kind-diagram");
  await expect(diagram).toContainText("云");

  // Tap the diagram to add the next box, with words on its arrow.
  await diagram.click();
  await expect(page.getByRole("dialog", { name: "给图示加一步" })).toContainText("第 4 个框");
  await page.getByRole("textbox", { name: "框里写什么" }).fill("下雨");
  await page.getByRole("textbox", { name: "箭头上写什么（可以不写）" }).fill("落下");
  await page.getByRole("button", { name: "加上" }).click();
  await expect(diagram).toContainText("下雨");
  await expect(diagram).toContainText("落下");
  // Four boxes joined in a ring: four arrows, each ending at a box.
  await expect(diagram.locator("line.diagram-edge[marker-end]")).toHaveCount(4);
  await expect(diagram.locator("rect.diagram-node")).toHaveCount(4);
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem("octos-learn:learner-recordings:v1:curated-learner")!)[0].cards[0].takes.at(-1).events);
  expect(events.map((event: { type: string }) => event.type)).toEqual(["component.insert", "diagram.add"]);
  expect(events[1]).toMatchObject({ node: "diagram-1", label: "下雨", link: "落下" });
  if (process.env.CYCLE_SHOT) await page.locator(".teach-stage").screenshot({ path: process.env.CYCLE_SHOT });
});

test("a highlight says what it means, and an arrow carries words", async ({ page }) => {
  await installTestAccount(page);
  const take = (text: string, events: unknown[]) => ({ take: 1, status: "kept", startedAt: now, durationMs: 3_000, asrText: text, text, speechSpanMs: [0, 2_000], segments: [{ startMs: 0, endMs: 2_000, text }], events });
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-marks", createdAt: now, updatedAt: now,
    topic: { text: "烫伤", type: "other" }, goals: ["小心蒸汽"],
    cards: [
      { key: "card-1", title: "开水", kind: "teach", takes: [take("开水会冒出蒸汽。", [{ t: 300, type: "component.insert", panel: "text", alias: "text-1", text: "开水" }])] },
      { key: "card-2", title: "蒸汽", kind: "teach", takes: [] },
    ],
  };
  await page.addInitScript((value) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem("octos-learn:learner-recordings:v1:curated-learner", JSON.stringify([value]));
  }, draft);
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: /^2 · / }).click();
  await page.getByRole("button", { name: "录第 2 张" }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "文字" }).click();
  await page.getByRole("textbox", { name: "要写的话" }).fill("蒸汽很烫");
  await page.getByRole("button", { name: "放到白板上" }).click();
  const steam = page.locator(`.teach-studio .board-node[data-id$=":node:text-2"]`);
  await expect(steam).toBeVisible();

  // A "careful" highlight.
  await page.getByRole("button", { name: /^荧光笔/ }).click();
  await page.getByRole("radio", { name: "小心" }).click();
  await steam.click();
  await expect(steam).toHaveClass(/emphasis-warning/);

  // An arrow from the boiling water to the steam, with words on it.
  await page.getByRole("button", { name: /^箭头/ }).click();
  await page.getByRole("textbox", { name: "箭头上写什么（可以不写）" }).fill("冒出");
  await page.locator(`.teach-studio .board-node[data-id$=":node:text-1"]`).click();
  await steam.click();
  await expect(page.locator(".teach-studio").getByText("冒出", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem("octos-learn:learner-recordings:v1:curated-learner")!)[0].cards[1].takes.at(-1).events);
  expect(events.find((event: { type: string }) => event.type === "tool.highlighter")).toMatchObject({ emphasis: "warning" });
  expect(events.find((event: { type: string }) => event.type === "tool.arrow")).toMatchObject({ label: "冒出", from: { node: "text-1" }, to: { node: "text-2" } });
  if (process.env.MARKS_SHOT) await page.locator(".teach-stage").screenshot({ path: process.env.MARKS_SHOT });
});
