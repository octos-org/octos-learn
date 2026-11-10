import { expect, it, vi } from "vitest";
import type { InkRuntime, InkSelectionSnapshot } from "../oll/oll-ink-runtime";
import { neatenSelectedInk, SNAP_SOUND_THRESHOLD } from "./snap-neat";

function setup() {
  const state = { mode: "select", selected_count: 2, selection_revision: 3, content_revision: 7, pen_color: "#222222", selection_color: "#334455" };
  const source = { document_id: "board", component_ids: ["a", "b"], component_origins: ["student", "student"], svg: "<svg />", bounds: { x: 100, y: 50, width: 200, height: 80 } } as InkSelectionSnapshot;
  const ink = { state, captureSelectionSnapshot: vi.fn(async () => source), replaceSelectionWithAiPaths: vi.fn(async () => true) };
  const dependencies = {
    recognize: vi.fn(async () => ({ readable: true, confidence: "high" as const, latex: "x^2+1=2" })),
    layout: vi.fn(async () => ["M100 50h10v10z"]),
  };
  const run = (current = () => true) => neatenSelectedInk(ink as unknown as InkRuntime, "session", current, dependencies);
  return { state, source, ink, dependencies, run };
}

it("uses the user's tested sound threshold", () => { expect(SNAP_SOUND_THRESHOLD).toBe(0.079); });
it("recognizes only the snapshot and commits vectors at the selected bounds with one replacement", async () => {
  const s = setup(); await s.run();
  expect(s.dependencies.recognize).toHaveBeenCalledWith("session", { svg: "<svg />", width: 200, height: 80 }, "zh-CN");
  expect(s.dependencies.layout).toHaveBeenCalledWith("x^2+1=2", s.source.bounds);
  expect(s.ink.replaceSelectionWithAiPaths).toHaveBeenCalledWith(expect.stringMatching(/^snap-neat-/), ["M100 50h10v10z"], {
    source: s.source, contentRevision: 7, selectionRevision: 3,
  }, "#334455");
});
it("preserves handwriting when recognition fails or is uncertain", async () => {
  for (const confidence of ["low", "medium"]) {
    const s = setup(); s.dependencies.recognize.mockResolvedValue({ readable: true, confidence: confidence as "high", latex: "x" });
    await expect(s.run()).rejects.toThrow("没看清");
    expect(s.ink.replaceSelectionWithAiPaths).not.toHaveBeenCalled();
  }
  const s = setup(); s.dependencies.recognize.mockRejectedValue(new Error("offline"));
  await expect(s.run()).rejects.toThrow("offline"); expect(s.ink.replaceSelectionWithAiPaths).not.toHaveBeenCalled();
});
it("rejects an AI selection before sending it for recognition", async () => {
  const s = setup(); s.source.component_origins = ["ai", "student"];
  await expect(s.run()).rejects.toThrow("请选择"); expect(s.dependencies.recognize).not.toHaveBeenCalled();
});
it("discards results after a same-count selection change, drawing change, or session cancellation", async () => {
  for (const change of [(s: ReturnType<typeof setup>) => s.state.selection_revision++, (s: ReturnType<typeof setup>) => s.state.content_revision++]) {
    const s = setup(); s.dependencies.recognize.mockImplementation(async () => {
      change(s); return { readable: true, confidence: "high", latex: "x" };
    });
    await expect(s.run()).rejects.toThrow("选区已变化"); expect(s.ink.replaceSelectionWithAiPaths).not.toHaveBeenCalled();
  }
  const s = setup(); let current = true;
  s.dependencies.layout.mockImplementation(async () => { current = false; return ["M0 0h1v1z"]; });
  await expect(s.run(() => current)).rejects.toThrow("选区已变化"); expect(s.ink.replaceSelectionWithAiPaths).not.toHaveBeenCalled();
});
it("preserves handwriting if typesetting fails", async () => {
  const s = setup(); s.dependencies.layout.mockRejectedValue(new Error("invalid latex"));
  await expect(s.run()).rejects.toThrow("invalid latex"); expect(s.ink.replaceSelectionWithAiPaths).not.toHaveBeenCalled();
});
