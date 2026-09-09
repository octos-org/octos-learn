import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/learning/learning-workspace.css", "utf8");

describe("Android meeting-display density", () => {
  it("keeps chrome compact without scaling the whiteboard surface", () => {
    expect(styles).toContain('[data-runtime-platform="android"] .learning-workspace-topbar');
    expect(styles).toContain('[data-runtime-platform="android"] .learning-ink-toolbar');
    expect(styles).toContain('[data-runtime-platform="android"] .learning-input-dock');
    expect(styles).toContain('[data-runtime-platform="android"] .octos-teacher-avatar');
    expect(styles).not.toMatch(
      /\[data-runtime-platform="android"\]\s+\.learning-(?:canvas-shell|oll-board)\s*\{[^}]*transform\s*:/s,
    );
  });
});
