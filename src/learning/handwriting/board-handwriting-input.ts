import type { HandwritingVariableOptions } from "./handwriting-variable-drag";
import type { HandwritingPreferences } from "./handwriting-preferences";
import { HandwritingTargets } from "./handwriting-targets";
import type { HandwritingGestureMode } from "./handwriting-gesture";
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
  getInk(): Pick<InkRuntime, "setMode" | "saveNow" | "state" | "clearSelection"> | null;
  allowed(): boolean;
  onState(state: BoardHandwritingState): void;
  onVisual(frame: HandwritingCaptureFrame | null, gesture: HandwritingControllerUpdate | null): void;
  mode?: HandwritingGestureMode;
  preferences?: HandwritingPreferences;
  variables?: HandwritingVariableOptions;
  onSample?(frame: HandwritingCaptureFrame): boolean;
  onInterruption?(): void;
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
  private controller: HandwritingPointerController;
  private readonly targets: HandwritingTargets;
  get executingCommand() { return this.targets.executingCommand; }
  get navigating() { return this.targets.navigating; }
  private capture: Capture | null = null;
  private generation = 0;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNotified = -Infinity;
  private disposed = false;
  private readonly options: BoardHandwritingOptions;

  constructor(options: BoardHandwritingOptions) {
    this.options = options;
    this.controller = new HandwritingPointerController({ mode: options.mode ?? "palm-pinch", ...options.preferences });
    this.targets = new HandwritingTargets(options.viewport, this.pointerId, () => {
      const ink = options.getInk();
      if (ink?.state.mode === "select") ink.clearSelection?.();
    }, options.variables);
  }
  private publish(patch: Partial<BoardHandwritingState>) {
    this.state = { ...this.state, ...patch };
    this.options.onState(this.state);
  }
  private local(point: { x: number; y: number }) {
    const view = this.options.viewport.getBoundingClientRect();
    const bounds = this.targets.root.hasAttribute("data-air-scope") ? this.targets.root.getBoundingClientRect() : view;
    return { x: point.x + bounds.left - view.left, y: point.y + bounds.top - view.top };
  }
  private dispatch(actions: HandwritingPointerAction[]) {
    this.targets.dispatch(actions.map(action => ({ ...action, point: this.local(action.point) })), point => handwritingPointBlocked(this.options.viewport, point),
      this.options.getInk()?.state.mode === "navigate");
  }

  private finish(reason: "stop" | "lost") {
    const running = this.capture !== null || this.state.status === "starting" || this.state.status === "active";
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.frameTimer = null;
    this.generation += 1;
    const generation = this.generation;
    this.dispatch(this.controller.reset(performance.now(), reason));
    this.targets.cancel();
    this.capture?.stop(); this.capture = null;
    this.options.onVisual(null, null);
    const ink = this.options.getInk();
    if (ink && running) void ink.saveNow().catch(() => {
      if (!this.disposed && generation === this.generation) this.publish({ status: "failed", error: "capture_failed" });
    });
  }
  configure(preferences: HandwritingPreferences) {
    this.dispatch(this.controller.reset(performance.now(), "lost"));
    this.targets.cancel();
    this.options.preferences = preferences;
    this.controller = new HandwritingPointerController({ mode: this.options.mode ?? "palm-pinch", ...preferences });
    this.options.onVisual(null, null);
    this.publish({ gesture: null });
  }
  viewChanged() {
    if (this.navigating || this.executingCommand || this.targets.capturingButton || this.targets.manipulatingVariable || this.state.status !== "active") return;
    if (this.targets.hasCapture) { this.pause("view"); return; }
    // An idle pointer is in screen coordinates. Camera animation cannot move
    // its palm reference, and repeatedly disarming it would prevent a pinch.
    this.targets.hover(this.state.gesture?.cursor ?? null, this.options.getInk()?.state.mode === "navigate");
  }
  pause(reason: HandwritingPauseReason = "manual") {
    if (this.executingCommand && reason === "tool") return;
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
    this.controller = new HandwritingPointerController({ mode: this.options.mode ?? "palm-pinch", ...this.options.preferences });
    const generation = this.generation;
    this.options.getInk()?.setMode("navigate");
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
        if (this.frameTimer) clearTimeout(this.frameTimer);
        this.frameTimer = setTimeout(() => {
          if (this.disposed || generation !== this.generation) return;
          this.dispatch(this.controller.reset(performance.now(), "lost"));
          this.targets.cancel();
          this.options.onVisual(null, null);
          this.options.onInterruption?.();
          this.publish({ capture: "lost", gesture: null });
        }, 350);
        if (!this.options.allowed()) { this.pause("playback"); return; }
        const dialog = Array.from(this.options.viewport.ownerDocument.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]'))
          .some(element => element.getBoundingClientRect().width > 0);
        if (dialog) { this.pause("dialog"); return; }
        if (this.options.onSample?.(frame)) {
          this.dispatch(this.controller.reset(frame.timeMs, "lost"));
          this.targets.cancel();
          this.options.onVisual(frame, null);
          return;
        }
        const viewport = this.options.viewport;
        const root = this.targets.root;
        const bounds = root.hasAttribute("data-air-scope") ? root.getBoundingClientRect() : viewport.getBoundingClientRect();
        const update = this.controller.update(frame, { width: bounds.width || viewport.clientWidth, height: bounds.height || viewport.clientHeight },
          this.options.getInk()?.state.mode === "draw");
        const gesture = { ...update, cursor: update.cursor ? this.local(update.cursor) : null,
          actions: update.actions.map(action => ({ ...action, point: this.local(action.point) })) };
        this.targets.hover(gesture.cursor, this.options.getInk()?.state.mode === "navigate");
        this.dispatch(update.actions);
        if (this.disposed || generation !== this.generation) return;
        if (gesture.cursor && handwritingPointBlocked(this.options.viewport, gesture.cursor)
          && !this.targets.executingCommand && !this.targets.manipulatingVariable) {
          // Flush an already emitted release before resetting the recognizer.
          // Commands use their own capture and may sit inside an occlusion.
          if (!this.targets.hasHover && !this.targets.capturingButton) {
            this.dispatch(this.controller.interrupt(frame.timeMs));
            this.targets.cancel();
            const hovering = { ...gesture, penDown: false, phase: "blocked" as const, actions: [] };
            this.options.onVisual(frame, hovering);
            this.publish({ gesture: hovering });
            return;
          }
        }
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
