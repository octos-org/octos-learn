import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import geometryLessonSource from "./fixtures/geometry-auxiliary-line-v2.canonical.jsonl?raw";
import unitCircleSineLessonSource from "./fixtures/unit-circle-sine.canonical.jsonl?raw";
import type { CanonicalEvent } from "octos-lesson-language";
import type {
  InkMode,
  InkRuntimeState,
} from "octos-lesson-language/ink-runtime";
import { OllLessonBoard } from "./oll-lesson-runtime";
import { useOllLessonRuntime } from "./use-oll-lesson-runtime";

const mountInkRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("./oll-ink-runtime", () => ({
  mountInkRuntime: mountInkRuntimeMock,
}));

function RuntimeProbe() {
  const runtime = useOllLessonRuntime({
    source: geometryLessonSource,
    storageKey: "oll-runtime-test",
  });
  if (!runtime) return null;
  return (
    <div style={{ width: 1200, height: 800 }}>
      <span data-testid="progress">
        {runtime.cursor}/{runtime.totalOperations}
      </span>
      <button type="button" onClick={runtime.nextBeat}>下一 Beat</button>
      <OllLessonBoard runtime={runtime} />
    </div>
  );
}

function InkRuntimeProbe() {
  const runtime = useOllLessonRuntime({
    source: geometryLessonSource,
    storageKey: "oll-ink-runtime-test",
  });
  if (!runtime) return null;
  return (
    <div style={{ width: 1200, height: 800 }}>
      <OllLessonBoard runtime={runtime} inkSessionId="learn-ink-1" />
    </div>
  );
}

function ReviewRuntimeProbe() {
  const runtime = useOllLessonRuntime({
    source: geometryLessonSource,
    storageKey: "oll-review-runtime-test",
    startAtEnd: true,
  });
  if (!runtime) return null;
  return (
    <div>
      <span data-testid="review-progress">
        {runtime.cursor}/{runtime.totalOperations}
      </span>
      <span data-testid="review-playing">{String(runtime.playing)}</span>
      <OllLessonBoard runtime={runtime} />
    </div>
  );
}

function VariableRuntimeProbe({
  onVariable,
}: {
  onVariable?: (value: number) => void;
} = {}) {
  const runtime = useOllLessonRuntime({
    source: unitCircleSineLessonSource,
    storageKey: "oll-variable-runtime-test",
    startAtEnd: true,
  });
  if (!runtime) return null;
  return (
    <div style={{ width: 1200, height: 800 }}>
      <span data-testid="student-operation-count">
        {runtime.studentOperations.length}
      </span>
      <span data-testid="student-operation-controls">
        {runtime.studentOperations.map((operation) => operation.control).join(",")}
      </span>
      <OllLessonBoard
        runtime={onVariable
          ? {
              ...runtime,
              handleStudentVariableInput: (alias, value, event) => {
                if (event.control === "geometry_point" && event.phase === "update") {
                  onVariable(value);
                }
                return runtime.handleStudentVariableInput(alias, value, event);
              },
            }
          : runtime}
      />
    </div>
  );
}

function StudentTaskRuntimeProbe({ startAtEnd = true }: { startAtEnd?: boolean }) {
  const runtime = useOllLessonRuntime({
    source: unitCircleSineLessonSource,
    storageKey: "oll-student-task-runtime-test",
    startAtEnd,
  });
  if (!runtime) return null;
  return (
    <div style={{ width: 1200, height: 800 }}>
      <OllLessonBoard runtime={runtime} />
    </div>
  );
}

function OutlineRuntimeProbe() {
  const runtime = useOllLessonRuntime({
    source: geometryLessonSource,
    storageKey: "oll-outline-runtime-test",
    startAtEnd: true,
    topics: [{
      id: "geometry",
      title: "几何证明",
      stepIds: geometryEvents.flatMap((event) =>
        event.step ? [event.step.id] : [],
      ),
    }],
  });
  if (!runtime) return null;
  const firstStep = runtime.outline[0]?.steps[0];
  return (
    <div>
      <span data-testid="outline-progress">
        {runtime.cursor}/{runtime.totalOperations}
      </span>
      <span data-testid="outline-topic">{runtime.outline[0]?.title}</span>
      <span data-testid="outline-current">{runtime.currentStepId}</span>
      <button
        type="button"
        onClick={() => firstStep && runtime.viewStep(firstStep.id)}
      >
        查看第一步
      </button>
      <OllLessonBoard runtime={runtime} />
    </div>
  );
}

const geometryEvents = geometryLessonSource
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line) as CanonicalEvent);

function IncrementalRuntimeProbe() {
  const runtime = useOllLessonRuntime({
    source: JSON.stringify(geometryEvents[0]),
    storageKey: "oll-incremental-runtime-test",
    incremental: true,
  });
  if (!runtime) return null;
  return (
    <div style={{ width: 1200, height: 800 }}>
      <span data-testid="stream-status">{runtime.status}</span>
      <span data-testid="stream-total">{runtime.totalOperations}</span>
      <button type="button" onClick={runtime.nextBeat}>推进增量课程</button>
      <button type="button" onClick={() => runtime.appendEvents([geometryEvents[1]!])}>追加课程步骤</button>
      <OllLessonBoard runtime={runtime} />
    </div>
  );
}

function IncrementalReviewRuntimeProbe() {
  const runtime = useOllLessonRuntime({
    source: JSON.stringify(geometryEvents[0]),
    storageKey: "oll-incremental-review-runtime-test",
    incremental: true,
    startAtEnd: true,
  });
  if (!runtime) return null;
  return (
    <div>
      <span data-testid="incremental-review-status">{runtime.status}</span>
      <span data-testid="incremental-review-progress">
        {runtime.cursor}/{runtime.totalOperations}
      </span>
      <span data-testid="incremental-review-playing">
        {String(runtime.playing)}
      </span>
      <button
        type="button"
        onClick={() => runtime.appendEvents(geometryEvents.slice(1, -1))}
      >
        恢复历史课程
      </button>
      <OllLessonBoard runtime={runtime} />
    </div>
  );
}

function ReviewToLiveRuntimeProbe() {
  const [review, setReview] = useState(true);
  const runtime = useOllLessonRuntime({
    source: JSON.stringify(geometryEvents[0]),
    storageKey: "oll-review-to-live-runtime-test",
    incremental: true,
    autoPlay: !review,
    startAtEnd: review,
    narrationTiming: "external",
  });
  if (!runtime) return null;
  return (
    <div>
      <span data-testid="review-to-live-status">{runtime.status}</span>
      <span data-testid="review-to-live-playing">
        {String(runtime.playing)}
      </span>
      <span data-testid="review-to-live-speech">{runtime.activeSpeech}</span>
      <button
        type="button"
        onClick={() => runtime.appendEvents([geometryEvents[1]!])}
      >
        恢复已有步骤
      </button>
      <button type="button" onClick={() => setReview(false)}>
        开始新语音轮次
      </button>
      <button
        type="button"
        onClick={() => runtime.appendEvents([geometryEvents[2]!])}
      >
        追加新课程步骤
      </button>
    </div>
  );
}

describe("OLL lesson Runtime integration", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    mountInkRuntimeMock.mockReset();
    vi.restoreAllMocks();
  });

  it("mounts writing as a persistent whiteboard capability", async () => {
    const listeners = new Set<(state: InkRuntimeState) => void>();
    let state: InkRuntimeState & { pen_color: string; selection_color: string | null } = {
      mode: "navigate",
      component_count: 2,
      selected_count: 0,
      pen_color: "#176b62",
      selection_color: null,
      document_version: 3,
      saved: true,
    };
    const ink = {
      ready: Promise.resolve(),
      subscribe: vi.fn((listener: (next: InkRuntimeState) => void) => {
        listeners.add(listener);
        listener(state);
        return () => listeners.delete(listener);
      }),
      setMode: vi.fn((mode: InkMode) => {
        state = { ...state, mode };
        listeners.forEach((listener) => listener(state));
      }),
      selectAll: vi.fn(() => {
        state = { ...state, selected_count: 2, selection_color: "#176b62" };
        listeners.forEach((listener) => listener(state));
      }),
      setPenColor: vi.fn((color: string) => {
        state = { ...state, pen_color: color };
        listeners.forEach((listener) => listener(state));
      }),
      setSelectionColor: vi.fn((color: string) => {
        state = { ...state, selection_color: color };
        listeners.forEach((listener) => listener(state));
      }),
      undo: vi.fn(),
      redo: vi.fn(),
      destroy: vi.fn(() => Promise.resolve()),
    };
    mountInkRuntimeMock.mockReturnValue(ink);

    render(<InkRuntimeProbe />);

    await waitFor(() => expect(mountInkRuntimeMock).toHaveBeenCalledOnce());
    expect(mountInkRuntimeMock).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: "octos-learning-ink:v1:learn-ink-1",
      documentId: "learning-session:learn-ink-1:student-ink",
      locale: "zh-CN",
    }));
    expect(ink.setMode).toHaveBeenCalledWith("navigate");
    expect(screen.queryByRole("button", { name: "启用白板书写" })).toBeNull();
    expect(screen.queryByRole("button", { name: "退出书写模式" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("2 项笔迹");
    fireEvent.click(screen.getByRole("button", { name: "书写笔迹" }));
    expect(ink.setMode).toHaveBeenLastCalledWith("draw");
    fireEvent.click(screen.getByRole("button", { name: "笔色：蓝色" }));
    expect(ink.setPenColor).toHaveBeenCalledWith("#1769aa");

    fireEvent.click(screen.getByRole("button", { name: "框选笔迹" }));
    expect(ink.setMode).toHaveBeenLastCalledWith("select");
    fireEvent.click(screen.getByRole("button", { name: "选择全部笔迹" }));
    expect(ink.selectAll).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("已选 2");
    fireEvent.click(screen.getByRole("button", { name: "选区颜色：红色" }));
    expect(ink.setSelectionColor).toHaveBeenCalledWith("#c75445");

    fireEvent.click(screen.getByRole("button", { name: "浏览白板" }));
    expect(ink.setMode).toHaveBeenLastCalledWith("navigate");
    expect(screen.getByRole("status").textContent).toContain("2 项笔迹");
    expect(screen.getByRole("button", { name: "书写笔迹" })).toBeTruthy();
    expect(ink.destroy).not.toHaveBeenCalled();
  });

  it("reports a failed restore and disposes the read-only ink layer", async () => {
    const ink = {
      ready: Promise.reject(new Error("保存的笔迹校验失败")),
      setMode: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      destroy: vi.fn(() => Promise.resolve()),
    };
    mountInkRuntimeMock.mockReturnValue(ink);
    render(<InkRuntimeProbe />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "保存的笔迹校验失败",
      );
    });
    expect(ink.destroy).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "启用白板书写" })).toBeNull();
  });

  it("plays Canonical Beats without replacing existing board nodes", () => {
    render(<RuntimeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "下一 Beat" }));

    expect(screen.getByTestId("progress").textContent).not.toMatch(/^0\//);
    const board = screen.getByTestId("oll-lesson-board");
    expect(board.querySelectorAll(".board-node").length).toBeGreaterThan(0);
    expect(screen.getByText("① 已知与目标")).toBeTruthy();

    const diagram = board.querySelector<HTMLElement>(
      '[data-id="lesson-geometry-v2-001:node:clean-diagram"]',
    );
    const instanceId = diagram?.dataset.instanceId;
    expect(instanceId).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "下一 Beat" }));

    expect(
      board.querySelector<HTMLElement>(
        '[data-id="lesson-geometry-v2-001:node:clean-diagram"]',
      )?.dataset.instanceId,
    ).toBe(instanceId);
    expect(screen.getByText("② 连接 AD")).toBeTruthy();
  });

  it("opens a historical lesson at its final board state without playing", async () => {
    render(<ReviewRuntimeProbe />);

    await waitFor(() => {
      const [cursor, total] = screen
        .getByTestId("review-progress")
        .textContent!.split("/")
        .map(Number);
      expect(cursor).toBe(total);
      expect(total).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("review-playing").textContent).toBe("false");
    expect(screen.getByText("关键想法")).toBeTruthy();
  });

  it("uses one persisted theta for the slider, unit circle, projection, and sine plot", async () => {
    vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 210,
      width: 300,
      height: 210,
      toJSON: () => ({}),
    } as DOMRect);
    const directValues: number[] = [];
    const first = render(<VariableRuntimeProbe onVariable={(value) => directValues.push(value)} />);
    const slider = await screen.findByRole("slider", { name: "旋转角 θ" });
    const board = screen.getByTestId("oll-lesson-board");
    const unitPointId = "lesson-unit-circle-sine-001:node:unit-circle:fragment:point-p";
    const footId = "lesson-unit-circle-sine-001:node:unit-circle:fragment:foot";
    const plotPointId = "lesson-unit-circle-sine-001:node:sine-plot:fragment:current-angle";
    const unitPoint = board.querySelector<SVGCircleElement>(`[data-id="${unitPointId}"]`);
    const plotPoint = board.querySelector<SVGCircleElement>(`[data-id="${plotPointId}"]`);
    expect(unitPoint).toBeTruthy();
    expect(plotPoint).toBeTruthy();
    expect(unitPoint?.dataset.ollVariableControl).toBe("theta");
    const initialUnitCx = unitPoint?.getAttribute("cx");
    const initialUnitCy = unitPoint?.getAttribute("cy");
    const initialPlotCx = plotPoint?.getAttribute("cx");

    fireEvent.pointerDown(slider, { pointerType: "mouse" });
    fireEvent.change(slider, { target: { value: String(Math.PI / 2) } });
    fireEvent.pointerUp(slider, { pointerType: "mouse" });

    await waitFor(() => {
      expect(screen.getByText("π/2", { selector: "output" })).toBeTruthy();
      expect(screen.getByTestId("student-operation-count").textContent).toBe("1");
    });
    const updatedUnitPoint = board.querySelector<SVGCircleElement>(`[data-id="${unitPointId}"]`);
    const updatedFoot = board.querySelector<SVGCircleElement>(`[data-id="${footId}"]`);
    const updatedPlotPoint = board.querySelector<SVGCircleElement>(`[data-id="${plotPointId}"]`);
    expect(updatedUnitPoint?.getAttribute("cx")).not.toBe(initialUnitCx);
    expect(updatedUnitPoint?.getAttribute("cy")).not.toBe(initialUnitCy);
    expect(updatedUnitPoint?.getAttribute("cx")).toBe(updatedFoot?.getAttribute("cx"));
    expect(updatedPlotPoint?.getAttribute("cx")).not.toBe(initialPlotCx);

    const controlPoint = board.querySelector<SVGCircleElement>(`[data-id="${unitPointId}"]`)!;
    const controlSvg = controlPoint.closest("svg")!;
    Object.defineProperty(controlSvg, "viewBox", {
      configurable: true,
      value: { baseVal: { width: 300, height: 210 } },
    });
    const centerX = Number(controlPoint.dataset.angleCenterX);
    const centerY = Number(controlPoint.dataset.angleCenterY);
    controlPoint.dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: centerX - 70,
      clientY: centerY,
    }));
    expect(directValues.at(-1)).toBeCloseTo(Math.PI);
    fireEvent.pointerUp(window);
    await waitFor(() => {
      expect(screen.getByText("π", { selector: "output" })).toBeTruthy();
      expect(screen.getByTestId("student-operation-count").textContent).toBe("2");
      expect(screen.getByTestId("student-operation-controls").textContent)
        .toBe("slider,geometry_point");
    });
    fireEvent.click(screen.getByRole("button", { name: "复位旋转角 θ" }));
    expect(screen.getByText("0", { selector: "output" })).toBeTruthy();
    expect(screen.getByTestId("student-operation-count").textContent).toBe("3");
    const finalSlider = screen.getByRole("slider", { name: "旋转角 θ" });
    fireEvent.pointerDown(finalSlider, { pointerType: "touch" });
    fireEvent.change(finalSlider, {
      target: { value: String(Math.PI) },
    });
    fireEvent.pointerUp(finalSlider, { pointerType: "touch" });
    expect(screen.getByTestId("student-operation-count").textContent).toBe("4");

    first.unmount();
    render(<VariableRuntimeProbe />);
    const restoredSlider = await screen.findByRole("slider", { name: "旋转角 θ" });
    expect(Number((restoredSlider as HTMLInputElement).value)).toBeCloseTo(Math.PI);
    expect(screen.getByText("π", { selector: "output" })).toBeTruthy();
    expect(screen.getByTestId("student-operation-count").textContent).toBe("4");
  });

  it("shows an after-lesson task with feedback, hints, retry, success, and restore", async () => {
    const duringLesson = render(<StudentTaskRuntimeProbe startAtEnd={false} />);
    expect(screen.queryByTestId("oll-student-tasks")).toBeNull();
    duringLesson.unmount();

    const first = render(<StudentTaskRuntimeProbe />);
    expect(await screen.findByText("把圆周点拖到 sin θ = 1")).toBeTruthy();
    expect(screen.getByText("轮到你操作了，完成后这里会立即反馈。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "给我提示" })).toBeNull();

    const slider = screen.getByRole("slider", { name: "旋转角 θ" });
    fireEvent.pointerDown(slider, { pointerType: "mouse" });
    fireEvent.change(slider, { target: { value: String(Math.PI / 4) } });
    fireEvent.pointerUp(slider, { pointerType: "mouse" });

    await waitFor(() => {
      expect(screen.getByText("已尝试 1 次")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "给我提示" }));
    expect(screen.getByText("观察圆周点的纵坐标怎样随 θ 变化。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重新开始" }));
    expect(screen.getByText("0", { selector: "output" })).toBeTruthy();

    const resetSlider = screen.getByRole("slider", { name: "旋转角 θ" });
    fireEvent.pointerDown(resetSlider, { pointerType: "touch" });
    fireEvent.change(resetSlider, { target: { value: String(Math.PI / 2) } });
    fireEvent.pointerUp(resetSlider, { pointerType: "touch" });
    await waitFor(() => {
      expect(screen.getByText("正确，圆周点在最高点时 sin θ = 1。")).toBeTruthy();
    });

    first.unmount();
    render(<StudentTaskRuntimeProbe />);
    expect(await screen.findByText("正确，圆周点在最高点时 sin θ = 1。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重新开始" })).toBeNull();
  });

  it("groups the outline and seeks backwards to a selected Step", () => {
    render(<OutlineRuntimeProbe />);
    const [initialCursor, total] = screen
      .getByTestId("outline-progress")
      .textContent!.split("/")
      .map(Number);
    expect(initialCursor).toBe(total);
    expect(screen.getByTestId("outline-topic").textContent).toBe("几何证明");

    fireEvent.click(screen.getByRole("button", { name: "查看第一步" }));

    const [cursorAfterSeek] = screen
      .getByTestId("outline-progress")
      .textContent!.split("/")
      .map(Number);
    expect(cursorAfterSeek).toBeLessThan(total!);
    expect(screen.getByTestId("outline-current").textContent).toBe(
      geometryEvents[1]?.step?.id,
    );
    expect(screen.getByText("① 已知与目标")).toBeTruthy();
  });

  it("applies each Beat focus even when React batches advanceBeat updates", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 960,
      bottom: 608,
      width: 960,
      height: 608,
      toJSON: () => ({}),
    } as DOMRect);
    render(<RuntimeProbe />);

    const board = screen.getByTestId("oll-lesson-board");
    const world = board.querySelector<HTMLElement>("[data-oll-board-runtime-world]");
    expect(world).toBeTruthy();
    const transforms: string[] = [];

    for (let beat = 0; beat < 11; beat += 1) {
      fireEvent.click(screen.getByRole("button", { name: "下一 Beat" }));
      transforms.push(world?.style.transform ?? "");
    }

    const scales = transforms.map((transform) => transform.match(/scale\(([^)]+)\)/)?.[1]);
    expect(new Set(scales).size).toBeGreaterThanOrEqual(4);
    expect(transforms[5]).not.toBe(transforms[6]);
    expect(transforms[7]).not.toBe(transforms[8]);
  });

  it("grows an active /learn board when a validated Canonical Step arrives", () => {
    render(<IncrementalRuntimeProbe />);
    fireEvent.click(screen.getByRole("button", { name: "推进增量课程" }));
    expect(screen.getByTestId("stream-status").textContent).toBe("waiting");
    const totalBefore = Number(screen.getByTestId("stream-total").textContent);

    fireEvent.click(screen.getByRole("button", { name: "追加课程步骤" }));
    expect(Number(screen.getByTestId("stream-total").textContent)).toBeGreaterThan(totalBefore);
    fireEvent.click(screen.getByRole("button", { name: "推进增量课程" }));
    expect(screen.getByText("① 已知与目标")).toBeTruthy();
  });

  it("applies an incrementally restored history directly to its available end", async () => {
    render(<IncrementalReviewRuntimeProbe />);
    fireEvent.click(screen.getByRole("button", { name: "恢复历史课程" }));

    await waitFor(() => {
      const [cursor, total] = screen
        .getByTestId("incremental-review-progress")
        .textContent!.split("/")
        .map(Number);
      expect(cursor).toBe(total);
      expect(total).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("incremental-review-status").textContent).toBe(
      "waiting",
    );
    expect(screen.getByTestId("incremental-review-playing").textContent).toBe(
      "false",
    );
    expect(screen.getByText("关键想法")).toBeTruthy();
  });

  it("plays a new incremental step after a reviewed lesson returns to live mode", async () => {
    render(<ReviewToLiveRuntimeProbe />);
    fireEvent.click(screen.getByRole("button", { name: "恢复已有步骤" }));
    expect(screen.getByTestId("review-to-live-status").textContent).toBe(
      "waiting",
    );

    fireEvent.click(screen.getByRole("button", { name: "开始新语音轮次" }));
    fireEvent.click(screen.getByRole("button", { name: "追加新课程步骤" }));

    await waitFor(() => {
      expect(screen.getByTestId("review-to-live-playing").textContent).toBe(
        "true",
      );
      expect(screen.getByTestId("review-to-live-speech").textContent).toContain(
        "现在连接 A 和 D",
      );
    });
  });
});
