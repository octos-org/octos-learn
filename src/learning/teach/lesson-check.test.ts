import { setLocale } from "@/i18n";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compileRecording } from "./compile-recording";
import { cardChecks, lessonReady } from "./lesson-check";
import { appendEvent, correctTranscript, createRecording, finishTake, planCards, startTake, type LearnerRecording } from "./recording";

const author = { kind: "learner" as const, learner_ref: "learner:demo", presented_by: { avatar_ref: "avatar:octo", voice_ref: "voice:learner-default" } };

function lesson(): LearnerRecording {
  let recording = planCards(createRecording({ id: "rec", now: "2026-11-01T10:00:00.000Z", topic: { text: "Slope", type: "math_off_map" }, goals: [] }),
    "2026-11-01T10:00:00.000Z", [{ title: "Points" }, { title: "Arrow" }]);
  recording = startTake(recording, "card-1", "2026-11-01T10:01:00.000Z");
  recording = appendEvent(recording, "card-1", { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, "2026-11-01T10:01:00.000Z");
  recording = finishTake(recording, "card-1", "2026-11-01T10:01:10.000Z", { durationMs: 10_000, asrText: "Points." });
  recording = startTake(recording, "card-2", "2026-11-01T10:02:00.000Z");
  recording = appendEvent(recording, "card-2", { t: 0, type: "component.insert", panel: "graph", alias: "graph-1", expression: "2*x", x: [-1, 6], y: [-1, 12] }, "2026-11-01T10:02:00.000Z");
  recording = appendEvent(recording, "card-2", { t: 10, type: "tool.arrow", from: { node: "grid-1" }, to: { node: "graph-1" } }, "2026-11-01T10:02:00.000Z");
  return finishTake(recording, "card-2", "2026-11-01T10:02:10.000Z", { durationMs: 10_000, asrText: "Arrow." });
}

beforeEach(() => setLocale("en-US"));
afterEach(() => setLocale("zh-CN"));

describe("cardChecks", () => {
  it("merges Octo's review and the screen check per card, and explains far-apart arrows", () => {
    const recording = lesson();
    const compiled = compileRecording(recording, { author, language: "en-US" });
    const checks = cardChecks(recording, compiled, {
      at: "2026-11-01T10:05:00.000Z", overall: "Good.",
      cards: [{ key: "card-1", status: "good", kind: "none", message: "Clear." }, { key: "card-2", status: "good", kind: "none", message: "Nice arrow." }],
      screen: [{ card: "card-2", board: "chromebook", problems: ["small_text"] }, { card: "card-2", board: "large", problems: ["small_text"] }],
    });
    expect(checks.map((check) => check.status)).toEqual(["good", "fix"]);
    expect(checks[0]!.praise).toBe("Clear.");
    expect(checks[1]!.findings).toEqual([{ source: "screen", message: expect.stringContaining("far apart") }]);
    expect(lessonReady(checks, recording)).toBe(false);
  });

  it("asks for words on a card recorded without any, until they are typed in", () => {
    let recording = lesson();
    recording = startTake(recording, "card-2", "2026-11-01T10:03:00.000Z");
    recording = finishTake(recording, "card-2", "2026-11-01T10:03:10.000Z", { durationMs: 10_000, asrText: "" });
    const review = { at: "2026-11-01T10:05:00.000Z", overall: "", cards: [], screen: [] };
    const checks = cardChecks(recording, null, review);
    expect(checks.map((check) => check.status)).toEqual(["good", "fix"]);
    expect(checks[1]!.findings).toEqual([{ source: "words", message: expect.stringContaining("none of your words") }]);
    recording = correctTranscript(recording, "card-2", "Now the arrow.", "2026-11-01T10:04:00.000Z");
    expect(cardChecks(recording, null, review)[1]!.status).toBe("good");
  });

  it("a card re-recorded after the check waits for the next check", () => {
    let recording = lesson();
    recording = finishTake(startTake(recording, "card-1", "2026-11-01T10:06:00.000Z"), "card-1", "2026-11-01T10:06:10.000Z", { durationMs: 5_000, asrText: "Again." });
    const checks = cardChecks(recording, null, { at: "2026-11-01T10:05:00.000Z", overall: "", cards: [], screen: [] });
    expect(checks.map((check) => check.status)).toEqual(["redo", "good"]);
    expect(lessonReady(checks, recording)).toBe(false);
  });
});

describe("privacy findings", () => {
  it("come from the rules and from Octo, only while the words are still there", () => {
    let recording = lesson();
    recording = correctTranscript(recording, "card-1", "Hi, I'm Maya. My friend Sam helped me plot these points.", "2026-11-01T10:04:00.000Z");
    const review = { at: "2026-11-01T10:05:00.000Z", overall: "", cards: [], screen: [], personal: [{ card: "card-1", quote: "Sam", kind: "name" }, { card: "card-1", quote: "Springfield", kind: "place" }] };
    const checks = cardChecks(recording, null, review);
    expect(checks[0]!.status).toBe("fix");
    expect(checks[0]!.findings.map((finding) => [finding.source, finding.message])).toEqual([
      ["privacy", 'You said "I\'m Maya" — that\'s a name. Take it out of your words before you share your lesson.'],
      ["privacy", 'You said "Sam" — that\'s a name. Take it out of your words before you share your lesson.'],
    ]);
    recording = correctTranscript(recording, "card-1", "A friend helped me plot these points.", "2026-11-01T10:06:00.000Z");
    expect(cardChecks(recording, null, review)[0]!.findings).toEqual([]);
  });
});
