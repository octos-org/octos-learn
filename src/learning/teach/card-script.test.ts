import { beforeEach, describe, expect, it } from "vitest";

import { setLocale } from "@/i18n";
import { cardSequence, joinWithPrevious, moveAction, SequenceError, splitSentence } from "./card-script";
import { compileRecording } from "./compile-recording";
import { appendEvent, createRecording, finishTake, planCards, startTake, type CardInk, type LearnerRecording, type RecordingEvent } from "./recording";

const now = "2026-11-06T12:00:00.000Z";
const author = { kind: "learner" as const, learner_ref: "learner:t", presented_by: { avatar_ref: "avatar:fox", voice_ref: "voice:v" } };
const SHA = "a".repeat(64);

beforeEach(() => setLocale("en-US"));

function card(events: RecordingEvent[], ink: CardInk[] = []): LearnerRecording {
  let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }), now, [{ title: "Two points" }]);
  recording = startTake(recording, "card-1", now);
  for (const event of events) recording = appendEvent(recording, "card-1", event, now);
  return finishTake(recording, "card-1", now, {
    durationMs: 8_000, asrText: "Here is a grid. Point B. It goes up.", speechSpanMs: [0, 5_000],
    segments: [
      { startMs: 0, endMs: 1_000, text: "Here is a grid." },
      { startMs: 2_000, endMs: 3_000, text: "Point B." },
      { startMs: 4_000, endMs: 5_000, text: "It goes up." },
    ],
    ink,
  });
}

const grid: RecordingEvent = { t: 500, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] };
const pointA: RecordingEvent = { t: 1_500, type: "point_tool.place", node: "grid", point: "point-a", x: 1, y: 2, label: "A" };
const laser: RecordingEvent = { t: 2_500, type: "tool.laser", target: { node: "grid" } };

const names = (recording: LearnerRecording) => cardSequence(recording.cards[0]!)!.map((item) => (item.kind === "sentence" ? `“${item.text}”` : item.label));

describe("card sequence", () => {
  it("lists sentences and actions in the order they play", () => {
    const recording = card([grid, pointA, laser], [{ snapshotId: "ink-snap:w@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [300, 1_200, 4_500] }]);
    expect(names(recording)).toEqual([
      "Writing (1 stroke)", "Put on a coordinate grid", "“Here is a grid.”",
      "Writing (1 stroke)", "Mark point A", "Point at it", "“Point B.”",
      "Writing (1 stroke)", "“It goes up.”",
    ]);
  });

  it("moves an action anywhere in the sequence, and the lesson plays it there", () => {
    const start = card([grid, pointA, laser]);
    // Sequence without the laser: grid, s1, A, s2, s3. Put it last, then right after the grid.
    const last = moveAction(start, "card-1", "event:2", 5, now);
    expect(names(last)).toEqual(["Put on a coordinate grid", "“Here is a grid.”", "Mark point A", "“Point B.”", "“It goes up.”", "Point at it"]);
    const early = moveAction(last, "card-1", "event:2", 1, now);
    expect(names(early)).toEqual(["Put on a coordinate grid", "Point at it", "“Here is a grid.”", "Mark point A", "“Point B.”", "“It goes up.”"]);
    const beats = compileRecording(early, { author, language: "en-US" }).lesson.steps[0]!.beats;
    expect(beats[0]!.actions.map((action) => `${action.when}:${action.do}`)).toEqual(["during_speech:write", "during_speech:point", "after_speech:revise"]);
    // Before everything: before the first sentence starts.
    expect(names(moveAction(start, "card-1", "event:1", 0, now))[0]).toBe("Mark point A");
  });

  it("refuses to show later strokes of writing before earlier ones", () => {
    const recording = card([], [{ snapshotId: "ink-snap:w@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [300, 4_500] }]);
    const later = cardSequence(recording.cards[0]!)!.filter((item) => item.kind === "action")[1]!;
    expect(() => moveAction(recording, "card-1", later.id, 0, now)).toThrow(SequenceError);
    expect(names(moveAction(recording, "card-1", later.id, 4, now)).at(-1)).toBe("Writing (1 stroke)");
  });

  it("splits a sentence where the learner pressed Enter, and joins it back", () => {
    const split = splitSentence(card([grid, laser]), "card-1", 2, "It".length, now);
    expect(names(split)).toEqual(["Put on a coordinate grid", "“Here is a grid.”", "Point at it", "“Point B.”", "“It”", "“goes up.”"]);
    expect(split.cards[0]!.takes[0]!.text).toBe("Here is a grid. Point B. It goes up.");
    expect(names(joinWithPrevious(split, "card-1", 3, now)).at(-1)).toBe("“It goes up.”");
    // The laser stands between "Here is a grid." and "Point B.": they stay apart.
    expect(() => joinWithPrevious(split, "card-1", 1, now)).toThrow(SequenceError);
    // An action made while a sentence was said stays with the part where it happened.
    expect(names(splitSentence(card([grid]), "card-1", 0, "Here is".length, now)).slice(0, 3)).toEqual(["“Here is”", "Put on a coordinate grid", "“a grid.”"]);
  });
});
