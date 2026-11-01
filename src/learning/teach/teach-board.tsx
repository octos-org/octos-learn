import { getLocale, subscribeLocale } from "@/i18n";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { normalizeAuthoringLesson, reduceCanonicalEvents, type CanonicalEvent } from "octos-lesson-language";
import { mountInfiniteBoard, type ImageAssetResolver, type MountedInfiniteBoard } from "octos-lesson-language/web-runtime";
import "octos-lesson-language/web-runtime/styles.css";

import { teachingCameraCeiling, teachingCameraFloor, teachingReadingScale } from "../oll/board-chrome-insets";
import type { CompiledLesson } from "./compile-recording";
import type { BoardTarget, CardInk } from "./recording";
import { boardTargetFromId, STUDIO_LESSON_ID } from "./studio-board-ids";


function nodeSections(events: CanonicalEvent[]): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const event of events) {
    for (const beat of event.step?.beats ?? []) {
      for (const actions of Object.values(beat.stage ?? {})) {
        for (const action of actions as Array<{ node?: { id?: string } }>) {
          if (action.node?.id && !sections[action.node.id]) sections[action.node.id] = event.step!.id;
        }
      }
    }
  }
  return sections;
}

/** Ink frozen when a take stops: its SVG and where on the board it was drawn. */
export interface FrozenInk {
  svg: string;
  width: number;
  height: number;
  annotates?: CardInk["annotates"];
}

export interface TeachBoardHandle {
  /** Starts a fresh ink document for one take; the ink runtime loads on demand. */
  startInk(documentId: string): Promise<void>;
  setPen(on: boolean): void;
  /** Freezes the take's strokes and removes the live ink; null when nothing was drawn. */
  freezeInk(): Promise<FrozenInk | null>;
  /** Removes the live ink without keeping it. */
  discardInk(): Promise<void>;
}

const ANNOTATABLE = new Set(["geometry", "plot", "scene3d", "image"]);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Ink drawn mostly on top of a component annotates it, at its position on that
 * component's card; other ink is a free note. Both the ink bounds and each
 * card's layout box (its positioned style) are in board coordinates, which is
 * what the layout uses to place the annotation again.
 */
function annotationFor(viewport: HTMLElement, ink: { x: number; y: number; width: number; height: number }): CardInk["annotates"] {
  const area = ink.width * ink.height;
  if (!(area > 0)) return undefined;
  for (const element of viewport.querySelectorAll<HTMLElement>(".board-node[data-id]")) {
    if (!ANNOTATABLE.has(element.dataset.kind ?? "")) continue;
    const card = {
      x: parseFloat(element.style.left), y: parseFloat(element.style.top),
      width: parseFloat(element.style.width), height: parseFloat(element.style.height),
    };
    if (![card.x, card.y, card.width, card.height].every(Number.isFinite) || card.width <= 0 || card.height <= 0) continue;
    const overlap = Math.max(0, Math.min(card.x + card.width, ink.x + ink.width) - Math.max(card.x, ink.x))
      * Math.max(0, Math.min(card.y + card.height, ink.y + ink.height) - Math.max(card.y, ink.y));
    const target = boardTargetFromId(element.dataset.id);
    if (!target || overlap / area < 0.8) continue;
    return {
      node: target.node,
      x: clamp((ink.x - card.x) / card.width, -0.5, 1.5),
      y: clamp((ink.y - card.y) / card.height, -0.5, 1.5),
      width: clamp(ink.width / card.width, 0.01, 2),
      height: clamp(ink.height / card.height, 0.01, 2),
    };
  }
  return undefined;
}

type InkModule = typeof import("octos-lesson-language/ink-runtime");
type InkRuntime = ReturnType<InkModule["mountInkRuntime"]>;

/**
 * The board while a learner records: the compiled lesson so far, laid out and
 * framed by the same teaching layout and camera rules as playback.
 */
export const TeachBoard = forwardRef<TeachBoardHandle, {
  compiled: CompiledLesson | null;
  resolveAsset: ImageAssetResolver;
  /** Called with what the learner tapped when a pointing tool is active. */
  onTarget?: (target: BoardTarget) => void;
}>(function TeachBoard({ compiled, resolveAsset, onTarget }, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const inkRef = useRef<InkRuntime | null>(null);
  const onTargetRef = useRef(onTarget);
  useEffect(() => {
    onTargetRef.current = onTarget;
  }, [onTarget]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const mounted = mountInfiniteBoard(viewport, (id) => resolveAsset(id));
    const setLocale = () => (mounted.view as unknown as { setLocale?: (locale: string) => void }).setLocale?.(getLocale());
    setLocale();
    const unsubscribeLocale = subscribeLocale(setLocale);
    mounted.view.setAutomaticCameraMinimumScale(teachingCameraFloor());
    mounted.view.setAutomaticCameraMaximumScale(teachingCameraCeiling());
    mountedRef.current = mounted;
    const handleClick = (event: MouseEvent) => {
      if (!onTargetRef.current) return;
      const element = (event.target as Element | null)?.closest<HTMLElement | SVGElement>("[data-id]");
      const target = boardTargetFromId(element?.dataset.id);
      if (target) onTargetRef.current(target);
    };
    viewport.addEventListener("click", handleClick);
    return () => {
      viewport.removeEventListener("click", handleClick);
      unsubscribeLocale();
      void inkRef.current?.destroy();
      inkRef.current = null;
      mounted.destroy();
      mountedRef.current = null;
    };
  }, [resolveAsset]);

  useImperativeHandle(ref, () => ({
    async startInk(documentId) {
      const mounted = mountedRef.current;
      if (!mounted || inkRef.current) return;
      const { mountInkRuntime } = await import("octos-lesson-language/ink-runtime");
      await import("octos-lesson-language/ink-runtime/styles.css");
      const ink = mountInkRuntime({
        board: mounted.view, viewport: mounted.elements.viewport,
        storageKey: `octos-learn:teach-ink:${documentId}`, documentId, locale: getLocale(),
      });
      await ink.ready;
      ink.setMode("navigate");
      inkRef.current = ink;
    },
    setPen(on) {
      inkRef.current?.setMode(on ? "draw" : "navigate");
    },
    async freezeInk() {
      const ink = inkRef.current;
      const mounted = mountedRef.current;
      if (!ink || !mounted) return null;
      inkRef.current = null;
      try {
        if (!ink.state.component_count) return null;
        ink.selectAll();
        const snapshot = await ink.captureSelectionSnapshot();
        const { bounds } = snapshot;
        const annotates = annotationFor(mounted.elements.viewport, bounds);
        return { svg: snapshot.svg, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), ...(annotates ? { annotates } : {}) };
      } finally {
        await ink.destroy();
      }
    },
    async discardInk() {
      const ink = inkRef.current;
      inkRef.current = null;
      await ink?.destroy();
    },
  }), []);

  useEffect(() => {
    const mounted = mountedRef.current;
    const viewport = viewportRef.current;
    if (!mounted || !viewport) return;
    if (!compiled) {
      mounted.view.render(null);
      return;
    }
    const events = normalizeAuthoringLesson(compiled.lesson, {
      lessonId: STUDIO_LESSON_ID,
      boardId: "studio-board",
      baseRevision: 0,
      resourceContext: compiled.resourceContext,
    });
    mounted.view.setRegionLayouts({
      __legacy__: {
        x: 20, y: 20, flow: "teaching", nodeSections: nodeSections(events),
        composition: { width: viewport.clientWidth, height: viewport.clientHeight, mode: "progressive", readingScale: teachingReadingScale() },
      },
    });
    const state = reduceCanonicalEvents(events);
    mounted.view.render(state);
    if (state.focus.length) mounted.view.focusTargets(state.focus);
  }, [compiled]);

  return <div ref={viewportRef} className="teach-board" data-testid="teach-board" data-pointing={onTarget ? "true" : undefined} />;
});
