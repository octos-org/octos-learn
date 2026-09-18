import { formatVariableValue } from "octos-lesson-language/web-runtime";

export function formatCourseControlValue(value: number, unit?: string): string {
  if (unit === "rad") {
    const symbolic = formatVariableValue(value, unit);
    if (symbolic === "0" || symbolic.includes("π")) return symbolic;
  }
  const rounded = Number(value.toFixed(2));
  return unit ? `${rounded} ${unit}` : String(rounded);
}
