import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planFocusCamera } from "octos-lesson-language/web-runtime";

const styles = readFileSync("src/learning/learning-workspace.css", "utf8");
const appStyles = readFileSync("src/index.css", "utf8");
const setupStyles = readFileSync("src/learning/setup-whiteboard.css", "utf8");

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

  it("keeps Android selection actions from overlapping in the compact toolbar", () => {
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-ink-toolbar > \.learning-ink-quick-action,[\s\S]*?\.learning-ink-ask\s*\{[^}]*display:\s*inline-flex[^}]*width:\s*auto[^}]*min-width:\s*max-content/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-ink-toolbar\s*\{[^}]*max-width:\s*calc\(100vw - 16px\)/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-ink-toolbar > \.learning-ink-select-all\s*\{[^}]*width:\s*auto/s,
    );
    expect(styles).toContain(
      '[data-runtime-platform="android"] .learning-top-action-button svg',
    );
    expect(styles).toContain(
      '[data-runtime-platform="android"] .learning-ink-width-menu',
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-selection-question\s*\{[^}]*width:\s*min\(300px/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-selection-enhancement\s*\{[^}]*padding:\s*10px/s,
    );
  });

  it("keeps automatic lesson framing above the meeting-display readability floor", () => {
    const camera = planFocusCamera(
      [{ x: 0, y: 0, width: 5_000, height: 3_000 }],
      { panX: 0, panY: 0, scale: 1 },
      { width: 1_920, height: 1_080 },
      "course",
      {},
      .55,
    );

    expect(camera.scale).toBe(.55);
  });

  it("aligns the Android sidebar close control with the new-conversation control", () => {
    expect(appStyles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-sidebar-close\s*\{[^}]*top:\s*1rem[^}]*height:\s*2\.75rem/s,
    );
    expect(appStyles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-sidebar-new\s*\{[^}]*height:\s*2\.75rem/s,
    );
  });

  it("does not depend on device cursive fonts for welcome or narration text", () => {
    expect(styles).toMatch(
      /\.learning-whiteboard-empty strong\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
    expect(styles).toMatch(
      /\.octos-teacher-caption\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
  });

  it("uses a compact three-column onboarding layout on the Android display", () => {
    expect(setupStyles).toMatch(
      /\[data-runtime-platform="android"\] \.setup-board\s*\{[^}]*padding:\s*14px 28px 20px/s,
    );
    expect(setupStyles).toMatch(
      /\[data-runtime-platform="android"\] \.setup-cards\s*\{[^}]*max-width:\s*1120px[^}]*grid-template-columns:\s*1fr 1\.15fr \.85fr[^}]*gap:\s*14px/s,
    );
    expect(setupStyles).toMatch(
      /\[data-runtime-platform="android"\] \.setup-card\s*\{[^}]*padding:\s*14px/s,
    );
    expect(setupStyles).toMatch(
      /\[data-runtime-platform="android"\] \.setup-form input,[\s\S]*?min-height:\s*32px/s,
    );
  });

  it("does not use the device cursive fallback in onboarding", () => {
    expect(setupStyles).toMatch(
      /\.setup-handwritten\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
    expect(setupStyles).not.toMatch(
      /\.setup-handwritten\s*\{[^}]*font-family:\s*cursive/s,
    );
  });

  it("keeps compact teacher selection markers square", () => {
    expect(setupStyles).toMatch(
      /\.setup-teacher-skin-picker \.teacher-skin-status \.workbench-status-pill\s*\{[^}]*width:\s*18px[^}]*min-width:\s*18px[^}]*height:\s*18px[^}]*min-height:\s*18px[^}]*flex:\s*0 0 18px/s,
    );
    expect(setupStyles).toMatch(
      /\[data-runtime-platform="android"\] \.setup-teacher-skin-picker \.teacher-skin-status \.workbench-status-pill\s*\{[^}]*width:\s*14px[^}]*min-width:\s*14px[^}]*height:\s*14px[^}]*min-height:\s*14px[^}]*flex-basis:\s*14px/s,
    );
  });
});
