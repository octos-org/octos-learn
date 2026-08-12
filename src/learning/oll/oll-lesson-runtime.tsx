import {
  BoxSelect,
  Eraser,
  Hand,
  PenLine,
  Redo2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  mountInfiniteBoard,
  type MountedInfiniteBoard,
  type ViewportInsets,
} from "octos-lesson-language/web-runtime";
import type {
  InkMode,
  InkRuntime,
  InkRuntimeState,
} from "octos-lesson-language/ink-runtime";
import type { OllLessonRuntimeController } from "./use-oll-lesson-runtime";
import "octos-lesson-language/web-runtime/styles.css";

type InkLoadState = "disabled" | "loading" | "ready" | "error";

const emptyInkState: InkRuntimeState = {
  mode: "navigate",
  component_count: 0,
  selected_count: 0,
  document_version: 0,
  saved: true,
};

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
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const renderedFocusRef = useRef<string[]>([]);
  const inkRuntimeRef = useRef<InkRuntime | null>(null);
  const unsubscribeInkRef = useRef<(() => void) | null>(null);
  const inkRequestRef = useRef(0);
  const [inkLoadState, setInkLoadState] = useState<InkLoadState>("disabled");
  const [inkState, setInkState] = useState<InkRuntimeState>(emptyInkState);
  const [inkError, setInkError] = useState("");

  const enableInk = useCallback(async () => {
    const mounted = mountedRef.current;
    const viewport = viewportRef.current;
    if (!mounted || !viewport || !inkSessionId || inkRuntimeRef.current) return;
    const request = ++inkRequestRef.current;
    setInkLoadState("loading");
    setInkError("");
    let candidate: InkRuntime | null = null;
    try {
      const module = await import("./oll-ink-runtime");
      if (request !== inkRequestRef.current || !mountedRef.current) return;
      candidate = module.mountInkRuntime({
        board: mounted.view,
        viewport,
        storageKey: `octos-learning-ink:v1:${inkSessionId}`,
        documentId: `learning-session:${inkSessionId}:student-ink`,
      });
      inkRuntimeRef.current = candidate;
      await candidate.ready;
      if (request !== inkRequestRef.current || mountedRef.current !== mounted) {
        await candidate.destroy();
        if (inkRuntimeRef.current === candidate) inkRuntimeRef.current = null;
        return;
      }
      candidate.setMode("draw");
      unsubscribeInkRef.current = candidate.subscribe(setInkState);
      setInkLoadState("ready");
    } catch (cause) {
      if (candidate) await candidate.destroy();
      if (inkRuntimeRef.current === candidate) inkRuntimeRef.current = null;
      if (request !== inkRequestRef.current) return;
      setInkLoadState("error");
      setInkError(cause instanceof Error ? cause.message : "笔迹功能加载失败");
    }
  }, [inkSessionId]);

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

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const mounted = mountInfiniteBoard(viewport);
    mountedRef.current = mounted;
    try {
      mounted.view.setViewportInsets(learningBoardInsets(viewport));
    } catch (cause) {
      mountedRef.current = null;
      mounted.destroy();
      throw cause;
    }
    return () => {
      mountedRef.current = null;
      mounted.destroy();
    };
  }, []);

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

  useEffect(() => () => {
    inkRequestRef.current += 1;
    unsubscribeInkRef.current?.();
    unsubscribeInkRef.current = null;
    const ink = inkRuntimeRef.current;
    inkRuntimeRef.current = null;
    if (ink) void ink.destroy();
  }, []);

  return (
    <div className="learning-oll-board-shell">
      <div
        ref={viewportRef}
        className="learning-oll-board"
        data-testid="oll-lesson-board"
        aria-label="OLL 无限白板"
      />
      {inkSessionId && inkLoadState !== "ready" ? (
        <button
          type="button"
          className="learning-ink-enable"
          onClick={() => void enableInk()}
          disabled={inkLoadState === "loading"}
          aria-label="启用白板书写"
        >
          <PenLine size={17} />
          <span>
            {inkLoadState === "loading"
              ? "正在加载书写…"
              : inkLoadState === "error"
                ? "重试书写"
                : "书写"}
          </span>
        </button>
      ) : null}
      {inkLoadState === "ready" ? (
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
    </div>
  );
}
