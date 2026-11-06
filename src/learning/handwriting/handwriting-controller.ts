import type { HandwritingPinchThresholds } from "./handwriting-preferences";
import {
  HandwritingGestureFilter,
  HANDWRITING_DEFAULT_MODE,
  type HandwritingGestureTransition,
  type HandwritingInputFrame,
  type HandwritingGestureMode,
  type HandwritingGesturePhase,
  type HandwritingGestureReading,
} from "./handwriting-gesture";
import {
  HandwritingPointFilter,
  mapHandPointToViewport,
  type HandwritingCameraRegion,
  type HandwritingViewportSize,
} from "./handwriting-map";
import { HandwritingGripPointerController } from "./handwriting-grip-controller";

export interface HandwritingPointerAction {
  type: "down" | "move" | "up";
  point: { x: number; y: number };
  timeMs: number;
  reason?: "pinch" | "point" | "extend" | "grip" | "release" | "lost" | "stop";
}

export interface HandwritingControllerUpdate {
  cursor: { x: number; y: number } | null;
  penDown: boolean;
  transition: HandwritingGestureTransition;
  pinchScore: number;
  phase: HandwritingGesturePhase | "outside";
  reading: HandwritingGestureReading;
  actions: HandwritingPointerAction[];
}

const MINIMUM_MOVE_DISTANCE_PX = 0.65;
const MAXIMUM_MOVE_INTERVAL_MS = 50;

export class HandwritingPointerController {
  private readonly gestures: HandwritingGestureFilter;
  private readonly points = new HandwritingPointFilter();
  private strokeActive = false;
  private strokePoint: { x: number; y: number } | null = null;
  private lastMoveAt = -Infinity;
  private readonly grip: HandwritingGripPointerController | null;

  private readonly options: {
    mirrorX?: boolean;
    region?: HandwritingCameraRegion;
    mode?: HandwritingGestureMode;
    pinch?: HandwritingPinchThresholds;
  };

  constructor(options: {
    mirrorX?: boolean;
    region?: HandwritingCameraRegion;
    mode?: HandwritingGestureMode;
    pinch?: HandwritingPinchThresholds;
  } = {}) {
    this.options = options;
    this.gestures = new HandwritingGestureFilter(options.mode, options.pinch);
    this.grip = (["grip", "palm-pinch"].includes(options.mode ?? HANDWRITING_DEFAULT_MODE)) ? new HandwritingGripPointerController(options) : null;
  }

  reset(timeMs = 0, reason: "lost" | "stop" = "stop"): HandwritingPointerAction[] {
    if (this.grip) return this.grip.reset(timeMs, reason);
    this.gestures.reset();
    this.points.reset();
    this.lastMoveAt = -Infinity;
    if (!this.strokeActive || !this.strokePoint) {
      this.strokeActive = false;
      this.strokePoint = null;
      return [];
    }
    const point = this.strokePoint;
    this.strokeActive = false;
    this.strokePoint = null;
    return [{ type: "up", point, timeMs, reason }];
  }

  update(frame: HandwritingInputFrame, viewport: HandwritingViewportSize): HandwritingControllerUpdate {
    if (this.grip) return this.grip.update(frame, viewport);
    const gesture = this.gestures.update(frame);
    let cursor: { x: number; y: number } | null = null;
    const actions: HandwritingPointerAction[] = [];

    if (gesture.reading.valid && gesture.reading.indexTip) {
      const mapped = mapHandPointToViewport(
        gesture.reading.indexTip,
        viewport,
        this.options.mirrorX ?? true,
        this.options.region,
      );
      if (!mapped.inside) {
        actions.push(...this.reset(frame.timeMs, "lost"));
        return {
          cursor: null,
          penDown: false,
          transition: actions.length ? "break" : null,
          pinchScore: gesture.reading.pinchScore,
          phase: "outside",
          reading: gesture.reading,
          actions,
        };
      }
      cursor = this.points.filter(mapped, frame.timeMs);
    } else {
      this.points.reset();
      if (this.strokeActive && this.strokePoint) {
        const point = this.strokePoint;
        this.strokeActive = false;
        this.strokePoint = null;
        actions.push({ type: "up", point, timeMs: frame.timeMs, reason: "lost" });
        return {
          cursor: null,
          penDown: false,
          transition: "break",
          pinchScore: gesture.reading.pinchScore,
          phase: "lost",
          reading: gesture.reading,
          actions,
        };
      }
    }

    if (gesture.transition === "down" && cursor) {
      // Do not carry smoothing from the hovering or hand-shape transition into
      // the first point of a stroke.
      this.points.reset();
      cursor = this.points.filter(mapHandPointToViewport(gesture.reading.indexTip!, viewport,
        this.options.mirrorX ?? true, this.options.region), frame.timeMs);
      const mode = this.options.mode ?? HANDWRITING_DEFAULT_MODE;
      actions.push({ type: "down", point: cursor, timeMs: frame.timeMs,
        reason: mode === "pinch" ? "pinch" : mode === "point" ? "point" : "extend" });
      this.strokeActive = true;
      this.strokePoint = cursor;
      this.lastMoveAt = frame.timeMs;
    } else if ((gesture.transition === "up" || gesture.transition === "break") && this.strokeActive && this.strokePoint) {
      const point = this.strokePoint;
      actions.push({
        type: "up",
        point,
        timeMs: frame.timeMs,
        reason: gesture.transition === "break" ? "lost" : "release",
      });
      this.strokeActive = false;
      this.strokePoint = null;
    } else if (gesture.canMove && cursor && this.strokeActive && this.strokePoint) {
      const distance = Math.hypot(cursor.x - this.strokePoint.x, cursor.y - this.strokePoint.y);
      if (distance >= MINIMUM_MOVE_DISTANCE_PX || frame.timeMs - this.lastMoveAt >= MAXIMUM_MOVE_INTERVAL_MS) {
        actions.push({ type: "move", point: cursor, timeMs: frame.timeMs });
        this.strokePoint = cursor;
        this.lastMoveAt = frame.timeMs;
      }
    }

    return {
      cursor,
      penDown: gesture.penDown,
      transition: gesture.transition,
      pinchScore: gesture.reading.pinchScore,
      phase: gesture.phase,
      reading: gesture.reading,
      actions,
    };
  }
}
