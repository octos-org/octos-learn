import { readHandwritingGesture, type HandwritingInputFrame } from "./handwriting-gesture";
import type { HandwritingControllerUpdate } from "./handwriting-controller";
import type { HandwritingPreferences } from "./handwriting-preferences";
import { validHandwritingRegion, validPinchThresholds } from "./handwriting-preferences";

type Point = { x: number; y: number };
export type HandwritingSetupStage = "open" | "open-ready" | "closed" | "pinch-ready" | "top-left" | "corner-ready" | "bottom-right" | "region-ready" | "failed";
export interface HandwritingSetupSnapshot { stage: HandwritingSetupStage; progress: number; result?: HandwritingPreferences }

export class HandwritingSetup {
  private samples: Array<{ score: number; point: Point }> = [];
  private firstTime: number | null = null;
  private lastTime = -Infinity;
  private open: number[] = [];
  private corner: Point | null = null;
  readonly kind: "pinch" | "region";
  private readonly preferences: HandwritingPreferences;
  snapshot: HandwritingSetupSnapshot;
  constructor(kind: "pinch" | "region", preferences: HandwritingPreferences) {
    this.kind = kind;
    this.preferences = preferences;
    this.snapshot = { stage: kind === "pinch" ? "open" : "top-left", progress: 0 };
  }
  next() {
    if (this.snapshot.stage === "open-ready") this.snapshot = { stage: "closed", progress: 0 };
    else if (this.snapshot.stage === "corner-ready") this.snapshot = { stage: "bottom-right", progress: 0 };
    this.samples = []; this.firstTime = null;
  }
  add(frame: HandwritingInputFrame) {
    if (!["open", "closed", "top-left", "bottom-right"].includes(this.snapshot.stage)) return;
    const reading = readHandwritingGesture(frame.tracked ? frame.landmarks : undefined, frame.confidence ?? 1,
      "palm-pinch", frame.worldLandmarks, frame.imageWidth && frame.imageHeight ? frame.imageWidth / frame.imageHeight : 1);
    if (!reading.valid || !reading.palmCenter || !Number.isFinite(frame.timeMs) || frame.timeMs <= this.lastTime) return;
    if (frame.timeMs - this.lastTime > 250) { this.samples = []; this.firstTime = null; }
    this.lastTime = frame.timeMs;
    this.firstTime ??= frame.timeMs;
    this.samples.push({ score: reading.pinchScore, point: { x: 1 - reading.palmCenter.x, y: reading.palmCenter.y } });
    const progress = Math.min(100, Math.floor(Math.min(this.samples.length / 20, (frame.timeMs - this.firstTime) / 700) * 20) * 5);
    this.snapshot = { ...this.snapshot, progress };
    if (progress < 100) return;
    const scores = this.samples.map(s => s.score).sort((a, b) => a - b);
    if (this.snapshot.stage === "open") {
      this.open = scores;
      this.snapshot = { stage: "open-ready", progress: 100 };
    } else if (this.snapshot.stage === "closed") {
      const closed = scores[Math.floor(scores.length * 0.9)]!;
      const open = this.open[Math.floor(this.open.length * 0.1)]!;
      const gap = open - closed;
      const pinch = { down: closed + gap * 0.25, up: closed + gap * 0.65 };
      this.snapshot = gap >= 0.12 && validPinchThresholds(pinch)
        ? { stage: "pinch-ready", progress: 100, result: { ...this.preferences, pinch } }
        : { stage: "failed", progress: 0 };
    } else {
      const point = { x: this.samples.reduce((sum, s) => sum + s.point.x, 0) / this.samples.length,
        y: this.samples.reduce((sum, s) => sum + s.point.y, 0) / this.samples.length };
      const spread = Math.max(...this.samples.map(s => Math.hypot(s.point.x - point.x, s.point.y - point.y)));
      if (spread > 0.07) { this.snapshot = { stage: "failed", progress: 0 }; return; }
      if (this.snapshot.stage === "top-left") {
        this.corner = point;
        this.snapshot = { stage: "corner-ready", progress: 100 };
      } else {
        const region = { left: this.corner!.x, top: this.corner!.y, right: point.x, bottom: point.y };
        this.snapshot = validHandwritingRegion(region)
          ? { stage: "region-ready", progress: 100, result: { ...this.preferences, region } }
          : { stage: "failed", progress: 0 };
      }
    }
  }
}

export interface HandwritingPracticeSnapshot {
  stage: "aim" | "pinch" | "draw" | "move" | "done";
  first: Point; second: Point; points: Point[];
}
export class HandwritingPractice {
  snapshot: HandwritingPracticeSnapshot;
  constructor(width: number, height: number) {
    const y = height * (width < 640 ? 0.65 : 0.4);
    this.snapshot = { stage: "aim", first: { x: width * 0.3, y }, second: { x: width * 0.6, y }, points: [] };
  }
  update(gesture: HandwritingControllerUpdate) {
    const s = this.snapshot;
    if (s.stage === "done") return;
    if (gesture.phase === "lost" || gesture.phase === "outside") {
      if (s.stage === "draw") this.snapshot = { ...s, stage: "aim", points: [] };
      return;
    }
    const near = (p: Point) => gesture.cursor && Math.hypot(gesture.cursor.x - p.x, gesture.cursor.y - p.y) <= 32;
    if (s.stage === "aim" && near(s.first) && gesture.phase === "ready") this.snapshot = { ...s, stage: "pinch" };
    else if (s.stage === "pinch" && gesture.actions.some(a => a.type === "down") && near(s.first)) {
      this.snapshot = { ...s, stage: "draw", points: [{ ...gesture.cursor! }] };
    } else if (s.stage === "draw") {
      const points = [...s.points, ...gesture.actions.filter(a => a.type === "move").map(a => a.point)].slice(-200);
      const release = gesture.actions.find(a => a.type === "up");
      const length = points.reduce((sum, p, i) => i === 0 ? sum : sum + Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y), 0);
      const stage = release ? (release.reason === "release" && length >= 40 ? "move" : "aim") : "draw";
      this.snapshot = { ...s, points, stage };
    } else if (s.stage === "move" && near(s.second) && gesture.phase === "ready") this.snapshot = { ...s, stage: "done" };
  }
}
