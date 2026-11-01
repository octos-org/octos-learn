import type { LessonAuthor } from "octos-lesson-language";

import type { LearnerRecording, RecordingEvent } from "./recording";

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
  for (const card of recording.cards) {
    for (const take of card.takes) {
      if (take.status === "superseded") continue;
      for (const event of take.events as RecordingEvent[]) {
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
 * The lesson's author: the learner by an opaque reference only. Avatar and
 * voice are placeholders until the learner chooses them (M5).
 */
export function learnerAuthor(profileId: string): LessonAuthor {
  let reference = profileId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64).replace(/^-+|-+$/g, "");
  if (!reference) reference = "local";
  return { kind: "learner", learner_ref: `learner:${reference}`, presented_by: { avatar_ref: "avatar:octo", voice_ref: "voice:learner-default" } };
}

/** The axis ranges of every coordinate grid the learner has put on the board. */
export function gridRanges(recording: LearnerRecording): Map<string, { x: [number, number]; y: [number, number] }> {
  const ranges = new Map<string, { x: [number, number]; y: [number, number] }>();
  for (const card of recording.cards) {
    for (const take of card.takes) {
      if (take.status === "superseded") continue;
      for (const event of take.events as RecordingEvent[]) {
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
  for (const card of recording.cards) {
    for (const take of card.takes) {
      if (take.status === "superseded") continue;
      for (const event of take.events as RecordingEvent[]) {
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
