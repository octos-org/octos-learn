import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInkCameraGate,
  DEFERRED_EDITOR_SYNC_MS,
  type InkCameraState,
} from "./ink-camera-gate";

function createBoard() {
  let emit: ((camera: InkCameraState) => void) | undefined;
  let current: InkCameraState = { panX: 0, panY: 0, scale: 1 };
  const unsubscribe = vi.fn(() => {
    emit = undefined;
  });
  const board = {
    getCameraState: vi.fn(() => ({ ...current })),
    subscribeCamera: vi.fn((listener: (camera: InkCameraState) => void) => {
      emit = listener;
      return unsubscribe;
    }),
    viewportToBoard(point: { x: number; y: number }) {
      return { x: point.x - current.panX, y: point.y - current.panY };
    },
  };
  return {
    board,
    unsubscribe,
    move(camera: InkCameraState) {
      current = camera;
      emit?.(camera);
    },
  };
}

describe("ink camera gate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards every frame to both channels by default", () => {
    const { board, move } = createBoard();
    const gate = createInkCameraGate(board);
    const editor = vi.fn();
    const live = vi.fn();
    gate.editorBoard.subscribeCamera(editor);
    gate.liveCameraSource.subscribeCamera(live);

    move({ panX: 10, panY: 0, scale: 1 });
    move({ panX: 20, panY: 0, scale: 1 });

    expect(editor).toHaveBeenCalledTimes(2);
    expect(live).toHaveBeenCalledTimes(2);
    expect(board.subscribeCamera).toHaveBeenCalledOnce();
  });

  it("keeps the rest of the board API bound to the real board", () => {
    const { board, move } = createBoard();
    const gate = createInkCameraGate(board);
    move({ panX: 5, panY: 7, scale: 1 });

    expect(gate.editorBoard.viewportToBoard({ x: 10, y: 10 })).toEqual({ x: 5, y: 3 });
    expect(gate.editorBoard.getCameraState()).toEqual({ panX: 5, panY: 7, scale: 1 });
  });

  it("coalesces deferred editor frames into one sync after the camera settles", () => {
    vi.useFakeTimers();
    const { board, move } = createBoard();
    const gate = createInkCameraGate(board);
    const editor = vi.fn();
    const live = vi.fn();
    gate.editorBoard.subscribeCamera(editor);
    gate.liveCameraSource.subscribeCamera(live);
    gate.setEditorSyncDeferred(true);

    for (let frame = 1; frame <= 10; frame += 1) {
      move({ panX: frame * 10, panY: 0, scale: 1 });
      vi.advanceTimersByTime(16);
    }
    expect(live).toHaveBeenCalledTimes(10);
    expect(editor).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEFERRED_EDITOR_SYNC_MS);
    expect(editor).toHaveBeenCalledOnce();
    expect(editor).toHaveBeenLastCalledWith({ panX: 100, panY: 0, scale: 1 });
  });

  it("flushes a pending editor camera as soon as editing starts", () => {
    vi.useFakeTimers();
    const { board, move } = createBoard();
    const gate = createInkCameraGate(board);
    const editor = vi.fn();
    gate.editorBoard.subscribeCamera(editor);
    gate.setEditorSyncDeferred(true);

    move({ panX: 30, panY: 0, scale: 1.2 });
    gate.setEditorSyncDeferred(false);
    expect(editor).toHaveBeenCalledWith({ panX: 30, panY: 0, scale: 1.2 });

    vi.advanceTimersByTime(DEFERRED_EDITOR_SYNC_MS);
    expect(editor).toHaveBeenCalledOnce();
  });

  it("does no ink work while suspended and resumes at the current camera", () => {
    vi.useFakeTimers();
    const { board, move } = createBoard();
    const gate = createInkCameraGate(board);
    const editor = vi.fn();
    const live = vi.fn();
    gate.editorBoard.subscribeCamera(editor);
    gate.liveCameraSource.subscribeCamera(live);
    gate.setEditorSyncDeferred(true);
    move({ panX: 1, panY: 0, scale: 1 });

    gate.setSuspended(true);
    move({ panX: 50, panY: 40, scale: 0.8 });
    move({ panX: 60, panY: 40, scale: 0.8 });
    vi.advanceTimersByTime(DEFERRED_EDITOR_SYNC_MS * 2);
    expect(editor).not.toHaveBeenCalled();
    expect(live).toHaveBeenCalledTimes(1);

    gate.setSuspended(false);
    expect(editor).toHaveBeenCalledOnce();
    expect(editor).toHaveBeenLastCalledWith({ panX: 60, panY: 40, scale: 0.8 });
    expect(live).toHaveBeenLastCalledWith({ panX: 60, panY: 40, scale: 0.8 });
  });

  it("releases the board subscription when the last listener leaves or on destroy", () => {
    const { board, unsubscribe } = createBoard();
    const gate = createInkCameraGate(board);
    const stop = gate.editorBoard.subscribeCamera(vi.fn());
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();

    gate.liveCameraSource.subscribeCamera(vi.fn());
    gate.destroy();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
