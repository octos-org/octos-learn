// Up the Page's tower, as plain numbers: block sizes, how a released block
// falls onto the tower, how the tower sways, and where the camera sits.
// Kept free of rendering so it can be tested.

export const BLOCK = { width: 2.8, height: 1.5, depth: 1.8 };
/** The wide slab the tower stands on. */
export const PLINTH = { width: 4.2, height: 0.7 };
/** A block the child did not get: a plain cardboard box, so the tower still climbs. */
export const CARD = { width: 2.5, height: 1.25 };
export const GRAVITY = 34;
/** A later block never lands before the one released before it. */
export const LANDING_GAP = 0.1;
/** How far down the tower the sway reaches. */
export const SWAY_SPAN = 9;

export interface Size { width: number; height: number }

/** Bigger blocks on a streak (plan §5.5): a little at 5 in a row, more at 10. */
export function blockSize(streak: number): Size {
  if (streak >= 10) return { width: BLOCK.width * 1.22, height: BLOCK.height * 1.4 };
  if (streak >= 5) return { width: BLOCK.width * 1.12, height: BLOCK.height * 1.2 };
  return { width: BLOCK.width, height: BLOCK.height };
}

export const BLOCK_COLORS = ["red", "blue", "yellow", "purple", "green", "orange", "teal", "pink", "sky"] as const;
export type BlockColor = (typeof BLOCK_COLORS)[number];

/** The block colour for item `index`: never the same twice in a row. */
export function blockColor(index: number, offset = 0): BlockColor {
  const n = BLOCK_COLORS.length;
  // 4 and 9 share no factor, so this walks every colour before repeating one.
  return BLOCK_COLORS[(((index * 4 + offset) % n) + n) % n];
}

export interface Point { x: number; y: number }

/** How long a released block takes to land: a short fall, longer when it is tossed in from the side. */
export function fallTime(from: Point, to: Point): number {
  const drop = Math.max(0.3, from.y - to.y);
  const straight = Math.sqrt((2 * drop) / GRAVITY);
  const across = 0.3 + 0.045 * Math.abs(to.x - from.x);
  return Math.min(0.7, Math.max(0.3, straight, across));
}

/**
 * The block's path from release to landing in `duration` seconds, under
 * gravity: a small toss up first when it has further to go sideways.
 */
export function fallArc(from: Point, to: Point, duration: number): (s: number) => Point {
  const lift = (to.y - from.y + 0.5 * GRAVITY * duration * duration) / duration;
  return s => {
    const t = s * duration;
    return { x: from.x + (to.x - from.x) * s, y: from.y + lift * t - 0.5 * GRAVITY * t * t };
  };
}

/**
 * When a block released `now` lands, given when the one before it lands:
 * in order, so a quick answer never puts a block down in mid-air.
 */
export function landingTime(now: number, natural: number, previousLanding: number): number {
  return Math.max(now + natural, previousLanding + LANDING_GAP);
}

/** The sideways sway at height `y` of a tower whose top is at `top`: only the top part moves. */
export function swayAt(y: number, top: number, amount: number): number {
  const k = Math.min(1, Math.max(0, (y - (top - SWAY_SPAN)) / SWAY_SPAN));
  return amount * k * k;
}

/**
 * The camera's height so that height `y` shows at `ndcY` (−1 bottom of the
 * screen, 1 top) for a camera `distance` away, looking straight ahead.
 */
export function cameraYFor(y: number, distance: number, fovDegrees: number, ndcY: number): number {
  return y - ndcY * distance * Math.tan((fovDegrees * Math.PI) / 360);
}

/**
 * The end-of-round view: the whole tower, ground to flag, in the middle of the
 * margin beside the results card (or the middle of the screen when there is no
 * room beside it). `margin` is the free strip on each side, as a fraction of
 * the screen's width.
 */
export function finaleView(height: number, aspect: number, fovDegrees: number, margin: number): { x: number; y: number; z: number } {
  const tan = Math.tan((fovDegrees * Math.PI) / 360);
  const span = height + 3.2;
  // Tall enough for the whole tower, and wide enough that it fits the margin.
  const room = margin >= 0.14 ? margin * 2 : 1;
  const distance = Math.max(span * 1.16 / (2 * tan), (PLINTH.width + 2) / (room * tan * aspect));
  const ndcX = margin >= 0.14 ? -1 + margin : 0;
  return { x: -ndcX * distance * tan * aspect, y: span / 2 - 0.6, z: distance };
}
