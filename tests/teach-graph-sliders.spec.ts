import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// A graph whose letters are sliders: y = a*x + b, dragged while talking.

const now = "2026-11-06T08:00:00.000Z";
const RECORDINGS = "octos-learn:learner-recordings:v1:curated-learner";

test("letters of a graph become sliders the learner drags while talking", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-sliders", createdAt: now, updatedAt: now,
    topic: { text: "斜率和截距", type: "math_off_map" }, goals: ["看懂 a 和 b"],
    cards: [{ key: "card-1", title: "直线", kind: "teach", takes: [] }],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "函数图" }).click();
  await page.getByRole("textbox", { name: "函数 y =" }).fill("a*x+b");
  await expect(page.getByRole("group", { name: "滑块 a" })).toBeVisible();
  await expect(page.getByRole("group", { name: "滑块 b" })).toBeVisible();
  await page.getByRole("group", { name: "滑块 b" }).getByRole("textbox", { name: "开始是" }).fill("0");
  await page.getByRole("button", { name: "放到白板上" }).click();

  // Two sliders on the board, labelled by their letters.
  const sliders = page.locator(".teach-studio .teach-board-sliders input[type=range]");
  await expect(sliders).toHaveCount(2);
  await expect(page.locator(".teach-studio .teach-board-sliders")).toContainText("a");
  // Drag a: the keyboard moves the slider like a drag.
  await sliders.first().focus();
  for (let step = 0; step < 10; step += 1) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[0].takes.at(-1).events, RECORDINGS);
  expect(events[0]).toMatchObject({ panel: "graph", expression: "a*x+b", parameters: [{ letter: "a", variable: "a", initial: 1 }, { letter: "b", variable: "b", initial: 0 }] });
  // Each key press moves it one step, as its own small drag: a goes from 1 to 2.
  const drags = events.filter((event: { type: string }) => event.type === "variable.drag");
  expect(drags.every((drag: { variable: string; via: string }) => drag.variable === "a" && drag.via === "slider")).toBe(true);
  expect(drags[0].from).toBe(1);
  expect(drags.at(-1).to).toBeCloseTo(2, 5);
});
  expect(drag.to).toBeGreaterThan(drag.from);
});
