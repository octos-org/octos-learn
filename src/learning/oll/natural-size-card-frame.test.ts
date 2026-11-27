import { describe, expect, it } from "vitest";

import { NATURAL_SIZE_CARD_KINDS, cardAnswerRowSelector, naturalSizeCardFrame } from "./natural-size-card-frame";

// Learn's desktop chrome floors: 92 px above the board, 120 px below (the input dock).
const desktop = (width: number, height: number) => ({ width, height, insets: { top: 92, bottom: 120 } });
// A six-column trade card at its natural size, and its answer box under the task panel.
const card = { x: 20, y: 20, width: 988, height: 545 };
const answer = { x: 20, y: 790, width: 988, height: 150 };

describe("naturalSizeCardFrame", () => {
  it("is for the place-value trade card, the make-ten card and the place-value times-ten card", () => {
    expect([...NATURAL_SIZE_CARD_KINDS]).toEqual(["place_value_trade", "make_ten", "place_value_times_ten"]);
    expect(NATURAL_SIZE_CARD_KINDS.has("base_ten_trade")).toBe(false);
    expect(NATURAL_SIZE_CARD_KINDS.has("place_value_chart")).toBe(false);
  });

  it("knows what each card's answer is read off: the trade card's answer row, make-ten's counts; none for times-ten", () => {
    expect(cardAnswerRowSelector("place_value_trade")).toBe(".place-value-trade-cell-answer");
    expect(cardAnswerRowSelector("make_ten")).toBe(".make-ten-caption");
    expect(cardAnswerRowSelector("place_value_times_ten")).toBeUndefined();
    expect(cardAnswerRowSelector(undefined)).toBeUndefined();
    expect(cardAnswerRowSelector("toString")).toBeUndefined();
  });

  it("keeps the card's top in view when the card and its answer box do not fit at natural size", () => {
    // 768 − 92 − 120 − 2 × 16: the height between the chrome, less a gap at each end.
    expect(naturalSizeCardFrame(card, [answer], desktop(1024, 768))).toEqual({ x: 20, y: 20, width: 988, height: 524 });
    expect(naturalSizeCardFrame(card, [answer], desktop(1440, 900))).toEqual({ x: 20, y: 20, width: 988, height: 656 });
  });

  it("keeps the bottom (the answer box) in view once the answer opens", () => {
    expect(naturalSizeCardFrame(card, [answer], desktop(1024, 768), "bottom")).toEqual({ x: 20, y: 940 - 524, width: 988, height: 524 });
  });

  it("frames all of it when it fits, at the card's width", () => {
    const small = { x: 20, y: 20, width: 600, height: 300 };
    const box = { x: 20, y: 360, width: 330, height: 120 };
    expect(naturalSizeCardFrame(small, [box], desktop(1440, 900))).toEqual({ x: 20, y: 20, width: 600, height: 460 });
    expect(naturalSizeCardFrame(small, [], desktop(1440, 900), "bottom")).toEqual(small);
  });
});
