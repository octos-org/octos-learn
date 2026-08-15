import {
  BoxSelect,
  CheckCircle2,
  Eraser,
  Hand,
  Lightbulb,
  MessageCircle,
  Mic,
  Palette,
  PenLine,
  RotateCcw,
  Redo2,
  Undo2,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  formatVariableValue,
  mountInfiniteBoard,
  studentInputMethod,
  type MountedInfiniteBoard,
  type StudentInputMethod,
  type ViewportInsets,
  variableControlModels,
} from "octos-lesson-language/web-runtime";
import {
  mountInkRuntime,
  type InkSelectionSnapshot,
  type InkMode,
  type InkRuntime,
  type InkRuntimeState,
} from "./oll-ink-runtime";
import { SelectionEnhancementLayer } from "../selection-enhancement-layer";
import type {
  SelectionContentKind,
  SelectionEnhancementArtifact,
} from "../selection-enhancements";
import type {
  OllLessonRuntimeController,
} from "./use-oll-lesson-runtime";
import "octos-lesson-language/web-runtime/styles.css";

type LearningInkState = InkRuntimeState & {
  pen_color: string;
  selection_color: string | null;
};

type LearningInkRuntime = InkRuntime & {
  setPenColor?: (color: string) => void;
  setSelectionColor?: (color: string) => void | Promise<void>;
};

const emptyInkState: LearningInkState = {
  mode: "navigate",
  component_count: 0,
  selected_count: 0,
  pen_color: "#176b62",
  selection_color: null,
  selection_input: "unknown",
  document_version: 0,
  saved: true,
};

function normalizeInkState(state: InkRuntimeState): LearningInkState {
  const enhanced = state as Partial<LearningInkState>;
  return {
    ...state,
    pen_color: enhanced.pen_color ?? "#176b62",
    selection_color: enhanced.selection_color ?? null,
  };
}

const inkColorPresets = [
  { color: "#176b62", label: "深青" },
  { color: "#1769aa", label: "蓝色" },
  { color: "#7a5aa3", label: "紫色" },
  { color: "#c75445", label: "红色" },
  { color: "#202b2a", label: "黑色" },
];

function InkColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="learning-ink-colors" aria-label={label}>
      <span>{label}</span>
      {inkColorPresets.map((preset) => (
        <button
          key={preset.color}
          type="button"
          className="learning-ink-color-swatch"
          style={{ "--ink-swatch": preset.color } as CSSProperties}
          onClick={() => onChange(preset.color)}
          aria-label={`${label}：${preset.label}`}
          aria-pressed={value.toLowerCase() === preset.color}
        />
      ))}
      <label className="learning-ink-custom-color" title={`自定义${label}`}>
        <Palette size={15} />
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`自定义${label}`}
        />
      </label>
    </div>
  );
}

function learningBoardInsets(viewport: HTMLElement): ViewportInsets {
  const compact = viewport.clientWidth <= 900;
  return {
    top: compact ? 78 : 92,
    right: compact ? 18 : 28,
    bottom: compact ? 180 : 190,
    left: compact ? 18 : 28,
  };
}

export function OllLessonBoard({
  runtime,
  inkSessionId,
  selectionEnhancements = [],
  selectionSources = [],
  onAskInkSelection,
  onVoiceInkSelection,
  onDeleteSelectionEnhancement,
}: {
  runtime: OllLessonRuntimeController;
  inkSessionId?: string;
  selectionEnhancements?: SelectionEnhancementArtifact[];
  selectionSources?: InkSelectionSnapshot[];
  onAskInkSelection?: (request: {
    snapshot: InkSelectionSnapshot;
    question: string;
    contentKind: SelectionContentKind;
  }) => Promise<void> | void;
  onVoiceInkSelection?: (request: {
    snapshot: InkSelectionSnapshot;
    contentKind: SelectionContentKind;
  }) => Promise<void> | void;
  onDeleteSelectionEnhancement?: (turnId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef(runtime);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const renderedFocusRef = useRef<string[]>([]);
  const renderedCompositionRef = useRef("");
  const inkRuntimeRef = useRef<LearningInkRuntime | null>(null);
  const unsubscribeInkRef = useRef<(() => void) | null>(null);
  const sliderOperationsRef = useRef(new Map<string, {
    input: StudentInputMethod;
    value: number;
    operationId?: string;
  }>());
  const [inkState, setInkState] = useState<LearningInkState>(emptyInkState);
  const [inkAvailable, setInkAvailable] = useState(false);
  const [inkSupportsColors, setInkSupportsColors] = useState(false);
  const [inkError, setInkError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [enhancementLayer, setEnhancementLayer] =
    useState<HTMLDivElement | null>(null);
  const [selectionQuestionOpen, setSelectionQuestionOpen] = useState(false);
  const [selectionQuestion, setSelectionQuestion] = useState("");
  const [selectionContentKind, setSelectionContentKind] =
    useState<SelectionContentKind>("unknown");
  const [selectionRequestPending, setSelectionRequestPending] = useState(false);
  const variableControls = variableControlModels(runtime.board);
  const availableStudentTasks = runtime.studentTasks.filter((task) => task.available);

  const requestTaskHint = useCallback((taskId: string) => {
    try {
      runtimeRef.current.requestStudentTaskHint(taskId);
      setTaskError("");
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "暂时无法显示提示");
    }
  }, []);

  const retryTask = useCallback((taskId: string) => {
    try {
      runtimeRef.current.retryStudentTask(taskId);
      setTaskError("");
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "暂时无法重新开始任务");
    }
  }, []);

  const startSliderOperation = useCallback((
    alias: string,
    value: number,
    input: StudentInputMethod,
  ) => {
    if (sliderOperationsRef.current.has(alias)) return;
    const operationId = runtimeRef.current.handleStudentVariableInput(alias, value, {
      phase: "start",
      control: "slider",
      input,
    });
    sliderOperationsRef.current.set(alias, {
      input,
      value,
      ...(typeof operationId === "string" ? { operationId } : {}),
    });
  }, []);

  const updateSliderOperation = useCallback((alias: string, value: number) => {
    if (!sliderOperationsRef.current.has(alias)) {
      startSliderOperation(alias, value, "unknown");
    }
    const active = sliderOperationsRef.current.get(alias);
    if (!active) return;
    active.value = value;
    runtimeRef.current.handleStudentVariableInput(alias, value, {
      phase: "update",
      control: "slider",
      input: active.input,
      ...(active.operationId ? { operation_id: active.operationId } : {}),
    });
  }, [startSliderOperation]);

  const commitSliderOperation = useCallback((alias: string, value: number) => {
    const active = sliderOperationsRef.current.get(alias);
    if (!active) return;
    sliderOperationsRef.current.delete(alias);
    runtimeRef.current.handleStudentVariableInput(alias, value, {
      phase: "commit",
      control: "slider",
      input: active.input,
      ...(active.operationId ? { operation_id: active.operationId } : {}),
    });
  }, []);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    if (inkState.selected_count === 0) setSelectionQuestionOpen(false);
  }, [inkState.selected_count]);

  const setInkMode = useCallback((mode: InkMode) => {
    try {
      inkRuntimeRef.current?.setMode(mode);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法切换书写工具");
    }
  }, []);

  const runInkHistory = useCallback((action: "undo" | "redo") => {
    const ink = inkRuntimeRef.current;
    if (!ink) return;
    void Promise.resolve(action === "undo" ? ink.undo() : ink.redo()).catch(
      (cause) => setInkError(cause instanceof Error ? cause.message : "笔迹历史操作失败"),
    );
  }, []);

  const selectAllInk = useCallback(() => {
    try {
      const ink = inkRuntimeRef.current;
      if (!ink) return;
      ink.setMode("select");
      ink.selectAll();
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法选择笔迹");
    }
  }, []);

  const setPenColor = useCallback((color: string) => {
    try {
      const setColor = inkRuntimeRef.current?.setPenColor;
      if (!setColor) throw new Error("当前 Ink Runtime 不支持笔迹颜色");
      setColor(color);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法设置笔迹颜色");
    }
  }, []);

  const setSelectionColor = useCallback((color: string) => {
    const ink = inkRuntimeRef.current;
    if (!ink) return;
    if (!ink.setSelectionColor) {
      setInkError("当前 Ink Runtime 不支持选区改色");
      return;
    }
    void Promise.resolve(ink.setSelectionColor(color)).then(
      () => setInkError(""),
      (cause) => setInkError(cause instanceof Error ? cause.message : "无法修改选中笔迹的颜色"),
    );
  }, []);

  const captureSelection = useCallback(async (): Promise<InkSelectionSnapshot> => {
    const ink = inkRuntimeRef.current;
    if (!ink) throw new Error("笔迹功能尚未就绪");
    await ink.ready;
    const snapshot = await ink.captureSelectionSnapshot();
    runtimeRef.current.recordStudentInkSelection({
      source_id: snapshot.source_id,
      document_id: snapshot.document_id,
      document_version: snapshot.document_version,
      bounds: snapshot.bounds,
      checksum: snapshot.checksum,
    }, inkState.selection_input);
    return snapshot;
  }, [inkState.selection_input]);

  const askSelection = useCallback(async (question: string) => {
    const value = question.trim();
    if (!value || !onAskInkSelection || selectionRequestPending) return;
    setSelectionRequestPending(true);
    try {
      const snapshot = await captureSelection();
      await onAskInkSelection({
        snapshot,
        question: value,
        contentKind: selectionContentKind,
      });
      setSelectionQuestion("");
      setSelectionQuestionOpen(false);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法发送当前选区");
    } finally {
      setSelectionRequestPending(false);
    }
  }, [
    captureSelection,
    onAskInkSelection,
    selectionContentKind,
    selectionRequestPending,
  ]);

  const askSelectionByVoice = useCallback(async () => {
    if (!onVoiceInkSelection || selectionRequestPending) return;
    setSelectionRequestPending(true);
    try {
      const snapshot = await captureSelection();
      await onVoiceInkSelection({
        snapshot,
        contentKind: selectionContentKind,
      });
      setSelectionQuestionOpen(false);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法针对当前选区开始语音提问");
    } finally {
      setSelectionRequestPending(false);
    }
  }, [
    captureSelection,
    onVoiceInkSelection,
    selectionContentKind,
    selectionRequestPending,
  ]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const mounted = mountInfiniteBoard(viewport);
    mountedRef.current = mounted;
    const enhancementHost = viewport.ownerDocument.createElement("div");
    enhancementHost.className = "learning-selection-enhancement-layer";
    const unmountEnhancementLayer =
      mounted.view.mountWorldLayer(enhancementHost);
    setEnhancementLayer(enhancementHost);
    const sliderOperations = sliderOperationsRef.current;
    setInkAvailable(false);
    setInkSupportsColors(false);
    setInkState(emptyInkState);
    let active = true;
    let ink: LearningInkRuntime | null = null;
    let inkDestroyed = false;
    const destroyInk = (): Promise<void> | undefined => {
      if (!ink || inkDestroyed) return undefined;
      inkDestroyed = true;
      unsubscribeInkRef.current?.();
      unsubscribeInkRef.current = null;
      if (inkRuntimeRef.current === ink) inkRuntimeRef.current = null;
      return ink.destroy();
    };
    try {
      mounted.view.setViewportInsets(learningBoardInsets(viewport));
      mounted.view.setVariableInputHandler((alias, value, event) => {
        return runtimeRef.current.handleStudentVariableInput(alias, value, event);
      });
      mounted.view.setScene3dInputHandler((nodeId, view, event) => {
        const result = runtimeRef.current.handleStudentScene3dInput(
          nodeId,
          view,
          event,
        );
        return typeof result === "string" ? result : undefined;
      });
      if (inkSessionId) {
        ink = mountInkRuntime({
          board: mounted.view,
          viewport,
          storageKey: `octos-learning-ink:v1:${inkSessionId}`,
          documentId: `learning-session:${inkSessionId}:student-ink`,
          locale: "zh-CN",
        }) as LearningInkRuntime;
        inkRuntimeRef.current = ink;
        ink.setMode("navigate");
        setInkSupportsColors(
          typeof ink.setPenColor === "function" &&
          typeof ink.setSelectionColor === "function",
        );
        unsubscribeInkRef.current = ink.subscribe((state) => {
          if (active) setInkState(normalizeInkState(state));
        });
        setInkError("");
        void ink.ready.then(
          () => {
            if (active) setInkAvailable(true);
          },
          (cause) => {
            if (!active) return;
            setInkAvailable(false);
            setInkSupportsColors(false);
            setInkError(cause instanceof Error ? cause.message : "笔迹功能加载失败");
            const destruction = destroyInk();
            if (destruction) void destruction.catch(() => undefined);
          },
        );
      }
    } catch (cause) {
      setInkAvailable(false);
      setInkSupportsColors(false);
      setInkError(cause instanceof Error ? cause.message : "笔迹功能加载失败");
      const destruction = destroyInk();
      if (destruction) void destruction.catch(() => undefined);
    }
    return () => {
      active = false;
      setEnhancementLayer(null);
      unmountEnhancementLayer();
      mountedRef.current = null;
      for (const [alias, operation] of sliderOperations) {
        runtimeRef.current.handleStudentVariableInput(alias, operation.value, {
          phase: "commit",
          control: "slider",
          input: operation.input,
          ...(operation.operationId ? { operation_id: operation.operationId } : {}),
        });
      }
      sliderOperations.clear();
      const destruction = destroyInk();
      mounted.destroy();
      if (destruction) void destruction.catch(() => undefined);
    };
  }, [inkSessionId]);

  useEffect(() => {
    const view = mountedRef.current?.view;
    const boardFocus = runtime.board?.focus ?? [];
    const renderedFocus = renderedFocusRef.current;
    const focusChanged =
      boardFocus.length !== renderedFocus.length ||
      boardFocus.some((target, index) => target !== renderedFocus[index]);
    const atPlaybackBoundary =
      runtime.currentOperation?.type === "beat.end" ||
      runtime.currentOperation?.type === "step.commit";
    const actionOperation = runtime.currentOperation?.action?.op;
    const compositionKey = `${runtime.currentBeatId ?? ""}\u0000${runtime.compositionTargets.join("\u0000")}`;
    const compositionChanged = compositionKey !== renderedCompositionRef.current;
    const compositionContentChanged =
      actionOperation === "board.create" ||
      actionOperation === "board.revise" ||
      actionOperation === "board.emphasize" ||
      actionOperation === "board.group" ||
      actionOperation === "board.connect";
    view?.setScene3dViews(runtime.scene3dViews);
    view?.render(runtime.board, runtime.currentOperation);
    if (runtime.attentionTargets.length > 0) {
      view?.focusTargets(runtime.attentionTargets);
    } else if (
      runtime.compositionTargets.length > 0 &&
      (compositionChanged || compositionContentChanged)
    ) {
      // A Beat's declared focus describes the visual composition needed for
      // its narration. Apply it while the Beat is unfolding so a newly written
      // formula does not replace the diagram it is explaining. This reuses the
      // existing focus action and does not add a playback delay.
      view?.focusTargets(runtime.compositionTargets);
    } else if (atPlaybackBoundary && focusChanged) {
      // React can batch every operation produced by advanceBeat() into the
      // boundary render. In that case the board already contains the new Beat
      // focus, but the view never observed the intermediate board.focus frame.
      view?.focusTargets(boardFocus);
    }
    renderedFocusRef.current = [...boardFocus];
    renderedCompositionRef.current = compositionKey;
  }, [
    runtime.attentionTargets,
    runtime.board,
    runtime.compositionTargets,
    runtime.currentOperation,
    runtime.currentBeatId,
    runtime.cursor,
    runtime.scene3dViews,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const mounted = mountedRef.current;
      if (mounted) {
        mounted.view.setViewportInsets(learningBoardInsets(viewport));
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="learning-oll-board-shell">
      <div
        ref={viewportRef}
        className="learning-oll-board"
        data-testid="oll-lesson-board"
        aria-label="OLL 无限白板"
      />
      {inkSessionId && inkAvailable ? (
        <div className="learning-ink-toolbar" aria-label="白板书写工具">
          <button
            type="button"
            className={inkState.mode === "navigate" ? "is-active" : ""}
            onClick={() => setInkMode("navigate")}
            aria-label="浏览白板"
            aria-pressed={inkState.mode === "navigate"}
          >
            <Hand size={17} />
          </button>
          <button
            type="button"
            className={inkState.mode === "draw" ? "is-active" : ""}
            onClick={() => setInkMode("draw")}
            aria-label="书写笔迹"
            aria-pressed={inkState.mode === "draw"}
          >
            <PenLine size={17} />
          </button>
          <button
            type="button"
            className={inkState.mode === "erase" ? "is-active" : ""}
            onClick={() => setInkMode("erase")}
            aria-label="擦除笔迹"
            aria-pressed={inkState.mode === "erase"}
          >
            <Eraser size={17} />
          </button>
          <button
            type="button"
            className={inkState.mode === "select" ? "is-active" : ""}
            onClick={() => setInkMode("select")}
            aria-label="框选笔迹"
            aria-pressed={inkState.mode === "select"}
          >
            <BoxSelect size={17} />
          </button>
          {inkSupportsColors && inkState.mode === "draw" ? (
            <InkColorControl
              label="笔色"
              value={inkState.pen_color}
              onChange={setPenColor}
            />
          ) : null}
          {inkSupportsColors && inkState.mode === "select" && inkState.selected_count > 0 ? (
            <InkColorControl
              label="选区颜色"
              value={inkState.selection_color ?? inkState.pen_color}
              onChange={setSelectionColor}
            />
          ) : null}
          {inkState.mode === "select"
            && inkState.selected_count > 0
            && onAskInkSelection ? (
              <button
                type="button"
                className="learning-ink-ask"
                onClick={() => setSelectionQuestionOpen((open) => !open)}
                aria-expanded={selectionQuestionOpen}
              >
                <MessageCircle size={16} />
                问小章鱼
              </button>
            ) : null}
          <button
            type="button"
            className="learning-ink-select-all"
            onClick={selectAllInk}
            aria-label="选择全部笔迹"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => runInkHistory("undo")}
            aria-label="撤销笔迹"
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            onClick={() => runInkHistory("redo")}
            aria-label="重做笔迹"
          >
            <Redo2 size={17} />
          </button>
          <span className="learning-ink-status" role="status">
            {inkState.component_count} 项笔迹
            {inkState.selected_count > 0
              ? ` · 已选 ${inkState.selected_count}`
              : ""}
            {inkState.saved ? " · 已保存" : " · 保存中"}
          </span>
        </div>
      ) : null}
      {selectionQuestionOpen && inkState.selected_count > 0 ? (
        <form
          className="learning-selection-question"
          onSubmit={(event) => {
            event.preventDefault();
            void askSelection(selectionQuestion);
          }}
        >
          <header>
            <strong>针对当前选区提问</strong>
            <span>
              将发送 {inkState.selected_count} 项选中笔迹和当前课程主题，不会发送整块白板。
            </span>
          </header>
          <label>
            我写的内容更像
            <select
              value={selectionContentKind}
              onChange={(event) =>
                setSelectionContentKind(
                  event.target.value as SelectionContentKind,
                )}
            >
              <option value="unknown">暂不确定</option>
              <option value="text">文字</option>
              <option value="math">公式</option>
              <option value="geometry">图形</option>
              <option value="data">数据</option>
            </select>
          </label>
          <div className="learning-selection-suggestions">
            <button
              type="button"
              onClick={() => void askSelection("请解释我选中的这部分。")}
              disabled={selectionRequestPending}
            >
              解释这部分
            </button>
            <button
              type="button"
              onClick={() => void askSelection("请检查我选中的内容，并在旁边给出建议。")}
              disabled={selectionRequestPending}
            >
              检查并建议
            </button>
            {selectionContentKind === "math" ? (
              <button
                type="button"
                onClick={() => void askSelection("请按我选中的公式生成函数图像。")}
                disabled={selectionRequestPending}
              >
                生成函数图像
              </button>
            ) : null}
          </div>
          <div className="learning-selection-question-input">
            <input
              value={selectionQuestion}
              onChange={(event) => setSelectionQuestion(event.target.value)}
              placeholder="例如：这一步为什么不对？"
              aria-label="针对选区的问题"
              disabled={selectionRequestPending}
            />
            {onVoiceInkSelection ? (
              <button
                type="button"
                onClick={() => void askSelectionByVoice()}
                disabled={selectionRequestPending}
                aria-label="针对当前选区语音提问"
              >
                <Mic size={16} />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={
                selectionRequestPending || !selectionQuestion.trim()
              }
            >
              发送
            </button>
          </div>
        </form>
      ) : null}
      {inkError ? (
        <div className="learning-ink-error" role="alert">
          笔迹功能：{inkError}
        </div>
      ) : null}
      {variableControls.length > 0 ? (
        <div
          className="learning-variable-controls"
          aria-label="课程变量控制"
          data-testid="oll-variable-controls"
        >
          {variableControls.map((control) => {
            const inputId = `oll-variable-${control.alias}`;
            return (
              <div
                className={runtime.activeVariableAnimation?.variable === control.alias
                  ? "learning-variable-control is-animating"
                  : "learning-variable-control"}
                key={control.alias}
              >
                <label htmlFor={inputId}>{control.label}</label>
                <input
                  id={inputId}
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={control.value}
                  onPointerDown={(event) => {
                    startSliderOperation(
                      control.alias,
                      control.value,
                      studentInputMethod(event.pointerType),
                    );
                  }}
                  onKeyDown={(event) => {
                    if ([
                      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
                      "Home", "End", "PageUp", "PageDown",
                    ].includes(event.key)) {
                      startSliderOperation(control.alias, control.value, "keyboard");
                    }
                  }}
                  onChange={(event) => {
                    updateSliderOperation(control.alias, Number(event.target.value));
                  }}
                  onPointerUp={(event) => {
                    commitSliderOperation(control.alias, Number(event.currentTarget.value));
                  }}
                  onPointerCancel={(event) => {
                    commitSliderOperation(control.alias, Number(event.currentTarget.value));
                  }}
                  onKeyUp={(event) => {
                    commitSliderOperation(control.alias, Number(event.currentTarget.value));
                  }}
                  onBlur={(event) => {
                    commitSliderOperation(control.alias, Number(event.currentTarget.value));
                  }}
                  aria-label={control.label}
                />
                <output>{formatVariableValue(control.value, control.unit)}</output>
                <button
                  type="button"
                  onClick={() => {
                    const initial = runtime.board?.variables?.[control.alias]?.initial;
                    if (typeof initial === "number") {
                      const operationId = runtime.handleStudentVariableInput(
                        control.alias,
                        control.value,
                        { phase: "start", control: "reset", input: "unknown" },
                      );
                      runtime.handleStudentVariableInput(control.alias, initial, {
                        phase: "commit",
                        control: "reset",
                        input: "unknown",
                        ...(typeof operationId === "string" ? { operation_id: operationId } : {}),
                      });
                    }
                  }}
                  aria-label={`复位${control.label}`}
                >
                  复位
                </button>
              </div>
            );
          })}
          <small>
            {runtime.activeVariableAnimation
              ? "动画正在改变同一个变量；拖动会暂停动画"
              : "拖动后课程会暂停；顶部按钮可继续播放或重新播放"}
          </small>
        </div>
      ) : null}
      {availableStudentTasks.length > 0 ? (
        <section
          className="learning-student-tasks"
          aria-label="动手试一试"
          data-testid="oll-student-tasks"
        >
          <header>
            <span>动手试一试</span>
            <small>直接使用白板上的滑杆或控制点</small>
          </header>
          {availableStudentTasks.map((task) => {
            const lastAttempt = task.attempts.at(-1);
            const attempts = task.attempts.length;
            return (
              <article
                key={task.task_id}
                className={`learning-student-task is-${task.status}`}
                aria-live="polite"
              >
                <p>{task.prompt}</p>
                {task.status === "succeeded" ? (
                  <div className="learning-student-task-feedback is-success">
                    <CheckCircle2 size={17} />
                    <span>{task.success_message ?? "完成得很好，已经达到目标。"}</span>
                  </div>
                ) : lastAttempt ? (
                  <div className="learning-student-task-feedback">
                    <span>
                      {task.status === "needs_hint"
                        ? "还没达到目标，可以查看提示后再试。"
                        : "已经记录这次操作，再调整一下试试。"}
                    </span>
                    <small>已尝试 {attempts} 次</small>
                  </div>
                ) : (
                  <div className="learning-student-task-feedback">
                    <span>轮到你操作了，完成后这里会立即反馈。</span>
                  </div>
                )}
                {task.current_hint ? (
                  <div className="learning-student-task-hint" role="status">
                    <Lightbulb size={16} />
                    <span>{task.current_hint}</span>
                  </div>
                ) : null}
                {task.status !== "succeeded" && attempts > 0 ? (
                  <div className="learning-student-task-actions">
                    {task.hints_revealed < task.hints.length ? (
                      <button
                        type="button"
                        onClick={() => requestTaskHint(task.task_id)}
                      >
                        <Lightbulb size={15} />
                        {task.current_hint ? "下一个提示" : "给我提示"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => retryTask(task.task_id)}
                    >
                      <RotateCcw size={15} />
                      重新开始
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
          {taskError ? <div className="learning-student-task-error" role="alert">{taskError}</div> : null}
        </section>
      ) : null}
      {enhancementLayer
        ? createPortal(
            <SelectionEnhancementLayer
              artifacts={selectionEnhancements}
              sources={selectionSources}
              currentDocumentVersion={inkState.document_version}
              onDelete={(turnId) =>
                onDeleteSelectionEnhancement?.(turnId)}
            />,
            enhancementLayer,
          )
        : null}
    </div>
  );
}
