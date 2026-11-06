import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { HandwritingGestureMode } from "./handwriting-gesture";
import type { InkRuntime } from "../oll/oll-ink-runtime";
import { BoardHandwritingInput, INITIAL_HANDWRITING_STATE, type BoardHandwritingState } from "./board-handwriting-input";
import { drawHandwritingOverlay } from "./handwriting-overlay";

export function useHandwritingInput({ viewportRef, inputRef: ownerRef, inkRef, enabled, ready, playing, sessionId, onZoom }: {
  viewportRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<BoardHandwritingInput | null>;
  inkRef: RefObject<InkRuntime | null>;
  enabled: boolean;
  ready: boolean;
  playing: boolean;
  sessionId?: string;
  onZoom?: (factor: number) => void;
}) {
  const zoom = useRef(onZoom);
  useEffect(() => { zoom.current = onZoom; }, [onZoom]);
  const [gestureMode, setGestureMode] = useState<HandwritingGestureMode>("palm-pinch");
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const allowed = useRef(false);
  const [state, setState] = useState<BoardHandwritingState>(INITIAL_HANDWRITING_STATE);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { allowed.current = ready && !playing; }, [ready, playing]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !sessionId || !enabled) return;
    const input = new BoardHandwritingInput({
      viewport, mode: gestureMode, getInk: () => inkRef.current, allowed: () => allowed.current,
      onState: setState,
      onVisual: (frame, gesture) => {
        if (overlay.current) drawHandwritingOverlay(overlay.current, frame, gesture?.penDown, gestureMode);
        if (cursor.current) {
          cursor.current.hidden = !gesture?.cursor;
          cursor.current.dataset.phase = gesture?.phase ?? "lost";
          cursor.current.dataset.down = gesture?.penDown ? "true" : "false";
          if (gesture?.cursor) cursor.current.style.transform = `translate3d(${gesture.cursor.x}px, ${gesture.cursor.y}px, 0)`;
        }
      },
    });
    input.stop();
    ownerRef.current = input;

    const onPointer = (event: PointerEvent) => {
      if (event.pointerId === input.pointerId) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-handwriting-controls]')) return;
      if (viewport.contains(target) || target.closest('.learning-ink-toolbar,input,textarea,select,[contenteditable="true"]')) input.pause("direct");
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") input.pause("manual"); };
    const onHidden = () => { if (document.hidden) input.pause("hidden"); };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHidden);
    let width = viewport.clientWidth;
    let height = viewport.clientHeight;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (width === viewport.clientWidth && height === viewport.clientHeight) return;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      input.pause("view");
    });
    resize?.observe(viewport);
    return () => {
      input.dispose(); if (ownerRef.current === input) ownerRef.current = null;
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHidden);
      resize?.disconnect();
    };
  }, [viewportRef, inkRef, sessionId, enabled, ownerRef, gestureMode]);
  useEffect(() => {
    const shell = viewportRef.current?.parentElement;
    shell?.classList.toggle("air-gesture-enabled", state.status === "active" || state.status === "starting");
    return () => shell?.classList.remove("air-gesture-enabled");
  }, [viewportRef, state.status]);
  useEffect(() => { if (playing) ownerRef.current?.pause("playback"); }, [playing, ownerRef]);
  const start = useCallback(() => { if (video.current) void ownerRef.current?.start(video.current); }, [ownerRef]);
  const zoomBy = useCallback((factor: number) => zoom.current?.(factor), []);
  const pause = useCallback(() => ownerRef.current?.pause("manual"), [ownerRef]);
  const stop = useCallback(() => ownerRef.current?.stop(), [ownerRef]);
  return { state, zoomBy, gestureMode, setGestureMode, videoRef: video, overlayRef: overlay, cursorRef: cursor, collapsed, setCollapsed, start, pause, stop };
}
