import {
  BoxSelect,
  Eraser,
  Hand,
  Palette,
  PenLine,
  Redo2,
  Undo2,
} from "lucide-react";
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
  type MountedInfiniteBoard,
  type ViewportInsets,
  variableControlModels,
} from "octos-lesson-language/web-runtime";
import {
  mountInkRuntime,
  type InkMode,
  type InkRuntime,
  type InkRuntimeState,
} from "./oll-ink-runtime";
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
}: {
  runtime: OllLessonRuntimeController;
  inkSessionId?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef(runtime);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const renderedFocusRef = useRef<string[]>([]);
  const inkRuntimeRef = useRef<LearningInkRuntime | null>(null);
  const unsubscribeInkRef = useRef<(() => void) | null>(null);
  const [inkState, setInkState] = useState<LearningInkState>(emptyInkState);
  const [inkAvailable, setInkAvailable] = useState(false);
  const [inkSupportsColors, setInkSupportsColors] = useState(false);
  const [inkError, setInkError] = useState("");
  const variableControls = variableControlModels(runtime.board);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

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

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const mounted = mountInfiniteBoard(viewport);
    mountedRef.current = mounted;
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
      mounted.view.setVariableInputHandler((alias, value) => {
        runtimeRef.current.setVariable(alias, value);
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
      mountedRef.current = null;
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
    view?.render(
      runtime.board,
      runtime.currentOperation,
    );
    if (runtime.attentionTargets.length > 0) {
      view?.focusTargets(runtime.attentionTargets);
    } else if (atPlaybackBoundary && focusChanged) {
      // React can batch every operation produced by advanceBeat() into the
      // boundary render. In that case the board already contains the new Beat
      // focus, but the view never observed the intermediate board.focus frame.
      view?.focusTargets(boardFocus);
    }
    renderedFocusRef.current = [...boardFocus];
  }, [
    runtime.attentionTargets,
    runtime.board,
    runtime.currentOperation,
    runtime.cursor,
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
                  onChange={(event) => {
                    runtime.setVariable(control.alias, Number(event.target.value));
                  }}
                  aria-label={control.label}
                />
                <output>{formatVariableValue(control.value, control.unit)}</output>
                <button
                  type="button"
                  onClick={() => {
                    const initial = runtime.board?.variables?.[control.alias]?.initial;
                    if (typeof initial === "number") {
                      runtime.setVariable(control.alias, initial);
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
    </div>
  );
}
