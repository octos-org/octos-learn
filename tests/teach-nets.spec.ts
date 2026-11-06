import { expect, test, type Page } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// Solids on other bases, stacked solids, and nets that open on a slider.

const now = "2026-11-06T08:00:00.000Z";
const RECORDINGS = "octos-learn:learner-recordings:v1:curated-learner";

async function openStudio(page: Page, id: string) {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id, createdAt: now, updatedAt: now,
    topic: { text: "立体的表面积", type: "math_off_map" }, goals: ["展开图的面积就是表面积"],
    cards: [{ key: "card-1", title: "打开盒子", kind: "teach", takes: [] }],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
}

async function addSolid(page: Page, choose: () => Promise<void>) {
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "立体" }).click();
  await choose();
  await page.getByRole("button", { name: "放到白板上" }).click();
}

const takeEvents = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[0].takes.at(-1).events, RECORDINGS);

test("a cube opens into its net as the learner drags the slider", async ({ page }) => {
  await openStudio(page, "rec-net");
  await addSolid(page, async () => {
    await page.getByRole("radio", { name: "正方体", exact: true }).click();
    await page.getByRole("checkbox", { name: /^展开成平面图/ }).check();
  });
  const scene = page.locator(".teach-studio .board-node.kind-scene3d");
  await expect(scene).toContainText("拖动滑杆把它展开成平面图。");
  const faces = async () => scene.locator("svg").first().innerHTML();
  const closed = await faces();
  const slider = page.locator(".teach-studio .teach-board-sliders input[type=range]");
  await expect(page.locator(".teach-studio .teach-board-sliders")).toContainText("展开");
  await slider.focus();
  for (let step = 0; step < 50; step += 1) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  expect(await faces()).not.toBe(closed);
  if (process.env.NET_SHOT) await page.locator(".teach-stage").screenshot({ path: `${process.env.NET_SHOT}-cube.png` });
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await takeEvents(page);
  expect(events[0]).toMatchObject({ panel: "solid_3d", shape: "box", size: { x: 3, y: 3, z: 3 }, unfold: { variable: "unfold" } });
  expect(events.at(-1)).toMatchObject({ type: "variable.drag", variable: "unfold" });
});

test("a truncated pyramid on a triangle, an ellipsoid and a stacked solid", async ({ page }) => {
  await openStudio(page, "rec-shapes");
  await addSolid(page, async () => {
    await page.getByRole("radio", { name: "棱台", exact: true }).click();
    await page.getByRole("radio", { name: "三角形（三边）", exact: true }).click();
    await page.getByLabel("边 c").fill("9");
    await expect(page.getByText("这三条边围不成三角形")).toBeVisible();
    await expect(page.getByRole("button", { name: "放到白板上" })).toBeDisabled();
    await page.getByLabel("边 c").fill("5");
    await page.getByLabel("边 a").fill("4");
    await page.getByLabel("边 b").fill("3");
  });
  await expect(page.locator(".teach-studio .board-node.kind-scene3d").first()).toContainText("底面是三边长 4、3、5 的三角形的棱台");
  await addSolid(page, async () => { await page.getByRole("radio", { name: "椭球", exact: true }).click(); });
  await addSolid(page, async () => {
    await page.getByRole("radio", { name: "圆柱 + 圆锥", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /^展开成平面图/ })).toHaveCount(0);
    await page.getByRole("checkbox", { name: /^切一刀/ }).check();
  });
  const scenes = page.locator(".teach-studio .board-node.kind-scene3d");
  await expect(scenes).toHaveCount(3);
  await expect(scenes.nth(2)).toContainText("上面是高 2 的圆锥");
  await expect(scenes.nth(2).locator(".scene3d-intersection")).toHaveCount(1);
  if (process.env.NET_SHOT) await page.locator(".teach-stage").screenshot({ path: `${process.env.NET_SHOT}-shapes.png` });
  await page.getByRole("button", { name: /^停止/ }).click();
  const events = await takeEvents(page);
  expect(events.map((event: { shape: string }) => event.shape)).toEqual(["pyramid", "ellipsoid", "composite"]);
  expect(events[0]).toMatchObject({ base: { kind: "triangle", a: 4, b: 3, c: 5 }, topScale: 0.5 });
  expect(events[2]).toMatchObject({ parts: "cylinder_cone", radius: 2, height: 4, topHeight: 2, cut: { variable: "cut" } });
});
