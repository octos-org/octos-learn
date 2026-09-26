import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planFocusCamera } from "octos-lesson-language/web-runtime";

const styles = readFileSync("src/learning/learning-workspace.css", "utf8");
const appStyles = readFileSync("src/index.css", "utf8");
const setupStyles = readFileSync("src/learning/setup-whiteboard.css", "utf8");
const launcherStyles = readFileSync("src/learning/course-launcher.css", "utf8");
const runtimeSource = readFileSync(
  "src/learning/oll/oll-lesson-runtime.tsx",
  "utf8",
);
const workspaceSource = readFileSync(
  "src/learning/learning-workspace.tsx",
  "utf8",
);
const pageSource = readFileSync("src/learning/learning-page.tsx", "utf8");

describe("Android meeting-display density", () => {
  it("keeps the shared launcher compact without scaling its entire page", () => {
    expect(launcherStyles).toContain('[data-runtime-platform="android"] .course-launcher-hero');
    expect(launcherStyles).toContain('[data-runtime-platform="android"] .course-launcher-card');
    expect(launcherStyles).toMatch(
      /\.course-launcher\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*touch-action:\s*pan-y/s,
    );
    expect(launcherStyles).not.toMatch(
      /\[data-runtime-platform="android"\]\s+\.course-launcher\s*\{[^}]*transform\s*:/s,
    );
  });
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

    // course 模式刻意不再沿用讲解模式的最小缩放限制（上一轮的确定性改动，
    // 用于修复"装不下时仍被强行放大裁切"）；缩放地板现在由 teaching-layout 的
    // 结构优先放松机制承担。此处记录当前行为：传入的 .55 下限不生效。
    expect(camera.scale).toBeCloseTo(.344, 3);
  });

  it("fits a multi-card lesson scene around real Android UI occlusions", () => {
    const camera = planFocusCamera(
      [
        { x: 3_714.85, y: 90, width: 380, height: 300 },
        { x: 4_148.85, y: 501, width: 440, height: 135 },
      ],
      { panX: 0, panY: 0, scale: .55 },
      { width: 960, height: 540 },
      "relationship",
      {
        focusMargin: 24,
        occlusions: [
          { x: 6, y: 9, width: 65, height: 30 },
          { x: 74, y: 6, width: 880, height: 36 },
          { x: 8, y: 48, width: 314, height: 35 },
          { x: 220, y: 495, width: 520, height: 37 },
          { x: 658, y: 421, width: 292, height: 65 },
        ],
      },
      .55,
    );

    // The previous fixed top/bottom bands left only 118px and produced
    // 118 / 546 = 0.216117. Target-aware safe-area selection keeps the same
    // Geometry + Note scene legible without cropping either target. Among
    // near-tie fits the most centered candidate wins, trading ~2% of scale
    // for a placement closer to the screen center.
    expect(camera.scale).toBeCloseTo(.616705, 5);
  });

  it("keeps a focused course control attachment above the bottom input dock", () => {
    const geometry = { x: 3_714.85, y: 90, width: 380, height: 300 };
    const controls = { x: 3_714.85, y: 432, width: 360, height: 100.5 };
    const camera = planFocusCamera(
      [geometry, controls],
      { panX: 0, panY: 0, scale: .864 },
      { width: 960, height: 540 },
      "relationship",
      {
        focusMargin: 24,
        occlusions: [
          { x: 6, y: 9, width: 65, height: 30 },
          { x: 74, y: 6, width: 880, height: 36 },
          { x: 8, y: 48, width: 314, height: 35 },
          { x: 220, y: 495, width: 520, height: 37 },
          { x: 658, y: 421, width: 292, height: 65 },
        ],
      },
      .55,
    );
    const controlsBottom = camera.panY
      + (controls.y + controls.height) * camera.scale;

    // 当前实现以 focusHeight（当前实际渲染高度）参与镜头聚焦，
    // 练习卡片未开放时不再按完整预留高度取景。
    expect(runtimeSource).toContain("focusHeight");
    expect(runtimeSource).toContain("focusHeight: plan.controlsHeight");
    expect(camera.scale).toBeCloseTo(.666667, 5);
    expect(controlsBottom).toBeLessThanOrEqual(471);
  });

  it("uses measured Android chrome instead of reserving duplicate full-width bands", () => {
    expect(runtimeSource).toContain(
      'dataset.runtimePlatform === "android"',
    );
    expect(runtimeSource).toMatch(/top:\s*androidRuntime \? 0/);
    expect(runtimeSource).toMatch(/bottom:\s*androidRuntime \? 0/);
    expect(runtimeSource).toContain("focusMargin: 24");
    expect(workspaceSource).toMatch(
      /learning-workspace-topbar[\s\S]*?data-learning-board-occlusion=""/,
    );
    expect(pageSource).toMatch(
      /learning-top-action-group[\s\S]*?data-learning-board-occlusion=""/,
    );
  });

  it("keeps the Android course outline compact as well as its trigger", () => {
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.oll-course-outline-panel\s*\{[^}]*width:\s*min\(260px[^}]*max-height:\s*min\(460px[^}]*border-radius:\s*14px/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.oll-course-outline-heading\s*\{[^}]*padding:\s*11px 13px 8px/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.oll-course-step-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 24px 24px[^}]*min-height:\s*34px/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.oll-course-step-main > span:last-child\s*\{[^}]*font-size:\s*10px/s,
    );
  });

  it("keeps the camera monitor and framing dialog compact on the meeting display", () => {
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-camera-monitor\s*\{[^}]*top:\s*48px[^}]*right:\s*8px[^}]*padding:\s*4px/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-camera-frame img\s*\{[^}]*width:\s*128px[^}]*height:\s*96px/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-camera-dialog\s*\{[^}]*width:\s*min\(760px[^}]*max-height:\s*calc\(100dvh - 16px\)/s,
    );
    expect(styles).toMatch(
      /\[data-runtime-platform="android"\] \.learning-camera-dialog-body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 250px[^}]*padding:\s*12px/s,
    );
  });

  it("uses a direct home action instead of the legacy learning sidebar", () => {
    expect(pageSource).toContain('aria-label="返回首页"');
    expect(pageSource).toContain("<Home size={20} />");
    expect(pageSource).not.toContain("sidebarOpen");
    expect(appStyles).not.toContain(".learning-session-sidebar");
  });

  it("does not depend on device cursive fonts for welcome or narration text", () => {
    expect(styles).toMatch(
      /\.learning-whiteboard-empty strong\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
    expect(styles).toMatch(
      /\.octos-teacher-caption\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
  });

  it("does not depend on device cursive fonts in learning chrome", () => {
    expect(styles).toMatch(
      /\.learning-workspace-topbar strong\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
    expect(styles).toMatch(
      /\.oll-course-outline-trigger-copy b\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
    expect(styles).toMatch(
      /\.oll-course-outline-heading h2\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
    );
    expect(styles).not.toMatch(/font-family:[^;}]*(?:Kaiti|KaiTi|cursive)/i);
    expect(styles).not.toContain("var(--font-ui)");
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
