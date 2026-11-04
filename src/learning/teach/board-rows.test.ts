import { setLocale } from "@/i18n";
import { describe, expect, it } from "vitest";
import { normalizeAuthoringLesson } from "octos-lesson-language";
import { computeBoardLayout, visibleBoard } from "octos-lesson-language/web-runtime";
import { reduceCanonicalEvents } from "octos-lesson-language";

import { currentRowCards } from "./board-rows";
import { compileRecording } from "./compile-recording";
import { addTakeInk, appendEvent, createRecording, finishTake, planCards, startTake, type LearnerRecording, type RecordingEvent } from "./recording";
import { teachingRegionLayout } from "./teaching-board-setup";

const now = "2026-11-01T12:00:00.000Z";
const author = { kind: "learner" as const, learner_ref: "learner:demo", presented_by: { avatar_ref: "avatar:octo", voice_ref: "voice:learner-default" } };

function record(recording: LearnerRecording, key: string, events: RecordingEvent[], ink?: Parameters<typeof addTakeInk>[2]) {
  let next = startTake(recording, key, now);
  if (ink) next = addTakeInk(next, key, ink, now);
  for (const event of events) next = appendEvent(next, key, event, now);
  return finishTake(next, key, now, { durationMs: 5_000, asrText: "Words." });
}

function slope(nextTo?: string) {
  let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now,
    [{ title: "Points" }, { title: "Rise over run" }, { title: "Check it" }]);
  recording = record(recording, "card-1", [{ t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }]);
  recording = record(recording, "card-2", [{ t: 100, type: "make_neat.confirmed", selection: "sel-n1", latex: "m=2", alias: "formula-1", replacesInk: true }],
    { snapshotId: "ink-snap:n1@v1", sha256: "a".repeat(64), selections: ["sel-n1"], neat: { selection: "sel-n1", latex: "m=2", alias: "formula-1" } });
  return record(recording, "card-3", [{ t: 0, type: "component.insert", panel: "graph", alias: "graph-1", expression: "2*x", x: [-1, 6], y: [-1, 12], ...(nextTo ? { nextTo } : {}) }]);
}

function layout(recording: LearnerRecording) {
  const compiled = compileRecording(recording, { author, language: "en-US" });
  const events = normalizeAuthoringLesson(compiled.lesson, { lessonId: "l", boardId: "b", baseRevision: 0, resourceContext: compiled.resourceContext });
  return { compiled, nodes: computeBoardLayout(visibleBoard(reduceCanonicalEvents(events)), {}, { regions: teachingRegionLayout(events, 1366, 768) as never }).nodes };
}

describe("currentRowCards", () => {
  it("lists the cards of the row a new figure would join, not handwriting that was made neat", () => {
    const recording = slope().cards.slice(0, 2);
    const compiled = compileRecording({ ...slope(), cards: recording }, { author, language: "en-US" });
    // Named in the learner's language (it was always English).
    setLocale("zh-CN");
    expect(currentRowCards(compiled)).toEqual([{ alias: "grid-1", label: "坐标网格", card: 1 }, { alias: "formula-1", label: "m=2", card: 2 }]);
    setLocale("en-US");
    expect(currentRowCards(compiled)[0]!.label).toBe("Coordinate grid");
    setLocale("zh-CN");
  });

  it("starts again at a figure that opens a new row, but not at one put next to a card", () => {
    expect(currentRowCards(layout(slope()).compiled).map((card) => card.alias)).toEqual(["graph-1"]);
    expect(currentRowCards(layout(slope("formula-1")).compiled).map((card) => card.alias)).toEqual(["grid-1", "formula-1", "graph-1"]);
  });
});

describe("placing a figure next to a card", () => {
  it("each card is its own step: a writing-only card continues the row, a new graph opens the next one", () => {
    const { nodes } = layout(slope());
    expect(nodes["l:node:formula-1"]!.y).toBe(nodes["l:node:grid-1"]!.y);
    expect(nodes["l:node:graph-1"]!.y).toBeGreaterThan(nodes["l:node:grid-1"]!.y + nodes["l:node:grid-1"]!.height);
  });

  it("a graph put next to the formula sits beside it on the same row", () => {
    const { nodes } = layout(slope("formula-1"));
    const formula = nodes["l:node:formula-1"]!;
    expect(nodes["l:node:graph-1"]!.y).toBe(nodes["l:node:grid-1"]!.y);
    expect(nodes["l:node:graph-1"]!.x).toBeGreaterThan(formula.x + formula.width);
  });
});
