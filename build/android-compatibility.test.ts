// @vitest-environment node
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { build, transformWithEsbuild } from "vite";
import legacy from "@vitejs/plugin-legacy";
import { androidLegacyOptions, downlevelAndroidCss } from "./android-compatibility";

describe("Android WebView compatibility", () => {
  it("keeps layered reset and spacing utilities executable in old WebViews", async () => {
    const css = await downlevelAndroidCss(`
      @layer base, utilities;
      @layer base { *, ::before, ::after { box-sizing: border-box } }
      @layer utilities { .px-4 { padding-inline: 1rem } .py-2 { padding-block: .5rem } }
      .card { color: var(--color-text); }
    `);
    expect(css).not.toContain("@layer");
    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("padding-left: 1rem");
    expect(css).toContain("padding-right: 1rem");
    expect(css).toContain("padding-top: .5rem");
    expect(css).toContain("padding-bottom: .5rem");
    expect(css).toContain("var(--color-text)");
  });

  it("adds old selector fallbacks without changing the modern :where rule", async () => {
    const css = await downlevelAndroidCss(".a:where(button, a) { padding: 8px }");
    expect(css).toContain("@supports not selector(:where(*))");
    expect(css).toContain(".a:where(button, a)");
    expect(css).toMatch(/\.a(?:button|a)|(?:button|a)\.a/);
    expect(css).not.toContain(":is(");
  });

  it("keeps fluid dialogs and controls bounded when min() is unavailable", async () => {
    const css = await downlevelAndroidCss(".controls { width: min(560px, calc(100% - 180px)); }");
    expect(css).toContain("@supports not (width: min(1px, 2px))");
    expect(css).toContain("width: 560px");
    expect(css).toContain("max-width: calc(100% - 180px)");
    expect(css).toContain("width: min(560px, calc(100% - 180px))");
  });

  it("loads built-in polyfills on the ESM path used by WebView 74", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "octos-android-polyfills-")));
    try {
      writeFileSync(join(root, "index.html"), '<script type="module" src="/entry.js"></script>');
      writeFileSync(join(root, "entry.js"), `
        globalThis.result = [Object.hasOwn({ a: 1 }, "a"), [1, 2].at(-1),
          "a-a".replaceAll("a", "b"), structuredClone({ nested: [1] })];
      `);
      const result = await build({
        root, configFile: false, logLevel: "silent", plugins: [legacy(androidLegacyOptions)],
        build: { write: false, minify: false },
      });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => {
        if (!("output" in r)) throw new Error("Unexpected build watcher");
        return r.output;
      });
      const chunk = outputs.find((entry) => entry.type === "chunk"
        && entry.fileName.includes("polyfills-") && !entry.fileName.includes("legacy"));
      if (!chunk || chunk.type !== "chunk") throw new Error("Modern polyfills were not emitted");
      const context = createContext({ DOMException });
      runInContext(`Object.hasOwn = undefined; Array.prototype.at = undefined;
        String.prototype.replaceAll = undefined; globalThis.structuredClone = undefined;`, context);
      const script = await transformWithEsbuild(chunk.code, "polyfills.js", { format: "iife", target: "chrome64" });
      runInContext(script.code, context);
      expect(runInContext('Object.hasOwn({a:1}, "a")', context)).toBe(true);
      expect(runInContext('[1,2].at(-1)', context)).toBe(2);
      expect(runInContext('"a-a".replaceAll("a", "b")', context)).toBe("b-b");
      expect(runInContext('structuredClone({a:[1]}).a[0]', context)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
