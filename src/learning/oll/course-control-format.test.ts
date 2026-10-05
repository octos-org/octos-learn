import { describe, expect, it } from "vitest";
import { courseControlLabelWidth, formatCourseControlValue } from "./course-control-format";

describe("formatCourseControlValue", () => {
  it("shows at most two decimal places without changing the underlying value", () => {
    expect(formatCourseControlValue(1.2345)).toBe("1.23");
    expect(formatCourseControlValue(-2.5)).toBe("-2.5");
    expect(formatCourseControlValue(0.004)).toBe("0");
    expect(formatCourseControlValue(1.239, "cm")).toBe("1.24 cm");
  });

  it("keeps familiar exact radian labels", () => {
    expect(formatCourseControlValue(0, "rad")).toBe("0");
    expect(formatCourseControlValue(Math.PI / 2, "rad")).toBe("π/2");
    expect(formatCourseControlValue(0.1234, "rad")).toBe("0.12 rad");
  });

  it("keeps a moving value's label length fixed by its slider step", () => {
    const labels = [1.55, 1.6, 1.65, 1.7].map((value) => formatCourseControlValue(value, undefined, { step: 0.03 }));
    expect(labels).toEqual(["1.55", "1.60", "1.65", "1.70"]);
    expect(formatCourseControlValue(2, undefined, { step: 0.5 })).toBe("2.0");
    expect(formatCourseControlValue(3, undefined, { step: 1 })).toBe("3");
    expect(formatCourseControlValue(-0.001, undefined, { step: 0.05 })).toBe("0.00");
  });

  it("shows symbolic radians only while the value is at rest", () => {
    expect(formatCourseControlValue(Math.PI / 2, "rad", { step: 0.0314 })).toBe("π/2");
    expect(formatCourseControlValue(Math.PI / 2, "rad", { step: 0.0314, moving: true })).toBe("1.57 rad");
  });

  it("reserves the width of the longest label in the range", () => {
    expect(courseControlLabelWidth(-3, 3, undefined, 0.03)).toBe(5);
    expect(courseControlLabelWidth(0, 6.28, "rad", 0.0314)).toBe(8);
  });
});
