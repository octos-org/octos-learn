import { expect, it } from "vitest";
import { neatMathPaths } from "./neat-math-paths";

it("lays out powers, fractions, roots, and integrals into font-independent vectors", async () => {
  for (const latex of ["x^2+y^2=25", "\\frac{x+1}{2}=3", "\\sqrt{x^2+1}", "\\int_0^1 x^2\\,dx=\\frac13"]) {
    const paths = await neatMathPaths(latex, { x: 100, y: 200, width: 300, height: 100 });
    expect(paths.length).toBeGreaterThan(2);
    expect(paths.every(path => !/NaN|Infinity|<|>/.test(path))).toBe(true);
    expect(paths.join("")).not.toMatch(/[ASTast]/);
  }
});
it("rejects unsupported or invalid formulae instead of replacing them with an error graphic", async () => {
  await expect(neatMathPaths("\\badmacro{x}", { x: 0, y: 0, width: 100, height: 50 })).rejects.toThrow();
  await expect(neatMathPaths("x", { x: NaN, y: 0, width: 100, height: 50 })).rejects.toThrow();
  await expect(neatMathPaths("", { x: 0, y: 0, width: 100, height: 50 })).rejects.toThrow();
});
