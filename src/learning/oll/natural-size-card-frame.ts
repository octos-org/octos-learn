import type { WhiteboardRect } from "../whiteboard-placement";

/**
 * Cards the learner works at no less than their natural size on desktop. Each is laid out for a window of 1024 px
 * and up, with no mobile layout (owner, 2026-11-26), and framed with the whole course its pieces shrank well below
 * the size it draws them at:
 * - the place-value trade card (OLL 0026): disks of 34, 28 or 24 px by column count, about 16 px with the course;
 * - the make-ten card (OLL 0027): counters of 50 px, 24 px with the course at 1024 × 768;
 * - the place-value times-ten card (OLL 0028): disks of 30 px, 11.5 to 14.3 px with the course at 1024 × 768;
 * - the place-value compare card (OLL 0029): disks of 34, 31, 30 or 28 px by four to seven columns; on the test
 *   pairs, a card 560 to 956 px wide and 582 to 660 px tall.
 */
export const NATURAL_SIZE_CARD_KINDS: ReadonlySet<string> = new Set(["place_value_trade", "make_ten", "place_value_times_ten", "place_value_compare"]);

/**
 * What the learner reads the answer off, on a natural-size card, by kind. Once the typed answer under the card
 * opens, the camera frames from the top of these down to the answer's entry, so what is read and what is typed are
 * in view together, as far as the window allows at natural size:
 * - the trade card: its answer row of disks;
 * - the make-ten card: the count above each frame (10 and what is left), with the frames under them;
 * - the times-ten card: its own answer element (OLL #126), a count's target column or a times pair's column of copy
 *   numbers (1 to 10).
 * The place-value compare card (OLL 0029) has none: its task ends on the card, with the learner's own sign in the
 * sentence under its chart, and nothing is typed under it, so it is framed from its top while worked.
 */
const CARD_ANSWER_READING: Readonly<Record<string, string>> = {
  place_value_trade: ".place-value-trade-cell-answer",
  make_ten: ".make-ten-caption",
  place_value_times_ten: ".place-value-times-ten-answer",
};

/** The selector for what a card's answer is read off, or undefined to frame the card and its answers. */
export function cardAnswerRowSelector(kind: string | undefined): string | undefined {
  return kind && Object.hasOwn(CARD_ANSWER_READING, kind) ? CARD_ANSWER_READING[kind] : undefined;
}

/** The camera floor while such a card is framed: one unit a pixel. */
export const NATURAL_SIZE_CAMERA_FLOOR = 1;

/** Space kept between the chrome and the framed edge. */
const EDGE_GAP = 16;

export interface CardFrameViewport {
  width: number;
  height: number;
  insets: { top?: number; bottom?: number };
}

/**
 * Which end of the card and its answer box stays in view when not all of it fits at natural size: the card's top
 * (the problem and the arrows) while the learner works the card, the answer box's bottom (the card's answer row
 * above it) once the answer opens.
 */
export type CardFrameAlign = "top" | "bottom";

/**
 * The world rect to hand the board camera, with a floor of 1, so the card the learner works lands at natural size,
 * centred across the window, with the chosen end just inside the chrome; the rest shows as far as the window
 * reaches.
 *
 * The board's camera centres what it is given in the area between the insets, and with a floor of 1 never shrinks
 * it. A rect as tall as that area (less a gap at each end), starting at the card's top (or ending at the answer
 * box's bottom), is therefore placed with that edge `EDGE_GAP` inside the chrome, whatever the camera's own
 * margins. When the card and its answer box fit in that height, the rect is all of them, and they are centred.
 */
export function naturalSizeCardFrame(
  card: WhiteboardRect,
  below: readonly WhiteboardRect[],
  viewport: CardFrameViewport,
  align: CardFrameAlign = "top",
): WhiteboardRect {
  const bottom = Math.max(card.y + card.height, ...below.map((rect) => rect.y + rect.height));
  const sceneHeight = bottom - card.y;
  const usable = Math.max(1, viewport.height - (viewport.insets.top ?? 0) - (viewport.insets.bottom ?? 0) - 2 * EDGE_GAP);
  const height = Math.min(sceneHeight, usable);
  return { x: card.x, y: align === "top" ? card.y : bottom - height, width: card.width, height };
}
