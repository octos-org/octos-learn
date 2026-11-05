import { beforeEach, describe, expect, it } from "vitest";

import { setLocale } from "@/i18n";
import { cardScript, gapOf, joinSentences, moveScriptChip, ScriptMoveError, splitSentence } from "./card-script";
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

const summary = (recording: LearnerRecording) => cardScript(recording.cards[0]!)!.chips.map((chip) => `${chip.label}@${chip.slot.phase}${chip.slot.sentence}`);

describe("card script", () => {
  it("lists the sentences and where each action plays among them", () => {
    const recording = card([grid, pointA, laser], [{ snapshotId: "ink-snap:w@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [300, 1_200, 4_500] }]);
    expect(cardScript(recording.cards[0]!)!.sentences).toEqual(["Here is a grid.", "Point B.", "It goes up."]);
    expect(summary(recording)).toEqual([
      "Writing (1 stroke)@during0", "Put on a coordinate grid@during0",
      "Writing (1 stroke)@after0", "Mark point A@after0",
      "Point at it@during1", "Writing (1 stroke)@during2",
    ]);
  });

  it("moves an action to another gap, after what is already there, and the lesson plays it there", () => {
    const recording = moveScriptChip(card([grid, pointA, laser]), "card-1", "event:2", 3, now);
    expect(summary(recording)).toEqual(["Put on a coordinate grid@during0", "Mark point A@after0", "Point at it@after2"]);
    const moved = moveScriptChip(recording, "card-1", "event:2", 1, now);
    expect(summary(moved)).toEqual(["Put on a coordinate grid@during0", "Mark point A@after0", "Point at it@after0"]);
    const beats = compileRecording(moved, { author, language: "en-US" }).lesson.steps[0]!.beats;
    expect(beats[0]!.actions.map((action) => action.do)).toEqual(["write", "revise", "point"]);
  });

  it("refuses to show later strokes of writing before earlier ones", () => {
    const recording = card([], [{ snapshotId: "ink-snap:w@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [300, 4_500] }]);
    const [, later] = cardScript(recording.cards[0]!)!.chips;
    expect(() => moveScriptChip(recording, "card-1", later!.id, 0, now)).toThrow(ScriptMoveError);
    // Later in the card is fine.
    expect(summary(moveScriptChip(recording, "card-1", later!.id, 3, now))).toEqual(["Writing (1 stroke)@during0", "Writing (1 stroke)@after2"]);
  });

  it("makes room before the first sentence when the learner started talking at once", () => {
    const moved = moveScriptChip(card([grid, pointA]), "card-1", "event:1", 0, now);
    expect(summary(moved)).toEqual(["Mark point A@before0", "Put on a coordinate grid@during0"]);
    expect(gapOf(cardScript(moved.cards[0]!)!.chips[0]!.slot)).toBe(0);
  });

  it("splits and joins sentences; a join waits until nothing plays between them", () => {
    const split = splitSentence(card([grid, laser]), "card-1", 0, "Here is".length, now);
    expect(cardScript(split.cards[0]!)!.sentences).toEqual(["Here is", "a grid.", "Point B.", "It goes up."]);
    expect(split.cards[0]!.takes[0]!.text).toBe("Here is a grid. Point B. It goes up.");
    const joined = joinSentences(split, "card-1", 0, now);
    expect(cardScript(joined.cards[0]!)!.sentences).toEqual(["Here is a grid.", "Point B.", "It goes up."]);
    const between = moveScriptChip(card([grid, laser]), "card-1", "event:1", 1, now);
    expect(() => joinSentences(between, "card-1", 0, now)).toThrow(ScriptMoveError);
  });
});
