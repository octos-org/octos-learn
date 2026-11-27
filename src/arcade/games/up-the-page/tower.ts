// Up the Page's tower, as plain numbers: block looks and sizes, how a block
// swings in under Nib while Nib hops, how the tower sways (more the taller it
// gets), and where the camera sits. Kept free of rendering so it can be tested.

/** The wide slab the tower stands on. */
export const PLINTH = { width: 4.2, height: 0.7 };
/** A block the child did not get: a plain cardboard box, so the tower still climbs. */
export const CARD = { width: 2.5, height: 1.25 };
export const DEPTH = 1.8;
/** A later block never lands before the one released before it. */
export const LANDING_GAP = 0.1;
/** Where a block hangs, beside the top of the tower: its middle this far out, its bottom this far up. */
export const HANG = { x: 3.6, above: 0.6 };
/** Nib, standing: half its width and its height (Nib's scale included). */
export const NIB_BODY = { halfWidth: 0.5, height: 1.5 };
/** How far from the middle of the top Nib stands, away from the block about to come in. */
export const NIB_ASIDE = 0.55;

export interface Size { width: number; height: number }

export type Shape = "box" | "plank" | "tall" | "drum";
export type Deco = "dots" | "stars" | "stripes" | "gift" | "windows" | "bricks" | "crate" | "cheese" | "cake" | "zigzag" | "hearts";
export const BLOCK_COLORS = ["red", "blue", "yellow", "purple", "green", "orange", "teal", "pink", "sky"] as const;
export type BlockColor = (typeof BLOCK_COLORS)[number] | "wood";

export const SHAPES: Record<Shape, Size> = {
  box: { width: 2.8, height: 1.5 },
  plank: { width: 3.3, height: 1.15 },
  tall: { width: 2.2, height: 1.9 },
  drum: { width: 2.6, height: 1.5 },
};

export interface BlockStyle { deco: Deco; shape: Shape; color?: BlockColor }

/** Every block style. Some always come in their own colour (bricks are red, cheese is yellow). */
export const BLOCK_STYLES: readonly BlockStyle[] = [
  { deco: "dots", shape: "box" },
  { deco: "stars", shape: "drum" },
  { deco: "stripes", shape: "plank" },
  { deco: "gift", shape: "box" },
  { deco: "windows", shape: "tall" },
  { deco: "bricks", shape: "box", color: "red" },
  { deco: "crate", shape: "box", color: "wood" },
  { deco: "cheese", shape: "plank", color: "yellow" },
  { deco: "cake", shape: "drum", color: "pink" },
  { deco: "zigzag", shape: "tall" },
  { deco: "hearts", shape: "box" },
];

export interface BlockLook { style: BlockStyle; color: BlockColor; size: Size }

/**
 * The looks of the blocks for a round: `perItem` blocks to choose from per
 * item (1 with the number pad, 2 in choice mode). A style never comes twice in
 * a row, and no block shares a colour with its neighbour or with any block of
 * the item before, whichever one the child picks.
 */
export function planLooks(total: number, perItem: number, start = 0): BlockLook[][] {
  const plan: BlockLook[][] = [];
  let styleAt = start;
  let colorAt = start;
  for (let index = 0; index < total; index++) {
    const before = plan[index - 1] ?? [];
    const taken = new Set<string>([...before.map(look => look.color), ...before.map(look => look.style.deco)]);
    const looks: BlockLook[] = [];
    for (let k = 0; k < perItem; k++) {
      for (let tries = 0; tries < BLOCK_STYLES.length * 2; tries++) {
        const style = BLOCK_STYLES[styleAt++ % BLOCK_STYLES.length];
        let color = style.color;
        if (!color) {
          for (let c = 0; c < BLOCK_COLORS.length && (!color || taken.has(color)); c++) color = BLOCK_COLORS[colorAt++ % BLOCK_COLORS.length];
        }
        if (!color || taken.has(color) || taken.has(style.deco)) continue;
        looks.push({ style, color, size: SHAPES[style.shape] });
        taken.add(color).add(style.deco);
        break;
      }
    }
    plan.push(looks);
  }
  return plan;
}

/** Bigger blocks on a streak (plan §5.5): a little at 5 in a row, more at 10. */
export function streakScale(streak: number): { x: number; y: number } {
  if (streak >= 10) return { x: 1.2, y: 1.38 };
  if (streak >= 5) return { x: 1.1, y: 1.2 };
  return { x: 1, y: 1 };
}

export interface Point { x: number; y: number }

/** How long a block takes to swing in from where it hangs. */
export function swingTime(from: Point, to: Point): number {
  return Math.min(0.55, Math.max(0.38, 0.3 + 0.03 * Math.abs(to.x - from.x)));
}

/**
 * The swing in, `s` from 0 to 1: sideways with an ease, and down onto the
 * tower at the end, so the block's bottom never dips into the top of it.
 */
export function swingPath(from: Point, to: Point, s: number): Point {
  const e = s * s * (3 - 2 * s);
  return { x: from.x + (to.x - from.x) * e, y: to.y + (from.y - to.y) * (1 - s) * (1 - s) };
}

/** How high above a straight line Nib's hop arcs, for a new top `rise` higher. */
export function hopLift(rise: number): number {
  return 0.62 * rise + 0.75;
}

/** Nib's hop from `from` to `to`, `s` from 0 to 1: a single arc. */
export function hopPath(from: Point, to: Point, s: number, lift = hopLift(to.y - from.y)): Point {
  return { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s + 4 * lift * s * (1 - s) };
}

/** Nib's hop lasts a little longer than the swing, so Nib lands on the block just after it lands. */
export function hopTime(swing: number): number {
  return swing + 0.16;
}

/**
 * When a block released `now` lands, given when the one before it lands:
 * in order, so a quick answer never puts a block down in mid-air.
 */
export function landingTime(now: number, natural: number, previousLanding: number): number {
  return Math.max(now + natural, previousLanding + LANDING_GAP);
}

/** The most the top of the tower sways; more the taller it is (a challenge), none on a streak. */
export function swayAmount(height: number, steady: number): number {
  return Math.min(0.6, 0.04 + 0.017 * Math.max(0, height)) * (1 - steady);
}

/** The sideways sway at height `y` of a tower whose top is at `top`: the base stays put, the top moves most. */
export function swayAt(y: number, top: number, amount: number): number {
  if (top <= 0) return 0;
  const k = Math.min(1, Math.max(0, y / top));
  return amount * Math.pow(k, 1.5);
}

/**
 * Where a block lands, relative to the block below: a little off true while
 * the tower sways (a messier tower), dead on while a streak holds it steady.
 * `jitter` is a random number from −1 to 1.
 */
export function landingOffset(below: number, sway: number, jitter: number): number {
  const off = jitter * (0.03 + 0.5 * sway);
  return Math.max(-0.7, Math.min(0.7, below + off));
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
