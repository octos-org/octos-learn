import { describe, expect, it } from "vitest";
import { formatCourseControlValue } from "./course-control-format";

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
});
