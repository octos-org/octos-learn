import { describe, expect, it } from "vitest";

import {
  addLegacySupportsForSrgbColorMixes,
  downlevelOklchColors,
  downlevelSrgbColorMixes,
} from "../../build/android-legacy-css";

describe("Android legacy CSS colors", () => {
  it("replaces authored sRGB color mixes with dynamic legacy colors", () => {
    const source = `
      .card {
        background: color-mix(in srgb, var(--color-surface) 82%, white 18%);
        border: 1px solid color-mix(in srgb, var(--color-border) 80%, var(--color-accent) 20%);
      }
    `;
    const result = downlevelSrgbColorMixes(source);

    expect(result).toContain("background: var(--color-surface);");
    expect(result).toContain("border: 1px solid var(--color-border);");
    expect(result).not.toContain("color-mix(in srgb");
  });

  it("converts hard-coded OKLCH palette values to old rgb syntax", () => {
    const result = downlevelOklchColors(
      ":root { --color-red-500: oklch(63.7% .237 25.331); }",
    );

    expect(result).toMatch(
      /--color-red-500:\s*rgb\(\d+,\s*\d+,\s*\d+\)/,
    );
    expect(result).not.toContain("oklch(");
  });

  it("adds a theme-aware fallback after the build-generated static color", () => {
    const source = ".card{background:#211d18}"
      + "@supports (color:color-mix(in lab,red,red)){"
      + ".card{background:color-mix(in srgb,var(--color-surface-elevated) 90%,var(--color-accent) 10%)}}";
    const result = addLegacySupportsForSrgbColorMixes(source);

    expect(result).toContain(
      "@supports not (color:color-mix(in lab,red,red)){"
      + ".card{background:var(--color-surface-elevated)}}",
    );
  });
});
