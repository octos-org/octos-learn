export interface InkCameraState {
  panX: number;
  panY: number;
  scale: number;
}

type CameraListener = (camera: InkCameraState) => void;

export interface InkCameraBoard {
  getCameraState: () => InkCameraState;
  subscribeCamera: (listener: CameraListener) => () => void;
}

/** Quiet period after the last camera frame before a deferred editor sync. */
export const DEFERRED_EDITOR_SYNC_MS = 120;

interface GateListener {
  channel: "live" | "editor";
  listener: CameraListener;
}

export interface InkCameraGate<Board extends InkCameraBoard> {
  /**
   * The board handed to the ink runtime. Its camera subscription is the
   * "editor" channel; every other member forwards to the real board.
   */
  editorBoard: Board;
  /** Camera source for layers the learner sees (the Android SVG mirror). */
  liveCameraSource: Pick<InkCameraBoard, "subscribeCamera">;
  /**
   * While suspended (lesson playback with ink hidden) no listener runs. On
   * resume every listener receives the camera once, so hidden layers never
   * reappear at a stale position.
   */
  setSuspended: (suspended: boolean) => void;
  /**
   * Coalesce editor-channel frames until the camera settles. Only valid when
   * the editor surface is not what the learner sees (the APK's js-draw
   * canvases are transparent behind the SVG mirror) and the learner is not
   * editing, so turning this off flushes the latest camera immediately.
   */
  setEditorSyncDeferred: (deferred: boolean) => void;
  destroy: () => void;
}

/**
 * Board camera fan-out for the learner ink layers.
 *
 * OLL notifies camera listeners on every animation frame of a camera
 * transition. The ink runtime answers each one with a full js-draw rerender,
 * which is the dominant per-frame cost on Android 8 WebViews. This gate keeps
 * that work proportional to what is actually visible or editable.
 */
export function createInkCameraGate<Board extends InkCameraBoard>(
  board: Board,
  hostWindow: Pick<Window, "setTimeout" | "clearTimeout" | "requestAnimationFrame" | "cancelAnimationFrame"> = window,
): InkCameraGate<Board> {
  const listeners = new Set<GateListener>();
  let unsubscribeBoard: (() => void) | null = null;
  let suspended = false;
  let editorDeferred = false;
  let pendingEditorCamera: InkCameraState | null = null;
  let editorTimer: ReturnType<typeof setTimeout> | undefined;
  let editorSettleFrame: number | undefined;
  let destroyed = false;

  const clearEditorTimer = () => {
    if (editorTimer !== undefined) {
      hostWindow.clearTimeout(editorTimer);
      editorTimer = undefined;
    }
    if (editorSettleFrame !== undefined) {
      hostWindow.cancelAnimationFrame(editorSettleFrame);
      editorSettleFrame = undefined;
    }
  };
  const emit = (channel: GateListener["channel"], camera: InkCameraState) => {
    for (const entry of [...listeners]) {
      if (entry.channel === channel) entry.listener({ ...camera });
    }
  };
  const flushEditor = () => {
    clearEditorTimer();
    const camera = pendingEditorCamera;
    pendingEditorCamera = null;
    if (camera && !suspended) emit("editor", camera);
  };
  const onBoardCamera = (camera: InkCameraState) => {
    if (suspended) return;
    emit("live", camera);
    if (!editorDeferred) {
      emit("editor", camera);
      return;
    }
    pendingEditorCamera = { ...camera };
    clearEditorTimer();
    editorTimer = hostWindow.setTimeout(() => {
      editorTimer = undefined;
      // On a slow WebView the quiet-period timer can expire between two
      // camera frames even while a pinch is still moving. Let the next frame's
      // camera notification cancel this flush before rerendering hidden ink.
      editorSettleFrame = hostWindow.requestAnimationFrame(() => {
        editorSettleFrame = undefined;
        flushEditor();
      });
    }, DEFERRED_EDITOR_SYNC_MS);
  };
  const subscribe = (
    channel: GateListener["channel"],
    listener: CameraListener,
  ): (() => void) => {
    const entry: GateListener = { channel, listener };
    listeners.add(entry);
    if (!unsubscribeBoard && !destroyed) {
      // The board replays its current camera to a new subscriber, which
      // reaches this listener through onBoardCamera.
      unsubscribeBoard = board.subscribeCamera(onBoardCamera);
    } else if (!destroyed) {
      // Keep that subscribe-time contract for every later listener: a freshly
      // mounted board does not start at the identity camera.
      listener(board.getCameraState());
    }
    return () => {
      listeners.delete(entry);
      if (listeners.size === 0 && unsubscribeBoard) {
        unsubscribeBoard();
        unsubscribeBoard = null;
      }
    };
  };

  const editorBoard = new Proxy(board, {
    get(target, property) {
      if (property === "subscribeCamera") {
        return (listener: CameraListener) => subscribe("editor", listener);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return {
    editorBoard,
    liveCameraSource: {
      subscribeCamera: (listener) => subscribe("live", listener),
    },
    setSuspended(next) {
      if (next === suspended) return;
      suspended = next;
      if (suspended) {
        clearEditorTimer();
        pendingEditorCamera = null;
        return;
      }
      const camera = board.getCameraState();
      emit("live", camera);
      emit("editor", camera);
    },
    setEditorSyncDeferred(next) {
      if (next === editorDeferred) return;
      editorDeferred = next;
      if (!editorDeferred) flushEditor();
    },
    destroy() {
      destroyed = true;
      clearEditorTimer();
      pendingEditorCamera = null;
      listeners.clear();
      unsubscribeBoard?.();
      unsubscribeBoard = null;
    },
  };
}
