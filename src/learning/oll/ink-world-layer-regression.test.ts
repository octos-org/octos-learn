import { afterEach, describe, expect, it, vi } from "vitest";
import { InkRuntime } from "octos-lesson-language/ink-runtime";
import type { CameraState } from "octos-lesson-language/web-runtime";

type RuntimeHarness = {
  options: { viewport: HTMLElement };
  host: HTMLElement;
  editor: { display: { setDevicePixelRatio: ReturnType<typeof vi.fn> } };
  layerBounds: { left: number; top: number; width: number; height: number };
  compactedScale: number;
  pixelRatioTimer?: ReturnType<typeof setTimeout>;
  pendingCamera?: CameraState;
  appliedPixelRatio?: number;
  resetEditorViewport: ReturnType<typeof vi.fn>;
};

const updateWorldLayer = (
  InkRuntime.prototype as unknown as {
    updateWorldLayer: (this: RuntimeHarness, camera: CameraState) => void;
  }
).updateWorldLayer;

function createHarness(): RuntimeHarness {
  const viewport = document.createElement("div");
  Object.defineProperties(viewport, {
    clientWidth: { value: 1200 },
    clientHeight: { value: 800 },
  });
  return {
    options: { viewport },
    host: document.createElement("div"),
    editor: { display: { setDevicePixelRatio: vi.fn() } },
    layerBounds: { left: -420, top: -420, width: 2040, height: 1640 },
    compactedScale: 1,
    resetEditorViewport: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ink world-layer camera settlement", () => {
  it("keeps the existing world layer when the learner only pans the board", () => {
    vi.useFakeTimers();
    const runtime = createHarness();
    const originalBounds = runtime.layerBounds;

    updateWorldLayer.call(runtime, { panX: -100, panY: -60, scale: 1 });
    vi.advanceTimersByTime(120);

    expect(runtime.layerBounds).toBe(originalBounds);
    expect(runtime.resetEditorViewport).not.toHaveBeenCalled();
    expect(runtime.compactedScale).toBe(1);
  });

  it("compacts and redraws the world layer after a zoom settles", () => {
    vi.useFakeTimers();
    const runtime = createHarness();

    updateWorldLayer.call(runtime, { panX: 0, panY: 0, scale: 1.2 });
    vi.advanceTimersByTime(120);

    expect(runtime.layerBounds).toEqual({
      left: -350,
      top: -350,
      width: 1700,
      height: 1367,
    });
    expect(runtime.resetEditorViewport).toHaveBeenCalledOnce();
    expect(runtime.compactedScale).toBe(1.2);
    expect(runtime.editor.display.setDevicePixelRatio).toHaveBeenCalledOnce();
  });
});
