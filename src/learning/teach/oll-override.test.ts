import { expect, it } from "vitest";

import { compileRecording } from "./compile-recording";
import { checkOllEdit, effectiveLesson, lessonFingerprint } from "./oll-override";
import { appendEvent, createRecording, finishTake, planCards, renameCard, setOllOverride, startTake } from "./recording";
import { decodeRecording } from "./recording-store";

const now = "2026-11-04T12:00:00.000Z";
const author = { kind: "learner" as const, learner_ref: "learner:x", presented_by: { avatar_ref: "avatar:star-fox", voice_ref: "voice:v" } };

function lesson() {
  let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Sine", type: "math_off_map" }, goals: ["Read sin x"] }), now, [{ title: "The circle" }]);
  recording = startTake(recording, "card-1", now);
  recording = appendEvent(recording, "card-1", { t: 0, type: "component.insert", panel: "unit_circle", alias: "circle", variable: "theta" }, now);
  return finishTake(recording, "card-1", now, { durationMs: 3000, asrText: "This is the unit circle.", speechSpanMs: [0, 3000] });
}

it("plays the learner's edited OLL while the recording is unchanged, and the recording's lesson once it changes", () => {
  const recording = lesson();
  const compiled = compileRecording(recording, { author, language: "en-US" });
  expect(effectiveLesson(recording, compiled).override).toBe("none");

  const edited = structuredClone(compiled.lesson);
  edited.steps[0]!.beats[0]!.say = "Meet the unit circle.";
  const checked = checkOllEdit(JSON.stringify(edited), compiled);
  expect("lesson" in checked).toBe(true);
  const overridden = setOllOverride(recording, { lesson: edited, basedOn: lessonFingerprint(compiled.lesson), editedAt: now }, now);
  // The edit survives being stored and read back.
  expect(decodeRecording(JSON.parse(JSON.stringify(overridden))).oll?.basedOn).toBe(lessonFingerprint(compiled.lesson));
  const used = effectiveLesson(overridden, compileRecording(overridden, { author, language: "en-US" }));
  expect(used.override).toBe("active");
  expect(used.compiled.lesson.steps[0]!.beats[0]!.say).toBe("Meet the unit circle.");

  // Renaming the card changes the recording's lesson: the edit is out of date.
  const renamed = renameCard(overridden, "card-1", "Meet the circle", now);
  const stale = effectiveLesson(renamed, compileRecording(renamed, { author, language: "en-US" }));
  expect(stale.override).toBe("stale");
  expect(stale.compiled.lesson.steps[0]!.beats[0]!.say).toBe("This is the unit circle.");
  expect(setOllOverride(renamed, null, now).oll).toBeUndefined();
});

it("says why hand-edited OLL cannot be used", () => {
  const compiled = compileRecording(lesson(), { author, language: "en-US" });
  expect(checkOllEdit("{ not json", compiled)).toMatchObject({ error: expect.stringMatching(/^JSON/) });
  const broken = structuredClone(compiled.lesson) as unknown as { steps: Array<{ beats: Array<{ actions: unknown[] }> }> };
  broken.steps[0]!.beats[0]!.actions.push({ do: "point", target: "nowhere" });
  expect(checkOllEdit(JSON.stringify(broken), compiled)).toMatchObject({ error: expect.any(String) });
});

it("keeps an OLL edit saved before face targets until the recording changes", () => {
  let recording = planCards(createRecording({ id: "rec-solid", now, topic: { text: "Solids", type: "math_off_map" }, goals: [] }), now, [{ title: "The solids" }]);
  recording = startTake(recording, "card-1", now);
  recording = appendEvent(recording, "card-1", { t: 0, type: "component.insert", panel: "solid_3d", alias: "box", shape: "box", size: { x: 4, y: 3, z: 2 } }, now);
  recording = appendEvent(recording, "card-1", { t: 100, type: "component.insert", panel: "solid_3d", alias: "net", shape: "box", size: { x: 4, y: 3, z: 2 }, unfold: { variable: "unfold" } }, now);
  recording = appendEvent(recording, "card-1", { t: 200, type: "component.insert", panel: "solid_3d", alias: "cylinder", shape: "cylinder", radius: 2, height: 4 }, now);
  recording = finishTake(recording, "card-1", now, { durationMs: 3000, asrText: "Here are three solids.", speechSpanMs: [0, 3000] });
  const options = { author, language: "zh-CN" };
  // Captured with the compiler on main before this change (bd986b62).
  const basedOn = "2a0-tr4yun";
  const edited = compileRecording(recording, { ...options, legacyFaceTargets: true }).lesson;
  expect(lessonFingerprint(edited)).toBe(basedOn);
  edited.steps[0]!.beats[0]!.say = "Compare the three solids.";
  const overridden = setOllOverride(recording, { lesson: edited, basedOn, editedAt: now }, now);
  const current = compileRecording(overridden, options);
  expect(lessonFingerprint(current.lesson)).not.toBe(basedOn);
  expect(effectiveLesson(overridden, current)).toMatchObject({ override: "active", compiled: { lesson: edited } });
  const renamed = renameCard(overridden, "card-1", "Compare solids", now);
  expect(effectiveLesson(renamed, compileRecording(renamed, options)).override).toBe("stale");
});

it("renames a card, refusing an empty or overlong name", () => {
  const recording = lesson();
  expect(renameCard(recording, "card-1", "  Meet the circle ", now).cards[0]!.title).toBe("Meet the circle");
  expect(() => renameCard(recording, "card-1", "  ", now)).toThrow();
  expect(() => renameCard(recording, "card-1", "x".repeat(81), now)).toThrow();
});
