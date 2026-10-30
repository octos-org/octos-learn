import { expect, it } from "vitest";

import { narrationTeacher, type NarrationTeacherInput } from "./narration-teacher";
import { getTeacher } from "./teachers";

const sufei = getTeacher("sufei"), alan = getTeacher("alan");
// Lessons q-alan and q-sufei; this device recorded none of them unless stated.
const recorded: Record<string, ReturnType<typeof getTeacher>> = {};
const base: NarrationTeacherInput = {
  questionOfBeat: (beatId) => ({ "alan-1": "q-alan", "sufei-1": "q-sufei" } as Record<string, string>)[beatId],
  teacherOf: (questionId) => (questionId && recorded[questionId]) || null,
  settled: false,
};
const run = (input: Partial<NarrationTeacherInput>, known: Record<string, ReturnType<typeof getTeacher>> = {}) =>
  narrationTeacher({ ...base, ...input, teacherOf: (questionId) => (questionId && known[questionId]) || null });

it("waits for the startup sentence's teacher before the Runtime outline knows its beat", () => {
  // The outline is empty, so the beat cannot be looked up; the startup narration names its question.
  const early = run({ startup: { beatId: "new-1", turnId: "q-new" }, questionOfBeat: () => undefined });
  expect([early.current.pending, early.prewarm.pending]).toEqual([true, true]);
  const answered = run({ startup: { beatId: "new-1", turnId: "q-new" }, questionOfBeat: () => undefined, settled: true }, { "q-new": sufei });
  expect([answered.current, answered.prewarm]).toEqual([{ voices: sufei.voices, pending: false }, { voices: sufei.voices, pending: false }]);
  // Asked on this device: known at once, nothing waits.
  expect(run({ startup: { beatId: "new-1", turnId: "q-new" }, questionOfBeat: () => undefined }, { "q-new": sufei }).prewarm).toEqual({ voices: sufei.voices, pending: false });
});

it("gives the current, upcoming and prewarmed sentences each their own lesson's teacher", () => {
  const voice = run({ currentBeatId: "alan-1", upcomingBeatId: "sufei-1", startup: { beatId: "new-1", turnId: "q-new" }, settled: true },
    { "q-alan": alan, "q-sufei": sufei });
  expect([voice.current.voices, voice.upcoming.voices, voice.prewarm.voices]).toEqual([alan.voices, sufei.voices, null]);
});

it("never waits for a course pack's own beats or a lesson without a teacher once the service has answered", () => {
  expect(run({ currentBeatId: "pack-1", upcomingBeatId: "pack-2" }).current).toEqual({ voices: null, pending: false });
  expect(run({ currentBeatId: "pack-1", upcomingBeatId: "pack-2" }).upcoming).toEqual({ voices: null, pending: false });
  expect(run({ currentBeatId: "alan-1", settled: true }).current).toEqual({ voices: null, pending: false });
  expect(run({ currentBeatId: "alan-1" }).current).toEqual({ voices: null, pending: true });
  expect(recorded).toEqual({});
});
