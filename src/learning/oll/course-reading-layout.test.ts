import { describe, expect, it } from "vitest";
import { computeBoardLayout } from "octos-lesson-language/web-runtime";

type BoardState = Parameters<typeof computeBoardLayout>[0];

function boardWithNodes(nodes: Record<string, unknown>): BoardState {
  return {
    board_id: "saved-board",
    revision: 8,
    nodes,
    groups: {},
    connections: {},
    variables: {},
    focus: [],
  } as unknown as BoardState;
}

describe("course reading layout", () => {
  it("reflows an existing visual and derivation chain into two stable lanes", () => {
    const board = boardWithNodes({
      circle: {
        id: "circle",
        kind: "geometry",
        region_id: "course-one",
        content: { title: "完整圆周" },
        placement: { relation: "new_region" },
      },
      arcFormula: {
        id: "arcFormula",
        kind: "math",
        region_id: "course-one",
        content: { latex: "l_1=2\\pi r/360=\\pi r/180" },
        placement: { relation: "new_region" },
      },
      circumference: {
        id: "circumference",
        kind: "math",
        region_id: "course-one",
        content: { latex: "C=2\\pi r" },
        placement: {
          relation: "below",
          anchor: "circle",
          align: "center",
        },
      },
      result: {
        id: "result",
        kind: "math",
        region_id: "course-one",
        content: { latex: "l=n\\pi r/180" },
        placement: {
          relation: "below",
          anchor: "circumference",
          align: "center",
        },
      },
    });
    const layout = computeBoardLayout(board, {
      circle: { width: 380, height: 300 },
      arcFormula: { width: 620, height: 96 },
      circumference: { width: 360, height: 96 },
      result: { width: 440, height: 96 },
    }, {
      regions: {
        "course-one": {
          x: 394,
          y: 90,
          reservedWidth: 886,
          flow: "reading",
        },
      },
    });

    expect(layout.nodes.circle).toEqual({
      x: 394,
      y: 120,
      width: 380,
      height: 300,
    });
    expect([
      layout.nodes.arcFormula?.x,
      layout.nodes.circumference?.x,
      layout.nodes.result?.x,
    ]).toEqual([828, 828, 828]);
    expect([
      layout.nodes.arcFormula?.y,
      layout.nodes.circumference?.y,
      layout.nodes.result?.y,
    ]).toEqual([120, 244, 368]);
    expect(layout.nodes.arcFormula?.width).toBe(452);
    expect(
      Math.max(...Object.values(layout.nodes).map((node) => node.x + node.width)),
    ).toBeLessThanOrEqual(394 + 886);
  });

  it("keeps independently persisted course regions separated after reflow", () => {
    const board = boardWithNodes({
      oldVisual: {
        id: "oldVisual",
        kind: "scene3d",
        region_id: "old-course",
        content: {},
        placement: { relation: "new_region" },
      },
      oldExplanation: {
        id: "oldExplanation",
        kind: "math",
        region_id: "old-course",
        content: { latex: "x" },
        placement: { relation: "below", anchor: "oldVisual" },
      },
      nextVisual: {
        id: "nextVisual",
        kind: "geometry",
        region_id: "next-course",
        content: {},
        placement: { relation: "new_region" },
      },
      nextExplanation: {
        id: "nextExplanation",
        kind: "text",
        region_id: "next-course",
        content: { text: "下一节课" },
        placement: { relation: "right_of", anchor: "nextVisual" },
      },
    });
    const layout = computeBoardLayout(board, {
      oldVisual: { width: 460, height: 360 },
      oldExplanation: { width: 680, height: 136 },
      nextVisual: { width: 380, height: 300 },
      nextExplanation: { width: 440, height: 106 },
    }, {
      regions: {
        "old-course": {
          x: 394,
          y: 90,
          reservedWidth: 886,
          flow: "reading",
        },
        "next-course": {
          x: 1_754,
          y: 90,
          reservedWidth: 886,
          flow: "reading",
        },
      },
    });

    const oldRight = Math.max(
      layout.nodes.oldVisual!.x + layout.nodes.oldVisual!.width,
      layout.nodes.oldExplanation!.x + layout.nodes.oldExplanation!.width,
    );
    const nextLeft = Math.min(
      layout.nodes.nextVisual!.x,
      layout.nodes.nextExplanation!.x,
    );
    expect(oldRight).toBeLessThanOrEqual(394 + 886);
    expect(nextLeft).toBe(1_754);
    expect(oldRight).toBeLessThan(nextLeft);
  });

  it("preserves intentional overlays inside an interactive visual", () => {
    const board = boardWithNodes({
      visual: {
        id: "visual",
        kind: "geometry",
        region_id: "course",
        content: {},
        placement: { relation: "new_region" },
      },
      annotation: {
        id: "annotation",
        kind: "note",
        region_id: "course",
        content: { text: "圆心" },
        placement: { relation: "overlay", anchor: "visual" },
      },
    });
    const layout = computeBoardLayout(board, {
      visual: { width: 380, height: 300 },
      annotation: { width: 120, height: 72 },
    }, {
      regions: {
        course: {
          x: 394,
          y: 90,
          reservedWidth: 886,
          flow: "reading",
        },
      },
    });

    expect(layout.nodes.annotation).toEqual({
      x: 418,
      y: 144,
      width: 120,
      height: 72,
    });
  });
});
