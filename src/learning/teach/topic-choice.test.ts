import { describe, expect, it } from "vitest";
import { searchStarTopics, topicFromChoice } from "./topic-choice";

const english = {
  "mt_slope": "Slope of a line",
  "mt_plot": "Plotting Linear Graphs",
  "mt_sine": "Sine and the unit circle",
};
const chinese = { "mt_slope": "直线的斜率", "mt_plot": "画一次函数图像", "mt_sine": "单位圆与正弦" };

describe("star topic search", () => {
  it("finds stars by name in any language and shows the learner's language", () => {
    expect(searchStarTopics("slope", [english, chinese], chinese, new Set())).toEqual([
      { starTopicId: "mt_slope", name: "直线的斜率", lit: false },
    ]);
    expect(searchStarTopics("斜率", [english, chinese], english, new Set(["mt_slope"]))).toEqual([
      { starTopicId: "mt_slope", name: "Slope of a line", lit: true },
    ]);
  });

  it("matches word prefixes and ranks lit stars first among equal matches", () => {
    const results = searchStarTopics("lin", [english], english, new Set(["mt_plot"]));
    expect(results.map((result) => result.starTopicId)).toEqual(["mt_plot", "mt_slope"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchStarTopics("  ", [english], english, new Set())).toEqual([]);
  });
});

describe("topic choice", () => {
  it("classifies a chosen star as lit or unlit", () => {
    expect(topicFromChoice({ kind: "star", starTopicId: "mt_slope", name: "Slope of a line", lit: true }))
      .toEqual({ text: "Slope of a line", type: "on_map_lit", starTopicId: "mt_slope" });
    expect(topicFromChoice({ kind: "star", starTopicId: "mt_slope", name: "Slope of a line", lit: false }).type).toBe("on_map_unlit");
  });

  it("classifies a free topic by whether the learner says it is math", () => {
    expect(topicFromChoice({ kind: "free", text: " Prime numbers in nature ", isMath: true }))
      .toEqual({ text: "Prime numbers in nature", type: "math_off_map" });
    expect(topicFromChoice({ kind: "free", text: "Dinosaurs", isMath: false }).type).toBe("other");
  });
});
