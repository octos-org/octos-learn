import { expect, it } from "vitest";

import { entryLetters, parseGraphEntry } from "./graph-entry";

it("reads functions, guide lines and equations", () => {
  expect(parseGraphEntry("x^2+k")).toEqual({ kind: "function", expression: "x^2+k" });
  expect(parseGraphEntry(" y = 2*x ")).toEqual({ kind: "function", expression: "2*x" });
  expect(parseGraphEntry("x = 2")).toEqual({ kind: "guide", axis: "x", value: 2 });
  expect(parseGraphEntry("y=-1.5")).toEqual({ kind: "guide", axis: "y", value: -1.5 });
  expect(parseGraphEntry("x^2 + y^2 = 4")).toEqual({ kind: "equation", expression: "(x^2+y^2)-(4)", label: "x^2+y^2 = 4" });
  expect(parseGraphEntry("y = y^2")).toMatchObject({ kind: "equation" });
  for (const bad of ["", "x = = 2", "=3", "x="]) expect(parseGraphEntry(bad)).toBeUndefined();
  expect(entryLetters(parseGraphEntry("x^2+y^2=r^2")!)).toEqual(["r"]);
  expect(entryLetters(parseGraphEntry("a*x+b")!)).toEqual(["a", "b"]);
});
