import type { HandwritingPointerAction } from "./handwriting-controller";
import { HANDWRITING_DEFAULT_MODE, handPalmCenter, type HandLandmark, type HandwritingGestureMode, type HandwritingInputFrame } from "./handwriting-gesture";

export interface SimulatedHandwritingReport {
  frames: number;
  trackedFrames: number;
  lostFrames: number;
  actions: {
    down: number;
    move: number;
    up: number;
  };
  strokes: number;
  breakUps: number;
  releaseUps: number;
  points: Array<{ x: number; y: number }>;
  actionLog: HandwritingPointerAction[];
}

export function makeHandwritingLandmarks(
  tip: { x: number; y: number },
  pinchRatio: number,
  mode: HandwritingGestureMode = "pinch",
  drawing = pinchRatio < 0.42,
): HandLandmark[] {
  if (mode === "grip") {
    const points = makeHandwritingLandmarks({ x: 0, y: 0 }, pinchRatio, "fist", false);
    if (!drawing) for (const mcp of [5, 9, 13, 17]) {
      for (let joint = mcp + 1; joint <= mcp + 3; joint += 1) {
        points[joint] = { x: points[mcp]!.x, y: points[mcp]!.y - (joint - mcp) * 0.075 };
      }
    }
    const center = handPalmCenter(points);
    return points.map(point => ({ x: tip.x + (point.x - center.x) * 0.65, y: tip.y + (point.y - center.y) * 0.65 }));
  }
  const wrist = { x: tip.x - 0.03, y: tip.y + 0.34 };
  const handSize = Math.hypot(0.04, 0.18);
  const thumbTip = { x: tip.x + pinchRatio * handSize, y: tip.y };
  const points: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: wrist.x, y: wrist.y }));
  points[0] = wrist;
  points[1] = { x: thumbTip.x + 0.05, y: thumbTip.y + 0.1 };
  points[2] = { x: thumbTip.x + 0.03, y: thumbTip.y + 0.06 };
  points[3] = { x: thumbTip.x + 0.015, y: thumbTip.y + 0.025 };
  points[4] = thumbTip;
  points[5] = { x: tip.x, y: tip.y + 0.18 };
  points[6] = { x: tip.x, y: tip.y + 0.11 };
  points[7] = { x: tip.x, y: tip.y + 0.05 };
  points[8] = tip;
  const curledFinger = (mcp: number, offset: number) => {
    points[mcp] = { x: wrist.x + offset, y: wrist.y - 0.18 };
    points[mcp + 1] = { x: wrist.x + offset + 0.04, y: wrist.y - 0.24 };
    points[mcp + 2] = { x: wrist.x + offset + 0.065, y: wrist.y - 0.17 };
    points[mcp + 3] = { x: wrist.x + offset + 0.05, y: wrist.y - 0.12 };
  };
  curledFinger(9, 0.04);
  curledFinger(13, 0.075);
  curledFinger(17, 0.11);
  if (mode === "fist" && !drawing) {
    // Keep the palm fixed while the index folds, as in a real hand closing.
    curledFinger(5, 0.03);
  }
  if (mode === "point" && !drawing) {
    for (let index = 10; index <= 12; index += 1) {
      points[index] = { x: points[9]!.x, y: points[9]!.y - (index - 9) * 0.075 };
    }
  }
  return points;
}

export function simulatedHandwritingFrames(mode: HandwritingGestureMode = HANDWRITING_DEFAULT_MODE): HandwritingInputFrame[] {
  const frames: HandwritingInputFrame[] = [];
  let time = 0;
  const push = (point: { x: number; y: number }, pinch: number, jitter = 0) => {
    const noisy = {
      x: point.x + jitter * Math.sin(frames.length * 2.7),
      y: point.y + jitter * Math.cos(frames.length * 2.1),
    };
    frames.push({
      timeMs: time,
      tracked: true,
      confidence: 0.94,
      landmarks: makeHandwritingLandmarks(noisy, pinch, mode),
      imageWidth: 640,
      imageHeight: 640,
    });
    time += 33;
  };
  const lost = () => {
    frames.push({ timeMs: time, tracked: false });
    time += 33;
  };

  for (let index = 0; index < 5; index += 1) push({ x: 0.3 + index * 0.012, y: 0.3 }, 0.74);
  for (let index = 0; index < 4; index += 1) push({ x: 0.36, y: 0.3 }, 0.22);
  for (let index = 0; index < 28; index += 1) {
    const progress = index / 27;
    push({ x: 0.36 + progress * 0.27, y: 0.3 + Math.sin(progress * Math.PI) * 0.2 }, 0.22, 0.0016);
    if (mode === "fist") {
      // Alternate one/two fingers while keeping the index trajectory unchanged.
      const points = frames.at(-1)!.landmarks!;
      for (let joint = 10; joint <= 12; joint += 1) {
        const unfoldedY = points[9]!.y - (joint - 9) * 0.075;
        const amount = (Math.sin(progress * Math.PI * 4) + 1) / 2;
        points[joint]!.x += (points[9]!.x - points[joint]!.x) * amount;
        points[joint]!.y += (unfoldedY - points[joint]!.y) * amount;
      }
    }
  }
  for (let index = 0; index < 2; index += 1) push({ x: 0.63, y: 0.3 }, 0.74);
  for (let index = 0; index < 6; index += 1) push({ x: 0.58 - index * 0.025, y: 0.68 }, 0.74);
  for (let index = 0; index < 4; index += 1) push({ x: 0.43, y: 0.68 }, 0.22);
  for (let index = 0; index < 8; index += 1) push({ x: 0.43 + index * 0.018, y: 0.68 }, 0.22);
  for (let index = 0; index < 4; index += 1) lost();
  for (let index = 0; index < 5; index += 1) push({ x: 0.59, y: 0.68 }, 0.74);
  for (let index = 0; index < 4; index += 1) push({ x: 0.59, y: 0.68 }, 0.22);
  for (let index = 0; index < 7; index += 1) push({ x: 0.59 + index * 0.018, y: 0.68 + index * 0.008 }, 0.22);
  for (let index = 0; index < (mode === "grip" ? 5 : 2); index += 1) push({ x: 0.7, y: 0.68 }, 0.74);
  return frames;
}

export function summarizeSimulatedActions(
  frames: HandwritingInputFrame[],
  actions: HandwritingPointerAction[],
): SimulatedHandwritingReport {
  return {
    frames: frames.length,
    trackedFrames: frames.filter((frame) => frame.tracked).length,
    lostFrames: frames.filter((frame) => !frame.tracked).length,
    actions: {
      down: actions.filter((action) => action.type === "down").length,
      move: actions.filter((action) => action.type === "move").length,
      up: actions.filter((action) => action.type === "up").length,
    },
    strokes: actions.filter((action) => action.type === "down").length,
    breakUps: actions.filter((action) => action.type === "up" && action.reason === "lost").length,
    releaseUps: actions.filter((action) => action.type === "up" && action.reason === "release").length,
    points: actions.flatMap((action) => action.type === "up" ? [] : [action.point]),
    actionLog: actions,
  };
}
