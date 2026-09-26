import { describe, expect, it } from "vitest";
import type { AuthoringLesson } from "octos-lesson-language";
import { analyzeOllConstruction } from "./oll-construction-diagnostics";

function lesson(expression: string, step = 1): AuthoringLesson {
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: { mode: "explain", title: "范围证明", language: "zh-CN", goals: ["边界"],
      variables: [{ as: "h", initial: 1, min: 0, max: 4, control: { kind: "slider", step } }] },
    steps: [{ key: "first", purpose: "观察", beats: [{ key: "first", actions: [{
      do: "write", as: "circle", kind: "geometry", role: "diagram", place: { relation: "new_region" },
      content: { bindings: [{ target: "circle.radius", expression, allow_zero: true }] },
    }] }] }], close: { summary: "完成", focus: ["circle"] },
  };
}

describe("bounded construction diagnostics", () => {
  it("proves only the enumerated slider domain and keeps continuity unproven", () => {
    const result = analyzeOllConstruction(lesson("sqrt(h)"));
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BINDING_GRID_PROVEN", proofStatus: "proven", samples: 5 }),
      expect.objectContaining({ code: "CONTINUOUS_BINDING_UNPROVEN", proofStatus: "not_proven" }),
    ]));
  });
  it("finds a singular interior slider point even when initial value is valid", () => {
    expect(analyzeOllConstruction(lesson("1/(h-2)^2"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BINDING_DOMAIN_INVALID", severity: "error", proofStatus: "disproven", samples: 3 }),
    ]));
  });
  it("bounds enormous grids without pretending the range was proved", () => {
    const result = analyzeOllConstruction(lesson("sqrt(h)", .000001));
    expect(result[0]).toMatchObject({ code: "BINDING_DOMAIN_UNPROVEN", proofStatus: "not_proven", samples: 1 });
  });
});
