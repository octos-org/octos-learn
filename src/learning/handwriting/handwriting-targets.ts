import type { HandwritingPointerAction } from "./handwriting-controller";

type Point = { x: number; y: number };

/** Only explicitly registered controls in this board can receive a hand click. */
export class HandwritingTargets {
  private pressed: HTMLButtonElement | null = null;
  private hovered: HTMLButtonElement | null = null;
  private boardDown = false;
  private lastPoint: Point = { x: 0, y: 0 };
  executingCommand = false;
  navigating = false;
  get hasCapture() { return this.boardDown || this.pressed !== null; }

  private readonly cancelBoard?: () => void;
  private readonly viewport: HTMLElement;
  private readonly pointerId: number;
  constructor(viewport: HTMLElement, pointerId: number, cancelBoard?: () => void) {
    this.cancelBoard = cancelBoard;
    this.viewport = viewport;
    this.pointerId = pointerId;
  }

  private buttonAt(point: Point): HTMLButtonElement | null {
    const rect = this.viewport.getBoundingClientRect();
    const x = rect.left + point.x, y = rect.top + point.y;
    const root = this.viewport.parentElement ?? this.viewport;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[data-air-command]')];
    return buttons.find(button => {
      const box = button.getBoundingClientRect();
      if (button.disabled || button.closest('[hidden], [inert]') || box.width <= 0 || box.height <= 0) return false;
      const covering = this.viewport.ownerDocument.elementFromPoint?.(x, y);
      if (covering && !button.contains(covering)) return false;
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    }) ?? null;
  }

  hover(point: Point | null) {
    const button = point ? this.buttonAt(point) : null;
    if (button === this.hovered) return;
    this.hovered?.removeAttribute('data-air-hover');
    this.hovered = button;
    button?.setAttribute('data-air-hover', '');
  }

  private pointer(type: string, point: Point, navigate = this.navigating) {
    const rect = this.viewport.getBoundingClientRect();
    this.viewport.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: this.pointerId,
      pointerType: navigate ? 'mouse' : 'pen', isPrimary: true,
      button: type === 'pointermove' ? -1 : 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pressure: type === 'pointerup' ? 0 : 0.5,
      clientX: rect.left + point.x, clientY: rect.top + point.y,
    }));
  }

  cancel() {
    this.pressed?.removeAttribute('data-air-pressed');
    this.pressed = null;
    if (this.boardDown) {
      this.boardDown = false;
      this.pointer('pointerup', this.lastPoint);
      this.cancelBoard?.();
    }
    this.navigating = false;
    this.hover(null);
  }

  dispatch(actions: HandwritingPointerAction[], blocked: (point: Point) => boolean, navigate: boolean) {
    for (const action of actions) {
      if (action.type === 'down') {
        this.pressed = this.buttonAt(action.point);
        if (this.pressed) {
          this.pressed.setAttribute('data-air-pressed', '');
          continue;
        }
        if (blocked(action.point)) continue;
        this.boardDown = true;
        this.navigating = navigate;
        this.lastPoint = action.point;
        this.pointer('pointerdown', action.point);
      } else if (this.pressed) {
        if (action.type !== 'up') continue;
        const button = this.pressed;
        this.pressed = null;
        button.removeAttribute('data-air-pressed');
        if (action.reason !== 'release' || !button.isConnected || this.buttonAt(action.point) !== button) continue;
        this.executingCommand = true;
        try { button.click(); } finally { this.executingCommand = false; }
      } else if (this.boardDown) {
        // A release must reach the recipient even if the cursor became occluded.
        if (action.type === 'up' || blocked(action.point)) {
          this.boardDown = false;
          this.pointer('pointerup', this.lastPoint);
          if (action.reason !== 'release' || blocked(action.point)) this.cancelBoard?.();
          this.navigating = false;
        } else {
          this.lastPoint = action.point;
          this.pointer('pointermove', action.point);
        }
      }
    }
  }
}
