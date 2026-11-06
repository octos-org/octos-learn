import { angleControlValue, type StudentVariableInputEvent } from "octos-lesson-language/web-runtime";
import type { OllLessonRuntimeController } from "../oll/use-oll-lesson-runtime";

type Point = { x: number; y: number };
export interface HandwritingVariableOptions {
  getRuntime(): OllLessonRuntimeController | null;
  commitValue?(alias: string, value: number, control: "slider" | "geometry_point", width: number): number;
}

/** Owns the operation ID and original value until an intentional release. */
export class HandwritingVariableDrag {
  private readonly runtime: OllLessonRuntimeController;
  private readonly alias: string;
  private readonly before: number;
  private readonly operationId: string;
  private readonly control: "slider" | "geometry_point";
  private readonly rect: DOMRect;
  private readonly svgSize?: { width: number; height: number; x: number; y: number };
  private value: number;
  private ended = false;
  private element: Element;
  private readonly scope: Element;
  private readonly nodeId: string | null;
  private readonly pointId: string | null;
  private readonly options: HandwritingVariableOptions;
  private readonly start: Point;
  private readonly range: { min: number; max: number; step: number; unit?: string };

  static start(element: Element, point: Point, options: HandwritingVariableOptions): HandwritingVariableDrag | null {
    const runtime = options.getRuntime();
    const alias = element.getAttribute("data-air-variable") ?? element.getAttribute("data-oll-variable-control");
    const variable = alias ? runtime?.board?.variables?.[alias] : null;
    if (!runtime || !alias || !variable || runtime.playing) return null;
    const control = element instanceof HTMLInputElement ? "slider" : "geometry_point";
    const svg = control === "geometry_point" ? element.closest("svg") : null;
    const rect = (svg ?? element).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const id = runtime.handleStudentVariableInput(alias, variable.value, { phase: "start", control, input: "unknown" });
    if (!id) return null;
    return new HandwritingVariableDrag(element, point, options, runtime, alias, variable, control, rect, id, svg);
  }

  private constructor(element: Element, point: Point, options: HandwritingVariableOptions,
    runtime: OllLessonRuntimeController, alias: string,
    variable: { value: number; min: number; max: number; unit?: string; control?: { step?: number } },
    control: "slider" | "geometry_point", rect: DOMRect, id: string, svg: SVGSVGElement | null) {
    this.scope = element.closest(".learning-oll-board") ?? element.parentElement!;
    this.nodeId = element.closest(".board-node")?.getAttribute("data-id") ?? null;
    this.pointId = element.getAttribute("data-id");
    this.element = element; this.start = point; this.options = options; this.runtime = runtime;
    this.alias = alias; this.before = variable.value; this.value = variable.value;
    this.operationId = id; this.control = control; this.rect = rect;
    this.range = { min: variable.min, max: variable.max, step: variable.control?.step ?? (variable.max - variable.min) / 100, unit: variable.unit };
    if (svg) this.svgSize = { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
      x: Number(element.getAttribute("data-angle-center-x")), y: Number(element.getAttribute("data-angle-center-y")) };
    element.setAttribute("data-air-pressed", "");
  }

  private send(phase: StudentVariableInputEvent["phase"], value: number) {
    this.runtime.handleStudentVariableInput(this.alias, value, { phase, control: this.control, input: "unknown", operation_id: this.operationId });
  }
  update(point: Point) {
    if (this.ended) return;
    if (!this.element.isConnected) {
      const replacement = [...this.scope.querySelectorAll('[data-air-variable], [data-oll-variable-control]')].find(element =>
        (element.getAttribute("data-air-variable") ?? element.getAttribute("data-oll-variable-control")) === this.alias
        && (element.closest(".board-node")?.getAttribute("data-id") ?? null) === this.nodeId
        && element.getAttribute("data-id") === this.pointId);
      if (!replacement) { this.end(false); return; }
      this.element = replacement;
      this.element.setAttribute("data-air-pressed", "");
    }
    if (this.element.closest('[hidden], [inert]')
      || (this.element instanceof HTMLInputElement && this.element.disabled)
      || this.element.getBoundingClientRect().width <= 0) { this.end(false); return; }
    if (this.options.getRuntime()?.handleStudentVariableInput !== this.runtime.handleStudentVariableInput || this.options.getRuntime()?.playing) { this.end(false); return; }
    if (this.control === "slider") {
      // Relative dragging avoids a jump when the enlarged slider track is hit.
      const raw = this.before + (point.x - this.start.x) / this.rect.width * (this.range.max - this.range.min);
      const step = this.range.step;
      this.value = Math.min(this.range.max, Math.max(this.range.min, this.range.min + Math.round((raw - this.range.min) / step) * step));
    } else if (this.svgSize) {
      const rect = this.element.closest("svg")!.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) { this.end(false); return; }
      const x = (point.x - rect.left) / rect.width * this.svgSize.width;
      const y = (point.y - rect.top) / rect.height * this.svgSize.height;
      this.value = angleControlValue(Math.atan2(this.svgSize.y - y, x - this.svgSize.x), this.value, this.range.min, this.range.max, this.range.unit);
    }
    if (Number.isFinite(this.value)) this.send("update", this.value);
  }
  end(commit: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.element.removeAttribute("data-air-pressed");
    // Returning to `before` closes the existing transaction without an operation
    // record or task evaluation. The runtime rejects IDs invalidated by playback.
    const current = this.options.getRuntime();
    const accepted = commit && !current?.playing && current?.handleStudentVariableInput === this.runtime.handleStudentVariableInput;
    const value = accepted ? (this.options.commitValue?.(this.alias, this.value, this.control, this.rect.width) ?? this.value) : this.before;
    this.send("commit", value);
  }
}
