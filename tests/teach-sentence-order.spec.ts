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
