import { describe, expect, it } from "vitest";
import { teachingCameraCeiling, teachingCameraFloor, teachingReadingScale } from "./board-chrome-insets";

describe("teaching camera range", () => {
  it("keeps desktop lessons at or above the reading scale", () => {
    expect(teachingCameraFloor(false)).toBe(teachingReadingScale(false));
    expect(teachingCameraFloor(false)).toBeLessThan(teachingCameraCeiling(false));
  });

  it("keeps the meeting-display floor below its reading scale", () => {
    expect(teachingCameraFloor(true)).toBe(.55);
    expect(teachingCameraFloor(true)).toBeLessThan(teachingReadingScale(true));
  });
});
