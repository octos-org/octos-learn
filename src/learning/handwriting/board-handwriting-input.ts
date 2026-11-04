import { HandwritingCapture, type HandwritingCaptureCallbacks, type HandwritingCaptureError, type HandwritingCaptureFrame, type HandwritingCaptureState } from "./handwriting-capture";
import { HandwritingPointerController, type HandwritingControllerUpdate, type HandwritingPointerAction } from "./handwriting-controller";
import type { InkRuntime } from "../oll/oll-ink-runtime";

export type HandwritingPauseReason = "manual" | "tool" | "direct" | "view" | "hidden" | "dialog" | "playback" | null;
export interface BoardHandwritingState {
  status: "off" | "starting" | "active" | "paused" | "failed";
  capture: HandwritingCaptureState;
  reason: HandwritingPauseReason;
  error: HandwritingCaptureError | null;
  gesture: HandwritingControllerUpdate | null;
}
export const INITIAL_HANDWRITING_STATE: BoardHandwritingState = { status: "off", capture: "idle", reason: null, error: null, gesture: null };
type Capture = Pick<HandwritingCapture, "start" | "stop">;
export interface BoardHandwritingOptions {
  viewport: HTMLElement;
  getInk(): Pick<InkRuntime, "setMode" | "saveNow" | "state"> | null;
  allowed(): boolean;
  onState(state: BoardHandwritingState): void;
  onVisual(frame: HandwritingCaptureFrame | null, gesture: HandwritingControllerUpdate | null): void;
  createCapture?: (video: HTMLVideoElement, callbacks: HandwritingCaptureCallbacks) => Capture;
}
let nextPointerId = 85_000;

export function handwritingPointBlocked(viewport: HTMLElement, point: { x: number; y: number }): boolean {
  const rect = viewport.getBoundingClientRect();
  const x = rect.left + point.x, y = rect.top + point.y;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return true;
  return Array.from(viewport.ownerDocument.querySelectorAll<HTMLElement>(
    '[data-learning-board-occlusion], button, input, textarea, select, [role="slider"], [contenteditable="true"]',
  )).some(element => {
    if (element.hidden) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  });
}

/** Binds an input source to the existing editor, never creating a second board. */
export class BoardHandwritingInput {
  readonly pointerId = nextPointerId++;
  private state: BoardHandwritingState = { ...INITIAL_HANDWRITING_STATE };
  private controller = new HandwritingPointerController({ mode: "grip" });
  private capture: Capture | null = null;
  private generation = 0;
  private lastNotified = -Infinity;
  private disposed = false;
  private readonly options: BoardHandwritingOptions;

  constructor(options: BoardHandwritingOptions) { this.options = options; }
  private publish(patch: Partial<BoardHandwritingState>) {
    this.state = { ...this.state, ...patch };
    this.options.onState(this.state);
  }
  private dispatch(actions: HandwritingPointerAction[]) {
    const viewport = this.options.viewport;
    const rect = viewport.getBoundingClientRect();
    for (const action of actions) viewport.dispatchEvent(new PointerEvent(
      action.type === "down" ? "pointerdown" : action.type === "move" ? "pointermove" : "pointerup", {
        bubbles: true, cancelable: true, composed: true, pointerId: this.pointerId,
        pointerType: "pen", isPrimary: true, button: action.type === "move" ? -1 : 0,
        buttons: action.type === "up" ? 0 : 1, pressure: action.type === "up" ? 0 : 0.5,
        clientX: rect.left + action.point.x, clientY: rect.top + action.point.y,
      },
    ));
  }
  private finish(reason: "stop" | "lost") {
    const running = this.capture !== null || this.state.status === "starting" || this.state.status === "active";
    this.generation += 1;
    const generation = this.generation;
    this.dispatch(this.controller.reset(performance.now(), reason));
    this.capture?.stop(); this.capture = null;
    this.options.onVisual(null, null);
    const ink = this.options.getInk();
    if (ink && running) void ink.saveNow().catch(() => {
      if (!this.disposed && generation === this.generation) this.publish({ status: "failed", error: "capture_failed" });
    });
  }
  pause(reason: HandwritingPauseReason = "manual") {
    if (this.state.status !== "active" && this.state.status !== "starting") return;
    this.finish("stop");
    this.publish({ status: "paused", capture: "idle", reason, gesture: null });
  }
  stop() {
    const running = this.state.status === "active" || this.state.status === "starting";
    this.finish("stop");
    if (running && this.options.getInk()?.state.mode === "draw") this.options.getInk()?.setMode("navigate");
    if (!this.disposed) this.publish({ ...INITIAL_HANDWRITING_STATE });
  }
  dispose() { this.disposed = true; this.finish("stop"); }
  async start(video: HTMLVideoElement) {
    if (this.disposed || !this.options.allowed() || !this.options.getInk()) return;
    this.finish("stop");
    this.controller = new HandwritingPointerController({ mode: "grip" });
    const generation = this.generation;
    this.options.getInk()?.setMode("draw");
    this.publish({ status: "starting", capture: "starting", reason: null, error: null, gesture: null });
    const callbacks: HandwritingCaptureCallbacks = {
      onState: capture => {
        if (this.disposed || generation !== this.generation || capture === "idle") return;
        if (capture !== this.state.capture) this.publish({ capture, ...(capture === "tracking" || capture === "lost" ? { status: "active" as const } : {}) });
      },
      onError: error => {
        if (this.disposed || generation !== this.generation) return;
        this.finish("lost");
        if (this.options.getInk()?.state.mode === "draw") this.options.getInk()?.setMode("navigate");
        this.publish({ status: "failed", capture: "idle", error, gesture: null });
      },
      onFrame: frame => {
        if (this.disposed || generation !== this.generation) return;
        if (!this.options.allowed()) { this.pause("playback"); return; }
        if (this.options.getInk()?.state.mode !== "draw") { this.pause("tool"); return; }
        const dialog = Array.from(this.options.viewport.ownerDocument.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]'))
          .some(element => element.getBoundingClientRect().width > 0);
        if (dialog) { this.pause("dialog"); return; }
        const gesture = this.controller.update(frame, { width: this.options.viewport.clientWidth, height: this.options.viewport.clientHeight });
        if (gesture.cursor && handwritingPointBlocked(this.options.viewport, gesture.cursor)) {
          this.dispatch(this.controller.reset(frame.timeMs, "lost"));
          this.options.onVisual(frame, null);
          this.publish({ gesture: null });
          return;
        }
        this.dispatch(gesture.actions);
        this.options.onVisual(frame, gesture);
        if (performance.now() - this.lastNotified >= 100 || gesture.phase !== this.state.gesture?.phase || gesture.penDown !== this.state.gesture?.penDown) {
          this.lastNotified = performance.now(); this.publish({ gesture });
        }
      },
    };
    this.capture = this.options.createCapture?.(video, callbacks) ?? new HandwritingCapture(video, callbacks);
    await this.capture.start();
  }
}
