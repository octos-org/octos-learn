import { describe, expect, it } from "vitest";
import { findWritingPosition } from "./board-writing";

describe("board writing placement", () => {
  const source = { x: 10, y: 20, width: 100, height: 60 };
  it("uses empty space beside the source", () => {
    expect(findWritingPosition(source, 200, 100, [])).toEqual({ x: 142, y: 20 });
  });
  it("avoids strokes added during generation and multiple occupied rows", () => {
    expect(findWritingPosition(source, 200, 100, [
      { x: 140, y: 0, width: 250, height: 100 },
      { x: 130, y: 120, width: 250, height: 100 },
    ])).toEqual({ x: 142, y: 244 });
  });
});
