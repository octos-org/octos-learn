import { afterEach, describe, expect, it, vi } from "vitest";
import { InkRuntime } from "octos-lesson-language/ink-runtime";
import type { CameraState } from "octos-lesson-language/web-runtime";

type RuntimeHarness = {
  options: { viewport: HTMLElement };
  editor: {
    getRootElement: () => HTMLElement;
    display: { setDevicePixelRatio: ReturnType<typeof vi.fn> };
    queueRerender: ReturnType<typeof vi.fn>;
  };
  renderedCamera: CameraState;
  pendingCamera?: CameraState;
  cameraRenderTimer?: ReturnType<typeof setTimeout>;
  cameraRenderRevision: number;
  appliedPixelRatio?: number;
  resetEditorViewport: ReturnType<typeof vi.fn>;
};

const updateWorldLayer = (
  InkRuntime.prototype as unknown as {
    updateWorldLayer: (this: RuntimeHarness, camera: CameraState) => void;
  }
).updateWorldLayer;

const disablePageBoundaryRendering = (
  InkRuntime.prototype as unknown as {
    disablePageBoundaryRendering: (this: {
      editor: { rerender: (...args: unknown[]) => unknown };
    }) => void;
  }
).disablePageBoundaryRendering;

function createHarness(renderedCamera: CameraState): RuntimeHarness & {
  editorRoot: HTMLElement;
} {
  const viewport = document.createElement("div");
  const editorRoot = document.createElement("div");
  return {
    options: { viewport },
    editorRoot,
    editor: {
      getRootElement: () => editorRoot,
      display: { setDevicePixelRatio: vi.fn() },
      queueRerender: vi.fn(async () => undefined),
    },
    renderedCamera,
    cameraRenderRevision: 0,
    resetEditorViewport: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ink camera synchronization", () => {
  it("never paints js-draw's fixed page boundary on the infinite board", () => {
    const rerender = vi.fn();
    const runtime = { editor: { rerender } };

    disablePageBoundaryRendering.call(runtime);
    runtime.editor.rerender();

    expect(rerender).toHaveBeenCalledOnce();
    expect(rerender).toHaveBeenCalledWith(false);
  });

  it("uses the same translation as the board while panning, then redraws in place", async () => {
    vi.useFakeTimers();
    const runtime = createHarness({ panX: 80, panY: 60, scale: 1 });

    updateWorldLayer.call(runtime, { panX: -100, panY: -60, scale: 1 });

    expect(runtime.editorRoot.style.transform).toBe("matrix(1, 0, 0, 1, -180, -120)");
    expect(runtime.resetEditorViewport).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120);

    expect(runtime.renderedCamera).toEqual({ panX: -100, panY: -60, scale: 1 });
    expect(runtime.resetEditorViewport).toHaveBeenCalledOnce();
    expect(runtime.editor.queueRerender).toHaveBeenCalledOnce();
    expect(runtime.editorRoot.style.transform).toBe("");
  });

  it("keeps the ink aligned to the zoom anchor and redraws at screen DPR", async () => {
    vi.useFakeTimers();
    const runtime = createHarness({ panX: 80, panY: 60, scale: 1 });

    updateWorldLayer.call(runtime, { panX: 20, panY: 10, scale: 1.25 });

    expect(runtime.editorRoot.style.transform).toBe("matrix(1.25, 0, 0, 1.25, -80, -65)");

    await vi.advanceTimersByTimeAsync(120);

    expect(runtime.renderedCamera).toEqual({ panX: 20, panY: 10, scale: 1.25 });
    expect(runtime.editor.display.setDevicePixelRatio).toHaveBeenCalledWith(window.devicePixelRatio);
    expect(runtime.editorRoot.style.transform).toBe("");
  });

  it("does not let an older redraw clear a newer camera transform", async () => {
    vi.useFakeTimers();
    let finishFirstRedraw: (() => void) | undefined;
    const runtime = createHarness({ panX: 0, panY: 0, scale: 1 });
    runtime.editor.queueRerender.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        finishFirstRedraw = resolve;
      }),
    );

    updateWorldLayer.call(runtime, { panX: -40, panY: -20, scale: 1 });
    await vi.advanceTimersByTimeAsync(120);

    updateWorldLayer.call(runtime, { panX: -80, panY: -40, scale: 1 });
    finishFirstRedraw?.();
    await Promise.resolve();

    expect(runtime.editorRoot.style.transform).toBe("matrix(1, 0, 0, 1, -40, -20)");
  });
});
