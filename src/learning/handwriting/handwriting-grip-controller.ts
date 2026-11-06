import { HandwritingGestureFilter, type HandwritingInputFrame, type HandwritingGestureMode } from "./handwriting-gesture";
import { HandwritingPointFilter, mapHandPointToViewport, type HandwritingCameraRegion, type HandwritingViewportSize } from "./handwriting-map";
import type { HandwritingControllerUpdate, HandwritingPointerAction } from "./handwriting-controller";

/** Short look-ahead for segmentation; the live cursor is not delayed. */
export const HANDWRITING_GRIP_BUFFER_MS = 100;
type Point = { x: number; y: number };
type Sample = { point: Point; timeMs: number };

export class HandwritingGripPointerController {
  private readonly gestures: HandwritingGestureFilter;
  private readonly points = new HandwritingPointFilter();
  private previous: Point | null = null;
  private cursor: Point | null = null;
  private frozen = false;
  private active = false;
  private strokePoint: Point | null = null;
  private lastMoveAt = -Infinity;
  private pending: Sample[] = [];
  private held: Sample[] = [];
  private releaseAt: number | undefined;
  private readonly options: { mirrorX?: boolean; region?: HandwritingCameraRegion };

  constructor(options: { mirrorX?: boolean; region?: HandwritingCameraRegion; mode?: HandwritingGestureMode } = {}) {
    this.options = options;
    this.gestures = new HandwritingGestureFilter(options.mode ?? "grip");
  }

  private commit(cutoff: number): HandwritingPointerAction[] {
    const actions: HandwritingPointerAction[] = [];
    while (this.pending.length && this.pending[0]!.timeMs <= cutoff) {
      const sample = this.pending.shift()!;
      if (this.strokePoint && (Math.hypot(sample.point.x - this.strokePoint.x, sample.point.y - this.strokePoint.y) >= 0.65
        || sample.timeMs - this.lastMoveAt >= 50)) {
        actions.push({ type: "move", ...sample });
        this.strokePoint = sample.point;
        this.lastMoveAt = sample.timeMs;
      }
    }
    return actions;
  }

  private end(timeMs: number, reason: "release" | "lost" | "stop", cutoff?: number): HandwritingPointerAction[] {
    const actions: HandwritingPointerAction[] = [];
    if (this.active) {
      // A deliberate stop flushes valid drawing. Lost tracking discards the
      // unconfirmed tail. Opening keeps only points preceding its shape change.
      if (cutoff !== undefined) actions.push(...this.commit(cutoff - 0.001));
      else if (reason === "stop" && this.releaseAt === undefined) actions.push(...this.commit(Infinity));
      if (this.strokePoint) actions.push({ type: "up", point: this.strokePoint, timeMs, reason });
    }
    this.active = false;
    this.strokePoint = null;
    this.pending = [];
    this.held = [];
    this.releaseAt = undefined;
    return actions;
  }

  reset(timeMs = 0, reason: "lost" | "stop" = "stop"): HandwritingPointerAction[] {
    const actions = this.end(timeMs, reason, this.releaseAt);
    this.gestures.reset();
    this.points.reset();
    this.previous = null;
    this.cursor = null;
    this.frozen = false;
    this.lastMoveAt = -Infinity;
    return actions;
  }

  update(frame: HandwritingInputFrame, viewport: HandwritingViewportSize): HandwritingControllerUpdate {
    const gesture = this.gestures.update(frame);
    const result = (actions: HandwritingPointerAction[], phase = gesture.phase, transition = gesture.transition): HandwritingControllerUpdate => ({
      cursor: this.cursor, penDown: this.active, phase, transition,
      pinchScore: gesture.reading.pinchScore, reading: gesture.reading, actions,
    });
    if (!gesture.reading.valid || !gesture.reading.palmCenter) {
      const active = this.active;
      const actions = this.reset(frame.timeMs, "lost");
      return result(actions, "lost", active ? "break" : gesture.transition);
    }
    const mapped = mapHandPointToViewport(gesture.reading.palmCenter, viewport, this.options.mirrorX ?? true, this.options.region);
    if (!mapped.inside) {
      const active = this.active;
      const actions = this.reset(frame.timeMs, "lost");
      return { ...result(actions), phase: "outside", transition: active ? "break" : null };
    }

    const freeze = gesture.phase === "pending"
      || gesture.transition === "down" || gesture.transition === "up" || gesture.transition === "break";
    if (!this.cursor) this.cursor = { x: mapped.x, y: mapped.y };
    if (gesture.phase === "holding" && this.active) {
      const current = this.points.filter(mapped, frame.timeMs);
      const base = this.held.at(-1)?.point ?? this.cursor;
      const point = this.previous ? { x: base.x + current.x - this.previous.x, y: base.y + current.y - this.previous.y } : base;
      this.held.push({ point: {
        x: Math.min(viewport.width, Math.max(0, point.x)), y: Math.min(viewport.height, Math.max(0, point.y)),
      }, timeMs: frame.timeMs });
      this.previous = current;
    } else if (freeze || this.frozen) {
      // Rebase internal smoothing without moving the displayed point. Hand
      // closure/opening cannot relocate the start of the stroke or cause a snap.
      this.points.reset();
      this.previous = this.points.filter(mapped, frame.timeMs);
    } else {
      if (this.active && this.held.length) {
        this.pending.push(...this.held);
        this.cursor = { ...this.held.at(-1)!.point };
        this.held = [];
      }
      const current = this.points.filter(mapped, frame.timeMs);
      if (this.previous) this.cursor = {
        x: Math.min(viewport.width, Math.max(0, this.cursor.x + current.x - this.previous.x)),
        y: Math.min(viewport.height, Math.max(0, this.cursor.y + current.y - this.previous.y)),
      };
      this.previous = current;
    }
    this.frozen = freeze && gesture.transition === null;

    if (gesture.transition === "down") {
      this.active = true;
      this.strokePoint = { ...this.cursor };
      this.lastMoveAt = frame.timeMs;
      this.pending = [];
      return result([{ type: "down", point: this.strokePoint, timeMs: frame.timeMs, reason: "grip" }]);
    }
    if (gesture.transition === "up" || gesture.transition === "break") {
      const reason = gesture.transition === "up" ? "release" : "lost";
      return result(this.end(frame.timeMs, reason, gesture.transitionStartedAt));
    }
    if (this.active) {
      this.releaseAt = gesture.phase === "holding" ? gesture.transitionStartedAt : undefined;
      if (gesture.canMove && gesture.phase === "drawing") this.pending.push({ point: { ...this.cursor }, timeMs: frame.timeMs });
      // A cancelled opening resumes the same stroke. Previously valid samples
      // remain queued; no undo/recreation of a live Ink Runtime stroke is needed.
      const cutoff = Math.min(frame.timeMs - HANDWRITING_GRIP_BUFFER_MS, this.releaseAt === undefined ? Infinity : this.releaseAt - 0.001);
      const actions = this.commit(cutoff);
      return result(actions);
    }
    return result([]);
  }
}
