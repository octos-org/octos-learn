const ANDROID_INK_IDLE_PIXEL_BUDGET = 3840 * 2160;
const ANDROID_INK_INTERACTION_PIXEL_BUDGET = 1920 * 1080;
const RESTORE_IDLE_DENSITY_MS = 180;

interface InkDisplay {
  setDevicePixelRatio: (ratio: number) => Promise<void> | undefined;
}

interface InkRuntimeWithDisplay {
  editor?: {
    display?: InkDisplay;
    toSVG?: () => SVGElement;
  };
  host?: HTMLElement;
  subscribe?: (
    listener: (state: { content_revision?: number }) => void,
  ) => () => void;
}

interface CameraState {
  panX: number;
  panY: number;
  scale: number;
}

interface CameraSource {
  subscribeCamera: (listener: (camera: CameraState) => void) => () => void;
}

interface AndroidVectorInkMirror {
  updateCamera: (camera: CameraState) => void;
  destroy: () => void;
}

export interface InkPixelRatioInput {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
}

function pixelRatioForBudget(
  { cssWidth, cssHeight, devicePixelRatio }: InkPixelRatioInput,
  pixelBudget: number,
): number {
  if (
    !Number.isFinite(cssWidth)
    || !Number.isFinite(cssHeight)
    || cssWidth <= 0
    || cssHeight <= 0
  ) return Math.max(0.1, devicePixelRatio || 1);

  const budgetRatio = Math.sqrt(pixelBudget / (cssWidth * cssHeight));
  return Math.max(0.1, Math.min(devicePixelRatio || 1, budgetRatio));
}

/** Native-density target used while the whiteboard camera is stationary. */
export function androidInkPixelRatio(input: InkPixelRatioInput): number {
  return pixelRatioForBudget(input, ANDROID_INK_IDLE_PIXEL_BUDGET);
}

/** 1080p target used only while the learner is panning or zooming. */
export function androidInteractiveInkPixelRatio(
  input: InkPixelRatioInput,
): number {
  return pixelRatioForBudget(input, ANDROID_INK_INTERACTION_PIXEL_BUDGET);
}

function sameCamera(left: CameraState, right: CameraState): boolean {
  return Math.abs(left.panX - right.panX) < 0.01
    && Math.abs(left.panY - right.panY) < 0.01
    && Math.abs(left.scale - right.scale) < 0.0001;
}

function configureAndroidVectorInkMirror(
  runtime: InkRuntimeWithDisplay,
  viewport: HTMLElement,
): AndroidVectorInkMirror | null {
  const hostWindow = viewport.ownerDocument.defaultView as (
    Window & { OctosNativeInk?: unknown }
  ) | null;
  const editor = runtime.editor;
  const host = runtime.host;
  // Keep ordinary Android-mode browser previews on js-draw. The SVG mirror is
  // paired with the APK's native live-stroke overlay so ink stays visible from
  // pointer-down through the committed vector handoff.
  if (!hostWindow?.OctosNativeInk || !editor?.toSVG || !host || !runtime.subscribe) {
    return null;
  }

  let camera: CameraState = { panX: 0, panY: 0, scale: 1 };
  let vector: SVGElement | null = null;
  let renderedRevision: number | undefined;
  let pendingRevision: number | undefined;
  let renderFrame: number | undefined;

  const applyCamera = (target: SVGElement) => {
    const scale = Math.max(0.01, camera.scale);
    target.setAttribute(
      "viewBox",
      [
        -camera.panX / scale,
        -camera.panY / scale,
        viewport.clientWidth / scale,
        viewport.clientHeight / scale,
      ].join(" "),
    );
  };
  const render = () => {
    const next = editor.toSVG!();
    next.classList.add("oll-android-vector-ink");
    next.setAttribute("aria-hidden", "true");
    next.setAttribute("width", "100%");
    next.setAttribute("height", "100%");
    next.setAttribute("preserveAspectRatio", "none");
    applyCamera(next);
    if (vector) vector.replaceWith(next);
    else host.prepend(next);
    vector = next;
    host.dataset.androidVectorInk = "";
  };

  const onRuntimeState = (state: { content_revision?: number }) => {
    const revision = state.content_revision;
    if (revision !== undefined && revision === renderedRevision) return;
    pendingRevision = revision;

    // Render the initial document immediately. Later content mutations are
    // coalesced to one full SVG export per display frame; save/selection/mode
    // notifications carrying the same revision do no work at all.
    if (!vector) {
      render();
      renderedRevision = revision;
      return;
    }
    if (renderFrame !== undefined) return;
    renderFrame = hostWindow.requestAnimationFrame(() => {
      renderFrame = undefined;
      render();
      renderedRevision = pendingRevision;
    });
  };

  const unsubscribe = runtime.subscribe(onRuntimeState);
  return {
    updateCamera(nextCamera) {
      camera = { ...nextCamera };
      if (vector) applyCamera(vector);
    },
    destroy() {
      if (renderFrame !== undefined) hostWindow.cancelAnimationFrame(renderFrame);
      unsubscribe();
      vector?.remove();
      delete host.dataset.androidVectorInk;
    },
  };
}

/**
 * Dynamically trade canvas resolution for camera-interaction throughput.
 *
 * Ordinary Android-mode browser previews render committed ink at up to 4K
 * while stationary, then temporarily drop js-draw to 1080p during camera
 * motion. The APK uses native Canvas for the active stroke and a persistent
 * SVG mirror for committed ink, so its hidden editing canvas stays at 1080p
 * and never pressures Android 8 into a blurry texture fallback.
 */
export function configureAndroidInkDynamicDensity(
  runtime: unknown,
  viewport: HTMLElement,
  cameraSource: CameraSource,
  devicePixelRatio = window.devicePixelRatio || 1,
): () => void {
  const inkRuntime = runtime as InkRuntimeWithDisplay;
  const display = inkRuntime.editor?.display;
  if (!display?.setDevicePixelRatio) return () => undefined;

  const input = {
    cssWidth: viewport.clientWidth,
    cssHeight: viewport.clientHeight,
    devicePixelRatio,
  };
  const interactionRatio = androidInteractiveInkPixelRatio(input);
  const vectorMirror = configureAndroidVectorInkMirror(inkRuntime, viewport);
  // The APK renders stationary committed ink as SVG. Its hidden js-draw
  // canvases only provide editing mechanics, so retaining a 4K backing store
  // wastes enough GPU memory for Android 8 WebView to downsample it after a
  // few strokes. Keep that backing store at the interaction budget instead.
  const idleRatio = vectorMirror ? interactionRatio : androidInkPixelRatio(input);
  const originalSetDevicePixelRatio = display.setDevicePixelRatio.bind(display);
  let maximumRatio = idleRatio;
  let appliedMode: "idle" | "interaction" = "idle";
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  let applyQueue = Promise.resolve();

  const applyRatio = (requestedRatio: number): Promise<void> => {
    const ratio = Math.min(requestedRatio, maximumRatio);
    applyQueue = applyQueue
      .catch(() => undefined)
      .then(() => originalSetDevicePixelRatio(ratio));
    return applyQueue;
  };
  // OLL may reapply the screen DPR after camera changes. Keep those calls
  // inside the current idle/interaction ceiling too.
  display.setDevicePixelRatio = applyRatio;
  void applyRatio(devicePixelRatio);

  const enterInteraction = () => {
    if (restoreTimer !== undefined) clearTimeout(restoreTimer);
    if (appliedMode !== "interaction") {
      appliedMode = "interaction";
      maximumRatio = interactionRatio;
      void applyRatio(devicePixelRatio);
    }
    restoreTimer = setTimeout(() => {
      restoreTimer = undefined;
      appliedMode = "idle";
      maximumRatio = idleRatio;
      void applyRatio(devicePixelRatio);
    }, RESTORE_IDLE_DENSITY_MS);
  };

  let previousCamera: CameraState | undefined;
  const unsubscribeCamera = cameraSource.subscribeCamera((camera) => {
    vectorMirror?.updateCamera(camera);
    if (previousCamera && !sameCamera(previousCamera, camera)) {
      enterInteraction();
    }
    previousCamera = { ...camera };
  });

  return () => {
    if (restoreTimer !== undefined) clearTimeout(restoreTimer);
    unsubscribeCamera();
    vectorMirror?.destroy();
    display.setDevicePixelRatio = originalSetDevicePixelRatio;
  };
}
