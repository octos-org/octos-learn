import { describe, expect, it } from "vitest";
import { describeCaptureError } from "./capture-errors";
describe("capture failure guidance", () => {
  it("distinguishes denied permission from missing or busy input devices", () => {
    expect(describeCaptureError(new DOMException("denied", "NotAllowedError"))).toContain("was blocked");
    expect(describeCaptureError(new DOMException("none", "NotFoundError"))).toContain("No microphone");
    expect(describeCaptureError(new DOMException("busy", "NotReadableError"))).toContain("another application");
  });
  it("does not mislabel an ONNX/runtime failure as a permission error", () => {
    const value = describeCaptureError(new Error("Failed to fetch /vad/silero_vad_v5.onnx"));
    expect(value).toContain("silero_vad_v5.onnx");
    expect(value).not.toContain("permission");
  });
});
