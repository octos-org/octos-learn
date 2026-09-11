import { describe, expect, it } from "vitest";
import { findWritingPosition } from "./board-writing";

describe("board writing placement", () => {
  const source = { x: 10, y: 20, width: 100, height: 60 };
  it("uses empty space beside the source", () => {
    expect(findWritingPosition(source, 200, 100, [])).toEqual({ x: 142, y: 20 });
  });
  it("uses the space directly below the source when the right edge is only narrowly blocked", () => {
    const selectedInk = { x: 80, y: 235, width: 280, height: 70 };
    const nearbyCourseCard = { x: 740, y: 150, width: 300, height: 300 };

    expect(findWritingPosition(selectedInk, 400, 100, [nearbyCourseCard]))
      .toEqual({ x: 80, y: 337 });
  });
  it("avoids strokes added during generation and multiple occupied rows", () => {
    expect(findWritingPosition(source, 200, 100, [
      { x: 140, y: 0, width: 250, height: 100 },
      { x: 130, y: 120, width: 250, height: 100 },
    ])).toEqual({ x: 130, y: 236 });
  });
});
