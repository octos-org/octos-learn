import { describe, expect, it } from "vitest";
import {
  availableSelectionTools,
  isSelectionLessonRequest,
  selectionAnswerPresentation,
  selectionToolRegistry,
} from "./selection-tools";

describe("selection tool registry", () => {
  it("is finite, auditable, and never claims it can change the learner source", () => {
    expect(selectionToolRegistry.map((tool) => tool.id)).toEqual([
      "explain",
      "check-and-suggest",
      "generate-plot",
    ]);
    expect(selectionToolRegistry.filter((tool) =>
      tool.action === "local-enhancement",
    ).every((tool) => tool.changesSource === false)).toBe(true);
  });

  it("chooses and freezes the answer surface before generation", () => {
    expect(selectionAnswerPresentation("check-and-suggest", "检查一下", true))
      .toBe("board-writing");
    expect(selectionAnswerPresentation("generate-plot", "生成函数图像", true))
      .toBe("card");
    expect(selectionAnswerPresentation("explain", "解释这部分", true))
      .toBe("card");
    expect(selectionAnswerPresentation(
      "custom-question",
      "将其更改为可以绘制函数图像的形式",
      true,
    )).toBe("board-writing");
    expect(selectionAnswerPresentation("custom-question", "现在画出函数图像", true))
      .toBe("card");
    expect(selectionAnswerPresentation("check-and-suggest", "检查一下", false))
      .toBe("card");
  });

  it("offers plotting only for recognized math or an explicitly selected math fragment", () => {
    expect(availableSelectionTools("unknown").map((tool) => tool.id))
      .not.toContain("generate-plot");
    expect(availableSelectionTools("math").map((tool) => tool.id))
      .toContain("generate-plot");
    expect(availableSelectionTools("unknown", ["math-fragment"]).map((tool) => tool.id))
      .toContain("generate-plot");
    expect(availableSelectionTools("geometry", ["plot", "plot-point"]).map((tool) => tool.id))
      .not.toContain("generate-plot");
    expect(availableSelectionTools("unknown", ["geometry-arc"]).map((tool) => tool.id))
      .not.toContain("generate-plot");
    expect(selectionToolRegistry.find((tool) => tool.id === "generate-plot"))
      .toMatchObject({
        requestContentKind: "math",
      });
  });

  it("classifies a transcribed request to teach the selected content as a lesson", () => {
    expect(isSelectionLessonRequest("老师，请结合这个公式给我上一课")).toBe(true);
    expect(isSelectionLessonRequest("围绕这部分讲一节课")).toBe(true);
    expect(isSelectionLessonRequest("把它做成一门课程")).toBe(true);
    expect(isSelectionLessonRequest("请解释这个公式为什么成立")).toBe(false);
    expect(isSelectionLessonRequest("这节课刚才讲了什么？")).toBe(false);
  });
});
