import { getLocale, subscribeLocale } from "@/i18n";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { normalizeAuthoringLesson, reduceCanonicalEvents, scene3dViewForIntent, setLessonVariable, type CanonicalTarget, type SemanticBoardState } from "octos-lesson-language";
import { mountInfiniteBoard, mountVariableControls, type ImageAssetResolver, type MountedInfiniteBoard, type StudentVariableInputHandler, type VariableControlsView } from "octos-lesson-language/web-runtime";
import { buildInteractionClusters } from "../oll/interaction-clusters";
import "octos-lesson-language/web-runtime/styles.css";

import { teachingCameraCeiling, teachingCameraFloor } from "../oll/board-chrome-insets";
import { compiledCardActions, type CompiledLesson } from "./compile-recording";
import { sameBoardTarget, type BoardTarget, type CardInk } from "./recording";
import { boardIdOf, boardTargetFromId, STUDIO_LESSON_ID } from "./studio-board-ids";
import { segmentDrag, wrapDrag, unwrapAngle, type DragSample } from "./studio-helpers";
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
  /** Written on or just below a handwriting or math card: it continues that card, where it was written. */
  continues?: CardInk["continues"];
  /** When each stroke was drawn (ms since the epoch), in the snapshot's stroke order, when every one was timed. */
  strokeDrawnAt?: number[];
}

/** A cell of a table on the board: row and column count from 0, rows below the headings. */
export interface TableCell { node: string; row: number; column: number; text: string }

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
  const focus = [...compiledCardActions(compiled, key)].reverse().find((action) => action.do === "focus") as { targets?: string[] } | undefined;
  return (focus?.targets ?? []).map((target) => boardIdOf({ node: target.split("#")[0]! }));
}

/** How close, in screen pixels, a tap must be to a part of a card to point at that part. */
const PART_REACH = 18;

/** Screen distance from a point to a part: along an SVG shape's outline, else to its box. */
function distanceToPart(part: Element, x: number, y: number): number {
  if (part instanceof SVGGeometryElement && typeof part.getTotalLength === "function") {
    const matrix = part.getScreenCTM();
    if (matrix) {
      const length = part.getTotalLength();
      const samples = Math.min(240, Math.max(12, Math.ceil(length / 2)));
      let best = Infinity;
      for (let index = 0; index <= samples; index += 1) {
        const at = part.getPointAtLength((length * index) / samples);
        const screen = new DOMPoint(at.x, at.y).matrixTransform(matrix);
        best = Math.min(best, Math.hypot(screen.x - x, screen.y - y));
      }
      return best;
    }
  }
  const box = part.getBoundingClientRect();
  if (!(box.width > 0 || box.height > 0)) return Infinity;
  return Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom));
}

/** A part this small (a point) is preferred over a line or curve passing through it. */
const SMALL_PART = 24;
const SMALL_PART_BONUS = 10;

/**
 * The part of a card nearest a tap, when one is within reach. Points win over
 * lines through them, and of parts equally near, the one drawn on top wins.
 */
function nearestPart(node: HTMLElement, x: number, y: number): HTMLElement | SVGElement | null {
  // A 3D scene's parts are faces, areas the tap is either on or not.
  if (node.dataset.kind === "scene3d") return null;
  let best: HTMLElement | SVGElement | null = null;
  let bestScore = PART_REACH;
  for (const part of node.querySelectorAll<HTMLElement | SVGElement>('[data-id*=":fragment:"]')) {
    const distance = distanceToPart(part, x, y);
    if (distance > PART_REACH) continue;
    const box = part.getBoundingClientRect();
    const score = distance - (box.width <= SMALL_PART && box.height <= SMALL_PART ? SMALL_PART_BONUS : 0);
    if (score <= bestScore) { best = part; bestScore = score; }
  }
  return best;
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

/** Cards writing can continue: handwriting and math (OLL placement `continues`). */
const CONTINUABLE = new Set(["ink", "math"]);
/** How far below a card new writing still continues it, and how far to either side. */
const CONTINUE_BELOW = 160;
const CONTINUE_SIDE = 80;

/**
 * Writing that starts on or just below a handwriting or math card (and is not
 * drawn on a figure) continues that card: it stays where it was written, as
 * the next line of the same working. Of several such cards, the one whose
 * bottom is nearest above the writing is the line it follows. The offset is in
 * board coordinates from the card's top-left, which is what the layout uses
 * to place it again.
 */
function continuationFor(viewport: HTMLElement, ink: { x: number; y: number; width: number; height: number }): CardInk["continues"] {
  if (!(ink.width > 0 && ink.height > 0)) return undefined;
  let best: { node: string; card: { x: number; y: number; height: number }; gap: number } | undefined;
  for (const element of viewport.querySelectorAll<HTMLElement>(".board-node[data-id]")) {
    if (!CONTINUABLE.has(element.dataset.kind ?? "") || element.classList.contains("annotation")) continue;
    const card = {
      x: parseFloat(element.style.left), y: parseFloat(element.style.top),
      width: parseFloat(element.style.width), height: parseFloat(element.style.height),
    };
    if (![card.x, card.y, card.width, card.height].every(Number.isFinite) || card.width <= 0 || card.height <= 0) continue;
    const overlapX = Math.min(card.x + card.width + CONTINUE_SIDE, ink.x + ink.width) - Math.max(card.x - CONTINUE_SIDE, ink.x);
    if (overlapX < Math.min(ink.width, card.width) * 0.3) continue;
    const gap = ink.y - (card.y + card.height);
    if (ink.y < card.y - 24 || gap > CONTINUE_BELOW) continue;
    const target = boardTargetFromId(element.dataset.id);
    if (!target) continue;
    const distance = Math.max(0, gap);
    if (!best || distance < best.gap || (distance === best.gap && card.y > best.card.y)) best = { node: target.node, card, gap: distance };
  }
  return best ? { node: best.node, x: Math.round(ink.x - best.card.x), y: Math.round(ink.y - best.card.y) } : undefined;
}

/** Where frozen writing goes: on a figure (annotation), continuing a card, or a card of its own. */
function placeFrozen(viewport: HTMLElement, bounds: { x: number; y: number; width: number; height: number }): Pick<FrozenInk, "annotates" | "continues"> {
  const annotates = annotationFor(viewport, bounds);
  if (annotates) return { annotates };
  const continues = continuationFor(viewport, bounds);
  return continues ? { continues } : {};
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
  onTarget?: (target: BoardTarget, solid?: BoardTarget) => void;
  highlighting?: boolean;
  /** Called with the box of a stroke of the take's own writing the learner tapped with a pointing tool. */
  onStroke?: (stroke: BoardBox) => void;
  /** While set, the learner can drag variables and turn 3D scenes; each finished gesture is reported. */
  onVariableGesture?: (gesture: VariableGesture) => void;
  onSceneGesture?: (gesture: SceneGesture) => void;
  /** Room at the bottom of the board covered by the host's tools; the camera keeps cards above it. */
  bottomInset?: number;
  /** A recorded card to frame, as it ends; without one the board frames the latest card. */
  focusCard?: string;
  /** Where an arrow being drawn starts: a line follows the pointer from it until the end is tapped. */
  arrowFrom?: BoardTarget | null;
  /** The card the take's writing will continue as it is written (null when it is a card of its own). */
  onContinuing?: (node: string | null) => void;
  /** While set, tapping a cell of a table on the board reports it, to fill it in. */
  onTableCell?: (cell: TableCell) => void;
  /** While set, tapping a diagram or a graph on the board reports it, to add a box or a curve. */
  onDiagram?: (node: string, kind: "diagram" | "plot") => void;
}>(function TeachBoard({ compiled, resolveAsset, onTarget, highlighting, onStroke, onVariableGesture, onSceneGesture, bottomInset = 0, focusCard, arrowFrom, onContinuing, onTableCell, onDiagram }, ref) {
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
  const onContinuingRef = useRef(onContinuing);
  useEffect(() => { onContinuingRef.current = onContinuing; }, [onContinuing]);
  const onTableCellRef = useRef(onTableCell);
  useEffect(() => { onTableCellRef.current = onTableCell; }, [onTableCell]);
  const onDiagramRef = useRef(onDiagram);
  useEffect(() => { onDiagramRef.current = onDiagram; }, [onDiagram]);
  // The card the live writing would continue, outlined while it is written.
  const continuingRef = useRef<string | null>(null);
  const showContinuing = (node: string | null) => {
    const viewport = viewportRef.current;
    if (continuingRef.current === node || !viewport) return;
    viewport.querySelector(".teach-continuing")?.classList.remove("teach-continuing");
    if (node) viewport.querySelector(`.board-node[data-id="${CSS.escape(boardIdOf({ node }))}"]`)?.classList.add("teach-continuing");
    continuingRef.current = node;
    onContinuingRef.current?.(node);
  };
  // The writing tool the learner picked, kept for ink that is still loading.
  const penRef = useRef<"draw" | "erase" | "off">("off");
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
      // A cell of a table (not its headings), to fill in.
      const cell = (event.target as Element | null)?.closest?.<HTMLElement>("[data-oll-target-kind='table-cell']");
      const found = cell && onTableCellRef.current ? /:node:([^:]+):table:row:(\d+):column:(\d+)$/.exec(cell.dataset.ollTargetId ?? "") : null;
      if (found) {
        onTableCellRef.current!({ node: found[1]!, row: Number(found[2]), column: Number(found[3]), text: cell!.textContent?.trim() ?? "" });
        return;
      }
      // A diagram or a graph, to add a box or a curve to (not its own controls).
      const growing = onDiagramRef.current && !(event.target as Element | null)?.closest?.("button, input, select, label")
        ? (event.target as Element | null)?.closest?.<HTMLElement>(".board-node.kind-diagram[data-id], .board-node.kind-plot[data-id]") : null;
      const growingTarget = growing ? boardTargetFromId(growing.dataset.id) : undefined;
      if (growing && growingTarget) {
        onDiagramRef.current!(growingTarget.node, growing.dataset.kind === "plot" ? "plot" : "diagram");
        return;
      }
      if (!onTargetRef.current) return;
      // The take's own writing is not on a card yet: a tap on a stroke points at that stroke.
      const box = viewport.getBoundingClientRect();
      const point = mounted.view.viewportToBoard({ x: event.clientX - box.left, y: event.clientY - box.top });
      const stroke = inkRef.current?.strokeBoundsAt(point, STROKE_TOLERANCE);
      if (stroke && onStrokeRef.current) {
        onStrokeRef.current(stroke);
        return;
      }
      // What is under the tap: a 3D scene captures the pointer, which makes the
      // click's target its whole drawing rather than the face that was tapped.
      const under = viewport.ownerDocument.elementFromPoint?.(event.clientX, event.clientY) ?? (event.target as Element | null);
      const tapped = viewport.contains(under) ? under : (event.target as Element | null);
      // A card's own buttons (a 3D view's presets, Explore) are not something to point at.
      if (tapped?.closest("button, input, select, label")) return;
      const hit = tapped?.closest<HTMLElement | SVGElement>("[data-id]");
      // A part is small (a point is a few pixels): a tap near one points at it, not at its card.
      const node = hit?.closest<HTMLElement>(".board-node[data-id]");
      const element = (node && nearestPart(node, event.clientX, event.clientY)) || hit;
      const target = boardTargetFromId(element?.dataset.id);
      if (!target || !element?.dataset.id) return;
      // The base polygons of a legacy box share a solid ID. A miss in a
      // drawing with face targets must never fall back to the whole solid.
      const wholeSolid = !target.part || element.matches(":is(.scene3d-solid, .scene3d-face):not(.scene3d-selectable-face)");
      if (viewport.hasAttribute("data-highlighting") && wholeSolid
        && node?.dataset.id && tapped?.closest(".scene3d-runtime")) {
        const objects = boardStateRef.current?.nodes[node.dataset.id]?.content.objects;
        if (Array.isArray(objects) && objects.some((object) => object.face_targets === true
          || (object.kind === "box" && typeof object.unfold === "number"))) return;
      }
      tappedRef.current = { target, canonical: canonicalTarget(element.dataset.id) };
      onTargetRef.current(target, boardTargetFromId(element.dataset.scene3dObjectId));
    };
    viewport.addEventListener("click", handleClick);
    const keepSceneStillForHighlight = (event: PointerEvent | WheelEvent) => {
      if (viewport.hasAttribute("data-highlighting") && (event.target as Element | null)?.closest(".scene3d-runtime svg")) {
        // Leave the face in place instead of starting an unrecorded orbit or zoom.
        if (event.type === "wheel") event.preventDefault();
        event.stopPropagation();
      }
    };
    viewport.addEventListener("pointerdown", keepSceneStillForHighlight, true);
    viewport.addEventListener("wheel", keepSceneStillForHighlight, { capture: true, passive: false });

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
        // A back-and-forth drag plays back as the moves the learner made; a
        // wrapping angle may cross the end of its range on the way.
        const declaration = boardStateRef.current?.variables?.[alias];
        const segments = segmentDrag(samples);
        for (const segment of declaration?.wrap ? wrapDrag(segments, declaration) : segments) {
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
      if (viewport.hasAttribute("data-highlighting") && (event.control === "orbit" || event.control === "zoom")) return;
      mounted.view.setScene3dViews({ [nodeId]: view });
      const target = boardTargetFromId(nodeId);
      if (event.phase === "commit" && target) gesturesRef.current.onSceneGesture({ node: target.node, yaw: view.yaw, pitch: view.pitch });
      return `studio-scene-${nodeId}`;
    });

    return () => {
      clearTimeout(pointerRef.current?.timer);
      pointerRef.current = null;
      viewport.removeEventListener("click", handleClick);
      viewport.removeEventListener("pointerdown", keepSceneStillForHighlight, true);
      viewport.removeEventListener("wheel", keepSceneStillForHighlight, true);
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
      // A pen picked while the ink was still loading applies now.
      ink.setMode(penRef.current === "off" ? "navigate" : penRef.current);
      inkRevisionRef.current = ink.state.content_revision;
      // Each js-draw command is one change and one undo step.
      ink.subscribe((state) => {
        if (inkRef.current !== ink || inkQuietRef.current || state.content_revision === inkRevisionRef.current) return;
        const steps = state.content_revision - inkRevisionRef.current;
        inkRevisionRef.current = state.content_revision;
        if (steps > 0) for (const listener of inkEditsRef.current) listener(steps);
      });
      // As it is written, the writing shows which card it will continue.
      ink.subscribe((state) => {
        if (inkRef.current !== ink) return;
        const bounds = state.component_count ? state.content_bounds : null;
        showContinuing(bounds ? placeFrozen(mounted.elements.viewport, bounds).continues?.node ?? null : null);
      });
      inkRef.current = ink;
    },
    setPen(mode) {
      penRef.current = mode;
      inkRef.current?.setMode(mode === "off" ? "navigate" : mode);
    },
    async freezeInk() {
      const ink = inkRef.current;
      const mounted = mountedRef.current;
      if (!ink || !mounted) return null;
      inkRef.current = null;
      showContinuing(null);
      try {
        if (!ink.state.component_count) return null;
        ink.selectAll();
        const snapshot = await ink.captureSelectionSnapshot();
        const { bounds } = snapshot;
        return { svg: snapshot.svg, x: bounds.x, y: bounds.y, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), ...placeFrozen(mounted.elements.viewport, bounds),
          ...(snapshot.component_drawn_at ? { strokeDrawnAt: snapshot.component_drawn_at } : {}) };
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
      const placed = placeFrozen(mounted.elements.viewport, bounds);
      const undoSteps = await quietInk(ink, inkQuietRef, inkRevisionRef, () => ink.deleteSelection());
      return { svg: snapshot.svg, x: bounds.x, y: bounds.y, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), ...placed,
        ...(snapshot.component_drawn_at ? { strokeDrawnAt: snapshot.component_drawn_at } : {}), undoSteps };
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
      const canonical = tapped && sameBoardTarget(tapped.target, target) ? tapped.canonical
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
    const markingScene = viewport.hasAttribute("data-highlighting") && framed.some((id) => state.nodes[id]?.kind === "scene3d");
    if (framed.length && !markingScene) mounted.view.focusTargets(framed);
    // A redraw hides the pointer; the learner's tap still shows until it fades.
    if (pointerRef.current?.canonical) mounted.view.showPointer(pointerRef.current.canonical);
    else if (pointerRef.current?.at) mounted.view.showPointerAt(pointerRef.current.at);
  }, [compiled, focusCard]);

  // An arrow being drawn: a dashed line from its start to the pointer, and the card it would end on outlined.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !arrowFrom || !("node" in arrowFrom)) return;
    const from = viewport.querySelector<HTMLElement>(`.board-node[data-id="${CSS.escape(boardIdOf({ node: arrowFrom.node }))}"]`);
    if (!from) return;
    const svg = viewport.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("teach-arrow-preview");
    svg.setAttribute("aria-hidden", "true");
    const line = viewport.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "line");
    svg.append(line);
    viewport.append(svg);
    let candidate: Element | null = null;
    const move = (event: PointerEvent) => {
      const box = viewport.getBoundingClientRect(), start = from.getBoundingClientRect();
      line.setAttribute("x1", String(start.left + start.width / 2 - box.left));
      line.setAttribute("y1", String(start.top + start.height / 2 - box.top));
      line.setAttribute("x2", String(event.clientX - box.left));
      line.setAttribute("y2", String(event.clientY - box.top));
      const under = viewport.ownerDocument.elementFromPoint?.(event.clientX, event.clientY)?.closest(".board-node[data-id]") ?? null;
      const next = under && under !== from ? under : null;
      if (next !== candidate) { candidate?.classList.remove("teach-arrow-candidate"); next?.classList.add("teach-arrow-candidate"); candidate = next; }
    };
    viewport.addEventListener("pointermove", move);
    return () => {
      viewport.removeEventListener("pointermove", move);
      candidate?.classList.remove("teach-arrow-candidate");
      svg.remove();
    };
  }, [arrowFrom]);

  return (
    <div className="teach-board-frame">
      <div ref={viewportRef} className="teach-board" data-testid="teach-board" data-pointing={onTarget ? "true" : undefined} data-highlighting={highlighting || undefined} data-interactive={onVariableGesture ? "true" : undefined} />
    </div>
  );
});
