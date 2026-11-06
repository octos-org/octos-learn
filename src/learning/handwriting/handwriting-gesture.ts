import type { HandwritingPinchThresholds } from "./handwriting-preferences";
export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export type HandwritingGestureMode = "grip" | "fist" | "point" | "pinch" | "palm-pinch";
export const HANDWRITING_DEFAULT_MODE: HandwritingGestureMode = "grip";
export type HandwritingGesturePhase = "lost" | "unarmed" | "ready" | "pending" | "drawing" | "holding";

export interface HandwritingInputFrame {
  timeMs: number;
  tracked: boolean;
  landmarks?: HandLandmark[];
  worldLandmarks?: HandLandmark[];
  imageWidth?: number;
  imageHeight?: number;
  confidence?: number;
  processingMs?: number;
}

export interface HandwritingGestureReading {
  tracked: boolean;
  valid: boolean;
  writingPose: boolean;
  movePose: boolean;
  pinchScore: number;
  fingers: Array<"extended" | "folded" | "uncertain">;
  indexTip: { x: number; y: number } | null;
  palmCenter: { x: number; y: number } | null;
  fingerCurls: number[];
  gripScore: number;
  openingScore: number;
}

export type HandwritingGestureTransition = "down" | "up" | "break" | null;

export interface HandwritingGestureUpdate {
  reading: HandwritingGestureReading;
  penDown: boolean;
  canMove: boolean;
  phase: HandwritingGesturePhase;
  transition: HandwritingGestureTransition;
  transitionStartedAt?: number;
}

export const HANDWRITING_PINCH_DOWN_SCORE = 0.28;
export const HANDWRITING_PINCH_UP_SCORE = 0.42;
export const HANDWRITING_MIN_CONFIDENCE = 0.55;
export const HANDWRITING_GESTURE_FRAMES = 3;
export const HANDWRITING_GESTURE_DWELL_MS = 90;

const distance = (a: HandLandmark, b: HandLandmark) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export function validHandLandmarks(points: unknown): points is HandLandmark[] {
  return Array.isArray(points)
    && points.length === 21
    && points.every((point) => point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && Math.abs(point.x) < 4
      && Math.abs(point.y) < 4
      && (point.z === undefined || Number.isFinite(point.z)));
}

export function pinchScore(points: HandLandmark[]): number {
  if (!validHandLandmarks(points)) return Number.POSITIVE_INFINITY;
  const scale = Math.max(0.0001, distance(points[0]!, points[9]!));
  return distance(points[4]!, points[8]!) / scale;
}

function fingerGeometry(points: HandLandmark[], mcp: number, pip: number, tip: number): { angle: number; reach: number } {
  const a = points[mcp]!;
  const b = points[pip]!;
  const c = points[tip]!;
  const ab = distance(a, b);
  const cb = distance(c, b);
  if (ab < 0.0001 || cb < 0.0001) return { angle: 135, reach: 1 };
  const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)
    + ((a.z ?? 0) - (b.z ?? 0)) * ((c.z ?? 0) - (b.z ?? 0));
  const angle = Math.acos(Math.min(1, Math.max(-1, dot / (ab * cb)))) * 180 / Math.PI;
  const reach = distance(c, points[0]!) / Math.max(0.0001, distance(b, points[0]!));
  return { angle, reach };
}

function fingerState(points: HandLandmark[], mcp: number, pip: number, tip: number): "extended" | "folded" | "uncertain" {
  const { angle, reach } = fingerGeometry(points, mcp, pip, tip);
  if (angle >= 150 && reach >= 1.12) return "extended";
  if (angle <= 115 || reach <= 0.95) return "folded";
  return "uncertain";
}

/** Use palm bones, never finger tips, as the shared hovering/drawing reference. */
export function handPalmCenter(points: HandLandmark[]): { x: number; y: number } {
  const result = { x: points[0]!.x * 0.5, y: points[0]!.y * 0.5 };
  for (const joint of [5, 9, 13, 17]) {
    result.x += points[joint]!.x * 0.125;
    result.y += points[joint]!.y * 0.125;
  }
  return result;
}

export function writingPose(points: HandLandmark[], mode: "point" | "fist" = "point"): boolean {
  if (!validHandLandmarks(points)) return false;
  return fingerState(points, 5, 6, 8) === "extended"
    // Middle finger position may change continuously in fist mode. It never
    // changes the pointer target or interrupts a stroke. An open palm remains
    // a pen-up pose, so a casual wave does not become a drawing command.
    && (mode === "fist" ? [[13, 14, 16], [17, 18, 20]] : [[9, 10, 12], [13, 14, 16], [17, 18, 20]])
      .every(([mcp, pip, tip]) => fingerState(points, mcp!, pip!, tip!) === "folded");
}

export function readHandwritingGesture(
  landmarks: HandLandmark[] | undefined,
  confidence = 1,
  mode: HandwritingGestureMode = HANDWRITING_DEFAULT_MODE,
  worldLandmarks?: HandLandmark[],
  aspectRatio = 1,
): HandwritingGestureReading {
  const rawValid = Boolean(landmarks && validHandLandmarks(landmarks) && Number.isFinite(confidence) && confidence >= HANDWRITING_MIN_CONFIDENCE);
  // Use a common metric scale for all axes, including depth. Image coordinates
  // normalize x/y independently, so correct the aspect ratio in the fallback.
  const geometry = rawValid
    ? validHandLandmarks(worldLandmarks) ? worldLandmarks : landmarks!.map((point) => ({
      x: point.x * aspectRatio, y: point.y, z: (point.z ?? 0) * aspectRatio,
    }))
    : [];
  const valid = rawValid && distance(geometry[0]!, geometry[9]!) > 0.005
    && distance(geometry[5]!, geometry[17]!) > 0.005;
  const score = valid ? pinchScore(geometry) : Number.POSITIVE_INFINITY;
  const fingers = valid ? [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]]
    .map(([mcp, pip, tip]) => fingerState(geometry, mcp!, pip!, tip!)) : [];
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const fingerGeometryReadings = valid ? [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]]
    .map(([mcp, pip, tip]) => fingerGeometry(geometry, mcp!, pip!, tip!)) : [];
  const fingerCurls = fingerGeometryReadings.map(({ angle, reach }) => {
    return Math.max(clamp((165 - angle) / 70), clamp((1.1 - reach) / 0.4));
  });
  const gripScore = valid ? fingerCurls.reduce((sum, curl) => sum + curl, 0) / 4 : 0;
  return {
    tracked: Boolean(landmarks),
    valid,
    writingPose: valid && (mode === "grip" ? gripScore >= 0.55 && fingerCurls.filter(curl => curl >= 0.45).length >= 3
      : (mode === "pinch" || mode === "palm-pinch") ? score <= HANDWRITING_PINCH_DOWN_SCORE : writingPose(geometry, mode as "point" | "fist")),
    movePose: valid && (mode === "grip" ? gripScore <= 0.20 && fingerCurls.filter(curl => curl <= 0.25).length >= 3
      : mode === "fist" ? fingers.every((finger) => finger === "folded")
      : mode === "point" ? fingers[0] === "extended" && fingers[1] === "extended" : score >= HANDWRITING_PINCH_UP_SCORE),
    pinchScore: score,
    fingers,
    indexTip: valid ? { x: landmarks![8]!.x, y: landmarks![8]!.y } : null,
    palmCenter: valid ? handPalmCenter(landmarks!) : null,
    gripScore,
    // Keep an unsaturated angle signal to detect the beginning of opening,
    // including frames where the broad, tolerant grip class remains unchanged.
    openingScore: valid ? fingerGeometryReadings.reduce((sum, finger) => sum + finger.angle / 180, 0) / 4 : 0,
    fingerCurls,
  };
}

export class HandwritingGestureFilter {
  private penDown = false;
  private armed = false;
  private streak = 0;
  private since = 0;
  private lastTime = -Infinity;
  private candidate: "move" | "write" | null = null;
  private readonly mode: HandwritingGestureMode;
  private gripClosingAt: number | null = null;
  private gripOpeningAt: number | null = null;
  private gripOpenSince: number | null = null;
  private gripOpenFrames = 0;
  private gripHistory: Array<{ timeMs: number; score: number }> = [];

  private readonly pinch: HandwritingPinchThresholds;
  constructor(mode: HandwritingGestureMode = HANDWRITING_DEFAULT_MODE, pinch: HandwritingPinchThresholds = { down: 0.28, up: 0.42 }) {
    this.mode = mode;
    this.pinch = pinch;
  }

  reset(): HandwritingGestureTransition {
    const transition = this.penDown ? "break" : null;
    this.penDown = false;
    this.armed = false;
    this.candidate = null;
    this.streak = 0;
    this.lastTime = -Infinity;
    this.gripClosingAt = null;
    this.gripOpeningAt = null;
    this.gripOpenSince = null;
    this.gripOpenFrames = 0;
    this.gripHistory = [];
    return transition;
  }

  update(frame: HandwritingInputFrame): HandwritingGestureUpdate {
    const reading = readHandwritingGesture(frame.tracked ? frame.landmarks : undefined,
      frame.confidence ?? 1, this.mode, frame.worldLandmarks,
      frame.imageWidth && frame.imageHeight ? frame.imageWidth / frame.imageHeight : 1);
    const result = (transition: HandwritingGestureTransition, phase: HandwritingGesturePhase): HandwritingGestureUpdate => ({
      reading, transition, phase, penDown: this.penDown,
      // Freeze ambiguous pinch-opening frames before release; the index finger
      // moving away from the thumb must not extend the stroke.
      canMove: this.penDown && reading.writingPose,
    });
    if (!reading.valid || !Number.isFinite(frame.timeMs)) {
      const transition = this.reset();
      return result(transition, "lost");
    }
    if (frame.timeMs <= this.lastTime || frame.timeMs - this.lastTime > 250) {
      const transition = this.reset();
      this.lastTime = frame.timeMs;
      if (transition) return result(transition, "unarmed");
    }
    this.lastTime = frame.timeMs;
    if (this.mode === "palm-pinch") return this.updatePalmPinch(reading, frame.timeMs);
    if (this.mode === "grip") return this.updateGrip(reading, frame.timeMs);
    if (this.penDown) {
      // Lift as soon as the index stops being clearly extended, without
      // waiting for a fully closed fist. Pointerup uses the last drawing point.
      const release = this.mode === "pinch" ? reading.pinchScore >= HANDWRITING_PINCH_UP_SCORE : !reading.writingPose;
      if (!release) return result(null, reading.writingPose ? "drawing" : "holding");
      this.penDown = false;
      this.armed = false;
      this.candidate = null;
      this.streak = 0;
      return result("up", "unarmed");
    }

    const candidate = !this.armed && reading.movePose ? "move"
      : this.armed && reading.writingPose ? "write" : null;
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.since = frame.timeMs;
      this.streak = 0;
    }
    this.streak = candidate ? this.streak + 1 : 0;
    const stable = this.streak >= HANDWRITING_GESTURE_FRAMES && frame.timeMs - this.since >= HANDWRITING_GESTURE_DWELL_MS;
    if (stable && candidate === "move") {
      this.armed = true;
      this.candidate = null;
      this.streak = 0;
    } else if (stable && candidate === "write") {
      this.penDown = true;
      this.candidate = null;
      this.streak = 0;
      return result("down", "drawing");
    }
    return result(null, !this.armed ? "unarmed" : candidate === "write" ? "pending" : "ready");
  }

  private updatePalmPinch(reading: HandwritingGestureReading, timeMs: number): HandwritingGestureUpdate {
    reading.writingPose = reading.valid && reading.pinchScore <= this.pinch.down;
    reading.movePose = reading.valid && reading.pinchScore >= this.pinch.up;
    const opening = reading.pinchScore > this.pinch.down;
    const candidate = this.penDown ? (opening ? "move" : null)
      : !this.armed ? (reading.movePose ? "move" : null)
      : reading.writingPose ? "write" : null;
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.since = timeMs;
      this.streak = 0;
    }
    if (candidate) this.streak += 1;
    let transition: HandwritingGestureTransition = null;
    if (this.penDown && opening && timeMs - this.since > 450) {
      const started = this.since;
      this.reset();
      return { reading, transition: "break", phase: "unarmed", penDown: false, canMove: false, transitionStartedAt: started };
    }
    if (this.streak >= 2 && timeMs - this.since >= (this.penDown ? 40 : 60)) {
      if (this.penDown && reading.movePose) {
        this.penDown = false;
        this.armed = true;
        transition = "up";
      } else if (!this.penDown && candidate === "move") this.armed = true;
      else if (candidate === "write") {
        this.penDown = true;
        transition = "down";
      }
    }
    const phase = this.penDown ? (opening ? "holding" : "drawing")
      : !this.armed ? "unarmed" : candidate === "write" ? "pending" : "ready";
    return { reading, transition, phase, penDown: this.penDown,
      canMove: this.penDown && !opening,
      transitionStartedAt: opening || transition === "up" ? this.since : undefined };
  }

  private updateGrip(reading: HandwritingGestureReading, timeMs: number): HandwritingGestureUpdate {
    const out = (transition: HandwritingGestureTransition, phase: HandwritingGesturePhase, transitionStartedAt?: number): HandwritingGestureUpdate => ({
      reading, transition, phase, transitionStartedAt, penDown: this.penDown,
      canMove: this.penDown && this.gripOpeningAt === null,
    });
    // Look back only over a sustained change in hand shape. A flat preceding
    // stroke must not be removed just because the user eventually opens a hand.
    let trendStart = timeMs;
    let nextScore = 1 - reading.openingScore;
    let drop = 0;
    for (let index = this.gripHistory.length - 1; index >= 0; index -= 1) {
      const sample = this.gripHistory[index]!;
      if (timeMs - sample.timeMs > 100 || sample.score - nextScore < 0.015) break;
      drop += sample.score - nextScore;
      trendStart = sample.timeMs;
      nextScore = sample.score;
    }
    this.gripHistory.push({ timeMs, score: 1 - reading.openingScore });
    this.gripHistory = this.gripHistory.filter(sample => timeMs - sample.timeMs <= 150);

    if (this.penDown) {
      const opening = reading.movePose || (drop >= 0.12 && reading.gripScore < 0.48
        && reading.fingerCurls.filter(curl => curl < 0.35).length >= 2);
      if (opening && this.gripOpeningAt === null) this.gripOpeningAt = drop >= 0.12 ? trendStart : timeMs;
      if (reading.movePose) {
        this.gripOpenSince ??= timeMs;
        this.gripOpenFrames += 1;
      } else {
        this.gripOpenSince = null;
        this.gripOpenFrames = 0;
      }
      if (this.gripOpenSince !== null && this.gripOpenFrames >= 2 && timeMs - this.gripOpenSince >= 50) {
        const started = this.gripOpeningAt ?? timeMs;
        this.penDown = false;
        this.armed = true;
        this.gripOpeningAt = null;
        this.gripOpenSince = null;
        this.gripOpenFrames = 0;
        this.streak = 0;
        this.candidate = null;
        return out("up", "ready", started);
      }
      if (this.gripOpeningAt !== null && !opening && reading.gripScore >= 0.4) {
        this.gripOpeningAt = null;
      }
      if (this.gripOpeningAt !== null) {
        if (timeMs - this.gripOpeningAt > 450) {
          const started = this.gripOpeningAt;
          this.reset();
          return out("break", "unarmed", started);
        }
        return out(null, "holding", this.gripOpeningAt);
      }
      // Once engaged, tolerate relaxed fingers. Only an explicit open-hand
      // gesture releases; a slightly different grip is not a pen-up command.
      return out(null, "drawing");
    }

    if (this.armed && !reading.movePose && reading.gripScore > 0.25) this.gripClosingAt ??= timeMs;
    if (reading.movePose) this.gripClosingAt = null;
    const candidate = !this.armed && reading.movePose ? "move" : this.armed && reading.writingPose ? "write" : null;
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.since = timeMs;
      this.streak = 0;
    }
    this.streak = candidate ? this.streak + 1 : 0;
    const stable = this.streak >= HANDWRITING_GESTURE_FRAMES && timeMs - this.since >= HANDWRITING_GESTURE_DWELL_MS;
    if (stable && candidate === "move") {
      this.armed = true;
      this.candidate = null;
      this.streak = 0;
    } else if (stable && candidate === "write") {
      const started = this.gripClosingAt ?? this.since;
      this.penDown = true;
      this.gripClosingAt = null;
      this.candidate = null;
      this.streak = 0;
      this.gripHistory = [{ timeMs, score: 1 - reading.openingScore }];
      return out("down", "drawing", started);
    }
    return out(null, !this.armed ? "unarmed" : this.gripClosingAt !== null ? "pending" : "ready", this.gripClosingAt ?? undefined);
  }
}
