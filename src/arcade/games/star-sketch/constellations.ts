// Star Sketch's constellations (plan §5.5, game C). Each is a chain of stars
// joined one line per answer, in one continuous path, so the pen never has to
// jump. Finishing one brings its chalk creature to life. The creatures are our
// own doodles; their stars sit on their outlines.
//
// Coordinates are in sky units: x right, y up, within about ±7.2 by ±4.

import type { Side } from "../../core/choices";

export type Point = readonly [number, number];

/** How a creature part moves once alive (around its pivot). */
export type PartMotion = "still" | "wag" | "flap" | "spout" | "blink" | "rise" | "wiggle" | "turn";
/** How the whole creature moves once alive. */
export type BodyMotion = "swim" | "fly" | "hop" | "sit" | "slide";
export type CreatureColor = "blue" | "coral" | "yellow" | "mint" | "pink" | "lilac";

export interface StrokeDef {
  points: Point[];
  closed?: boolean;
  /** Straight segments instead of a smooth curve. */
  sharp?: boolean;
  /** White gel-pen details (eyes, whiskers) instead of the creature's chalk. */
  white?: boolean;
  /** A small circle at points[0] with this radius, instead of a line. */
  circle?: number;
}

export interface PartDef {
  strokes: StrokeDef[];
  pivot?: Point;
  motion?: PartMotion;
  /** Size of the motion (radians, or units for "rise"). */
  amount?: number;
  /** Speed of the motion (radians per second). */
  speed?: number;
}

export interface Constellation {
  id: string;
  color: CreatureColor;
  stars: Point[];
  /** Star indices in drawing order: line k joins path[k] to path[k + 1]. */
  path: number[];
  body: BodyMotion;
  parts: PartDef[];
}

const spiral = (cx: number, cy: number, radius: number, turns: number): Point[] =>
  Array.from({ length: Math.round(turns * 14) + 1 }, (_, i) => {
    const t = i / (turns * 14);
    const angle = t * turns * Math.PI * 2 + Math.PI * 0.6;
    const r = radius * (1 - t * 0.88);
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const;
  });

export const CONSTELLATIONS: readonly Constellation[] = [
  {
    id: "whale",
    color: "blue",
    stars: [[-6.6, 0.2], [-3.8, 2.4], [1.2, 2.3], [4.6, 0.4], [6.9, 2.5], [6.6, -1.4], [-1.4, -2.5]],
    path: [0, 1, 2, 3, 4, 5, 6, 0],
    body: "swim",
    parts: [
      { strokes: [{ points: [[4.6, 0.4], [3.4, 1.4], [1.2, 2.3], [-1, 2.7], [-3.8, 2.4], [-5.8, 1.8], [-6.6, 0.2], [-6.2, -0.9], [-4.5, -2.0], [-1.4, -2.5], [2.5, -1.8], [4.4, -0.6]] }] },
      { strokes: [{ points: [[4.6, 0.4], [5.6, 1.2], [6.9, 2.5], [6.4, 0.6], [6.6, -1.4], [5.4, -0.7], [4.4, -0.6]] }], pivot: [4.5, -0.1], motion: "wag", amount: 0.28, speed: 3.6 },
      { strokes: [{ points: [[-2.4, -1.2], [-1.4, -2.0], [-0.8, -2.9], [-1.9, -2.4], [-2.4, -1.2]] }], pivot: [-2.4, -1.2], motion: "wag", amount: 0.3, speed: 3.6 },
      { strokes: [{ points: [[-3.4, 2.6], [-3.6, 3.4], [-4.1, 3.9]] }, { points: [[-3.4, 2.6], [-3.1, 3.5], [-2.6, 3.9]] }], pivot: [-3.4, 2.6], motion: "spout", speed: 3 },
      { strokes: [{ points: [[-6.3, -0.2], [-5.2, -0.5], [-4.2, -0.3]], white: true }] },
      { strokes: [{ points: [[-4.7, 0.7]], circle: 0.22, white: true }], pivot: [-4.7, 0.7], motion: "blink" },
    ],
  },
  {
    id: "cat",
    color: "coral",
    stars: [[5.8, -0.4], [2.8, -3.0], [-2.0, -3.0], [-2.8, 0.9], [-2.7, 3.5], [-1.5, 2.3], [-0.2, 3.5]],
    path: [0, 1, 2, 3, 4, 5, 6],
    body: "sit",
    parts: [
      {
        strokes: [{
          points: [[-0.2, 3.5], [0.2, 2.1], [1.6, 1.0], [2.9, -0.6], [3.2, -2.2], [2.8, -3.0], [-2.0, -3.0], [-2.2, -1.6], [-2.4, 0.1], [-2.8, 0.9], [-3.2, 2.0], [-2.7, 3.5], [-1.5, 2.3], [-0.2, 3.5]],
          sharp: true,
        }],
      },
      { strokes: [{ points: [[-1.1, -3.0], [-0.9, -1.4]] }] },
      { strokes: [{ points: [[3.0, -2.6], [4.6, -2.3], [5.6, -1.4], [5.8, -0.4], [5.3, 0.4]] }], pivot: [3.0, -2.6], motion: "wag", amount: 0.3, speed: 2.4 },
      { strokes: [{ points: [[-2.2, 1.8]], circle: 0.2, white: true }, { points: [[-0.9, 1.8]], circle: 0.2, white: true }], pivot: [-1.5, 1.8], motion: "blink" },
      {
        strokes: [
          { points: [[-1.55, 1.25], [-1.35, 1.25], [-1.45, 1.05]], white: true, sharp: true },
          { points: [[-2.0, 1.1], [-3.5, 1.4]], white: true },
          { points: [[-2.0, 0.9], [-3.5, 0.7]], white: true },
          { points: [[-0.9, 1.1], [0.5, 1.4]], white: true },
          { points: [[-0.9, 0.9], [0.5, 0.7]], white: true },
        ],
      },
    ],
  },
  {
    id: "bird",
    color: "yellow",
    stars: [[-6.0, 0.6], [-3.6, 1.4], [-0.2, 3.8], [1.4, 0.8], [5.8, 1.6], [0.8, -1.8]],
    path: [0, 1, 2, 3, 4, 5],
    body: "fly",
    parts: [
      {
        strokes: [
          { points: [[-3.6, 1.4], [-2.2, 1.6], [0, 1.2], [1.4, 0.8], [3.4, 0.9], [5.8, 1.6], [5.3, 0.4], [5.8, -0.6], [3.2, -0.4], [0.8, -1.8], [-2.2, -1.2], [-3.4, -0.2], [-4.4, 0.4], [-3.6, 1.4]] },
          { points: [[-4.4, 1.0], [-6.0, 0.6], [-4.4, 0.2]], sharp: true },
          { points: [[0.4, -1.6], [0.9, -2.4]] },
        ],
      },
      { strokes: [{ points: [[-1.6, 1.3], [-1.2, 2.8], [-0.2, 3.8], [0.6, 2.6], [1.0, 1.3]] }], pivot: [-0.3, 1.3], motion: "flap", speed: 7 },
      { strokes: [{ points: [[-3.5, 0.8]], circle: 0.2, white: true }], pivot: [-3.5, 0.8], motion: "blink" },
    ],
  },
  {
    id: "fish",
    color: "mint",
    stars: [[-6.0, 0.0], [-1.2, 2.8], [6.2, 2.4], [6.2, -2.2], [-1.0, -2.6]],
    path: [0, 1, 2, 3, 4, 0],
    body: "swim",
    parts: [
      { strokes: [{ points: [[3.6, 0.4], [1.8, 2.0], [-1.2, 2.8], [-4.5, 1.8], [-6.0, 0], [-4.4, -1.8], [-1.0, -2.6], [1.8, -1.9], [3.6, -0.3]] }] },
      { strokes: [{ points: [[3.6, 0.4], [5.0, 1.4], [6.2, 2.4], [5.6, 0.1], [6.2, -2.2], [4.9, -1.2], [3.6, -0.3]] }], pivot: [3.6, 0], motion: "wag", amount: 0.32, speed: 5 },
      { strokes: [{ points: [[-1.6, 2.7], [-0.4, 3.7], [1.2, 3.4], [1.8, 2.0]] }] },
      { strokes: [{ points: [[-3.2, 1.3], [-2.8, 0], [-3.2, -1.2]] }] },
      { strokes: [{ points: [[-4.2, 0.6]], circle: 0.32, white: true }], pivot: [-4.2, 0.6], motion: "blink" },
      { strokes: [{ points: [[-7.0, 1.0]], circle: 0.22, white: true }, { points: [[-7.4, 2.0]], circle: 0.3, white: true }, { points: [[-6.9, 3.1]], circle: 0.18, white: true }], pivot: [-7.1, 2.0], motion: "rise", amount: 0.7, speed: 1.4 },
    ],
  },
  {
    id: "rabbit",
    color: "pink",
    stars: [[-2.0, 3.9], [-1.2, 1.7], [0.6, 4.0], [1.2, 0.9], [3.4, -2.9], [-2.4, -2.9], [-2.9, 0.4]],
    path: [0, 1, 2, 3, 4, 5, 6],
    body: "hop",
    parts: [
      { strokes: [{ points: [[0.1, 1.6], [1.2, 0.9], [2.6, 0.2], [3.6, -1.4], [3.4, -2.9], [-2.4, -2.9], [-2.0, -1.6], [-2.2, -0.6], [-2.9, 0.4], [-2.6, 1.3], [-1.3, 1.7]] }] },
      {
        strokes: [
          { points: [[-1.3, 1.7], [-2.3, 2.8], [-2.0, 3.9], [-1.3, 3.2], [-0.8, 1.9]] },
          { points: [[-0.6, 1.9], [-0.1, 3.2], [0.6, 4.0], [0.6, 2.8], [0.1, 1.6]] },
        ],
        pivot: [-0.6, 1.7],
        motion: "wag",
        amount: 0.12,
        speed: 3,
      },
      { strokes: [{ points: [[3.8, -1.6]], circle: 0.45 }] },
      { strokes: [{ points: [[-1.0, -2.9], [-0.6, -1.8]] }] },
      { strokes: [{ points: [[-1.7, 0.9]], circle: 0.18, white: true }], pivot: [-1.7, 0.9], motion: "blink" },
      { strokes: [{ points: [[-2.75, 0.45]], circle: 0.1, white: true }, { points: [[-2.5, 0.2], [-3.6, 0.5]], white: true }, { points: [[-2.5, 0.05], [-3.6, -0.2]], white: true }] },
    ],
  },
  {
    id: "snail",
    color: "lilac",
    stars: [[-5.8, -2.4], [-5.0, 1.0], [-0.6, 3.2], [3.2, 1.0], [5.6, -2.4]],
    path: [0, 1, 2, 3, 4, 0],
    body: "slide",
    parts: [
      { strokes: [{ points: [[5.6, -2.4], [3.0, -1.8], [-3.0, -1.8], [-4.4, -1.2], [-4.6, -0.2], [-5.6, -1.6], [-5.8, -2.4], [-4.0, -2.6], [5.6, -2.4]] }] },
      { strokes: [{ points: spiral(-0.4, 0.8, 2.6, 2.2) }], pivot: [-0.4, 0.8], motion: "turn", amount: 0.06, speed: 1.2 },
      {
        strokes: [
          { points: [[-4.6, -0.4], [-4.9, 0.4], [-5.0, 1.0]] },
          { points: [[-5.0, 1.15]], circle: 0.24, white: true },
          { points: [[-4.2, -0.4], [-3.9, 0.5], [-3.7, 1.0]] },
          { points: [[-3.7, 1.15]], circle: 0.24, white: true },
        ],
        pivot: [-4.4, -0.4],
        motion: "wag",
        amount: 0.14,
        speed: 3,
      },
    ],
  },
];

export interface Segment {
  /** Index into `SkyPlan.constellations`. */
  constellation: number;
  line: number;
  from: number;
  to: number;
}

export interface SkyPlan {
  /** Indices into CONSTELLATIONS, in the order they are drawn. */
  constellations: number[];
  /** One line per round item. */
  segments: Segment[];
}

/** The lines of a constellation, in drawing order. */
export function linesOf(constellation: Constellation): [number, number][] {
  return constellation.path.slice(1).map((to, k) => [constellation.path[k], to]);
}

/**
 * Which constellation and line each of `total` items draws: constellations in
 * turn from `start`, as many as the round needs. The last may be left part
 * drawn; the round's finale finishes it.
 */
export function planSky(total: number, start: number): SkyPlan {
  const plan: SkyPlan = { constellations: [], segments: [] };
  let next = ((start % CONSTELLATIONS.length) + CONSTELLATIONS.length) % CONSTELLATIONS.length;
  while (plan.segments.length < total) {
    const constellation = plan.constellations.length;
    plan.constellations.push(next);
    linesOf(CONSTELLATIONS[next]).forEach(([from, to], line) => {
      if (plan.segments.length < total) plan.segments.push({ constellation, line, from, to });
    });
    next = (next + 1) % CONSTELLATIONS.length;
  }
  return plan;
}

const DECOY_GAP = 4.6;
/** Against the edge of the sky the decoy may come this close sideways, and moves up or down instead. */
const DECOY_NARROW = 1.8;
const DECOY_CLEAR = 1.6;
const SKY_X = 7.8;

/**
 * Choice mode: where the second candidate star goes. The real next star is on
 * the `correctSide`, so the decoy sits on the other side of it, left or right
 * on screen, as far from Nib as the real one (mirrored across Nib's star)
 * where there is room, and clear of every star in the constellation.
 */
export function decoyFor(current: Point, target: Point, correctSide: Side, stars: readonly Point[]): Point {
  const away = correctSide === "left" ? 1 : -1;
  const mirrored = current[0] - (target[0] - current[0]);
  let x = away > 0 ? Math.max(mirrored, target[0] + DECOY_GAP) : Math.min(mirrored, target[0] - DECOY_GAP);
  x = Math.max(-SKY_X, Math.min(SKY_X, x));
  const pinned = (x - target[0]) * away < DECOY_GAP;
  if ((x - target[0]) * away < DECOY_NARROW) x = target[0] + away * DECOY_NARROW;
  const towardsMiddle = target[1] > 0.5 ? -1 : 1;
  let y = target[1] + (pinned ? towardsMiddle * 2.4 : 0);
  for (let tries = 0; tries < 8; tries++) {
    const crowded = stars.some(star => Math.hypot(star[0] - x, star[1] - y) < DECOY_CLEAR);
    if (!crowded && Math.hypot(target[0] - x, target[1] - y) >= 2.6) break;
    y += towardsMiddle * 0.8;
  }
  return [x, Math.max(-3.6, Math.min(3.8, y))];
}
