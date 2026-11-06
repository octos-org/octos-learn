// What a learner types to add to a graph: a function of x, a guide line
// (x = 2, y = 3), or an equation in x and y drawn as a curve (x^2 + y^2 = 4).

export type GraphEntry =
  | { kind: "function"; expression: string }
  | { kind: "guide"; axis: "x" | "y"; value: number }
  | { kind: "equation"; expression: string; label: string };

const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** Reads a graph entry; undefined when it is empty or has more than one "=". */
export function parseGraphEntry(text: string): GraphEntry | undefined {
  const written = text.trim().replace(/\s+/g, "");
  if (!written) return undefined;
  const parts = written.split("=");
  if (parts.length > 2 || parts.some((part) => !part)) return undefined;
  if (parts.length === 1) return { kind: "function", expression: written };
  const [left, right] = parts as [string, string];
  if ((left === "x" || left === "y") && NUMBER.test(right)) return { kind: "guide", axis: left, value: Number(right) };
  if (left === "y" && !/\by\b/.test(right)) return { kind: "function", expression: right };
  return { kind: "equation", expression: `(${left})-(${right})`, label: `${left} = ${right}` };
}

/** The letters a graph entry reads besides its own x (and y, for an equation). */
export function entryLetters(entry: GraphEntry): string[] {
  if (entry.kind === "guide") return [];
  const own = entry.kind === "equation" ? new Set(["x", "y"]) : new Set(["x"]);
  return [...new Set((entry.expression.toLowerCase().match(/[a-z][a-z0-9_]*/g) ?? []).filter((name) => !own.has(name)))];
}
