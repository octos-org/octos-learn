import { getLocale, subscribeLocale } from "@/i18n";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { normalizeAuthoringLesson, reduceCanonicalEvents, scene3dViewForIntent, setLessonVariable, type CanonicalEvent, type SemanticBoardState } from "octos-lesson-language";
import { mountInfiniteBoard, mountVariableControls, type ImageAssetResolver, type MountedInfiniteBoard, type VariableControlsView } from "octos-lesson-language/web-runtime";
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
  /** Writing tool for the take's ink: draw, erase, or off (the board moves and responds). */
  setPen(mode: "draw" | "erase" | "off"): void;
  /** Freezes the take's strokes and removes the live ink; null when nothing was drawn. */
  freezeInk(): Promise<FrozenInk | null>;
  /** Removes the live ink without keeping it. */
  discardInk(): Promise<void>;
  /** The value a lesson variable shows on the board now. */
  variableValue(alias: string): number | undefined;
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

/** A finished drag of a lesson variable (unit circle point or slider). */
export interface VariableGesture {
  variable: string;
  via: "slider" | "geometry_point";
  from: number;
  to: number;
  durationMs: number;
}

/** A finished turn of a 3D scene by the learner. */
export interface SceneGesture {
  node: string;
  yaw: number;
  pitch: number;
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
  /** While set, the learner can drag variables and turn 3D scenes; each finished gesture is reported. */
  onVariableGesture?: (gesture: VariableGesture) => void;
  onSceneGesture?: (gesture: SceneGesture) => void;
}>(function TeachBoard({ compiled, resolveAsset, onTarget, onVariableGesture, onSceneGesture }, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const inkRef = useRef<InkRuntime | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<VariableControlsView | null>(null);
  // The compiled board, and what the learner's drags show on top of it until
  // the recording catches up.
  const boardStateRef = useRef<SemanticBoardState | null>(null);
  const gestureRef = useRef<{ variable: string; from: number; startedAt: number } | null>(null);
  const gesturesRef = useRef({ onVariableGesture, onSceneGesture });
  useEffect(() => {
    gesturesRef.current = { onVariableGesture, onSceneGesture };
  }, [onVariableGesture, onSceneGesture]);
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

    const showVariable = (alias: string, value: number) => {
      const state = boardStateRef.current;
      if (!state?.variables?.[alias]) return;
      const next = setLessonVariable(state, alias, value);
      boardStateRef.current = next;
      mounted.view.render(next);
      sliderRef.current?.render(next);
    };
    const variableInput = (alias: string, value: number, event: { phase: "start" | "update" | "commit"; control: string }) => {
      if (!gesturesRef.current.onVariableGesture) return;
      const current = boardStateRef.current?.variables?.[alias]?.value;
      if (event.phase === "start" || !gestureRef.current) {
        gestureRef.current = { variable: alias, from: current ?? value, startedAt: performance.now() };
      }
      showVariable(alias, value);
      if (event.phase === "commit" && gestureRef.current) {
        const { from, startedAt } = gestureRef.current;
        gestureRef.current = null;
        if (from !== value) {
          gesturesRef.current.onVariableGesture?.({
            variable: alias, via: event.control === "geometry_point" ? "geometry_point" : "slider",
            from, to: value, durationMs: Math.round(performance.now() - startedAt),
          });
        }
      }
      return `studio-gesture-${alias}`;
    };
    mounted.view.setVariableInputHandler((alias, value, event) => variableInput(alias, value, event));
    if (controlsRef.current) sliderRef.current = mountVariableControls(controlsRef.current, (alias, value, event) => variableInput(alias, value, event));
    mounted.view.setScene3dInputHandler((nodeId, view, event) => {
      if (!gesturesRef.current.onSceneGesture) return;
      mounted.view.setScene3dViews({ [nodeId]: view });
      const target = boardTargetFromId(nodeId);
      if (event.phase === "commit" && target) gesturesRef.current.onSceneGesture({ node: target.node, yaw: view.yaw, pitch: view.pitch });
      return `studio-scene-${nodeId}`;
    });

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
    setPen(mode) {
      inkRef.current?.setMode(mode === "off" ? "navigate" : mode);
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
    variableValue(alias) {
      return boardStateRef.current?.variables?.[alias]?.value;
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
    boardStateRef.current = state;
    // A 3D scene shows its recorded view: the camera of its last view intent.
    mounted.view.setScene3dViews(Object.fromEntries(Object.values(state.nodes)
      .filter((node) => node.kind === "scene3d")
      .map((node) => [node.id, node.view_intent ? scene3dViewForIntent(node.content, node.view_intent, node.content.camera) : node.content.camera])));
    mounted.view.render(state);
    sliderRef.current?.render(state);
    if (state.focus.length) mounted.view.focusTargets(state.focus);
  }, [compiled]);

  return (
    <div className="teach-board-frame">
      <div ref={viewportRef} className="teach-board" data-testid="teach-board" data-pointing={onTarget ? "true" : undefined} data-interactive={onVariableGesture ? "true" : undefined} />
      <div ref={controlsRef} className="teach-board-controls" />
    </div>
  );
});
