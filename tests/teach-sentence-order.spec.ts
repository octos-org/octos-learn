import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { installTestAccount } from "./helpers/course-test-account";

// One card, said in four sentences, with board actions between and during
// them. Playback must keep the order they were recorded in.
const now = "2026-11-06T08:00:00.000Z";
const recording = {
  schema: "octos.learner-recording.v1", id: "rec-order", createdAt: now, updatedAt: now,
  topic: { text: "两点之间", type: "math_off_map" }, goals: ["按顺序看懂两个点"],
  cards: [{
    key: "card-1", title: "两个点", kind: "teach",
    takes: [{
      take: 1, status: "kept", startedAt: now, durationMs: 9_000,
      asrText: "这是一个坐标网格。现在放第二个点。它往上走。然后往右走。",
      text: "这是一个坐标网格。现在放第二个点。它往上走。然后往右走。",
      speechSpanMs: [0, 7_000],
      segments: [
        { startMs: 0, endMs: 1_000, text: "这是一个坐标网格。" },
        { startMs: 2_000, endMs: 3_000, text: "现在放第二个点。" },
        { startMs: 4_000, endMs: 5_000, text: "它往上走。" },
        { startMs: 6_000, endMs: 7_000, text: "然后往右走。" },
      ],
      events: [
        { t: 500, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
        { t: 1_500, type: "point_tool.place", node: "grid", point: "point-a", x: 1, y: 2, label: "Alpha" },
        { t: 2_500, type: "point_tool.place", node: "grid", point: "point-b", x: 4, y: 8, label: "Beta" },
      ],
    }],
  }],
};

test("a recorded card plays its sentences and board actions in the order they were recorded", async ({ page }) => {
  await installTestAccount(page);
  await page.addInitScript((draft) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem("octos-learn:learner-recordings:v1:curated-learner", JSON.stringify([draft]));
  }, recording);
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${recording.id}/watch`);
  await expect(page.getByText("第 1 张，共 1 张")).toBeVisible();

  // Sample what is said and what the board shows while the lesson plays, without sound.
  const sound = page.getByRole("button", { name: "关掉声音" });
  if (await sound.isVisible().catch(() => false)) await sound.click();
  await page.getByRole("button", { name: "播放我的课" }).click();
  const timeline = await page.evaluate(async () => {
    const samples: string[] = [];
    const stage = document.querySelector(".teach-watch-stage")!;
    const caption = document.querySelector(".teach-watch-caption")!;
    for (let tick = 0; tick < 300; tick += 1) {
      const board = stage.textContent ?? "";
      const sample = `${caption.textContent?.trim() || "—"} | alpha:${board.includes("Alpha")} beta:${board.includes("Beta")}`;
      if (sample !== samples.at(-1)) samples.push(sample);
      if (caption.textContent?.includes("看完了")) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return samples;
  });
  console.log(timeline.join("\n"));

  const first = (predicate: (sample: string) => boolean) => timeline.findIndex(predicate);
  const said = (words: string) => first((sample) => sample.startsWith(words));
  // The first point was placed in the pause after the first sentence: before the second sentence is said.
  expect(first((sample) => sample.includes("alpha:true"))).toBeGreaterThan(-1);
  expect(first((sample) => sample.includes("alpha:true"))).toBeLessThan(said("现在放第二个点"));
  // The second point was placed while the second sentence was said: not before it.
  expect(first((sample) => sample.includes("beta:true"))).toBeGreaterThanOrEqual(said("现在放第二个点"));
  expect(said("这是一个坐标网格")).toBeLessThan(said("现在放第二个点"));
});

// Three strokes: the first written during sentence 1, the second in the pause after it, the third during sentence 2.
const strokes = ["M5 5L40 5", "M5 20L40 20", "M5 35L40 35"];
const inkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 40" width="45" height="40" data-oll-ink-selection="1">${
  strokes.map((d, index) => `<g data-oll-stroke="${index}"><path d="${d}" fill="none" stroke="#1b2457" stroke-width="3"/></g>`).join("")}</svg>`;
const inkRecording = {
  ...recording, id: "rec-ink",
  cards: [{
    key: "card-1", title: "三条线", kind: "teach",
    ink: [{ snapshotId: "ink-snap:rec-ink-card-1-t1@v1", sha256: createHash("sha256").update(inkSvg).digest("hex"), selections: [], take: 1, strokeTimesMs: [300, 1_500, 2_300] }],
    takes: [{
      take: 1, status: "kept", startedAt: now, durationMs: 4_000,
      asrText: "先画第一条。再画第三条。", text: "先画第一条。再画第三条。", speechSpanMs: [0, 3_000],
      segments: [{ startMs: 0, endMs: 1_000, text: "先画第一条。" }, { startMs: 2_000, endMs: 3_000, text: "再画第三条。" }],
      events: [],
    }],
  }],
};

test("handwriting plays stroke by stroke where it was written among the sentences", async ({ page }) => {
  await installTestAccount(page);
  await page.addInitScript(({ draft, svg }) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem("octos-learn:learner-recordings:v1:curated-learner", JSON.stringify([draft]));
    localStorage.setItem("octos-learn:learner-ink:v1:curated-learner", JSON.stringify({ "ink-snap:rec-ink-card-1-t1@v1": { svg, width: 45, height: 40 } }));
  }, { draft: inkRecording, svg: inkSvg });
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${inkRecording.id}/watch`);
  await expect(page.getByText("第 1 张，共 1 张")).toBeVisible();
  const sound = page.getByRole("button", { name: "关掉声音" });
  if (await sound.isVisible().catch(() => false)) await sound.click();
  await page.getByRole("button", { name: "播放我的课" }).click();
  const timeline = await page.evaluate(async () => {
    const samples: string[] = [];
    const stage = document.querySelector(".teach-watch-stage")!;
    const caption = document.querySelector(".teach-watch-caption")!;
    for (let tick = 0; tick < 300; tick += 1) {
      const sample = `${caption.textContent?.trim() || "—"} | strokes:${stage.querySelectorAll(".lesson-ink path").length}`;
      if (sample !== samples.at(-1)) samples.push(sample);
      if (caption.textContent?.includes("看完了")) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return samples;
  });
  console.log(timeline.join("\n"));
  const first = (predicate: (sample: string) => boolean) => timeline.findIndex(predicate);
  const said = (words: string) => first((sample) => sample.startsWith(words));
  // One stroke while the first sentence is said, the second before the next sentence, the third with it.
  expect(timeline.some((sample) => sample.startsWith("先画第一条") && sample.endsWith("strokes:1"))).toBe(true);
  expect(first((sample) => sample.endsWith("strokes:2"))).toBeLessThan(said("再画第三条"));
  expect(first((sample) => sample.endsWith("strokes:3"))).toBeGreaterThanOrEqual(said("再画第三条"));
});

test("strokes written in the studio keep when they were written, numbered in drawing order", async ({ page }) => {
  await installTestAccount(page);
  const empty = { ...recording, id: "rec-draw", cards: [{ key: "card-1", title: "写三笔", kind: "teach", takes: [] }] };
  await page.addInitScript((draft) => {
    localStorage.setItem("octos-locale", "zh-CN");
    localStorage.setItem("octos-learn:learner-recordings:v1:curated-learner", JSON.stringify([draft]));
  }, empty);
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${empty.id}`);
  await page.getByRole("button", { name: "录第 1 张" }).click();
  await page.getByRole("button", { name: /^笔/ }).click();
  const board = page.locator(".teach-studio .oll-board-runtime, .teach-studio [class*=board]").first();
  const box = (await board.boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  for (const [index, y] of [0.3, 0.4, 0.5].entries()) {
    if (index) await page.waitForTimeout(700);
    const from = at(0.3, y), to = at(0.6, y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) await page.mouse.move(from.x + (to.x - from.x) * step / 8, from.y);
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^停止/ }).click();
  await expect(page.getByRole("button", { name: "重录我的话" }).first()).toBeVisible();
  const saved = await page.evaluate(() => {
    const [draft] = JSON.parse(localStorage.getItem("octos-learn:learner-recordings:v1:curated-learner")!);
    const ink = draft.cards[0].ink[0];
    const svg = JSON.parse(localStorage.getItem("octos-learn:learner-ink:v1:curated-learner")!)[ink.snapshotId].svg as string;
    return { times: ink.strokeTimesMs as number[], take: ink.take, groups: (svg.match(/data-oll-stroke="\d+"/g) ?? []).length };
  });
  console.log(JSON.stringify(saved));
  expect(saved.take).toBe(1);
  expect(saved.groups).toBe(3);
  expect(saved.times).toHaveLength(3);
  // Written about 0.7 s apart, in order, within the take.
  expect(saved.times[1]! - saved.times[0]!).toBeGreaterThan(500);
  expect(saved.times[2]! - saved.times[1]!).toBeGreaterThan(500);
});

test("the script editor moves an action between sentences, refuses one that would come before what it needs, and opens the lesson at a sentence", async ({ page }) => {
  await installTestAccount(page);
  await page.addInitScript((draft) => {
    localStorage.setItem("octos-locale", "zh-CN");
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("octos-learn:learner-recordings:v1:curated-learner", JSON.stringify([draft]));
      sessionStorage.setItem("seeded", "1");
    }
  }, recording);
  await page.route("**/api/learn/lessons**", (route) => route.fulfill({ json: { lessons: [] } }));
  await page.goto(`/teach/${recording.id}`);
  const script = page.locator(".teach-script");
  await expect(script.getByRole("textbox", { name: "第 4 句" })).toHaveValue("然后往右走。");

  // Point B was placed while sentence 2 was said; move it after the last sentence.
  await script.getByRole("button", { name: "标出点 Beta" }).click();
  await script.getByRole("button", { name: "放到这里" }).last().click();
  await expect(script.getByRole("button", { name: "放到这里" })).toHaveCount(0);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("octos-learn:learner-recordings:v1:curated-learner")!)[0].cards[0].takes[0]);
  const take = await stored();
  expect(take.events.at(-1).label).toBe("Beta");
  expect(take.events.at(-1).t).toBeGreaterThan(7_000);

  // The grid cannot go after the points placed on it.
  await script.getByRole("button", { name: "放上坐标网格" }).click();
  await script.getByRole("button", { name: "放到这里" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "不能放在那里" })).toBeVisible();
  expect((await stored()).events[0].type).toBe("component.insert");

  // Watch from sentence 2: the lesson starts there.
  await script.getByRole("link", { name: "从这句开始看" }).nth(1).click();
  await expect(page).toHaveURL(/\/watch\?from=card-1-s2$/);
  const sound = page.getByRole("button", { name: "关掉声音" });
  if (await sound.isVisible().catch(() => false)) await sound.click();
  await page.getByRole("button", { name: "播放我的课" }).click();
  const firstWords = await page.evaluate(async () => {
    const caption = document.querySelector(".teach-watch-caption")!;
    for (let tick = 0; tick < 100; tick += 1) {
      const words = caption.textContent?.trim();
      if (words) return words;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return "";
  });
  // The lesson starts at sentence 2, not at the beginning.
  expect(firstWords.startsWith("现在放第二个点")).toBe(true);
});
