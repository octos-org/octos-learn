import type { WhiteboardRect } from "../whiteboard-placement";

/**
 * Cards the learner works at no less than their natural size on desktop. The place-value trade card (OLL 0026)
 * draws its disks at 34, 28 or 24 px by column count and is laid out for a window of 1024 px and up; framed with
 * the whole course it shrank to about 16 px. There is no mobile layout for it (owner, 2026-11-26).
 */
export const NATURAL_SIZE_CARD_KINDS: ReadonlySet<string> = new Set(["place_value_trade"]);

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
