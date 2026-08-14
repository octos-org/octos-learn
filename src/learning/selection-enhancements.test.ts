import { describe, expect, it } from "vitest";
import {
  INK_SELECTION_FORMAT,
  INK_SELECTION_FORMAT_VERSION,
  inkSvgChecksum,
  type InkSelectionSnapshot,
} from "octos-lesson-language/ink-runtime";
import {
  addSelectionSource,
  buildSelectionEnhancementTurnContext,
  loadSelectionEnhancementState,
  saveSelectionEnhancementState,
  selectionArtifactMatchesSource,
  validateSelectionEnhancementArtifact,
} from "./selection-enhancements";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

async function source(): Promise<InkSelectionSnapshot> {
  const svg = '<svg data-oll-ink-selection="1"><path d="M0 0L10 10"/></svg>';
  return {
    format: INK_SELECTION_FORMAT,
    format_version: INK_SELECTION_FORMAT_VERSION,
    source_id: "source-1",
    document_id: "ink-1",
    document_version: 2,
    created_at: "2026-08-14T10:00:00.000Z",
    bounds: { x: 20, y: 30, width: 100, height: 60 },
    checksum: { algorithm: "sha-256", value: await inkSvgChecksum(svg) },
    svg,
  };
}

describe("selection enhancement persistence", () => {
  it("restores a checksummed source snapshot without editor component IDs", async () => {
    const storage = new MemoryStorage();
    const selection = await source();
    const state = addSelectionSource({
      profile: "octos.selection-enhancement-state",
      version: "0.1",
      session_id: "session-1",
      sources: [],
      hidden_enhancement_turn_ids: [],
    }, selection);
    saveSelectionEnhancementState(state, storage);

    await expect(loadSelectionEnhancementState("session-1", storage))
      .resolves.toEqual(state);
  });

  it("drops a corrupted local snapshot but leaves validation deterministic", async () => {
    const storage = new MemoryStorage();
    const selection = await source();
    selection.svg = selection.svg.replace("10 10", "9 9");
    saveSelectionEnhancementState({
      profile: "octos.selection-enhancement-state",
      version: "0.1",
      session_id: "session-1",
      sources: [selection],
      hidden_enhancement_turn_ids: [],
    }, storage);

    await expect(loadSelectionEnhancementState("session-1", storage))
      .resolves.toMatchObject({ sources: [] });
  });

  it("accepts only source-linked explanation or plot artifacts", () => {
    const artifact = validateSelectionEnhancementArtifact({
      profile: "octos.selection-enhancement",
      version: "0.1",
      turn_id: "turn-1",
      created_at: "2026-08-14T10:00:01.000Z",
      source: {
        source_id: "source-1",
        document_id: "ink-1",
        document_version: 2,
        bounds: { x: 20, y: 30, width: 100, height: 60 },
        checksum: { algorithm: "sha-256", value: "a".repeat(64) },
      },
      interpretation: {
        kind: "math",
        content: "y=sin(x)",
        confidence: "high",
      },
      response: {
        kind: "plot",
        title: "正弦函数图像",
        text: "这是所选函数对应的图像。",
        expression: "sin(x)",
        x_range: { min: -6.28, max: 6.28 },
        y_range: { min: -1.2, max: 1.2 },
      },
    });
    expect(artifact.response.kind).toBe("plot");

    const matchingSource = {
      format: INK_SELECTION_FORMAT,
      format_version: INK_SELECTION_FORMAT_VERSION,
      source_id: artifact.source.source_id,
      document_id: artifact.source.document_id,
      document_version: artifact.source.document_version,
      created_at: "2026-08-14T10:00:00.000Z",
      bounds: artifact.source.bounds,
      checksum: artifact.source.checksum,
      svg: "<svg />",
    } satisfies InkSelectionSnapshot;
    expect(selectionArtifactMatchesSource(artifact, matchingSource)).toBe(true);
    expect(selectionArtifactMatchesSource(artifact, {
      ...matchingSource,
      checksum: { algorithm: "sha-256", value: "b".repeat(64) },
    })).toBe(false);

    expect(() => validateSelectionEnhancementArtifact({
      ...artifact,
      source: { ...artifact.source, source_id: "" },
    })).toThrow(/来源或说明/);
  });

  it("routes a turn to selection enhancement without embedding the source SVG", async () => {
    const selection = await source();
    const context = buildSelectionEnhancementTurnContext({
      sessionId: "session-1",
      turnId: "turn-selection-1",
      mediaPath: "uploads/selection.png",
      source: selection,
      contentKind: "math",
      learnerRequest: "请解释这条公式",
      lessonTitle: "二次函数",
    });

    expect(context).toContain("selection_artifact_tool: oll_enhance_selection");
    expect(context).toContain("lesson_artifact_policy: forbidden");
    expect(context).toContain("preserve_source_ink: required");
    expect(context).toContain(selection.checksum.value);
    expect(context).not.toContain(selection.svg);
  });
});
