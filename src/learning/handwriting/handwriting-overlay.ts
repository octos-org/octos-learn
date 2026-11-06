import { HANDWRITING_DEFAULT_MODE, handPalmCenter, validHandLandmarks, type HandwritingGestureMode, type HandwritingInputFrame } from "./handwriting-gesture";
import { HANDWRITING_CAMERA_REGION } from "./handwriting-map";

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// Match the video's object-fit: cover. Both video and canvas are mirrored once
// by CSS, so landmarks remain aligned for 4:3, widescreen and portrait cameras.
export function projectPreviewPoint(
  point: { x: number; y: number },
  preview: { width: number; height: number },
  source: { width: number; height: number },
): { x: number; y: number } {
  const scale = Math.max(preview.width / source.width, preview.height / source.height);
  return {
    x: point.x * source.width * scale + (preview.width - source.width * scale) / 2,
    y: point.y * source.height * scale + (preview.height - source.height * scale) / 2,
  };
}

export function drawHandwritingOverlay(
  canvas: HTMLCanvasElement,
  frame: HandwritingInputFrame | null,
  penDown = false,
  mode: HandwritingGestureMode = HANDWRITING_DEFAULT_MODE,
  region = HANDWRITING_CAMERA_REGION,
): void {
  if (!frame) {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const project = (point: { x: number; y: number }) => projectPreviewPoint(point, { width, height }, {
    width: frame.imageWidth || 640, height: frame.imageHeight || 480,
  });
  const topLeft = project({ x: 1 - region.right, y: region.top });
  const bottomRight = project({ x: 1 - region.left, y: region.bottom });
  context.strokeStyle = "rgba(255,255,255,0.45)";
  context.lineWidth = 1;
  context.setLineDash([4, 5]);
  context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  context.setLineDash([]);
  if (!frame.tracked || !validHandLandmarks(frame.landmarks)) return;
  const points = frame.landmarks.map(project);
  context.strokeStyle = "#f8fafc";
  context.lineWidth = 2;
  context.shadowColor = "#17211f";
  context.shadowBlur = 3;
  for (const [a, b] of HAND_CONNECTIONS) {
    context.beginPath();
    context.moveTo(points[a]!.x, points[a]!.y);
    context.lineTo(points[b]!.x, points[b]!.y);
    context.stroke();
  }
  for (const [index, point] of points.entries()) {
    context.beginPath();
    const highlighted = mode !== "grip" && mode !== "palm-pinch" && index === 8;
    context.arc(point.x, point.y, highlighted ? 5 : 3, 0, Math.PI * 2);
    context.fillStyle = highlighted ? penDown ? "#ff704f" : "#5ff4c4" : "#ff5869";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.stroke();
  }
  if (mode === "grip" || mode === "palm-pinch") {
    const center = project(handPalmCenter(frame.landmarks));
    context.beginPath();
    context.arc(center.x, center.y, 7, 0, Math.PI * 2);
    context.fillStyle = penDown ? "#ff704f" : "#5ff4c4";
    context.fill();
    context.strokeStyle = "#fff";
    context.lineWidth = 2;
    context.stroke();
  }
  context.shadowBlur = 0;
}
