import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HandwritingPointerController,
  type HandwritingPointerAction,
} from "../src/learning/handwriting/handwriting-controller";
import {
  HANDWRITING_PINCH_DOWN_SCORE,
  HANDWRITING_PINCH_UP_SCORE,
  HANDWRITING_GESTURE_FRAMES,
  HANDWRITING_GESTURE_DWELL_MS,
} from "../src/learning/handwriting/handwriting-gesture";
import { summarizeLatency } from "../src/learning/handwriting/handwriting-metrics";
import { HANDWRITING_GRIP_BUFFER_MS } from "../src/learning/handwriting/handwriting-grip-controller";
import {
  simulatedHandwritingFrames,
  summarizeSimulatedActions,
} from "../src/learning/handwriting/simulated-trajectory";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "docs", "handwriting-lab");
const viewport = { width: 800, height: 600 };
const frames = simulatedHandwritingFrames();
const controller = new HandwritingPointerController();
const actions: HandwritingPointerAction[] = [];
const updateMs: number[] = [];
for (const frame of frames) {
  const started = performance.now();
  const update = controller.update(frame, viewport);
  updateMs.push(performance.now() - started);
  actions.push(...update.actions);
}
let strokeActive = false;
let hoverDoesNotDraw = true;
let balancedStrokes = true;
for (const action of actions) {
  if (action.type === "down" && strokeActive) balancedStrokes = false;
  if (action.type !== "down" && !strokeActive) balancedStrokes = false;
  if (action.type === "move" && !strokeActive) hoverDoesNotDraw = false;
  strokeActive = action.type !== "up";
}
if (strokeActive) balancedStrokes = false;
const report = {
  generatedAt: new Date().toISOString(),
  viewport,
  gesture: {
    choice: "open palm to hover; loose grip to draw with a palm-based anchored cursor; open palm to release",
    pointReference: "palm bones with relative rebasing during pose transitions",
    inkBufferMs: HANDWRITING_GRIP_BUFFER_MS,
    pinchDownScore: HANDWRITING_PINCH_DOWN_SCORE,
    pinchUpScore: HANDWRITING_PINCH_UP_SCORE,
    confirmationFrames: HANDWRITING_GESTURE_FRAMES,
    confirmationDwellMs: HANDWRITING_GESTURE_DWELL_MS,
    releaseConfirmation: "open palm over at least 2 frames and 50 ms",
  },
  trajectory: summarizeSimulatedActions(frames, actions),
  controllerUpdateMs: summarizeLatency(updateMs),
  checks: {
    hoverDoesNotDraw,
    everyDownHasUp: balancedStrokes,
    occlusionBreak: actions.some((action) => action.type === "up" && action.reason === "lost"),
  },
};

function strokePaths(): string[] {
  const strokes: string[] = [];
  let current: string[] = [];
  for (const action of actions) {
    if (action.type === "down") {
      if (current.length > 1) strokes.push(`M ${current.join(" L ")}`);
      current = [`${action.point.x.toFixed(1)} ${action.point.y.toFixed(1)}`];
    } else if (current.length) {
      current.push(`${action.point.x.toFixed(1)} ${action.point.y.toFixed(1)}`);
      if (action.type === "up") {
        strokes.push(`M ${current.join(" L ")}`);
        current = [];
      }
    }
  }
  if (current.length > 1) strokes.push(`M ${current.join(" L ")}`);
  return strokes;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewport.width} ${viewport.height}">
  <rect width="100%" height="100%" fill="#f7faf8"/>
  <rect x="80" y="48" width="640" height="504" rx="10" fill="none" stroke="#b9cec6" stroke-dasharray="6 6"/>
  ${strokePaths().map((pathData) => `<path d="${pathData}" fill="none" stroke="#176b62" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join("\n  ")}
</svg>
`;

await mkdir(out, { recursive: true });
await writeFile(path.join(out, "simulated-trajectory-report.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(out, "simulated-trajectory.svg"), svg);
console.log(`handwriting simulation: ${report.trajectory.strokes} strokes, ${report.trajectory.actions.move} moves, ${report.trajectory.breakUps} occlusion break`);
