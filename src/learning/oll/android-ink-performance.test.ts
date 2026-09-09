import { describe, expect, it, vi } from "vitest";
import {
  androidInkPixelRatio,
  capAndroidInkPixelDensity,
} from "./android-ink-performance";

describe("Android ink pixel budget", () => {
  it("renders a 4K CSS viewport at a 1080p backing-store budget", () => {
    expect(androidInkPixelRatio({
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 1,
    })).toBeCloseTo(0.5);
  });

  it("caps a 1080p viewport reported at DPR 2 to DPR 1", () => {
    expect(androidInkPixelRatio({
      cssWidth: 1920,
      cssHeight: 1080,
      devicePixelRatio: 2,
    })).toBe(1);
  });

  it("preserves native density when the backing store is already under budget", () => {
    expect(androidInkPixelRatio({
      cssWidth: 1280,
      cssHeight: 720,
      devicePixelRatio: 1,
    })).toBe(1);
  });

  it("clamps later runtime attempts to restore the screen DPR", () => {
    const setDevicePixelRatio = vi.fn(() => undefined);
    const runtime = { editor: { display: { setDevicePixelRatio } } };
    const viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientWidth: { value: 1920 },
      clientHeight: { value: 1080 },
    });

    capAndroidInkPixelDensity(runtime, viewport, 2);
    runtime.editor.display.setDevicePixelRatio(3);

    expect(setDevicePixelRatio).toHaveBeenNthCalledWith(1, 1);
    expect(setDevicePixelRatio).toHaveBeenNthCalledWith(2, 1);
  });
});
