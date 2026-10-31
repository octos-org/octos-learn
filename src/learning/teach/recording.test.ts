import { describe, expect, it } from "vitest";
import {
  appendEvent,
  cancelTake,
  correctTranscript,
  createRecording,
  finishTake,
  keptTake,
  planCards,
  recordingComplete,
  RecordingError,
  startTake,
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
    recording = appendEvent(recording, "card-1", { t: 900, type: "ink.stroke", componentIds: ["c1"] }, now);
    recording = appendEvent(recording, "card-1", { t: 7300, type: "tool.laser", target: { inkSelection: "sel-steep" } }, now);
    recording = finishTake(recording, "card-1", now, { durationMs: 9400, asrText: "A steep ramp has a big soap.", speechSpanMs: [600, 8700] });
    const take = keptTake(recording.cards[0]!);
    expect(take?.events).toHaveLength(2);
    expect(take?.text).toBe("A steep ramp has a big soap.");
  });

  it("rejects events out of time order or outside a take", () => {
    const recording = startTake(slopeLesson(), "card-1", now);
    const later = appendEvent(recording, "card-1", { t: 500, type: "ink.stroke", componentIds: ["c1"] }, now);
    expect(() => appendEvent(later, "card-1", { t: 100, type: "ink.stroke", componentIds: ["c2"] }, now)).toThrow(RecordingError);
    expect(() => appendEvent(slopeLesson(), "card-2", { t: 0, type: "ink.stroke", componentIds: [] }, now)).toThrow(RecordingError);
  });

  it("allows only one card to record at a time", () => {
    const recording = startTake(slopeLesson(), "card-1", now);
    expect(() => startTake(recording, "card-2", now)).toThrow(RecordingError);
  });

  it("re-recording a card supersedes its speech but keeps its ink", () => {
    const ink = { snapshotId: "ink-snap:card3@v4", sha256: "abc", selections: ["sel-rise", "sel-run"] };
    let recording = startTake(slopeLesson(), "card-3", now);
    recording = finishTake(recording, "card-3", now, { durationMs: 8000, asrText: "Rise over run is 3 over 6.", ink });
    recording = startTake(recording, "card-3", now);
    recording = finishTake(recording, "card-3", now, { durationMs: 11800, asrText: "So the slope is 6 over 3, which is 2." });
    const card = recording.cards[2]!;
    expect(card.takes.map((take) => take.status)).toEqual(["superseded", "kept"]);
    expect(keptTake(card)?.text).toBe("So the slope is 6 over 3, which is 2.");
    expect(card.ink).toEqual(ink);
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
});
