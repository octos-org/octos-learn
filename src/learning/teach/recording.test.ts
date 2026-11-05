import { describe, expect, it } from "vitest";
import {
  addInkMark,
  addTakeInk,
  setCardKind,
  appendEvent,
  cancelTake,
  correctTranscript,
  createRecording,
  currentTake,
  finishTake,
  keptTake,
  planCards,
  recordingComplete,
  RecordingError,
  startTake,
  undoTakeEvents,
  type LearnerRecording,
} from "./recording";

const now = "2026-10-31T12:00:00.000Z";

function slopeLesson(): LearnerRecording {
  const recording = createRecording({
    id: "rec-1",
    now,
    topic: { text: " slope ", type: "on_map_lit", starTopicId: "mt_-3udyo6VyB" },
    goals: ["Find the slope from any two points", " "],
  });
  return planCards(recording, now, [
    { title: "What is slope?" },
    { title: "Pick two points" },
    { title: "Rise over run" },
    { title: "Check it on the graph" },
  ]);
}

describe("learner recording", () => {
  it("creates a recording with a trimmed topic and goals", () => {
    const recording = slopeLesson();
    expect(recording.topic.text).toBe("slope");
    expect(recording.goals).toEqual(["Find the slope from any two points"]);
    expect(recording.cards.map((card) => card.key)).toEqual(["card-1", "card-2", "card-3", "card-4"]);
  });

  it("limits a lesson to six cards and requires titles", () => {
    const recording = slopeLesson();
    expect(() => planCards(recording, now, Array.from({ length: 7 }, () => ({ title: "x" })))).toThrow(RecordingError);
    expect(() => planCards(recording, now, [{ title: "  " }])).toThrow(RecordingError);
  });

  it("records a take with timed events and keeps it", () => {
    let recording = startTake(slopeLesson(), "card-1", now);
    recording = appendEvent(recording, "card-1", { t: 900, type: "tool.highlighter", target: { inkSelection: "sel-gentle" } }, now);
    recording = appendEvent(recording, "card-1", { t: 7300, type: "tool.laser", target: { inkSelection: "sel-steep" } }, now);
    recording = finishTake(recording, "card-1", now, { durationMs: 9400, asrText: "A steep ramp has a big soap.", speechSpanMs: [600, 8700] });
    const take = keptTake(recording.cards[0]!);
    expect(take?.events).toHaveLength(2);
    expect(take?.text).toBe("A steep ramp has a big soap.");
  });

  it("rejects events out of time order or outside a take", () => {
    const recording = startTake(slopeLesson(), "card-1", now);
    const laser = (t: number) => ({ t, type: "tool.laser" as const, target: { node: "grid" } });
    const later = appendEvent(recording, "card-1", laser(500), now);
    expect(() => appendEvent(later, "card-1", laser(100), now)).toThrow(RecordingError);
    expect(() => appendEvent(slopeLesson(), "card-2", laser(0), now)).toThrow(RecordingError);
  });

  it("undoes the take's latest actions with the ink they added, but not carried-over board content", () => {
    let recording = startTake(slopeLesson(), "card-1", now);
    recording = appendEvent(recording, "card-1", { t: 0, type: "component.insert", panel: "graph", alias: "sine", expression: "sin(x)", x: [-7, 7], y: [-2, 2] }, now);
    recording = finishTake(recording, "card-1", now, { durationMs: 2000, asrText: "A sine graph.", speechSpanMs: [0, 2000] });
    // Re-recording keeps the graph on the board; this take adds a formula from neat writing.
    recording = startTake(recording, "card-1", now);
    recording = addTakeInk(recording, "card-1", { snapshotId: "ink-snap:neat@v1", sha256: "a".repeat(64), selections: ["sel-n1"] }, now);
    recording = appendEvent(recording, "card-1", { t: 400, type: "make_neat.confirmed", selection: "sel-n1", latex: "y=\\sin x", alias: "formula-1", replacesInk: true }, now);
    recording = addInkMark(recording, "card-1", { selection: "sel-m1", box: { x: 0, y: 0, width: 10, height: 10 } }, now);
    recording = appendEvent(recording, "card-1", { t: 600, type: "tool.highlighter", target: { inkSelection: "sel-m1" } }, now);
    const take = () => currentTake(recording.cards[0]!)!;
    expect(take().events.map((event) => event.type)).toEqual(["component.insert", "make_neat.confirmed", "tool.highlighter"]);

    recording = undoTakeEvents(recording, "card-1", 1, now, { inkMarks: ["sel-m1"] });
    expect(take().events.map((event) => event.type)).toEqual(["component.insert", "make_neat.confirmed"]);
    expect(take().inkMarks).toEqual([]);
    recording = undoTakeEvents(recording, "card-1", 1, now, { inkSnapshot: "ink-snap:neat@v1" });
    expect(take().events.map((event) => event.type)).toEqual(["component.insert"]);
    expect(take().ink).toEqual([]);
    expect(() => undoTakeEvents(recording, "card-1", 2, now)).toThrow(RecordingError);
    expect(() => undoTakeEvents(slopeLesson(), "card-1", 1, now)).toThrow(RecordingError);
  });

  it("allows only one card to record at a time", () => {
    const recording = startTake(slopeLesson(), "card-1", now);
    expect(() => startTake(recording, "card-2", now)).toThrow(RecordingError);
  });

  it("re-recording a card supersedes its speech but keeps its ink", () => {
    const ink = [{ snapshotId: "ink-snap:card3@v4", sha256: "abc", selections: ["sel-rise", "sel-run"] }];
    let recording = startTake(slopeLesson(), "card-3", now);
    recording = finishTake(recording, "card-3", now, { durationMs: 8000, asrText: "Rise over run is 3 over 6.", ink });
    recording = startTake(recording, "card-3", now);
    recording = finishTake(recording, "card-3", now, { durationMs: 11800, asrText: "So the slope is 6 over 3, which is 2." });
    const card = recording.cards[2]!;
    expect(card.takes.map((take) => take.status)).toEqual(["superseded", "kept"]);
    expect(keptTake(card)?.text).toBe("So the slope is 6 over 3, which is 2.");
    expect(card.ink).toEqual(ink);
  });

  it("re-recording the words keeps the board the learner built, arrows and highlights included, and replaces words and the laser", () => {
    let recording = startTake(slopeLesson(), "card-2", now);
    recording = appendEvent(recording, "card-2", { t: 400, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now);
    recording = appendEvent(recording, "card-2", { t: 2_100, type: "point_tool.place", node: "grid-1", point: "point-a", x: 1, y: 2, label: "A (1, 2)" }, now);
    recording = appendEvent(recording, "card-2", { t: 3_000, type: "tool.laser", target: { node: "grid-1", part: "point-a" } }, now);
    recording = appendEvent(recording, "card-2", { t: 3_500, type: "tool.highlighter", target: { node: "grid-1", part: "point-a" } }, now);
    recording = appendEvent(recording, "card-2", { t: 4_000, type: "tool.arrow", from: { node: "card-1-formula" }, to: { node: "grid-1" } }, now);
    recording = finishTake(recording, "card-2", now, { durationMs: 5_000, asrText: "Point A." });
    recording = startTake(recording, "card-2", now);
    // Cards, highlights and arrows stay; the laser was a moment in the talk.
    expect(currentTake(recording.cards[1]!)!.events.map((event) => [event.t, event.type])).toEqual([[0, "component.insert"], [0, "point_tool.place"], [0, "tool.highlighter"], [0, "tool.arrow"]]);
    recording = appendEvent(recording, "card-2", { t: 1_000, type: "tool.laser", target: { node: "grid-1", part: "point-a" } }, now);
  });

  it("starting a card over begins empty and replaces its ink only once the new take is kept", () => {
    const ink = [{ snapshotId: "ink-snap:card3@v4", sha256: "abc", selections: [] }];
    let recording = startTake(slopeLesson(), "card-3", now);
    recording = appendEvent(recording, "card-3", { t: 400, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now);
    recording = finishTake(recording, "card-3", now, { durationMs: 8000, asrText: "First.", ink });
    recording = cancelTake(startTake(recording, "card-3", now, { fresh: true }), "card-3", now);
    expect(recording.cards[2]!.ink).toEqual(ink);
    recording = startTake(recording, "card-3", now, { fresh: true });
    expect(currentTake(recording.cards[2]!)!.events).toEqual([]);
    recording = finishTake(recording, "card-3", now, { durationMs: 3000, asrText: "Again." });
    expect(recording.cards[2]!.ink).toEqual([]);
  });

  it("lets the learner correct the transcript of the kept take", () => {
    let recording = startTake(slopeLesson(), "card-1", now);
    recording = finishTake(recording, "card-1", now, { durationMs: 9400, asrText: "a big soap" });
    recording = correctTranscript(recording, "card-1", " a big slope ", now);
    const take = keptTake(recording.cards[0]!);
    expect(take?.asrText).toBe("a big soap");
    expect(take?.text).toBe("a big slope");
  });

  it("cancels an unfinished take without touching earlier ones", () => {
    let recording = startTake(slopeLesson(), "card-1", now);
    recording = finishTake(recording, "card-1", now, { durationMs: 9400, asrText: "first" });
    recording = cancelTake(startTake(recording, "card-1", now), "card-1", now);
    expect(recording.cards[0]!.takes.map((take) => take.status)).toEqual(["kept"]);
  });

  it("keeps recorded cards when replanning and refuses to drop them", () => {
    let recording = startTake(slopeLesson(), "card-2", now);
    recording = finishTake(recording, "card-2", now, { durationMs: 8200, asrText: "Point A and point B" });
    const reordered = planCards(recording, now, [
      { title: "Pick two points", from: "card-2" },
      { title: "What is slope?", from: "card-1" },
      { title: "Rise over run", from: "card-3" },
      { title: "Check it on the graph", from: "card-4" },
    ]);
    expect(reordered.cards[0]).toMatchObject({ key: "card-1", title: "Pick two points" });
    expect(keptTake(reordered.cards[0]!)?.text).toBe("Point A and point B");
    expect(() => planCards(recording, now, [{ title: "Only one", from: "card-1" }])).toThrow(RecordingError);
  });

  it("is complete only when every card has a kept take", () => {
    let recording = slopeLesson();
    expect(recordingComplete(recording)).toBe(false);
    for (const card of recording.cards) {
      recording = startTake(recording, card.key, now);
      recording = finishTake(recording, card.key, now, { durationMs: 1000, asrText: card.title });
    }
    expect(recordingComplete(recording)).toBe(true);
  });
  it("changes a card's kind only while it has nothing recorded, with one exercise per lesson", () => {
    const planned = planCards(createRecording({ id: "rec-k", now: now, topic: { text: "Sine", type: "math_off_map" }, goals: ["g"] }), now, [{ title: "A" }, { title: "B" }]);
    const exercise = setCardKind(planned, "card-2", "your_turn", now);
    expect(exercise.cards.map((card) => card.kind)).toEqual(["teach", "your_turn"]);
    expect(() => setCardKind(exercise, "card-1", "your_turn", now)).toThrow(/one/);
    expect(setCardKind(exercise, "card-2", "teach", now).cards[1]!.kind).toBe("teach");
    const recorded = startTake(planned, "card-1", now);
    expect(() => setCardKind(recorded, "card-1", "your_turn", now)).toThrow(/already has a recording/);
  });
});
