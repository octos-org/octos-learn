import { expect, test, type Page } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// Studio's number line (OLL decision 0013): the insert form, the recorded
// panel, and the card the board draws from it.

const now = "2026-11-11T08:00:00.000Z";
const RECORDINGS = "octos-learn:learner-recordings:v1:curated-learner";

async function openStudio(page: Page, id: string) {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id, createdAt: now, updatedAt: now,
    topic: { text: "负数加法", type: "math_off_map" }, goals: ["在数轴上看加法"],
    cards: [{ key: "card-1", title: "3 加 −5", kind: "teach", takes: [] }],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
}

const takeEvents = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[0].takes.at(-1).events, RECORDINGS);

test("a learner puts 3 + (−5) on a number line: the form records it and the board draws five hops", async ({ page }) => {
  await openStudio(page, "rec-number-line");
  await page.getByRole("toolbar").getByRole("button", { name: "放入", exact: true }).click();
  await page.getByRole("button", { name: "数轴", exact: true }).click();
  const form = page.getByRole("dialog", { name: "数轴", exact: true });
  const insert = form.getByRole("button", { name: "放到白板上" });
  // A start outside the line cannot be inserted, and the form says why.
  await form.getByRole("textbox", { name: "起点（可不填）" }).fill("9");
  await expect(insert).toBeDisabled();
  await expect(form.getByRole("status")).toContainText("起点要是数轴范围里的数或分数");
  await form.getByRole("textbox", { name: "起点（可不填）" }).fill("3");
  await form.getByRole("textbox", { name: "移动多少（可不填）" }).fill("−5");
  await expect(form.getByRole("checkbox", { name: /一格一跳/ })).toBeChecked();
  await expect(insert).toBeEnabled();
  await insert.click();

  const events = await takeEvents(page);
  expect(events.find((event: { type: string }) => event.type === "component.insert")).toMatchObject({
    panel: "number_line", range: [-5, 5], subdivisions: 1, start: "3", jump: { by: "−5", hops: true },
  });
  const card = page.locator('.board-node[data-kind="number_line"]').first();
  await expect(card).toBeVisible();
  await expect(card.locator(".number-line-jump-arc")).toHaveCount(5);
  await expect(card.locator(".number-line-point-label")).toHaveText(["起点 3", "终点"]);
});

test("fourths with a slider: the form records the slider and the board draws exact fourths", async ({ page }) => {
  await openStudio(page, "rec-number-line-fourths");
  await page.getByRole("toolbar").getByRole("button", { name: "放入", exact: true }).click();
  await page.getByRole("button", { name: "数轴", exact: true }).click();
  const form = page.getByRole("dialog", { name: "数轴", exact: true });
  await form.getByRole("textbox", { name: "从" }).fill("0");
  await form.getByRole("textbox", { name: "到" }).fill("2");
  await form.getByRole("combobox", { name: "每格分成" }).selectOption("4");
  await form.getByRole("textbox", { name: "起点（可不填）" }).fill("3/4");
  await form.getByRole("textbox", { name: "移动多少（可不填）" }).fill("1/4");
  await form.getByRole("checkbox", { name: /移动做成滑块/ }).check();
  await form.getByRole("button", { name: "放到白板上" }).click();

  const insert = (await takeEvents(page)).find((event: { type: string }) => event.type === "component.insert");
  expect(insert).toMatchObject({ panel: "number_line", subdivisions: 4, start: "3/4", jump: { by: "1/4", hops: true, slider: { variable: "move" } } });
  const card = page.locator('.board-node[data-kind="number_line"]').first();
  await expect(card.locator(".number-line-fraction").first()).toBeVisible();
  // One hop of a fourth from 3/4; the slider's range is checked in compile-recording.test.ts.
  await expect(card.locator(".number-line-jump-arc")).toHaveCount(1);
  await expect(card.locator(".number-line-point-label")).toHaveText(["起点 3/4"]);
});
