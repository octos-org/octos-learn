/** Browser integration fixture; served by Vite only, never imported by the app. */
import React from "react";
import { createRoot } from "react-dom/client";
import {
  createInkDocumentRecord,
  InkRuntime,
  type InkSelectionSnapshot,
} from "octos-lesson-language/ink-runtime";
import { OllLessonBoard } from "../src/learning/oll/oll-lesson-runtime";
import { layoutBoardWriting } from "../src/learning/board-writing";
import type {
  SelectionEnhancementArtifact,
  SelectionEnhancementCardLayout,
} from "../src/learning/selection-enhancements";
import "../src/index.css";
import "../src/learning/learning-workspace.css";

const LAYOUT_KEY = "octos-whiteboard-assistance-probe-layouts";
const host = window as unknown as {
  ink: InkRuntime;
  source?: InkSelectionSnapshot;
  layouts: Record<string, SelectionEnhancementCardLayout>;
  renderWriting: (show: boolean, session?: string) => void;
};
host.layouts = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
const mount = InkRuntime.mount;
InkRuntime.mount = (options) => { const ink = mount(options); host.ink = ink; return ink; };
const root = createRoot(document.getElementById("root")!);
const sourceRef = (source: InkSelectionSnapshot) => ({
  source_id: source.source_id,
  document_id: source.document_id,
  document_version: source.document_version,
  bounds: { ...source.bounds },
  checksum: { ...source.checksum },
});
const writingArtifact = (source: InkSelectionSnapshot): SelectionEnhancementArtifact => ({
  profile: "octos.selection-enhancement", version: "0.3", turn_id: "probe-writing",
  created_at: "2026-09-07T00:00:00Z", tool_id: "custom-question",
  source: sourceRef(source),
  board: { board_id: "probe", revision: 0, targets: [] },
  interpretation: { kind: "math", content: "y=x^2+z^3", confidence: "high" },
  response: { kind: "board_writing", title: "等价整理", text: "原式可表示三维曲面，等价整理为：\nx^2+z^3-y=0", lines: ["原式可表示三维曲面，等价整理为：", "x^2+z^3-y=0"] },
});
const cardArtifact = (source: InkSelectionSnapshot): SelectionEnhancementArtifact => ({
  profile: "octos.selection-enhancement", version: "0.2", turn_id: "probe-card",
  created_at: "2026-09-06T23:59:00Z", tool_id: "explain",
  source: sourceRef(source),
  board: { board_id: "probe", revision: 0, targets: [] },
  interpretation: { kind: "math", content: "y=x^2+z^3", confidence: "high" },
  response: { kind: "explanation", title: "已有辅助卡片", text: "板书必须避开这张卡片。" },
});
const secondCardArtifact = (source: InkSelectionSnapshot): SelectionEnhancementArtifact => ({
  ...cardArtifact(source),
  turn_id: "probe-card-2",
  created_at: "2026-09-06T23:59:30Z",
  response: { kind: "explanation", title: "第二张辅助卡片", text: "板书也必须避开这张卡片。" },
});
host.renderWriting = (show, session = "probe") => {
  const source = host.source;
  root.render(
    <div style={{ width: "100vw", height: "100vh" }}>
      <OllLessonBoard
        runtime={null}
        inkSessionId={session}
        selectionEnhancements={show && source
          ? [cardArtifact(source), secondCardArtifact(source), writingArtifact(source)]
          : []}
        selectionSources={show && source ? [source] : []}
        selectionCardLayouts={host.layouts}
        onSelectionCardLayoutChange={(turnId, layout) => {
          host.layouts = { ...host.layouts, [turnId]: layout };
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(host.layouts));
          host.renderWriting(show, session);
        }}
      />
    </div>,
  );
};
async function start() {
  const key = "octos-learning-ink:v1:probe";
  if (!localStorage.getItem(key)) {
    const writing = await layoutBoardWriting(["y = x^2 + z^3"], { x: 48, y: 160, width: 1, height: 1 }, []);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">${writing.paths.map((path) => `<path fill="#176b62" d="${path}"/>`).join("")}</svg>`;
    const record = await createInkDocumentRecord({ documentId: "learning-session:probe:student-ink", documentVersion: 1, editorVersion: "1.33.0", svg });
    localStorage.setItem(key, JSON.stringify(record));
  }
  host.renderWriting(false);
  while (!host.ink) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await host.ink.ready;
  host.ink.setMode("select");
  host.ink.selectAll();
  host.source = await host.ink.captureSelectionSnapshot();
  host.ink.clearSelection();
  host.ink.setMode("navigate");
  host.renderWriting(true);
}
void start();
