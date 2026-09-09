import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INK_SELECTION_FORMAT,
  INK_SELECTION_FORMAT_VERSION,
  type InkSelectionSnapshot,
} from "octos-lesson-language/ink-runtime";
import { SelectionEnhancementLayer } from "./selection-enhancement-layer";
import type { SelectionEnhancementArtifact } from "./selection-enhancements";
import type { WhiteboardQuestionRecord } from "./whiteboard-questions";

vi.mock("octos-lesson-language/web-runtime", () => ({
  plotPathData: vi.fn(() => ""),
  renderScene3d: vi.fn((parent: HTMLElement) => {
    const scene = document.createElement("div");
    scene.textContent = "可旋转三维函数图";
    parent.append(scene);
  }),
  sampleImplicitPlotExpression: vi.fn(() => []),
  samplePlotExpression: vi.fn(() => []),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const artifact: SelectionEnhancementArtifact = {
  profile: "octos.selection-enhancement",
  version: "0.2",
  turn_id: "turn-invalid",
  created_at: "2026-08-15T10:00:00.000Z",
  source: {
    source_id: "source-1",
    document_id: "ink-1",
    document_version: 1,
    bounds: { x: 10, y: 20, width: 120, height: 70 },
    checksum: { algorithm: "sha-256", value: "a".repeat(64) },
  },
  board: { board_id: "board-1", revision: 4, targets: [] },
  tool_id: "explain",
  interpretation: { kind: "math", content: "y=x²", confidence: "high" },
  response: {
    kind: "explanation",
    title: "原来的说明",
    text: "这条说明不会被悄悄重新指向别的对象。",
  },
};

function dispatchPointerEvent(
  target: Element,
  type: string,
  { pointerId, clientX, clientY }: {
    pointerId: number;
    clientX: number;
    clientY: number;
  },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
    button: { value: 0 },
  });
  fireEvent(target, event);
}

function expectCardsApart(left: HTMLElement, right: HTMLElement): void {
  const leftRect = {
    x: Number.parseFloat(left.style.left),
    y: Number.parseFloat(left.style.top),
    width: Number.parseFloat(left.style.width),
    height: 300 * Number(left.dataset.cardScale ?? 1),
  };
  const rightRect = {
    x: Number.parseFloat(right.style.left),
    y: Number.parseFloat(right.style.top),
    width: Number.parseFloat(right.style.width),
    height: 300 * Number(right.dataset.cardScale ?? 1),
  };
  const overlaps = leftRect.x < rightRect.x + rightRect.width + 24
    && leftRect.x + leftRect.width + 24 > rightRect.x
    && leftRect.y < rightRect.y + rightRect.height + 24
    && leftRect.y + leftRect.height + 24 > rightRect.y;
  expect(overlaps).toBe(false);
}

describe("SelectionEnhancementLayer", () => {
  it("draws a thick arrow that follows the live source and a dragged card", () => {
    const source: InkSelectionSnapshot = {
      format: INK_SELECTION_FORMAT,
      format_version: INK_SELECTION_FORMAT_VERSION,
      source_id: artifact.source.source_id,
      document_id: artifact.source.document_id,
      document_version: artifact.source.document_version,
      created_at: "2026-09-08T12:00:00.000Z",
      bounds: artifact.source.bounds,
      region: {
        kind: "rectangle",
        closed: true,
        points: [
          { x: 10, y: 20 },
          { x: 130, y: 20 },
          { x: 130, y: 90 },
          { x: 10, y: 90 },
        ],
      },
      component_ids: ["stroke:source-1"],
      checksum: artifact.source.checksum,
      svg: '<svg data-oll-ink-selection="1"><path d="M10 20L130 90"/></svg>',
    };
    const onLayoutChange = vi.fn();
    const layout = {
      x: 160,
      y: 20,
      scale: 1,
      minimized: false,
      manually_positioned: false,
    };
    const { container, rerender } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[source]}
        cardLayouts={{ [artifact.turn_id]: layout }}
        currentSourceBoundsById={new Map([[source.source_id, source.bounds]])}
        clientToBoardPoint={(point) => point}
        currentDocumentVersion={1}
        onCardLayoutChange={onLayoutChange}
        onDelete={vi.fn()}
      />,
    );
    const path = container.querySelector<SVGPathElement>(
      ".learning-selection-source-path",
    );
    expect(path?.getAttribute("stroke-width")).toBe("3");
    expect(path?.getAttribute("d")).toMatch(/^M .* H .* Q .* V .* Q .* H /);
    expect(path?.getAttribute("marker-end"))
      .toMatch(/^url\(#selection-source-arrow-/);
    expect(container.querySelector<SVGElement>(
      ".learning-selection-source-link",
    )?.dataset.sourceSide).toBe("right");
    expect(container.querySelector<SVGElement>(
      ".learning-selection-source-link",
    )?.dataset.cardSide).toBe("left");
    expect(container.querySelector("marker polyline")?.getAttribute("points"))
      .toBe("2,1 10,5 2,9");

    const card = container.querySelector<HTMLElement>(
      ".learning-selection-enhancement",
    )!;
    dispatchPointerEvent(card, "pointerdown", {
      pointerId: 7,
      clientX: 200,
      clientY: 100,
    });
    dispatchPointerEvent(card, "pointermove", {
      pointerId: 7,
      clientX: 260,
      clientY: 140,
    });
    expect(card.dataset.cardX).toBe("220");
    expect(card.dataset.cardY).toBe("60");
    dispatchPointerEvent(card, "pointerup", {
      pointerId: 7,
      clientX: 260,
      clientY: 140,
    });
    expect(onLayoutChange).toHaveBeenLastCalledWith(artifact.turn_id, {
      ...layout,
      x: 220,
      y: 60,
      manually_positioned: true,
    });

    rerender(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[source]}
        cardLayouts={{
          [artifact.turn_id]: {
            ...layout,
            x: 220,
            y: 60,
            manually_positioned: true,
          },
        }}
        currentSourceBoundsById={new Map([[
          source.source_id,
          { ...source.bounds, x: 90, y: 60 },
        ]])}
        clientToBoardPoint={(point) => point}
        currentDocumentVersion={2}
        onCardLayoutChange={onLayoutChange}
        onDelete={vi.fn()}
      />,
    );
    const movedLink = container.querySelector<SVGElement>(
      ".learning-selection-source-link",
    );
    expect(movedLink?.dataset.sourceX).toBe("210");
    expect(Number(movedLink?.dataset.sourceY)).toBeGreaterThanOrEqual(60);
  });

  it("moves connector endpoints to the nearest sides as relative positions change", () => {
    const source: InkSelectionSnapshot = {
      format: INK_SELECTION_FORMAT,
      format_version: INK_SELECTION_FORMAT_VERSION,
      source_id: artifact.source.source_id,
      document_id: artifact.source.document_id,
      document_version: 1,
      created_at: "2026-09-08T12:00:00.000Z",
      bounds: { x: 100, y: 100, width: 120, height: 70 },
      region: {
        kind: "rectangle",
        closed: true,
        points: [{ x: 100, y: 100 }, { x: 220, y: 100 }, { x: 220, y: 170 }, { x: 100, y: 170 }],
      },
      component_ids: ["stroke:source-1"],
      checksum: artifact.source.checksum,
      svg: '<svg data-oll-ink-selection="1"><path/></svg>',
    };
    const renderAt = (x: number, y: number) => (
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[source]}
        cardLayouts={{
          [artifact.turn_id]: { x, y, scale: 1, minimized: false, manually_positioned: true },
        }}
        currentSourceBoundsById={new Map([[source.source_id, source.bounds]])}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />
    );
    const { container, rerender } = render(renderAt(260, 100));
    const link = () => container.querySelector<SVGElement>(
      ".learning-selection-source-link",
    );
    expect(link()?.dataset.sourceSide).toBe("right");
    expect(link()?.dataset.cardSide).toBe("left");

    rerender(renderAt(-270, 100));
    expect(link()?.dataset.sourceSide).toBe("left");
    expect(link()?.dataset.cardSide).toBe("right");

    rerender(renderAt(90, -320));
    expect(link()?.dataset.sourceSide).toBe("top");
    expect(link()?.dataset.cardSide).toBe("bottom");

    rerender(renderAt(90, 220));
    expect(link()?.dataset.sourceSide).toBe("bottom");
    expect(link()?.dataset.cardSide).toBe("top");
  });

  it("connects to the measured bottom edge of a card above its source", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("learning-selection-enhancement") ? 420 : 0;
      });
    const source: InkSelectionSnapshot = {
      format: INK_SELECTION_FORMAT,
      format_version: INK_SELECTION_FORMAT_VERSION,
      source_id: artifact.source.source_id,
      document_id: artifact.source.document_id,
      document_version: 1,
      created_at: "2026-09-08T12:00:00.000Z",
      bounds: { x: 100, y: 100, width: 120, height: 70 },
      region: {
        kind: "rectangle",
        closed: true,
        points: [{ x: 100, y: 100 }, { x: 220, y: 100 }, { x: 220, y: 170 }, { x: 100, y: 170 }],
      },
      component_ids: ["stroke:source-1"],
      checksum: artifact.source.checksum,
      svg: '<svg data-oll-ink-selection="1"><path/></svg>',
    };
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[source]}
        cardLayouts={{
          [artifact.turn_id]: {
            x: 0,
            y: -350,
            scale: 1,
            minimized: false,
            manually_positioned: true,
          },
        }}
        currentSourceBoundsById={new Map([[source.source_id, source.bounds]])}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );

    const link = container.querySelector<SVGElement>(
      ".learning-selection-source-link",
    );
    expect(link?.dataset.cardSide).toBe("bottom");
    expect(link?.dataset.cardY).toBe("70");
  });

  it("lets text selection start in card content without dragging the card", () => {
    const onLayoutChange = vi.fn();
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[]}
        currentDocumentVersion={1}
        clientToBoardPoint={(point) => point}
        onCardLayoutChange={onLayoutChange}
        onDelete={vi.fn()}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      ".learning-selection-enhancement",
    )!;
    const text = screen.getByText("这条说明不会被悄悄重新指向别的对象。");
    dispatchPointerEvent(text, "pointerdown", { pointerId: 8, clientX: 100, clientY: 100 });
    dispatchPointerEvent(text, "pointermove", { pointerId: 8, clientX: 180, clientY: 140 });
    dispatchPointerEvent(text, "pointerup", { pointerId: 8, clientX: 180, clientY: 140 });

    expect(card.dataset.cardX).toBe("160");
    expect(card.dataset.cardY).toBe("20");
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it("reserves a loading card only for card-bound selection answers", () => {
    const pending = {
      id: "pending-card",
      sessionId: "learn-1",
      text: "请画出函数图像",
      origin: "selection" as const,
      createdAt: "2026-09-07T10:00:00.000Z",
      status: "pending" as const,
      source: {
        sourceId: "source-1",
        bounds: { x: 10, y: 20, width: 120, height: 70 },
      },
      answerPresentation: "card" as const,
    };
    const { rerender } = render(
      <SelectionEnhancementLayer
        artifacts={[]}
        sources={[]}
        questions={[pending]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent)
      .toContain("正在生成小章鱼辅助");

    rerender(
      <SelectionEnhancementLayer
        artifacts={[]}
        sources={[]}
        questions={[{ ...pending, answerPresentation: "board-writing" }]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText("正在生成小章鱼辅助")).toBeNull();
  });

  it("renders LaTeX throughout generated auxiliary card text", () => {
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[{
          ...artifact,
          response: {
            kind: "explanation",
            title: "函数 $y=x^2$",
            text: "当 $x=2$ 时，得到 $y=4$。",
            items: ["横坐标是 $x$。"],
          },
        }]}
        sources={[]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );

    const card = container.querySelector(".learning-selection-enhancement");
    expect(card?.getAttribute("data-enhancement-id")).toBe(artifact.turn_id);
    expect(card?.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
    expect(card?.textContent).not.toContain("$");
    expect(card?.textContent).toContain("函数");
  });

  it("keeps an invalidated result visible and labels the missing board target", () => {
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[]}
        currentDocumentVersion={1}
        invalidTargetTurnIds={new Set([artifact.turn_id])}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("引用的白板对象已失效，请重新选择")).toBeTruthy();
    expect(screen.getByText("原来的说明")).toBeTruthy();
    expect(container.querySelector(".is-invalid-target")).toBeTruthy();
  });

  it("minimizes an explanation to a nearby question button and restores it", () => {
    const onDelete = vi.fn();
    render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[]}
        currentDocumentVersion={1}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "最小化这条辅助内容",
    }));

    expect(screen.queryByText("原来的说明")).toBeNull();
    const restore = screen.getByRole("button", {
      name: "展开小章鱼辅助：原来的说明",
    });
    expect(restore.textContent).toBe("?");

    fireEvent.click(restore);

    expect(screen.getByText("原来的说明")).toBeTruthy();
    expect(screen.getByRole("button", {
      name: "删除这条辅助内容",
    })).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("resizes the card and all of its contents from the corner handle", () => {
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      ".learning-selection-enhancement",
    );
    const handle = screen.getByRole("button", {
      name: "调整辅助卡片大小，当前 100%",
    });
    expect(card?.style.width).toBe("330px");
    expect(card?.style.fontSize).toBe("13px");

    dispatchPointerEvent(handle, "pointerdown", {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    dispatchPointerEvent(handle, "pointermove", {
      pointerId: 1,
      clientX: 210,
      clientY: 210,
    });

    expect(Number.parseFloat(card?.style.width ?? "0")).toBeGreaterThan(330);
    expect(Number.parseFloat(card?.style.fontSize ?? "0")).toBeGreaterThan(13);
    expect(card?.dataset.cardScale).toBe("1.50");
    expect(screen.getByRole("button", {
      name: "调整辅助卡片大小，当前 150%",
    })).toBeTruthy();

    fireEvent.doubleClick(screen.getByRole("button", {
      name: "调整辅助卡片大小，当前 150%",
    }));
    expect(card?.dataset.cardScale).toBe("1.00");
  });

  it("places repeated results in separate open whiteboard areas", () => {
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[
          { ...artifact, turn_id: "turn-first", created_at: "2026-08-15T10:00:00.000Z" },
          { ...artifact, turn_id: "turn-second", created_at: "2026-08-15T10:01:00.000Z" },
        ]}
        sources={[]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );
    const cards = [...container.querySelectorAll<HTMLElement>(
      ".learning-selection-enhancement",
    )];
    expect(cards).toHaveLength(2);
    expectCardsApart(cards[0]!, cards[1]!);

    const firstResize = screen.getAllByRole("button", {
      name: "调整辅助卡片大小，当前 100%",
    })[0]!;
    dispatchPointerEvent(firstResize, "pointerdown", {
      pointerId: 8,
      clientX: 100,
      clientY: 100,
    });
    dispatchPointerEvent(firstResize, "pointermove", {
      pointerId: 8,
      clientX: 210,
      clientY: 210,
    });

    expectCardsApart(cards[0]!, cards[1]!);
  });

  it("does not overlap results when the same strokes are selected again", () => {
    const svg = '<svg data-oll-ink-selection="1"><path d="M0 0L10 10"/></svg>';
    const snapshots: InkSelectionSnapshot[] = ["source-1", "source-2"].map(
      (sourceId, index) => ({
        format: INK_SELECTION_FORMAT,
        format_version: INK_SELECTION_FORMAT_VERSION,
        source_id: sourceId,
        document_id: "ink-1",
        document_version: 2 + index,
        created_at: `2026-08-15T10:0${index}:00.000Z`,
        bounds: { x: 10 - index * 2, y: 20, width: 120 + index * 4, height: 70 },
        region: {
          kind: "rectangle",
          closed: true,
          points: [
            { x: 10 - index * 2, y: 20 },
            { x: 130 + index * 2, y: 20 },
            { x: 130 + index * 2, y: 90 },
            { x: 10 - index * 2, y: 90 },
          ],
        },
        component_ids: ["stroke:shared"],
        checksum: { algorithm: "sha-256", value: String(index + 1).repeat(64) },
        svg,
      }),
    );
    const secondArtifact: SelectionEnhancementArtifact = {
      ...artifact,
      turn_id: "turn-second-capture",
      created_at: "2026-08-15T10:01:00.000Z",
      source: {
        ...artifact.source,
        source_id: "source-2",
        document_version: 3,
        bounds: snapshots[1]!.bounds,
        checksum: snapshots[1]!.checksum,
      },
    };
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact, secondArtifact]}
        sources={snapshots}
        currentDocumentVersion={3}
        onDelete={vi.fn()}
      />,
    );
    const cards = [...container.querySelectorAll<HTMLElement>(
      ".learning-selection-enhancement",
    )];
    expect(cards).toHaveLength(2);
    expectCardsApart(cards[0]!, cards[1]!);
  });

  it("keeps restored cards apart when their local source snapshots are missing", () => {
    const restoredArtifact: SelectionEnhancementArtifact = {
      ...artifact,
      turn_id: "turn-restored-second",
      created_at: "2026-08-15T10:01:00.000Z",
      source: {
        ...artifact.source,
        source_id: "source-restored-second",
        document_version: 2,
        bounds: { x: 8, y: 20, width: 124, height: 70 },
        checksum: { algorithm: "sha-256", value: "b".repeat(64) },
      },
    };

    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact, restoredArtifact]}
        sources={[]}
        currentDocumentVersion={2}
        onDelete={vi.fn()}
      />,
    );
    const cards = [...container.querySelectorAll<HTMLElement>(
      ".learning-selection-enhancement",
    )];

    expect(cards).toHaveLength(2);
    expectCardsApart(cards[0]!, cards[1]!);
  });

  it("renders a selection question and its matching result as one collapsible card", () => {
    const question: WhiteboardQuestionRecord = {
      id: artifact.turn_id,
      sessionId: "learn-question-layout",
      text: "请解释我圈出的这一部分。",
      origin: "selection",
      createdAt: "2026-08-15T09:59:00.000Z",
      status: "answered",
      source: {
        sourceId: artifact.source.source_id,
        bounds: artifact.source.bounds,
      },
    };
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[]}
        questions={[question]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );
    const resultCard = container.querySelector<HTMLElement>(
      ".learning-selection-enhancement",
    );

    expect(screen.getByText("我的问题")).toBeTruthy();
    expect(screen.getByText("请解释我圈出的这一部分。")).toBeTruthy();
    expect(resultCard).toBeTruthy();
    expect(container.querySelector(".learning-whiteboard-question-card")).toBeNull();

    fireEvent.click(screen.getByRole("button", {
      name: "最小化问题和辅助内容",
    }));

    expect(screen.queryByText("请解释我圈出的这一部分。")).toBeNull();
    expect(screen.queryByText("原来的说明")).toBeNull();
    const restore = screen.getByRole("button", {
      name: "展开问题和小章鱼辅助：原来的说明",
    });
    expect(restore.textContent).toBe("?");

    fireEvent.click(restore);
    expect(screen.getByText("请解释我圈出的这一部分。")).toBeTruthy();
    expect(screen.getByText("原来的说明")).toBeTruthy();
  });

  it("does not resurrect a loading card for legacy pending records without a surface", () => {
    const question: WhiteboardQuestionRecord = {
      id: "turn-pending",
      sessionId: "learn-question-pending",
      text: "请绘制我圈出的函数。",
      origin: "selection",
      createdAt: "2026-08-15T09:59:00.000Z",
      status: "pending",
      source: {
        sourceId: artifact.source.source_id,
        bounds: artifact.source.bounds,
      },
    };
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[]}
        sources={[]}
        questions={[question]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".learning-selection-enhancement"))
      .toHaveLength(0);
    expect(container.querySelector(".learning-whiteboard-question-card"))
      .toBeNull();
    expect(container.querySelector(".learning-whiteboard-loading-block"))
      .toBeNull();
    expect(screen.queryByText("请绘制我圈出的函数。")).toBeNull();
    expect(screen.queryByText("正在生成函数图像")).toBeNull();
  });

  it("keeps a failed selection answer in the same question card", () => {
    const question: WhiteboardQuestionRecord = {
      id: "turn-failed",
      sessionId: "learn-question-failed",
      text: "请解释我圈出的内容。",
      origin: "selection",
      createdAt: "2026-08-15T09:59:00.000Z",
      status: "failed",
      error: "当前选区无法识别，请重新圈选后再试。",
      source: {
        sourceId: artifact.source.source_id,
        bounds: artifact.source.bounds,
      },
    };
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[]}
        sources={[]}
        questions={[question]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".learning-selection-enhancement"))
      .toHaveLength(1);
    expect(screen.getByText("请解释我圈出的内容。")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "当前选区无法识别，请重新圈选后再试。",
    );
  });

  it("shows unsupported content as a clear result instead of an empty card", () => {
    render(
      <SelectionEnhancementLayer
        artifacts={[{
          ...artifact,
          turn_id: "turn-unsupported",
          response: {
            kind: "unsupported",
            title: "暂时无法绘制这个表达式",
            text: "它包含四个独立变量，无法直接画成三维图像。",
            reason_code: "unsupported_variables",
            alternatives: ["固定其中一个变量后绘制三维切片"],
          },
        }]}
        sources={[]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "当前无法生成这个图像",
    );
    expect(screen.getByText("固定其中一个变量后绘制三维切片")).toBeTruthy();
  });

  it("mounts a validated three-dimensional selection result", () => {
    render(
      <SelectionEnhancementLayer
        artifacts={[{
          ...artifact,
          turn_id: "turn-scene3d",
          response: {
            kind: "scene3d",
            title: "四次曲面",
            text: "可以拖动旋转查看。",
            content: {
              title: "四次曲面",
              fallback: "x⁴+y⁴+z⁴=1",
              axes: true,
              camera: { yaw: .65, pitch: .45, zoom: 1 },
              objects: [{
                as: "surface",
                kind: "implicit_surface",
                expression: "x^4+y^4+z^4-1",
                level: 0,
                x_range: { min: -1.2, max: 1.2 },
                y_range: { min: -1.2, max: 1.2 },
                z_range: { min: -1.2, max: 1.2 },
              }],
            },
          },
        }]}
        sources={[]}
        currentDocumentVersion={1}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("可旋转三维函数图")).toBeTruthy();
  });
});
