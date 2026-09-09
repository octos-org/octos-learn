const ANDROID_INK_PIXEL_BUDGET = 1920 * 1080;

interface InkDisplay {
  setDevicePixelRatio: (ratio: number) => Promise<void> | undefined;
}

interface InkRuntimeWithDisplay {
  editor?: { display?: InkDisplay };
}

export interface InkPixelRatioInput {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
}

/**
 * Keep the two viewport-sized js-draw canvases within a 1080p pixel budget.
 * Course cards remain DOM/SVG and therefore retain the panel's native clarity;
 * only the freehand ink backing stores are rendered at this lower density.
 */
export function androidInkPixelRatio({
  cssWidth,
  cssHeight,
  devicePixelRatio,
}: InkPixelRatioInput): number {
  if (
    !Number.isFinite(cssWidth)
    || !Number.isFinite(cssHeight)
    || cssWidth <= 0
    || cssHeight <= 0
  ) return Math.max(0.1, devicePixelRatio || 1);

  const budgetRatio = Math.sqrt(
    ANDROID_INK_PIXEL_BUDGET / (cssWidth * cssHeight),
  );
  return Math.max(0.1, Math.min(devicePixelRatio || 1, budgetRatio));
}

export function capAndroidInkPixelDensity(
  runtime: unknown,
  viewport: HTMLElement,
  devicePixelRatio = window.devicePixelRatio || 1,
): void {
  const display = (runtime as InkRuntimeWithDisplay).editor?.display;
  if (!display?.setDevicePixelRatio) return;

  const maximumRatio = androidInkPixelRatio({
    cssWidth: viewport.clientWidth,
    cssHeight: viewport.clientHeight,
    devicePixelRatio,
  });
  const setDevicePixelRatio = display.setDevicePixelRatio.bind(display);

  // The OLL runtime reapplies window.devicePixelRatio when the camera changes.
  // Clamp those later calls as well as the initial canvas allocation.
  display.setDevicePixelRatio = (requestedRatio) =>
    setDevicePixelRatio(Math.min(requestedRatio, maximumRatio));
  void display.setDevicePixelRatio(devicePixelRatio);
}
