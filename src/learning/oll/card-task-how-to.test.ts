import { cardHowTo } from "octos-lesson-language/plugin-math";
import { describe, expect, it } from "vitest";

import { cardTaskHowTo } from "./card-task-how-to";

describe("cardTaskHowTo", () => {
  it("keeps the trading mat's and the place-value chart's fixed text beside their tasks", () => {
    expect(cardTaskHowTo("base_ten_trade", {})).toBe(cardHowTo("base_ten_trade", {}));
    expect(cardTaskHowTo("base_ten_trade", {})).toMatch(/Tap a block to put it in the tray/);
    expect(cardTaskHowTo("place_value_chart", { mode: "build" })).toMatch(/Tap \+ under a place/);
    expect(cardTaskHowTo("place_value_chart", { mode: "apart" })).toMatch(/Take out/);
  });

  it("shows no second line for the place-value trade card, which draws its own (OLL decision 0026)", () => {
    // OLL still has fixed text for the card; Learn relies on the line the card draws instead.
    expect(cardHowTo("place_value_trade", { operation: "add" })).toBeTruthy();
    expect(cardTaskHowTo("place_value_trade", { operation: "add" })).toBeUndefined();
    expect(cardTaskHowTo("place_value_trade", { operation: "subtract", language: "zh-CN" })).toBeUndefined();
  });

  it("has nothing for a card without a how-to", () => {
    expect(cardTaskHowTo("number_line", {})).toBeUndefined();
    expect(cardTaskHowTo(undefined, {})).toBeUndefined();
  });
});
