import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectionEnhancementLayer } from "./selection-enhancement-layer";
import type { SelectionEnhancementArtifact } from "./selection-enhancements";

const artifact: SelectionEnhancementArtifact = {
  profile: "octos.selection-enhancement",
  version: "0.2",
  turn_id: "turn-invalid",
  created_at: "2026-08-15T10:00:00.000Z",
  source: {
    source_id: "source-1",
    document_id: "ink-1",
    document_version: 1,
    bounds: { x: 10, y: 20, width: 120, height: 70 },
    checksum: { algorithm: "sha-256", value: "a".repeat(64) },
  },
  board: { board_id: "board-1", revision: 4, targets: [] },
  tool_id: "explain",
  interpretation: { kind: "math", content: "y=x²", confidence: "high" },
  response: {
    kind: "explanation",
    title: "原来的说明",
    text: "这条说明不会被悄悄重新指向别的对象。",
  },
};

describe("SelectionEnhancementLayer", () => {
  it("keeps an invalidated result visible and labels the missing board target", () => {
    const { container } = render(
      <SelectionEnhancementLayer
        artifacts={[artifact]}
        sources={[]}
        currentDocumentVersion={1}
        invalidTargetTurnIds={new Set([artifact.turn_id])}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("引用的白板对象已失效，请重新选择")).toBeTruthy();
    expect(screen.getByText("原来的说明")).toBeTruthy();
    expect(container.querySelector(".is-invalid-target")).toBeTruthy();
  });
});
