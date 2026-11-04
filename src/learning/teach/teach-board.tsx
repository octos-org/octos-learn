import { getLocale, subscribeLocale } from "@/i18n";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { normalizeAuthoringLesson, reduceCanonicalEvents, scene3dViewForIntent, setLessonVariable, type CanonicalTarget, type SemanticBoardState } from "octos-lesson-language";
import { mountInfiniteBoard, mountVariableControls, type ImageAssetResolver, type MountedInfiniteBoard, type StudentVariableInputHandler, type VariableControlsView } from "octos-lesson-language/web-runtime";
import { buildInteractionClusters } from "../oll/interaction-clusters";
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
  /**
   * Freezes the selected strokes on their own and removes them from the live
   * ink; null when nothing is selected. `undoSteps` is how many ink undos put
   * the strokes back.
   */
  cutSelectedInk(): Promise<(FrozenInk & { undoSteps: number }) | null>;
  /** Hears each change the learner makes to the live ink (a stroke drawn, erased or moved); not the board's own changes. */
  onInkEdit(listener: (steps: number) => void): () => void;
  /** Takes back the last `steps` changes to the live ink. */
  undoInk(steps?: number): Promise<void>;
  /** Shows the pointer on what the learner tapped, or at a board point; briefly, or until replaced when `hold` is set; null hides it. */
  showPointer(target: BoardTarget | { at: { x: number; y: number } } | null, options?: { hold?: boolean }): void;
  /**
   * Highlighter marks on the take's live writing, in board units. Writing that
   * is frozen into the lesson shows its highlight from the lesson itself.
   */
  markInk(boxes: BoardBox[]): void;
  /** Whether a live stroke still covers a board point (it may have been erased or made neat). */
  hasStrokeAt(point: { x: number; y: number }): boolean;
}

const ANNOTATABLE = new Set(["geometry", "plot", "scene3d", "image"]);
/** How long the pointer stays where the learner tapped with the laser. */
const POINTER_MS = 1_600;
/** One card's slider panel: the variables it shows, drawn in a layer of the board. */
interface Slider { layer: HTMLDivElement; view: VariableControlsView; aliases: Set<string> }
const renderSlider = (slider: Slider, state: SemanticBoardState) => slider.view.render({
  ...state, variables: Object.fromEntries(Object.entries(state.variables ?? {}).filter(([alias]) => slider.aliases.has(alias))),
});

/** A slider row's height and the slider panel's width, in board units (as in playback). */
const SLIDER_ROW = 34;
const SLIDER_WIDTH = 360;
/** How far, in board units, a highlighter mark reaches past the writing it marks. */
const MARK_PAD = 6;
/** How close, in board units, a tap must be to a stroke of writing to point at it. */
const STROKE_TOLERANCE = 10;

/** A board element ID as an OLL target: a card, or a part of one. */
function canonicalTarget(id: string): CanonicalTarget {
  const fragment = id.indexOf(":fragment:");
  return fragment < 0 ? { node_id: id } : { node_id: id.slice(0, fragment), fragment_id: id };
}

/** The board IDs a recorded card ends on, as its final focus names them. */
function cardEndTargets(compiled: CompiledLesson, key: string): string[] {
  const beat = compiled.lesson.steps[0]?.beats.find((candidate) => candidate.key === key);
  const focus = [...(beat?.actions ?? [])].reverse().find((action) => action.do === "focus") as { targets?: string[] } | undefined;
  return (focus?.targets ?? []).map((target) => boardIdOf({ node: target.split("#")[0]! }));
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
 * Runs one of the board's own ink changes (undo, cutting writing out) without
 * reporting it as the learner's; returns how many ink steps it took.
 */
async function quietInk(ink: InkRuntime, quiet: { current: number }, revision: { current: number }, change: () => unknown): Promise<number> {
  const before = ink.state.content_revision;
  quiet.current += 1;
  try { await change(); } finally {
    revision.current = ink.state.content_revision;
    quiet.current -= 1;
  }
  return ink.state.content_revision - before;
}

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
  /** Room at the bottom of the board covered by the host's tools; the camera keeps cards above it. */
  bottomInset?: number;
  /** A recorded card to frame, as it ends; without one the board frames the latest card. */
  focusCard?: string;
}>(function TeachBoard({ compiled, resolveAsset, onTarget, onStroke, onVariableGesture, onSceneGesture, bottomInset = 0, focusCard }, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const inkRef = useRef<InkRuntime | null>(null);
  const marksRef = useRef<HTMLDivElement | null>(null);
  // The sliders of the lesson's variables, one panel per card they belong to, docked under that card as in playback.
  const slidersRef = useRef(new Map<string, Slider>());
  const variableInputRef = useRef<StudentVariableInputHandler | null>(null);
  // Live-ink changes the learner makes, told apart from the board's own (undo, cutting writing out).
  const inkEditsRef = useRef(new Set<(steps: number) => void>());
  const inkRevisionRef = useRef(0);
  const inkQuietRef = useRef(0);
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
    mounted.view.setViewportInsets({ top: 0, right: 0, bottom: bottomInset, left: 0 });
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
      for (const slider of slidersRef.current.values()) renderSlider(slider, next);
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
    variableInputRef.current = (alias, value, event) => variableInput(alias, value, event);
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
      marksRef.current = null;
      for (const { layer } of slidersRef.current.values()) layer.remove();
      slidersRef.current.clear();
      void inkRef.current?.destroy();
      inkRef.current = null;
      mounted.destroy();
      mountedRef.current = null;
    };
  }, [resolveAsset, bottomInset]);

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
      inkRevisionRef.current = ink.state.content_revision;
      // Each js-draw command is one change and one undo step.
      ink.subscribe((state) => {
        if (inkRef.current !== ink || inkQuietRef.current || state.content_revision === inkRevisionRef.current) return;
        const steps = state.content_revision - inkRevisionRef.current;
        inkRevisionRef.current = state.content_revision;
        if (steps > 0) for (const listener of inkEditsRef.current) listener(steps);
      });
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
      const undoSteps = await quietInk(ink, inkQuietRef, inkRevisionRef, () => ink.deleteSelection());
      return { svg: snapshot.svg, x: bounds.x, y: bounds.y, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), ...(annotates ? { annotates } : {}), undoSteps };
    },
    onInkEdit(listener) {
      inkEditsRef.current.add(listener);
      return () => { inkEditsRef.current.delete(listener); };
    },
    async undoInk(steps = 1) {
      const ink = inkRef.current;
      if (!ink) return;
      await quietInk(ink, inkQuietRef, inkRevisionRef, async () => { for (let step = 0; step < steps; step++) await ink.undo(); });
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
    markInk(boxes) {
      const mounted = mountedRef.current;
      if (!mounted) return;
      let layer = marksRef.current;
      if (!layer && boxes.length) {
        layer = document.createElement("div");
        layer.className = "teach-ink-marks";
        layer.setAttribute("aria-hidden", "true");
        mounted.view.mountWorldLayer(layer);
        marksRef.current = layer;
      }
      if (!layer) return;
      layer.replaceChildren(...boxes.map((box) => {
        const mark = document.createElement("div");
        Object.assign(mark.style, { left: `${box.x - MARK_PAD}px`, top: `${box.y - MARK_PAD}px`, width: `${box.width + MARK_PAD * 2}px`, height: `${box.height + MARK_PAD * 2}px` });
        return mark;
      }));
    },
  }), []);

  /** Puts each card's slider panel where the layout docked it, under the card, in the board's own coordinates. */
  const placeSliders = (mounted: MountedInfiniteBoard, state: SemanticBoardState | null, clusters: ReturnType<typeof buildInteractionClusters>) => {
    const sliders = slidersRef.current;
    const rects = state ? mounted.view.getAttachmentBoundsMap() : {};
    for (const [id, { layer }] of sliders) {
      if (!clusters.some((cluster) => cluster.id === id) || !rects[id]) { layer.remove(); sliders.delete(id); }
    }
    if (!state) return;
    for (const cluster of clusters) {
      const rect = rects[cluster.id];
      if (!rect) continue;
      let slider = sliders.get(cluster.id);
      if (!slider) {
        const layer = document.createElement("div");
        layer.className = "teach-board-sliders";
        layer.dataset.ollInkInput = "ignore";
        mounted.view.mountWorldLayer(layer);
        slider = { layer, view: mountVariableControls(layer, (alias, value, event) => variableInputRef.current?.(alias, value, event)), aliases: new Set() };
        sliders.set(cluster.id, slider);
      }
      Object.assign(slider.layer.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px` });
      slider.aliases = new Set(cluster.variableAliases);
      renderSlider(slider, state);
    }
  };

  useEffect(() => {
    const mounted = mountedRef.current;
    const viewport = viewportRef.current;
    if (!mounted || !viewport) return;
    if (!compiled) {
      mounted.view.render(null);
      placeSliders(mounted, null, []);
      return;
    }
    const events = normalizeAuthoringLesson(compiled.lesson, {
      lessonId: STUDIO_LESSON_ID,
      boardId: "studio-board",
      baseRevision: 0,
      resourceContext: compiled.resourceContext,
    });
    const state = reduceCanonicalEvents(events);
    // Each card's sliders are docked under it, and the layout keeps room for them, as in playback.
    const clusters = buildInteractionClusters(state, { id: "__legacy__" }, Object.keys(state.variables ?? {}), []);
    const layouts = teachingRegionLayout(events, viewport.clientWidth, viewport.clientHeight);
    if (clusters.length) layouts.__legacy__ = { ...layouts.__legacy__!, attachments: clusters.map((cluster) => {
      const height = 12 + cluster.variableAliases.length * SLIDER_ROW;
      return { id: cluster.id, kind: "control" as const, anchorNodeId: cluster.anchorNodeId, ownerNodeId: cluster.nodeIds[0] ?? cluster.anchorNodeId,
        anchorNodeIds: cluster.nodeIds, width: SLIDER_WIDTH, height, focusHeight: height, gap: 24 };
    }) };
    mounted.view.setRegionLayouts(layouts);
    boardStateRef.current = state;
    // A 3D scene shows its recorded view: the camera of its last view intent.
    mounted.view.setScene3dViews(Object.fromEntries(Object.values(state.nodes)
      .filter((node) => node.kind === "scene3d")
      .map((node) => [node.id, node.view_intent ? scene3dViewForIntent(node.content, node.view_intent, node.content.camera) : node.content.camera])));
    mounted.view.render(state);
    placeSliders(mounted, state, clusters);
    const framed = focusCard ? cardEndTargets(compiled, focusCard) : state.focus;
    if (framed.length) mounted.view.focusTargets(framed);
    // A redraw hides the pointer; the learner's tap still shows until it fades.
    if (pointerRef.current?.canonical) mounted.view.showPointer(pointerRef.current.canonical);
    else if (pointerRef.current?.at) mounted.view.showPointerAt(pointerRef.current.at);
  }, [compiled, focusCard]);

  return (
    <div className="teach-board-frame">
      <div ref={viewportRef} className="teach-board" data-testid="teach-board" data-pointing={onTarget ? "true" : undefined} data-interactive={onVariableGesture ? "true" : undefined} />
    </div>
  );
});
