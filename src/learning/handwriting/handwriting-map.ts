export interface HandwritingViewportSize {
  width: number;
  height: number;
}

export interface HandwritingCameraRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface HandwritingBoardCamera {
  panX: number;
  panY: number;
  scale: number;
}

export interface HandwritingMappedPoint {
  x: number;
  y: number;
  inside: boolean;
}

export const HANDWRITING_CAMERA_REGION: HandwritingCameraRegion = {
  left: 0.1,
  top: 0.08,
  right: 0.9,
  bottom: 0.92,
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function mapHandPointToViewport(
  point: { x: number; y: number },
  viewport: HandwritingViewportSize,
  mirrorX = true,
  region: HandwritingCameraRegion = HANDWRITING_CAMERA_REGION,
): HandwritingMappedPoint {
  const cameraX = mirrorX ? 1 - point.x : point.x;
  const cameraY = point.y;
  const inside = cameraX >= region.left
    && cameraX <= region.right
    && cameraY >= region.top
    && cameraY <= region.bottom;
  const normalizedX = clamp((cameraX - region.left) / Math.max(0.0001, region.right - region.left), 0, 1);
  const normalizedY = clamp((cameraY - region.top) / Math.max(0.0001, region.bottom - region.top), 0, 1);
  return {
    x: normalizedX * viewport.width,
    y: normalizedY * viewport.height,
    inside,
  };
}

export function viewportPointToBoard(
  point: { x: number; y: number },
  camera: HandwritingBoardCamera,
): { x: number; y: number } {
  if (!Number.isFinite(camera.scale) || camera.scale <= 0) throw new Error("Camera scale must be positive");
  return {
    x: (point.x - camera.panX) / camera.scale,
    y: (point.y - camera.panY) / camera.scale,
  };
}

class OneEuroChannel {
  private previousValue: number | undefined;
  private previousDerivative = 0;
  private previousTime: number | undefined;

  private readonly minimumCutoff: number;
  private readonly beta: number;
  private readonly derivativeCutoff: number;

  constructor(minimumCutoff: number, beta: number, derivativeCutoff = 1) {
    this.minimumCutoff = minimumCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (Math.PI * 2 * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.previousValue = undefined;
    this.previousDerivative = 0;
    this.previousTime = undefined;
  }

  filter(value: number, timeMs: number): number {
    if (this.previousValue === undefined || this.previousTime === undefined) {
      this.previousValue = value;
      this.previousTime = timeMs;
      return value;
    }
    const dt = clamp((timeMs - this.previousTime) / 1000, 0.001, 0.1);
    const derivative = (value - this.previousValue) / dt;
    const derivativeAlpha = this.alpha(this.derivativeCutoff, dt);
    const smoothedDerivative = derivativeAlpha * derivative + (1 - derivativeAlpha) * this.previousDerivative;
    const cutoff = this.minimumCutoff + this.beta * Math.abs(smoothedDerivative);
    const valueAlpha = this.alpha(cutoff, dt);
    const smoothed = valueAlpha * value + (1 - valueAlpha) * this.previousValue;
    this.previousValue = smoothed;
    this.previousDerivative = smoothedDerivative;
    this.previousTime = timeMs;
    return smoothed;
  }
}

export class HandwritingPointFilter {
  private readonly x: OneEuroChannel;
  private readonly y: OneEuroChannel;

  constructor(minimumCutoff = 1.6, beta = 0.035) {
    this.x = new OneEuroChannel(minimumCutoff, beta);
    this.y = new OneEuroChannel(minimumCutoff, beta);
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }

  filter(point: { x: number; y: number }, timeMs: number): { x: number; y: number } {
    return {
      x: this.x.filter(point.x, timeMs),
      y: this.y.filter(point.y, timeMs),
    };
  }
}
