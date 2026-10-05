import { formatVariableValue } from "octos-lesson-language/web-runtime";

export interface CourseControlFormat {
  /** Slider step: fixes the number of decimals so the label keeps its length. */
  step?: number;
  /** True while the value is being animated or dragged: no symbolic labels. */
  moving?: boolean;
}

/** Decimals implied by a slider step, at most two. */
export function courseControlDecimals(step: number | undefined): number {
  if (!step || !Number.isFinite(step) || step <= 0) return 2;
  for (let decimals = 0; decimals < 2; decimals += 1) {
    const scaled = step * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return decimals;
  }
  return 2;
}

export function formatCourseControlValue(value: number, unit?: string, format: CourseControlFormat = {}): string {
  if (unit === "rad" && !format.moving) {
    const symbolic = formatVariableValue(value, unit);
    if (symbolic === "0" || symbolic.includes("π")) return symbolic;
  }
  // With a known step every value keeps the same number of decimals, so the
  // label does not change length (and jump) while the slider moves.
  const text = format.step === undefined
    ? String(Number(value.toFixed(2)))
    : value.toFixed(courseControlDecimals(format.step));
  const normalized = /^-0(?:\.0+)?$/.test(text) ? text.slice(1) : text;
  return unit ? `${normalized} ${unit}` : normalized;
}

/** Character width that fits every label of a slider range. */
export function courseControlLabelWidth(min: number, max: number, unit?: string, step?: number): number {
  return Math.max(
    ...[min, max].map((value) =>
      formatCourseControlValue(value, unit, { step, moving: true }).length),
    unit === "rad" ? 4 : 1,
  );
}
