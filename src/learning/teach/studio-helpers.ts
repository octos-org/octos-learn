import type { LessonAuthor } from "octos-lesson-language";

import { DEFAULT_AVATAR } from "./presenters";
import { boardTake, type LearnerRecording, type Presenter, type RecordingEvent } from "./recording";

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

/** Lesson variables a component introduced (unit circles), in insertion order. */
export function recordingVariables(recording: LearnerRecording): string[] {
  const variables: string[] = [];
  {
    {
      for (const event of boardEvents(recording)) {
        if (event.type === "component.insert" && event.panel === "unit_circle" && !variables.includes(event.variable)) variables.push(event.variable);
      }
    }
  }
  return variables;
}

const VARIABLE_NAMES = ["theta", "phi", "alpha", "beta", "gamma"];

export function nextVariable(recording: LearnerRecording): string {
  const used = new Set(recordingVariables(recording));
  return VARIABLE_NAMES.find((name) => !used.has(name)) ?? `angle_${used.size + 1}`;
}

/**
 * The lesson's author: the learner by an opaque reference only, presented by
 * the avatar and voice they chose from the app's catalogs (Octo and the
 * account's voice until they choose).
 */
export function learnerAuthor(profileId: string, presenter: Presenter = {}): LessonAuthor {
  let reference = profileId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64).replace(/^-+|-+$/g, "");
  if (!reference) reference = "local";
  return {
    kind: "learner", learner_ref: `learner:${reference}`,
    presented_by: { avatar_ref: `avatar:${presenter.avatar ?? DEFAULT_AVATAR}`, voice_ref: presenter.voice ? `voice:${presenter.voice}` : "voice:learner-default" },
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
export function unwrapAngle(previous: number, value: number, range?: { min: number; max: number }): number {
  const turn = 2 * Math.PI;
  const nearest = value - turn * Math.round((value - previous) / turn);
  return range ? Math.min(range.max, Math.max(range.min, nearest)) : nearest;
}

/** What the Add panel can put on the board. */
export type InsertForm = "graph" | "coordinate_grid" | "unit_circle" | "solid_3d" | "point" | "line";
const FIGURES: ReadonlySet<InsertForm> = new Set(["graph", "coordinate_grid", "unit_circle", "solid_3d"]);

/** Whether a kind of component is a figure, which starts a row unless it is put next to a card. */
export function isFigure(form: InsertForm | null): boolean {
  return form !== null && FIGURES.has(form);
}
