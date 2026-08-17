import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionEnhancementLayer } from "./selection-enhancement-layer";
import type { SelectionEnhancementArtifact } from "./selection-enhancements";

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

afterEach(cleanup);

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
  });
  fireEvent(target, event);
}

describe("SelectionEnhancementLayer", () => {
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
