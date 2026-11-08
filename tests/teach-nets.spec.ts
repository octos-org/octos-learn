import { expect, test, type Page } from "@playwright/test";
import type { RecordingCard } from "../src/learning/teach/recording";
import { installTestAccount } from "./helpers/course-test-account";

// Solids on other bases, stacked solids, and nets that open on a slider.

const now = "2026-11-06T08:00:00.000Z";
const RECORDINGS = "octos-learn:learner-recordings:v1:curated-learner";

async function loadStudio(page: Page, id: string, cards: RecordingCard[]) {
  await installTestAccount(page);
  const draft = {
    schema: "octos.learner-recording.v1", id, createdAt: now, updatedAt: now,
    topic: { text: "立体的表面积", type: "math_off_map" }, goals: ["展开图的面积就是表面积"],
    cards,
  };
  await page.addInitScript(({ value, key }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem(key, JSON.stringify([value]));
  }, { value: draft, key: RECORDINGS });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${id}`);
}

async function openStudio(page: Page, id: string) {
  await loadStudio(page, id, [{ key: "card-1", title: "打开盒子", kind: "teach", takes: [] }]);
  await page.getByRole("button", { name: "录第 1 张" }).click();
}

async function addSolid(page: Page, choose: () => Promise<void>) {
  await page.getByRole("button", { name: /^放入/ }).click();
  await page.getByRole("button", { name: "立体" }).click();
  await choose();
  await page.getByRole("button", { name: "放到白板上" }).click();
}

const takeEvents = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[0].takes.at(-1).events, RECORDINGS);

test("the solid picker keeps its action visible on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page, "rec-solid-picker");
  const add = page.getByRole("toolbar").getByRole("button", { name: "放入", exact: true });
  await add.click();
  const solidEntry = page.getByRole("button", { name: "立体", exact: true });
  await solidEntry.click();
  const picker = page.getByRole("dialog", { name: "立体", exact: true });
  await expect(picker.getByRole("button", { name: "放入", exact: true })).toBeFocused();
  await picker.getByRole("button", { name: "放入", exact: true }).click();
  await expect(solidEntry).toBeFocused();
  await solidEntry.press("Enter");
  const box = picker.getByRole("radio", { name: "长方体", exact: true });
  const cube = picker.getByRole("radio", { name: "正方体", exact: true });
  await box.press("ArrowRight");
  await expect(cube).toBeChecked();
  await expect(picker.getByRole("heading", { name: "正方体的尺寸" })).toBeVisible();
  const insert = picker.getByRole("button", { name: "放到白板上" });
  await expect(insert).toBeInViewport({ ratio: 1 });
  if (process.env.NET_SHOT) await picker.screenshot({ path: `${process.env.NET_SHOT}-mobile.png` });
  await picker.getByRole("textbox", { name: "棱长" }).fill("5");
  await picker.getByRole("button", { name: "正多面体" }).click();
  await expect(picker.getByRole("radio", { name: "正二十面体" })).toBeVisible();
  await picker.getByRole("button", { name: "常见的立体" }).click();
  await expect(cube).toBeChecked();
  await expect(picker.getByRole("textbox", { name: "棱长" })).toHaveValue("5");
  await expect(insert).toBeInViewport({ ratio: 1 });
  await cube.press("Escape");
  await expect(picker).toBeHidden();
  await expect(add).toBeFocused();
});

test("a cube opens into its net as the learner drags the slider", async ({ page }) => {
  await openStudio(page, "rec-net");
  await addSolid(page, async () => {
    await page.getByRole("radio", { name: "正方体", exact: true }).click();
    if (process.env.NET_SHOT) await page.getByRole("dialog", { name: "立体", exact: true }).screenshot({ path: `${process.env.NET_SHOT}-desktop.png` });
    await page.getByRole("checkbox", { name: /^展开成平面图/ }).check();
  });
  const scene = page.locator(".teach-studio .board-node.kind-scene3d");
  await expect(scene).toContainText("拖动滑杆把它展开成平面图。");
  await expect(scene.getByText("顶面 3 × 3", { exact: true })).toBeVisible();
  const faces = async () => scene.locator("svg").first().innerHTML();
  const closed = await faces();
  const slider = page.locator(".teach-studio .teach-board-sliders input[type=range]");
  await expect(page.locator(".teach-studio .teach-board-sliders")).toContainText("展开");
  await slider.press("End");
  await expect.poll(faces).not.toBe(closed);
  const netLabels = scene.locator(".scene3d-net-label");
  await expect(netLabels).toHaveCount(6);
  await expect.poll(() => netLabels.evaluateAll((labels) => labels.every((label) => {
    const face = label.previousElementSibling?.getAttribute("points");
    return [...label.closest("svg")!.querySelectorAll(".scene3d-facet")]
      .some((polygon) => polygon.getAttribute("points") === face);
  }))).toBe(true);
  await scene.getByRole("button", { name: "正视" }).click();
  await expect(netLabels.and(scene.locator('[visibility="visible"]'))).toHaveCount(0);
  await scene.getByRole("button", { name: "俯视" }).click();
  await expect(netLabels.and(scene.locator('[visibility="visible"]'))).toHaveCount(6);
  const top = scene.locator('[data-id$=":top-face"]');
  const bottom = scene.locator('[data-id$=":bottom-face"]');
  await page.getByRole("button", { name: "荧光笔" }).click();
  await scene.locator(".scene3d-runtime > svg").click({ position: { x: 12, y: 12 } });
  await expect(scene).not.toHaveClass(/emphasis-focus/);
  await expect(scene.locator(".scene3d-highlight-face.emphasis-focus")).toHaveCount(0);
  await top.click();
  await expect(top).toHaveClass(/emphasis-focus/);
  await bottom.click();
  await expect(bottom).toHaveClass(/emphasis-focus/);
  await page.getByRole("button", { name: "移动", exact: true }).click();
  await slider.press("Home");
  await scene.getByRole("button", { name: "等轴", exact: true }).click();
  await expect(top).toHaveClass(/emphasis-focus/);
  await expect(top).toHaveCSS("fill-opacity", "0.36");
  await expect(top).toHaveCSS("stroke-opacity", "0");
  await expect(bottom).toHaveCSS("fill-opacity", "0");
  await expect(scene.getByText("底面 3 × 3", { exact: true })).toBeHidden();
  await expect(scene.locator(".scene3d-face-hidden").first()).toHaveCSS("stroke-dasharray", "4px, 3px");
  if (process.env.NET_SHOT) await scene.screenshot({ path: `${process.env.NET_SHOT}-marked-box.png` });
  await slider.press("End");
  await scene.getByRole("button", { name: "俯视" }).click();
  await page.getByRole("button", { name: "荧光笔" }).click();
  await top.click();
  await expect(top).not.toHaveClass(/emphasis-focus/);
  await expect(bottom).toHaveClass(/emphasis-focus/);
  await expect(scene).not.toHaveClass(/emphasis-focus/);
  if (process.env.NET_SHOT) await page.locator(".teach-stage").screenshot({ path: `${process.env.NET_SHOT}-cube.png` });
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const events = await takeEvents(page);
  expect(events[0]).toMatchObject({ panel: "solid_3d", shape: "box", size: { x: 3, y: 3, z: 3 }, unfold: { variable: "unfold" } });
  expect(events).toContainEqual(expect.objectContaining({ type: "variable.drag", variable: "unfold", to: 1 }));
  expect(events.at(-1)).toMatchObject({ type: "tool.highlighter", target: { node: "box-1", part: "top-face" }, emphasis: "none" });

  await page.getByRole("link", { name: "看我的课" }).click();
  await page.getByRole("button", { name: "播放我的课" }).click();
  const replay = page.locator(".teach-watch-stage .board-node.kind-scene3d");
  await expect(page.locator(".teach-watch-caption")).toContainText("看完了", { timeout: 25_000 });
  await expect(replay.locator(".scene3d-net-label")).toHaveCount(6);
  await expect(replay.locator('[data-id$=":top-face"]')).not.toHaveClass(/emphasis-focus/);
  await expect(replay.locator('[data-id$=":bottom-face"]')).toHaveClass(/emphasis-focus/);
});

test("face highlighting replaces an old whole-net mark when re-recording the practice card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 780 });
  await loadStudio(page, "rec-reused-net", [
    {
      key: "card-1", title: "打开盒子", kind: "teach",
      takes: [{ take: 1, status: "kept", startedAt: now, durationMs: 6000, text: "把盒子摊平。", events: [
        { t: 0, type: "component.insert", panel: "solid_3d", alias: "box-1", shape: "box", size: { x: 4, y: 3, z: 2 }, unfold: { variable: "unfold" } },
        { t: 800, type: "variable.drag", variable: "unfold", from: 0, to: 1, via: "slider", durationMs: 1300 },
        { t: 2800, type: "view.rotate", node: "box-1", yaw: 0, pitch: Math.PI / 2 },
      ] }],
    },
    {
      key: "card-2", title: "数出六块纸板", kind: "teach",
      takes: [{ take: 1, status: "kept", startedAt: now, durationMs: 6000, text: "一共是 52 平方厘米。", events: [
        { t: 3200, type: "component.insert", panel: "text", alias: "text-1", text: "2 × (4 × 3 + 4 × 2 + 3 × 2) = 52 平方厘米" },
      ] }],
    },
    {
      key: "card-3", title: "轮到你了", kind: "your_turn",
      takes: [{ take: 1, status: "kept", startedAt: now, durationMs: 6000, text: "不用盖子需要多少纸板？", events: [
        { t: 100, type: "component.insert", panel: "text", alias: "text-2", text: "不用盖子需要多少纸板？" },
        { t: 1200, type: "tool.highlighter", target: { node: "box-1", part: "solid" } },
        { t: 1800, type: "your_turn.answer_set", answer: "40", unit: "平方厘米" },
      ] }],
    },
  ]);
  await page.getByRole("button", { name: /^3 · / }).click();
  await page.getByRole("button", { name: "重录我的话", exact: true }).click();
  await page.getByRole("button", { name: "荧光笔", exact: true }).click();
  await page.getByRole("radio", { name: "也看看", exact: true }).click();
  const scene = page.locator(".teach-studio .board-node.kind-scene3d");
  await scene.getByRole("button", { name: "等轴", exact: true }).click();
  await scene.getByRole("button", { name: "俯视", exact: true }).click();
  const labels = scene.locator('.scene3d-net-label[visibility="visible"]');
  await expect(labels).toHaveCount(6);
  const wholeNetMark = scene.locator(".scene3d-facet.emphasis-focus");
  await expect(wholeNetMark).toHaveCount(6);
  for (const [name, face] of [
    ["顶面", "top"], ["底面", "bottom"], ["前面", "front"], ["后面", "back"], ["左侧面", "left"], ["右侧面", "right"],
  ]) {
    const label = labels.filter({ hasText: name });
    await expect(label).toBeInViewport({ ratio: 1 });
    const polygon = scene.locator(`[data-id$=":${face}-face"]`);
    const bounds = (await (face === "bottom" ? polygon : label).boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width * (face === "bottom" ? 0.15 : 0.5), bounds.y + bounds.height / 2);
    await expect(polygon).toHaveClass(/emphasis-supporting/);
    await expect(wholeNetMark).toHaveCount(0);
  }
  const markedFaces = scene.locator(".scene3d-highlight-face.emphasis-supporting");
  await expect(markedFaces).toHaveCount(6);
  await scene.locator('[data-id$=":top-face"]').click();
  await expect(markedFaces).toHaveCount(5);
  await expect(scene.locator('[data-id$=":top-face"]')).not.toHaveClass(/emphasis-supporting/);
  await expect(scene).not.toHaveClass(/emphasis-focus/);
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" })).toBeVisible();
  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].cards[2].takes.at(-1).events, RECORDINGS);
  expect(events).toContainEqual(expect.objectContaining({ type: "tool.highlighter", target: { node: "box-1", part: "solid" }, emphasis: "none" }));
  expect(events).toContainEqual(expect.objectContaining({ type: "your_turn.answer_set", answer: "40" }));
});

test("a cylinder's cap and curved side can be marked separately before and after unfolding", async ({ page }) => {
  await openStudio(page, "rec-cylinder-faces");
  await addSolid(page, async () => {
    await page.getByRole("radio", { name: "圆柱", exact: true }).click();
    await page.getByRole("checkbox", { name: /^展开成平面图/ }).check();
  });
  const scene = page.locator(".teach-studio .board-node.kind-scene3d");
  const top = scene.locator('[data-id$=":solid-top-face"]');
  const bottom = scene.locator('[data-id$=":solid-bottom-face"]');
  const sides = scene.locator('[data-id$=":solid-side-face"]');
  const marks = scene.locator(".scene3d-selectable-face.emphasis-focus");
  await page.getByRole("button", { name: "荧光笔" }).click();
  await top.click();
  await expect(marks).toHaveCount(1);
  await expect(top).toHaveClass(/emphasis-focus/);
  await sides.nth(10).click();
  await expect.poll(async () => await marks.count() === 1 + await sides.count()).toBe(true);
  await top.click();
  await expect(top).not.toHaveClass(/emphasis-focus/);

  await page.getByRole("button", { name: "移动", exact: true }).click();
  await page.locator(".teach-studio .teach-board-sliders input[type=range]").press("End");
  await scene.getByRole("button", { name: "正视", exact: true }).click();
  await expect(scene.locator(".scene3d-selectable-face")).toHaveCount(3);
  await expect(sides).toHaveClass(/emphasis-focus/);
  await page.getByRole("button", { name: "荧光笔" }).click();
  await bottom.click();
  await expect(bottom).toHaveClass(/emphasis-focus/);
  await sides.click();
  await expect(sides).not.toHaveClass(/emphasis-focus/);
  await expect(bottom).toHaveClass(/emphasis-focus/);
  await expect(top).not.toHaveClass(/emphasis-focus/);

  await page.getByRole("button", { name: /^停止/ }).click();
  await page.getByRole("link", { name: "看我的课" }).click();
  await page.getByRole("button", { name: "播放我的课" }).click();
  await expect(page.locator(".teach-watch-caption")).toContainText("看完了", { timeout: 35_000 });
  const replay = page.locator(".teach-watch-stage .scene3d-selectable-face.emphasis-focus");
  await expect(replay).toHaveCount(1);
  await expect(replay).toHaveAttribute("data-id", /:solid-bottom-face$/);
});

test("unfolding a prism exposes independently selectable flat faces", async ({ page }) => {
  await openStudio(page, "rec-prism-faces");
  await addSolid(page, async () => {
    await page.getByRole("button", { name: "棱柱和棱锥", exact: true }).click();
    await page.getByRole("radio", { name: "棱柱", exact: true }).click();
    await page.getByRole("checkbox", { name: /^展开成平面图/ }).check();
  });
  const scene = page.locator(".teach-studio .board-node.kind-scene3d");
  await page.locator(".teach-studio .teach-board-sliders input[type=range]").press("End");
  await scene.getByRole("button", { name: "俯视", exact: true }).click();
  await expect(scene.locator(".scene3d-selectable-face")).toHaveCount(8);
  const first = scene.locator('[data-id$=":solid-side-1-face"]');
  const second = scene.locator('[data-id$=":solid-side-2-face"]');
  await page.getByRole("button", { name: "荧光笔" }).click();
  await first.click();
  await second.click();
  await expect(scene.locator(".scene3d-selectable-face.emphasis-focus")).toHaveCount(2);
  await first.click();
  await expect(first).not.toHaveClass(/emphasis-focus/);
  await expect(second).toHaveClass(/emphasis-focus/);
});

test("marks keep their shading and edges as a folded solid rotates", async ({ page }) => {
  await openStudio(page, "rec-fold-and-turn");
  await addSolid(page, async () => {
    await page.getByRole("radio", { name: "圆柱", exact: true }).click();
    await page.getByRole("checkbox", { name: /^展开成平面图/ }).check();
  });
  const scene = page.locator(".teach-studio .board-node.kind-scene3d");
  const slider = page.locator(".teach-studio .teach-board-sliders input[type=range]");
  const cap = scene.locator('[data-id$=":solid-top-face"]');
  const sides = scene.locator('[data-id$=":solid-side-face"]');
  await slider.press("End");
  await scene.getByRole("button", { name: "正视", exact: true }).click();
  await page.getByRole("button", { name: "荧光笔" }).click();
  await sides.click();
  await cap.click();
  await expect(sides).toHaveClass(/emphasis-focus/);
  await expect(cap).toHaveClass(/emphasis-focus/);
  await page.getByRole("button", { name: "移动", exact: true }).click();
  await slider.press("Home");
  await scene.getByRole("button", { name: "等轴", exact: true }).click();
  const capBefore = await cap.getAttribute("points");
  const svg = (await scene.locator(".scene3d-runtime > svg").boundingBox())!;
  const x = svg.x + svg.width / 2;
  const y = svg.y + svg.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 75, y - 12, { steps: 8 });
  await expect(cap).not.toHaveAttribute("points", capBefore!);
  await expect(cap).toHaveClass(/emphasis-focus/);
  expect(await sides.evaluateAll((faces) => faces.every((face) => face.classList.contains("emphasis-focus")))).toBe(true);
  expect(await sides.evaluateAll((faces) => new Set(faces.map((face) => getComputedStyle(face).fillOpacity)).size)).toBeGreaterThan(1);
  await expect(cap).toHaveCSS("stroke", "rgb(39, 124, 117)");
  await expect(cap).toHaveCSS("stroke-opacity", "1");
  if (process.env.NET_SHOT) await scene.screenshot({ path: `${process.env.NET_SHOT}-marked-cylinder.png` });
  await page.mouse.up();
  await expect(cap).toHaveClass(/emphasis-focus/);
  await expect(sides.first()).toHaveClass(/emphasis-focus/);
});

test("the highlighter preserves the board camera while marking two unfolded solids", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 780 });
  await loadStudio(page, "rec-two-nets", [
    {
      key: "card-1", title: "两个展开图", kind: "teach",
      takes: [{ take: 1, status: "kept", startedAt: now, durationMs: 6000, text: "展开圆柱和棱台。", events: [
        { t: 100, type: "component.insert", panel: "solid_3d", alias: "solid-1", shape: "cylinder", radius: 2, height: 4, unfold: { variable: "unfold" } },
        { t: 800, type: "variable.drag", variable: "unfold", from: 0, to: 1, via: "slider", durationMs: 400 },
        { t: 1600, type: "view.rotate", node: "solid-1", yaw: 0, pitch: 0 },
        { t: 2300, type: "component.insert", panel: "solid_3d", alias: "solid-2", shape: "pyramid", sides: 6, radius: 2, height: 4, topScale: .5, unfold: { variable: "unfold_2" } },
        { t: 3000, type: "variable.drag", variable: "unfold_2", from: 0, to: 1, via: "slider", durationMs: 400 },
        { t: 4000, type: "view.rotate", node: "solid-2", yaw: 0, pitch: Math.PI / 2 },
      ] }],
    },
    {
      key: "card-2", title: "比较两个面", kind: "teach",
      takes: [{ take: 1, status: "kept", startedAt: now, durationMs: 3000, text: "比较两个面。", events: [
        { t: 1000, type: "tool.highlighter", target: { node: "solid-2", part: "solid" } },
      ] }],
    },
  ]);
  await page.getByRole("button", { name: /^2 · / }).click();
  await page.getByRole("button", { name: "重录我的话", exact: true }).click();
  const board = page.getByTestId("teach-board");
  const world = board.locator(".world");
  const highlighter = page.getByRole("button", { name: "荧光笔", exact: true });
  const settledTransform = () => world.evaluate(async (element) => {
    getComputedStyle(element).transform;
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
    return getComputedStyle(element).transform;
  });
  const initialTransform = await settledTransform();
  await highlighter.click();
  expect(await settledTransform()).toBe(initialTransform);

  const cylinder = page.locator('.teach-stage .board-node[data-id$=":solid-1"]');
  const frustum = page.locator('.teach-stage .board-node[data-id$=":solid-2"]');
  await expect(frustum.locator(".scene3d-selectable-face.emphasis-focus")).toHaveCount(8);
  const cylinderTop = cylinder.locator('[data-id$=":solid-top-face"]');
  const frustumTop = frustum.locator('[data-id$=":solid-top-face"]');
  const panTo = async (face: typeof cylinderTop) => {
    const stage = (await board.boundingBox())!;
    const bounds = (await face.boundingBox())!;
    const delta = Math.round(stage.y + stage.height * .4 - bounds.y - bounds.height / 2);
    const x = stage.x + 25;
    const y = delta > 0 ? stage.y + 24 : stage.y + stage.height - 100;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + delta, { steps: 12 });
    await page.mouse.up();
    await expect(face).toBeInViewport({ ratio: 1 });
  };

  await frustumTop.click();
  await expect(frustum.locator(".scene3d-selectable-face.emphasis-focus")).toHaveCount(1);
  await expect(frustumTop).toHaveClass(/emphasis-focus/);
  expect(await settledTransform()).toBe(initialTransform);
  await panTo(cylinderTop);
  await cylinderTop.click();
  await expect(cylinderTop).toHaveClass(/emphasis-focus/);
  await panTo(frustumTop);
  await frustumTop.click();
  await expect(frustum.locator(".scene3d-selectable-face.emphasis-focus")).toHaveCount(0);
  await expect(cylinderTop).toHaveClass(/emphasis-focus/);
  await panTo(cylinderTop);
  await cylinderTop.click();
  await expect(cylinderTop).not.toHaveClass(/emphasis-focus/);
  await expect(highlighter).toHaveAttribute("aria-pressed", "true");
  expect((await settledTransform()).split(",")[0]).toBe(initialTransform.split(",")[0]);
});

test("a truncated pyramid on a triangle, an ellipsoid and a stacked solid", async ({ page }) => {
  await openStudio(page, "rec-shapes");
  await addSolid(page, async () => {
    await page.getByRole("button", { name: "棱柱和棱锥", exact: true }).click();
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
    await page.getByRole("button", { name: "组合体", exact: true }).click();
    await page.getByRole("radio", { name: "圆柱 + 圆锥", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /^展开成平面图/ })).toHaveCount(0);
    await page.getByRole("checkbox", { name: /^切一刀/ }).check();
  });
  const scenes = page.locator(".teach-studio .board-node.kind-scene3d");
  await expect(scenes).toHaveCount(3);
  await expect(scenes.nth(2)).toContainText("上面是高 2 的圆锥");
  await expect(scenes.nth(2).locator(".scene3d-intersection")).toHaveCount(1);
  await expect(scenes.nth(2).locator('.scene3d-selectable-face[data-id$=":solid-top-face"]')).toHaveCount(0);
  await expect(scenes.nth(2).locator('.scene3d-selectable-face[data-id$=":solid-top-bottom-face"]')).toHaveCount(0);
  await expect.poll(() => scenes.nth(2).locator('.scene3d-selectable-face[data-id$=":solid-top-side-face"]').count()).toBeGreaterThan(0);
  if (process.env.NET_SHOT) await page.locator(".teach-stage").screenshot({ path: `${process.env.NET_SHOT}-shapes.png` });
  await page.getByRole("button", { name: /^停止/ }).click();
  const events = await takeEvents(page);
  expect(events.map((event: { shape: string }) => event.shape)).toEqual(["pyramid", "ellipsoid", "composite"]);
  expect(events[0]).toMatchObject({ base: { kind: "triangle", a: 4, b: 3, c: 5 }, topScale: 0.5 });
  expect(events[2]).toMatchObject({ parts: "cylinder_cone", radius: 2, height: 4, topHeight: 2, cut: { variable: "cut" } });
});
