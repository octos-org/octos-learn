import { getLocale, subscribeLocale } from "@/i18n";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { normalizeAuthoringLesson, reduceCanonicalEvents, scene3dViewForIntent, setLessonVariable, type CanonicalTarget, type SemanticBoardState } from "octos-lesson-language";
import { mountInfiniteBoard, mountVariableControls, type ImageAssetResolver, type MountedInfiniteBoard, type VariableControlsView } from "octos-lesson-language/web-runtime";
import "octos-lesson-language/web-runtime/styles.css";

import { teachingCameraCeiling, teachingCameraFloor } from "../oll/board-chrome-insets";
import type { CompiledLesson } from "./compile-recording";
import type { BoardTarget, CardInk } from "./recording";
import { boardIdOf, boardTargetFromId, STUDIO_LESSON_ID } from "./studio-board-ids";
import { segmentDrag, unwrapAngle, type DragSample } from "./studio-helpers";
import { teachingRegionLayout } from "./teaching-board-setup";


/** Ink frozen when a take stops: its SVG and where on the board it was drawn. */
export interface FrozenInk {
  svg: string;
  /** Its box on the board. */
  x: number;
  y: number;
  width: number;
  height: number;
  annotates?: CardInk["annotates"];
}

/** A box on the board, in board coordinates. */
export interface BoardBox { x: number; y: number; width: number; height: number }

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
  /** How many strokes the take has drawn so far. */
  inkCount(): number;
  /** The learner circles strokes with a lasso; `onChange` hears how many are selected. Returns a stop function. */
  selectInk(onChange: (selected: number) => void): () => void;
  /** Selects every stroke of the take. */
  selectAllInk(): void;
  /** The selected strokes as an image, without changing them; null when nothing is selected. */
  selectedInk(): Promise<{ svg: string; width: number; height: number } | null>;
  /** Freezes the selected strokes on their own and removes them from the live ink; null when nothing is selected. */
  cutSelectedInk(): Promise<FrozenInk | null>;
  /** Shows the pointer on what the learner tapped, or at a board point; briefly, or until replaced when `hold` is set; null hides it. */
  showPointer(target: BoardTarget | { at: { x: number; y: number } } | null, options?: { hold?: boolean }): void;
  /** Whether a live stroke still covers a board point (it may have been erased or made neat). */
  hasStrokeAt(point: { x: number; y: number }): boolean;
}

const ANNOTATABLE = new Set(["geometry", "plot", "scene3d", "image"]);
/** How long the pointer stays where the learner tapped with the laser. */
const POINTER_MS = 1_600;
/** How close, in board units, a tap must be to a stroke of writing to point at it. */
const STROKE_TOLERANCE = 10;

/** A board element ID as an OLL target: a card, or a part of one. */
function canonicalTarget(id: string): CanonicalTarget {
  const fragment = id.indexOf(":fragment:");
  return fragment < 0 ? { node_id: id } : { node_id: id.slice(0, fragment), fragment_id: id };
}

function sameTarget(a: BoardTarget, b: BoardTarget): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
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

/** One move of a finished drag of a lesson variable (unit circle point or slider). */
export interface VariableGesture {
  variable: string;
  via: "slider" | "geometry_point";
  from: number;
  to: number;
  durationMs: number;
  /** How long before the report this move started. */
  startedAgoMs: number;
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
  /** Called with the box of a stroke of the take's own writing the learner tapped with a pointing tool. */
  onStroke?: (stroke: BoardBox) => void;
  /** While set, the learner can drag variables and turn 3D scenes; each finished gesture is reported. */
  onVariableGesture?: (gesture: VariableGesture) => void;
  onSceneGesture?: (gesture: SceneGesture) => void;
}>(function TeachBoard({ compiled, resolveAsset, onTarget, onStroke, onVariableGesture, onSceneGesture }, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const inkRef = useRef<InkRuntime | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<VariableControlsView | null>(null);
  // The compiled board, and what the learner's drags show on top of it until
  // the recording catches up.
  const boardStateRef = useRef<SemanticBoardState | null>(null);
  const gestureRef = useRef<{ variable: string; samples: DragSample[] } | null>(null);
  const gesturesRef = useRef({ onVariableGesture, onSceneGesture });
  useEffect(() => {
    gesturesRef.current = { onVariableGesture, onSceneGesture };
  }, [onVariableGesture, onSceneGesture]);
  // The last tap, as the board names it, so the pointer lands on exactly what was tapped.
  const tappedRef = useRef<{ target: BoardTarget; canonical: CanonicalTarget } | null>(null);
  const pointerRef = useRef<{ canonical?: CanonicalTarget; at?: { x: number; y: number }; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const onTargetRef = useRef(onTarget);
  const onStrokeRef = useRef(onStroke);
  useEffect(() => {
    onTargetRef.current = onTarget;
    onStrokeRef.current = onStroke;
  }, [onTarget, onStroke]);

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
      // The take's own writing is not on a card yet: a tap on a stroke points at that stroke.
      const box = viewport.getBoundingClientRect();
      const point = mounted.view.viewportToBoard({ x: event.clientX - box.left, y: event.clientY - box.top });
      const stroke = inkRef.current?.strokeBoundsAt(point, STROKE_TOLERANCE);
      if (stroke && onStrokeRef.current) {
        onStrokeRef.current(stroke);
        return;
      }
      const element = (event.target as Element | null)?.closest<HTMLElement | SVGElement>("[data-id]");
      const target = boardTargetFromId(element?.dataset.id);
      if (!target || !element?.dataset.id) return;
      tappedRef.current = { target, canonical: canonicalTarget(element.dataset.id) };
      onTargetRef.current(target);
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
      const at = performance.now();
      if (event.phase === "start" || !gestureRef.current) {
        gestureRef.current = { variable: alias, samples: [{ value: current ?? value, at }] };
      }
      gestureRef.current.samples.push({ value: event.control === "geometry_point" ? unwrapAngle(gestureRef.current.samples.at(-1)!.value, value, boardStateRef.current?.variables?.[alias]) : value, at });
      showVariable(alias, value);
      if (event.phase === "commit") {
        const { samples } = gestureRef.current;
        gestureRef.current = null;
        // A back-and-forth drag plays back as the moves the learner made.
        for (const segment of segmentDrag(samples)) {
          gesturesRef.current.onVariableGesture?.({
            variable: alias, via: event.control === "geometry_point" ? "geometry_point" : "slider",
            from: segment.from, to: segment.to,
            durationMs: Math.max(1, Math.round(segment.endAt - segment.startAt)),
            startedAgoMs: Math.round(at - segment.startAt),
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
      clearTimeout(pointerRef.current?.timer);
      pointerRef.current = null;
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
        return { svg: snapshot.svg, x: bounds.x, y: bounds.y, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), ...(annotates ? { annotates } : {}) };
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
    inkCount() {
      return inkRef.current?.state.component_count ?? 0;
    },
    selectInk(onChange) {
      const ink = inkRef.current;
      if (!ink) return () => undefined;
      ink.setSelectionMode("lasso");
      ink.setMode("select");
      onChange(ink.state.selected_count);
      return ink.subscribe((state) => onChange(state.selected_count));
    },
    selectAllInk() {
      inkRef.current?.selectAll();
    },
    async selectedInk() {
      const ink = inkRef.current;
      if (!ink || !ink.state.selected_count) return null;
      const snapshot = await ink.captureSelectionSnapshot();
      return { svg: snapshot.svg, width: Math.max(1, snapshot.bounds.width), height: Math.max(1, snapshot.bounds.height) };
    },
    async cutSelectedInk() {
      const ink = inkRef.current;
      const mounted = mountedRef.current;
      if (!ink || !mounted || !ink.state.selected_count) return null;
      const snapshot = await ink.captureSelectionSnapshot();
      const { bounds } = snapshot;
      const annotates = annotationFor(mounted.elements.viewport, bounds);
      await ink.deleteSelection();
      return { svg: snapshot.svg, x: bounds.x, y: bounds.y, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), ...(annotates ? { annotates } : {}) };
    },
    showPointer(target, options) {
      const view = mountedRef.current?.view;
      clearTimeout(pointerRef.current?.timer);
      pointerRef.current = null;
      if (!view) return;
      if (!target) { view.showPointer(undefined); return; }
      const timer = options?.hold ? undefined : setTimeout(() => {
        pointerRef.current = null;
        mountedRef.current?.view.showPointer(undefined);
      }, POINTER_MS);
      if ("at" in target) {
        pointerRef.current = { at: target.at, timer };
        view.showPointerAt(target.at);
        return;
      }
      const tapped = tappedRef.current;
      const canonical = tapped && sameTarget(tapped.target, target) ? tapped.canonical
        : "node" in target ? canonicalTarget(boardIdOf(target)) : undefined;
      if (!canonical) { clearTimeout(timer); view.showPointer(undefined); return; }
      pointerRef.current = { canonical, timer };
      view.showPointer(canonical);
    },
    hasStrokeAt(point) {
      return Boolean(inkRef.current?.strokeBoundsAt(point, 0));
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
    mounted.view.setRegionLayouts(teachingRegionLayout(events, viewport.clientWidth, viewport.clientHeight));
    const state = reduceCanonicalEvents(events);
    boardStateRef.current = state;
    // A 3D scene shows its recorded view: the camera of its last view intent.
    mounted.view.setScene3dViews(Object.fromEntries(Object.values(state.nodes)
      .filter((node) => node.kind === "scene3d")
      .map((node) => [node.id, node.view_intent ? scene3dViewForIntent(node.content, node.view_intent, node.content.camera) : node.content.camera])));
    mounted.view.render(state);
    sliderRef.current?.render(state);
    if (state.focus.length) mounted.view.focusTargets(state.focus);
    // A redraw hides the pointer; the learner's tap still shows until it fades.
    if (pointerRef.current?.canonical) mounted.view.showPointer(pointerRef.current.canonical);
    else if (pointerRef.current?.at) mounted.view.showPointerAt(pointerRef.current.at);
  }, [compiled]);

  return (
    <div className="teach-board-frame">
      <div ref={viewportRef} className="teach-board" data-testid="teach-board" data-pointing={onTarget ? "true" : undefined} data-interactive={onVariableGesture ? "true" : undefined} />
      <div ref={controlsRef} className="teach-board-controls" />
    </div>
  );
});
