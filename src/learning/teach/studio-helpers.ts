import type { LessonAuthor } from "octos-lesson-language";
import { tr } from "@/i18n";

import { presenterAvatar } from "./presenters";
import { boardTake, type LearnerRecording, type Presenter, type RecordingEvent, type Solid, type SolidShape } from "./recording";

/** The events of the take each card shows now, in card order. */
function boardEvents(recording: LearnerRecording): RecordingEvent[] {
  return recording.cards.flatMap((card) => (boardTake(card)?.events ?? []) as RecordingEvent[]);
}

/** Aliases already used by components and points anywhere in the recording. */
function usedAliases(recording: LearnerRecording): Set<string> {
  const used = new Set<string>();
  for (const card of recording.cards) {
    for (const take of card.takes) {
      for (const event of take.events as RecordingEvent[]) {
        if ("alias" in event && typeof event.alias === "string") used.add(event.alias);
        if (event.type === "point_tool.place" || event.type === "make_point.confirmed") used.add(`${event.node}#${event.point}`);
      }
    }
  }
  return used;
}

/** The next free alias such as `graph-2` for a component the learner inserts. */
export function nextComponentAlias(recording: LearnerRecording, prefix: string): string {
  const used = usedAliases(recording);
  for (let index = 1; ; index += 1) {
    const alias = `${prefix}-${index}`;
    if (!used.has(alias)) return alias;
  }
}

/** The next point letter on a grid: A, B, C… then A2, B2… */
export function nextPointLabel(recording: LearnerRecording, node: string): { point: string; label: string } {
  const used = usedAliases(recording);
  for (let round = 1; ; round += 1) {
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const label = round === 1 ? letter : `${letter}${round}`;
      const point = `point-${label.toLowerCase()}`;
      if (!used.has(`${node}#${point}`)) return { point, label };
    }
  }
}

const POLYGON_SIDES = ["", "", "", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

/** A 3D solid's name, for the learner; a prism or pyramid named by its number of sides when known. */
export function solidName(shape: SolidShape, sides?: number): string {
  if ((shape === "prism" || shape === "pyramid") && sides && sides >= 3 && sides <= 12) {
    return shape === "prism" ? tr("{{v0}}棱柱", { v0: POLYGON_SIDES[sides] }) : tr("{{v0}}棱锥", { v0: POLYGON_SIDES[sides] });
  }
  return {
    box: tr("长方体"), cylinder: tr("圆柱"), cone: tr("圆锥"), sphere: tr("球"), hemisphere: tr("半球"), prism: tr("棱柱"), pyramid: tr("棱锥"),
    frustum: tr("圆台"), torus: tr("圆环"), ellipsoid: tr("椭球"), composite: tr("组合体"), tetrahedron: tr("正四面体"), octahedron: tr("正八面体"), dodecahedron: tr("正十二面体"), icosahedron: tr("正二十面体"),
  }[shape];
}

/** What a stack of two solids is called. */
export function compositeName(parts: Extract<Solid, { shape: "composite" }>["parts"]): string {
  return { cylinder_cone: tr("圆柱 + 圆锥"), cylinder_hemisphere: tr("圆柱 + 半球"), box_pyramid: tr("长方体 + 棱锥"), two_cylinders: tr("两个圆柱") }[parts];
}

/** A solid's name: a six-sided prism, a truncated pyramid, a cylinder with a cone on top. */
export function solidLabel(solid: Solid): string {
  if (solid.shape === "composite") return compositeName(solid.parts);
  if (solid.shape === "pyramid" && solid.topScale !== undefined) return tr("棱台");
  return solidName(solid.shape, "sides" in solid ? solid.sides : undefined);
}

/** Lesson variables components introduced (unit circles' angles, graphs' sliders), in insertion order. */
export function recordingVariables(recording: LearnerRecording): string[] {
  return recordingVariableInfo(recording).map((variable) => variable.variable);
}

/** Each lesson variable with what it is called on the board, and whether it is a unit circle's angle. */
export function recordingVariableInfo(recording: LearnerRecording): Array<{ variable: string; label: string; angle: boolean }> {
  const variables: Array<{ variable: string; label: string; angle: boolean }> = [];
  const add = (variable: string, label: string, angle: boolean) => { if (!variables.some((known) => known.variable === variable)) variables.push({ variable, label, angle }); };
  for (const event of boardEvents(recording)) {
    if (event.type !== "component.insert") continue;
    if (event.panel === "unit_circle") add(event.variable, "θ", true);
    if (event.panel === "graph") for (const parameter of event.parameters ?? []) add(parameter.variable, parameter.letter, false);
    if (event.panel === "solid_3d" && event.cut) add(event.cut.variable, tr("切面高度"), false);
    if (event.panel === "solid_3d" && event.unfold) add(event.unfold.variable, tr("展开"), false);
    if (event.panel === "polygon" && event.slider) add(event.slider.variable, tr("边数"), false);
    if (event.panel === "number_line" && event.jump?.slider) add(event.jump.slider.variable, tr("移动"), false);
    if (event.panel === "constant_speed") {
      add(event.time.variable, tr("时间 t"), false);
      if (event.speed.slider) add(event.speed.slider.variable, tr("速度 v"), false);
    }
  }
  return variables;
}

/** Names the expression language keeps for itself. */
const EXPRESSION_WORDS = new Set(["abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "ln", "log", "round", "sin", "sqrt", "tan", "pi", "e", "x"]);

/**
 * The letters of a graph's expression that can be sliders (any single letter
 * but x and e), and any other names the expression does not know.
 */
export function graphParameterLetters(expression: string): { letters: string[]; unknown: string[] } {
  const letters: string[] = [], unknown: string[] = [];
  for (const name of expression.toLowerCase().match(/[a-z][a-z0-9_]*/g) ?? []) {
    if (EXPRESSION_WORDS.has(name)) continue;
    const list = name.length === 1 ? letters : unknown;
    if (!list.includes(name)) list.push(name);
  }
  return { letters, unknown };
}

/** A lesson variable name for a graph's slider letter: the letter itself, or letter_2, letter_3… when taken. */
export function nextParameterVariable(recording: LearnerRecording, letter: string, taken: string[] = []): string {
  const used = new Set([...recordingVariables(recording), ...taken]);
  if (!used.has(letter)) return letter;
  for (let index = 2; ; index += 1) if (!used.has(`${letter}_${index}`)) return `${letter}_${index}`;
}

const VARIABLE_NAMES = ["theta", "phi", "alpha", "beta", "gamma"];

export function nextVariable(recording: LearnerRecording): string {
  const used = new Set(recordingVariables(recording));
  return VARIABLE_NAMES.find((name) => !used.has(name)) ?? `angle_${used.size + 1}`;
}

/**
 * The learner's opaque reference: random, made once per profile on this
 * device, so a shared lesson never carries the profile's name.
 */
export function learnerReference(profileId: string, storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): string {
  const key = `octos-learn:learner-ref:v1:${profileId}`;
  try {
    const existing = storage?.getItem(key);
    if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
    const made = crypto.randomUUID().replaceAll("-", "");
    storage?.setItem(key, made);
    return made;
  } catch {
    // Without storage the reference is still opaque, just not stable across visits.
    return crypto.randomUUID().replaceAll("-", "");
  }
}

/**
 * The lesson's author: the learner by an opaque reference only, presented by
 * the character they chose from the app's catalog, which speaks in its own
 * voice (so the voice reference names the character too).
 */
export function learnerAuthor(profileId: string, presenter: Presenter = {}): LessonAuthor {
  return {
    kind: "learner", learner_ref: `learner:${learnerReference(profileId)}`,
    presented_by: { avatar_ref: `avatar:${presenterAvatar(presenter.avatar).id}`, voice_ref: `voice:${presenterAvatar(presenter.avatar).id}` },
  };
}

/** The axis ranges of every coordinate grid the learner has put on the board. */
export function gridRanges(recording: LearnerRecording): Map<string, { x: [number, number]; y: [number, number] }> {
  const ranges = new Map<string, { x: [number, number]; y: [number, number] }>();
  {
    {
      for (const event of boardEvents(recording)) {
        if (event.type === "component.insert" && event.panel === "coordinate_grid") ranges.set(event.alias, { x: event.x, y: event.y });
      }
    }
  }
  return ranges;
}

export interface GridPoint {
  point: string;
  label: string;
  x: number;
  y: number;
}

/** The points placed on each coordinate grid, in the order they were placed. */
export function gridPoints(recording: LearnerRecording): Map<string, GridPoint[]> {
  const points = new Map<string, GridPoint[]>();
  {
    {
      for (const event of boardEvents(recording)) {
        if (event.type !== "point_tool.place" && event.type !== "make_point.confirmed") continue;
        points.set(event.node, [...(points.get(event.node) ?? []), { point: event.point, label: event.label, x: event.x, y: event.y }]);
      }
    }
  }
  return points;
}

function plain(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

/** How a line through two points reads: y = m·x + b, or x = c when it is vertical. */
export function lineLabel(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const expression = lineThrough(a, b);
  return expression === undefined ? `x = ${plain(a.x)}` : `y = ${expression.replaceAll("*", "")}`;
}

/**
 * Where the line through two points enters and leaves a grid, so it is drawn
 * across the whole grid; undefined when the two points are the same.
 */
export function lineAcross(
  a: { x: number; y: number }, b: { x: number; y: number }, range: { x: [number, number]; y: [number, number] },
): [{ x: number; y: number }, { x: number; y: number }] | undefined {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return undefined;
  // Parameters t where a + t·(b − a) meets each side of the grid, kept when the meeting point is on that side.
  const hits: number[] = [];
  const within = (value: number, [low, high]: [number, number]) => value >= low - 1e-9 && value <= high + 1e-9;
  if (dx !== 0) for (const x of range.x) { const t = (x - a.x) / dx; if (within(a.y + t * dy, range.y)) hits.push(t); }
  if (dy !== 0) for (const y of range.y) { const t = (y - a.y) / dy; if (within(a.x + t * dx, range.x)) hits.push(t); }
  if (hits.length < 2) return undefined;
  const at = (t: number) => ({ x: Math.round((a.x + t * dx) * 1e6) / 1e6, y: Math.round((a.y + t * dy) * 1e6) / 1e6 });
  return [at(Math.min(...hits)), at(Math.max(...hits))];
}

/** y = m·x + b through two points, or undefined for a vertical line (not a function). */
export function lineThrough(a: { x: number; y: number }, b: { x: number; y: number }): string | undefined {
  if (a.x === b.x) return undefined;
  const slope = (b.y - a.y) / (b.x - a.x);
  const intercept = a.y - slope * a.x;
  const term = slope === 0 ? "" : `${plain(slope)}*x`;
  if (!term) return plain(intercept);
  if (Math.abs(intercept) < 1e-12) return term;
  return `${term}${intercept < 0 ? "-" : "+"}${plain(Math.abs(intercept))}`;
}

export interface DragSample {
  value: number;
  at: number;
}

export interface DragSegment {
  from: number;
  to: number;
  startAt: number;
  endAt: number;
}

/**
 * Splits one drag into the moves a viewer should see: a new segment starts
 * when the direction reverses or after a pause of `pauseMs` without movement.
 */
export function segmentDrag(samples: DragSample[], pauseMs = 300): DragSegment[] {
  const segments: DragSegment[] = [];
  let start: DragSample | undefined = samples[0];
  let last = start;
  let direction = 0;
  for (const sample of samples.slice(1)) {
    if (!start || !last) break;
    const delta = sample.value - last.value;
    if (delta === 0) continue;
    const step = Math.sign(delta);
    const paused = sample.at - last.at >= pauseMs;
    if ((direction !== 0 && step !== direction) || paused) {
      if (last.value !== start.value) segments.push({ from: start.value, to: last.value, startAt: start.at, endAt: last.at });
      start = last;
      direction = step;
    } else if (direction === 0) {
      direction = step;
    }
    last = sample;
  }
  if (start && last && last.value !== start.value) segments.push({ from: start.value, to: last.value, startAt: start.at, endAt: last.at });
  return segments;
}

/**
 * A point dragged around a circle reports its angle within one turn, so
 * crossing 0 jumps by a full turn. Read each sample as the nearest equivalent
 * of the previous one, kept within the variable's range.
 */
export function unwrapAngle(previous: number, value: number, range?: { min: number; max: number; wrap?: true }): number {
  const turn = 2 * Math.PI;
  const nearest = value - turn * Math.round((value - previous) / turn);
  // A wrapping angle keeps turning past the end of its range; wrapDrag brings it back.
  return range && !range.wrap ? Math.min(range.max, Math.max(range.min, nearest)) : nearest;
}

/** The longest move recorded as one step: under half a turn, so playback goes the same way round. */
const MAX_WRAPPED_STEP = 0.45;

/**
 * A drag of a wrapping angle (its range's ends are the same place) read
 * continuously, as moves within the range: each at most under half a turn,
 * so an animation taking the shorter way round retraces the learner's hand.
 */
export function wrapDrag(segments: DragSegment[], range: { min: number; max: number }): DragSegment[] {
  const period = range.max - range.min;
  const inside = (value: number) => ((value - range.min) % period + period) % period + range.min;
  return segments.flatMap((segment) => {
    const steps = Math.max(1, Math.ceil(Math.abs(segment.to - segment.from) / (period * MAX_WRAPPED_STEP)));
    return Array.from({ length: steps }, (_, index) => {
      const at = (share: number) => segment.startAt + (segment.endAt - segment.startAt) * share;
      const value = (share: number) => segment.from + (segment.to - segment.from) * share;
      return { from: inside(value(index / steps)), to: inside(value((index + 1) / steps)), startAt: at(index / steps), endAt: at((index + 1) / steps) };
    });
  });
}

/** What the Add panel can put on the board. */
export type InsertForm = "graph" | "coordinate_grid" | "unit_circle" | "solid_3d" | "point" | "line" | "text" | "note" | "table" | "diagram" | "polygon" | "circle" | "segment" | "constant_speed" | "number_line";
const FIGURES: ReadonlySet<InsertForm> = new Set(["graph", "coordinate_grid", "unit_circle", "solid_3d", "polygon", "constant_speed", "number_line"]);

/** Whether a kind of component is a figure, which starts a row unless it is put next to a card. */
export function isFigure(form: InsertForm | null): boolean {
  return form !== null && FIGURES.has(form);
}
