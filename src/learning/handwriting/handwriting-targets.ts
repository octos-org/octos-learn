import { HandwritingVariableDrag, type HandwritingVariableOptions } from "./handwriting-variable-drag";
import type { HandwritingPointerAction } from "./handwriting-controller";

type Control = HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement;
type Point = { x: number; y: number };

/** Only explicitly registered controls in this board can receive a hand click. */
export class HandwritingTargets {
  private variable: HandwritingVariableDrag | null = null;
  private readonly variableOptions?: HandwritingVariableOptions;
  private pressed: Control | null = null;
  private activatedOnPress = false;
  private hovered: Element | null = null;
  private boardDown = false;
  private lastPoint: Point = { x: 0, y: 0 };
  executingCommand = false;
  navigating = false;
  get capturingButton() { return this.pressed !== null; }
  get manipulatingVariable() { return this.variable !== null; }
  get hasCapture() { return this.boardDown || this.pressed !== null || this.variable !== null; }

  private readonly cancelBoard?: () => void;
  private readonly viewport: HTMLElement;
  private readonly pointerId: number;
  constructor(viewport: HTMLElement, pointerId: number, cancelBoard?: () => void, variableOptions?: HandwritingVariableOptions) {
    this.variableOptions = variableOptions;
    this.cancelBoard = cancelBoard;
    this.viewport = viewport;
    this.pointerId = pointerId;
  }

  get root(): HTMLElement {
    return this.viewport.closest<HTMLElement>('[data-air-scope]') ?? this.viewport.closest<HTMLElement>('.learning-workspace') ?? this.viewport.parentElement ?? this.viewport;
  }
  get hasHover() { return this.hovered !== null; }

  private isControl(element: Element | null): element is Control {
    return (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
      && element.hasAttribute('data-air-command');
  }

  private buttonHit(button: Control, point: Point, margin = 0): boolean {
    const rect = this.viewport.getBoundingClientRect();
    const x = rect.left + point.x, y = rect.top + point.y;
    const box = button.getBoundingClientRect();
    if (!button.isConnected || button.disabled || button.closest('[hidden], [inert], [aria-disabled="true"]') || box.width <= 0 || box.height <= 0) return false;
    if (x < box.left - margin || x > box.right + margin || y < box.top - margin || y > box.bottom + margin) return false;
    const covering = this.viewport.ownerDocument.elementFromPoint?.(x, y);
    if (!covering || button.contains(covering)) return true;
    if (margin === 0 || covering.closest('button, input, select, textarea, [role="slider"]')) return false;
    // Release tolerance may enter toolbar gaps or the adjacent canvas, while
    // a different floating panel or another control continues to block it.
    const occlusion = covering.closest('[data-learning-board-occlusion]');
    return occlusion ? occlusion === button.closest('[data-learning-board-occlusion]')
      : covering === this.viewport || this.viewport.contains(covering);
  }

  private buttonAt(point: Point): Control | null {
    return [...this.root.querySelectorAll<Control>('button[data-air-command], input[data-air-command]:not([type="file"]), textarea[data-air-command]')]
      .find(button => this.buttonHit(button, point)) ?? null;
  }

  hover(point: Point | null, navigate = false) {
    let target: Element | null = this.pressed;
    if (!target && point) {
      target = this.buttonAt(point);
      if (!target && this.isControl(this.hovered) && this.buttonHit(this.hovered, point, 8)) target = this.hovered;
      target ??= navigate ? this.variableAt(point) : null;
    }
    if (target === this.hovered) return;
    this.hovered?.removeAttribute('data-air-hover');
    this.hovered = target;
    target?.setAttribute('data-air-hover', '');
  }

  private activate(button: Control) {
    this.executingCommand = true;
    button.setAttribute("data-air-activating", "");
    try {
      if (button instanceof HTMLButtonElement) button.click();
      else button.focus({ preventScroll: true });
    } finally { button.removeAttribute("data-air-activating"); this.executingCommand = false; }
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
    this.variable?.end(false);
    this.variable = null;
    this.pressed?.removeAttribute('data-air-pressed');
    this.pressed = null;
    this.activatedOnPress = false;
    if (this.boardDown) {
      this.boardDown = false;
      this.pointer('pointerup', this.lastPoint);
      this.cancelBoard?.();
    }
    this.navigating = false;
    this.hover(null);
  }

  private variableAt(point: Point): Element | null {
    const rect = this.viewport.getBoundingClientRect();
    const x = point.x + rect.left, y = point.y + rect.top;
    const elements = [...this.viewport.querySelectorAll('[data-air-variable], [data-oll-variable-control]')];
    const hits = elements.filter(element => {
      if (element.closest('[hidden], [inert]') || (element instanceof HTMLInputElement && element.disabled)) return false;
      const box = element.getBoundingClientRect();
      const margin = element instanceof HTMLInputElement ? 0 : 16;
      if (box.width <= 0 || box.height <= 0) return false;
      const covering = this.viewport.ownerDocument.elementFromPoint?.(x, y);
      const covered = covering && !element.contains(covering)
        && !covering.closest('svg')?.contains(element);
      return !covered && x >= box.left - margin && x <= box.right + margin
        && y >= box.top - margin && y <= box.bottom + margin;
    });
    // Overlapping hit areas need a more precise aim.
    return hits.length === 1 ? hits[0]! : null;
  }

  dispatch(actions: HandwritingPointerAction[], blocked: (point: Point) => boolean, navigate: boolean, allowNewCapture = true) {
    for (const action of actions) {
      if (action.type === 'down') {
        if (!allowNewCapture) continue;
        this.pressed = this.buttonAt(action.point);
        if (!this.pressed && this.isControl(this.hovered) && this.buttonHit(this.hovered, action.point, 8)) this.pressed = this.hovered;
        if (this.pressed) {
          const button = this.pressed;
          button.setAttribute('data-air-pressed', '');
          this.activatedOnPress = button.dataset.airActivation === 'press';
          if (this.activatedOnPress) this.activate(button);
          continue;
        }
        const variableElement = navigate ? this.variableAt(action.point) : null;
        if (variableElement && this.variableOptions) {
          const rect = this.viewport.getBoundingClientRect();
          this.variable = HandwritingVariableDrag.start(variableElement,
            { x: rect.left + action.point.x, y: rect.top + action.point.y }, this.variableOptions);
          if (this.variable) continue;
        }
        if (blocked(action.point)) continue;
        this.boardDown = true;
        this.navigating = navigate;
        this.lastPoint = action.point;
        this.pointer('pointerdown', action.point);
      } else if (this.variable) {
        const drag = this.variable;
        if (action.type === 'up') {
          this.variable = null;
          drag.end(action.reason === 'release');
        } else {
          const rect = this.viewport.getBoundingClientRect();
          drag.update({ x: rect.left + action.point.x, y: rect.top + action.point.y });
        }
      } else if (this.pressed) {
        if (action.type !== 'up') continue;
        const button = this.pressed;
        this.pressed = null;
        const activated = this.activatedOnPress;
        this.activatedOnPress = false;
        button.removeAttribute('data-air-pressed');
        if (activated || action.reason !== 'release' || !this.buttonHit(button, action.point, 12)) continue;
        this.activate(button);
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
