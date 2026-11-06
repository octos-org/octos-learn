import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// "Your turn" beyond dragging: a number to type after the lesson, and a 3D
// shape to turn, set up in the studio and done by the viewer.

const now = "2026-11-06T08:00:00.000Z";
const RECORDINGS = "octos-learn:learner-recordings:v1:curated-learner";
const take = (text: string, events: unknown[]) => ({ take: 1, status: "kept", startedAt: now, durationMs: 3_000, asrText: text, text, speechSpanMs: [0, 2_000],
  segments: [{ startMs: 0, endMs: 2_000, text }], events });

test("a viewer answers the learner's number question after the lesson", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-answer", createdAt: now, updatedAt: now,
    topic: { text: "约分", type: "math_off_map" }, goals: ["会约分"],
    cards: [
      { key: "card-1", title: "约分", kind: "teach", takes: [take("6/8 可以约分。", [{ t: 300, type: "component.insert", panel: "text", alias: "text-1", text: "6/8 = 3/4" }])] },
      { key: "card-2", title: "轮到你了", kind: "your_turn", takes: [take("把 9/12 约成最简分数。", [
        { t: 300, type: "component.insert", panel: "text", alias: "text-2", text: "9/12 = ?" },
        { t: 600, type: "your_turn.answer_set", answer: "3/4", simplest: true },
        { t: 700, type: "your_turn.hint_spoken", text: "分子分母同时除以 3。" },
      ])] },
    ],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}/watch`);
  const sound = page.getByRole("button", { name: "关掉声音" });
  if (await sound.isVisible().catch(() => false)) await sound.click();
  await page.getByRole("button", { name: "播放我的课" }).click();
  await expect(page.locator(".teach-watch-caption")).toContainText("看完了", { timeout: 45_000 });
  const box = page.getByRole("textbox").filter({ hasNot: page.locator("[disabled]") }).last();
  await expect(box).toBeVisible();
  await box.fill("9/12");
  await box.press("Enter");
  // Right number, not simplest: not done yet.
  await page.waitForTimeout(400);
  await expect(page.getByText("完成得很好，已经达到目标。")).toHaveCount(0);
  await box.fill("3/4");
  await box.press("Enter");
  await expect(page.getByText("完成得很好，已经达到目标。")).toBeVisible();
  await expect(page.getByText("答案：3/4")).toBeVisible();
  if (process.env.PRACTICE_SHOT) await page.screenshot({ path: process.env.PRACTICE_SHOT });
});

test("the learner turns a box to the view viewers must find; the view is kept only once the box was turned", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-view", createdAt: now, updatedAt: now,
    topic: { text: "长方体的面", type: "math_off_map" }, goals: ["找到顶面"],
    cards: [
      { key: "card-1", title: "长方体", kind: "teach", takes: [take("这是一个长方体。", [{ t: 300, type: "component.insert", panel: "solid_3d", alias: "box-1", shape: "box", size: { x: 4, y: 3, z: 2 } }])] },
      { key: "card-2", title: "轮到你了", kind: "your_turn", takes: [] },
    ],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: /^2 · / }).click();
  await page.getByRole("button", { name: "录第 2 张" }).click();
  await page.getByRole("radio", { name: "转到某个角度" }).click();
  // Not turned yet.
  await page.getByRole("button", { name: "就是这个角度" }).click();
  await expect(page.getByText("先在白板上转动这个立体，再点这个按钮。")).toBeVisible();
  // Turn the box to look down on it: drag upwards on the scene.
  const scene = (await page.locator(".teach-studio .board-node.kind-scene3d").boundingBox())!;
  const centre = { x: scene.x + scene.width / 2, y: scene.y + scene.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) await page.mouse.move(centre.x + step * 18, centre.y + step * 10);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "就是这个角度" }).click();
  await expect(page.getByText("看的人要自己把它转到差不多这个方向，才算做对。")).toBeVisible();
  await page.getByRole("button", { name: "保存这道练习" }).click();
  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[1].takes.at(-1).events, RECORDINGS);
  const view = events.find((event: { type: string }) => event.type === "your_turn.view_set");
  console.log(JSON.stringify(view));
  expect(view).toMatchObject({ node: "box-1" });
  expect(Math.abs(view.yaw - 0.72) + Math.abs(view.pitch - 0.55)).toBeGreaterThan(0.3);
});
