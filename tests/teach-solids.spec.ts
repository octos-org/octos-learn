import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// 3D beyond the box: a cone with a cutting plane the learner moves while talking.

const now = "2026-11-06T08:00:00.000Z";
const RECORDINGS = "octos-learn:learner-recordings:v1:curated-learner";

test("a cone with a cut: the slider moves the cutting plane and its cross-section", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-cone", createdAt: now, updatedAt: now,
    topic: { text: "圆锥的横截面", type: "math_off_map" }, goals: ["横截面越来越小"],
    cards: [{ key: "card-1", title: "切一刀", kind: "teach", takes: [] }],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "立体" }).click();
  await page.getByRole("radio", { name: "圆锥", exact: true }).click();
  await page.getByRole("checkbox", { name: /^切一刀/ }).check();
  await page.getByRole("button", { name: "放到白板上" }).click();

  const scene = page.locator(".teach-studio .board-node.kind-scene3d");
  await expect(scene).toBeVisible();
  await expect(scene).toContainText("半径 2、高 4 的圆锥。");
  const cutAt = async () => (await scene.locator(".scene3d-intersection").first().getAttribute("d")) ?? "";
  const before = await cutAt();
  expect(before).not.toBe("");
  const slider = page.locator(".teach-studio .teach-board-sliders input[type=range]");
  await expect(slider).toHaveCount(1);
  await expect(page.locator(".teach-studio .teach-board-sliders")).toContainText("切面高度");
  await slider.focus();
  for (let step = 0; step < 15; step += 1) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  expect(await cutAt()).not.toBe(before);
  await page.getByRole("button", { name: "荧光笔", exact: true }).click();
  const plane = scene.locator(".scene3d-section");
  const planeTap = await plane.evaluate((element: SVGPolygonElement) => {
    const transform = element.getScreenCTM()!;
    const length = element.getTotalLength();
    for (let step = 1; step < 100; step += 1) {
      const { x, y } = element.getPointAtLength(length * step / 100).matrixTransform(transform);
      if (document.elementFromPoint(x, y) === element) return { x, y };
    }
    return null;
  });
  expect(planeTap).not.toBeNull();
  await page.mouse.click(planeTap!.x, planeTap!.y);
  await expect(plane).toHaveClass(/emphasis-focus/);
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[0].takes.at(-1).events, RECORDINGS);
  expect(events[0]).toMatchObject({ panel: "solid_3d", shape: "cone", radius: 2, height: 4, cut: { variable: "cut" } });
  expect(events).toContainEqual(expect.objectContaining({ type: "variable.drag", variable: "cut" }));
  expect(events.at(-1)).toMatchObject({ type: "tool.highlighter", target: { part: "cut" } });
  if (process.env.SOLID_SHOT) await page.locator(".teach-stage").screenshot({ path: process.env.SOLID_SHOT });
});

test("a regular polygon and unit circle, and points, a line, a segment and a circle on a grid", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-polygon", createdAt: now, updatedAt: now,
    topic: { text: "圆周率", type: "math_off_map" }, goals: ["边越多越接近圆"],
    cards: [{ key: "card-1", title: "割圆", kind: "teach", takes: [] }],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "正多边形" }).click();
  const polygonForm = page.getByRole("dialog", { name: "正多边形" });
  const sideCount = polygonForm.getByRole("textbox", { name: "几条边（3 到 48）" });
  await sideCount.fill("3");
  expect((await polygonForm.locator("polygon").getAttribute("points"))?.split(" ")).toHaveLength(3);
  await sideCount.fill("2");
  await expect(polygonForm.getByRole("button", { name: "放到白板上" })).toBeDisabled();
  await sideCount.fill("6");
  await page.getByRole("button", { name: "放到白板上" }).click();
  const polygon = page.locator(".teach-studio .board-node.kind-geometry polygon").first();
  await expect(polygon).toHaveAttribute("data-sides", "6");
  const slider = page.locator(".teach-studio .teach-board-sliders input[type=range]");
  await expect(page.locator(".teach-studio .teach-board-sliders")).toContainText("边数");
  await slider.focus();
  for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowRight");
  await expect(polygon).toHaveAttribute("data-sides", "12");

  // A grid with a point, and a circle round it.
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "坐标网格" }).click();
  const xStart = page.getByRole("textbox", { name: "x 从" });
  await xStart.fill("6");
  await expect(page.getByRole("button", { name: "放到白板上" })).toBeDisabled();
  await xStart.fill("-5");
  await page.getByRole("button", { name: "放到白板上" }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "放一个点" }).click();
  await page.getByRole("textbox", { name: "x" }).fill("0");
  await page.getByRole("textbox", { name: "y" }).fill("0");
  await page.getByRole("button", { name: /放到网格上|放到白板上/ }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "画圆" }).click();
  await page.getByRole("textbox", { name: "半径" }).fill("3");
  await page.getByRole("button", { name: "画在网格上" }).click();
  await expect(page.locator(".teach-studio .board-node.kind-geometry").last()).toContainText("r = 3");
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "放一个点" }).click();
  await page.getByRole("textbox", { name: "x" }).fill("2");
  await page.getByRole("textbox", { name: "y" }).fill("1");
  await page.getByRole("button", { name: "放到网格上" }).click();
  for (const name of ["过两点画直线", "连线段"]) {
    await page.getByRole("button", { name: /^放入/ }).click();
    await page.getByRole("button", { name }).click();
    const sheet = page.getByRole("dialog", { name });
    await expect(sheet.getByRole("combobox", { name: "第一个点" })).toBeVisible();
    await expect(sheet.getByRole("combobox", { name: "第二个点" })).toBeVisible();
    await sheet.getByRole("button", { name: "画在网格上" }).click();
  }
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "单位圆" }).click();
  await page.getByRole("button", { name: "放到白板上" }).click();
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[0].takes.at(-1).events, RECORDINGS);
  expect(events.find((event: { type: string }) => event.type === "geometry.circle")).toMatchObject({ radius: 3 });
  expect(events.map((event: { type: string }) => event.type)).toEqual(expect.arrayContaining(["line_tool.draw", "geometry.segment"]));
  expect(events.at(-1)).toMatchObject({ type: "component.insert", panel: "unit_circle" });
  if (process.env.SOLID_SHOT) await page.locator(".teach-stage").screenshot({ path: process.env.SOLID_SHOT });
});

test("more solids: a hexagonal prism with a cut and an icosahedron, from the Solid form", async ({ page }) => {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id: "rec-more", createdAt: now, updatedAt: now,
    topic: { text: "立体图形", type: "math_off_map" }, goals: ["认识立体"],
    cards: [{ key: "card-1", title: "棱柱", kind: "teach", takes: [] }],
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${draft.id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "立体" }).click();
  await page.getByRole("button", { name: "棱柱和棱锥", exact: true }).click();
  await page.getByRole("radio", { name: "棱柱", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "底面边数（3 到 12）" })).toHaveValue("6");
  await page.getByRole("checkbox", { name: /^切一刀/ }).check();
  await page.getByRole("button", { name: "放到白板上" }).click();
  const prism = page.locator(".teach-studio .board-node.kind-scene3d").first();
  await expect(prism).toContainText("底面是正六边形的棱柱");
  await expect(prism.locator(".scene3d-intersection")).toHaveCount(1);
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "立体" }).click();
  await page.getByRole("button", { name: "正多面体", exact: true }).click();
  await page.getByRole("radio", { name: "正二十面体", exact: true }).click();
  await page.getByRole("button", { name: "放到白板上" }).click();
  const icosahedron = page.locator(".teach-studio .board-node.kind-scene3d").last();
  await expect(icosahedron).toContainText("正二十面体");
  // About half of its 20 faces face the viewer.
  const faces = await icosahedron.locator(".scene3d-facet").count();
  expect(faces).toBeGreaterThanOrEqual(8);
  expect(faces).toBeLessThanOrEqual(12);
});
