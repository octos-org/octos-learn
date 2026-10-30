import { expect, it } from "vitest";

import { classroomTeacher, type ClassroomTeacherInput } from "./classroom-teacher";
import { getTeacher } from "./teachers";

const alan = getTeacher("alan"), sufei = getTeacher("sufei"), doudou = getTeacher("doudou");
// 苏绯 is chosen now throughout; the board's older lessons were taught by others.
const base: ClassroomTeacherInput = { selected: sufei, asking: false, askedTeacher: null, generating: null, playing: false, onScreen: null };
const pick = (input: Partial<ClassroomTeacherInput>) => {
  const result = classroomTeacher({ ...base, ...input });
  return [result.portrait.id, result.reactions?.id ?? null, result.packagedLesson];
};

it("replays a lesson as the teacher who taught it, whoever is chosen now", () => {
  expect(pick({ onScreen: { questionId: "q1", teacher: alan } })).toEqual(["alan", "alan", false]);
  expect(pick({ onScreen: { questionId: "q1", teacher: alan }, playing: true })).toEqual(["alan", "alan", false]);
});

it("follows the lesson on screen on a board taught by several teachers", () => {
  expect(pick({ onScreen: { questionId: "q1", teacher: alan }, playing: true })[0]).toBe("alan");
  expect(pick({ onScreen: { questionId: "q2", teacher: doudou }, playing: true })[0]).toBe("doudou");
});

it("gives a new question to the chosen teacher while it is asked and while it is generated", () => {
  const old = { questionId: "q1", teacher: alan };
  expect(pick({ onScreen: old, asking: true, askedTeacher: sufei })).toEqual(["sufei", "sufei", false]);
  // The job was accepted and runs in the background: still 苏绯, not the old lesson's 阿澜.
  expect(pick({ onScreen: old, generating: { teacher: sufei } })).toEqual(["sufei", "sufei", false]);
  // Replaying the old lesson meanwhile shows the teacher of that lesson.
  expect(pick({ onScreen: old, generating: { teacher: sufei }, playing: true })).toEqual(["alan", "alan", false]);
});

it("keeps a restored selection lesson with the teacher it was asked of, and that teacher while asking even if the choice changes", () => {
  // Reloaded while a selection lesson asked of 苏绯 is still generating; 窦鸢 is chosen now.
  expect(pick({ selected: doudou, generating: { teacher: sufei } })).toEqual(["sufei", "sufei", false]);
  // Still being sent, and the choice changed meanwhile: the recorded teacher stands.
  expect(pick({ selected: doudou, asking: true, askedTeacher: sufei, generating: { teacher: sufei } })).toEqual(["sufei", "sufei", false]);
});

it("keeps neutral lines only for a course pack's or fixture's own lesson, not for lessons generated onto it", () => {
  expect(pick({ onScreen: { teacher: null } })).toEqual(["sufei", null, true]);
  expect(pick({ onScreen: { questionId: "q3", teacher: sufei }, playing: true })).toEqual(["sufei", "sufei", false]);
});

it("falls back to the chosen portrait and neutral lines when a lesson has no teacher record", () => {
  expect(pick({ onScreen: { questionId: "q0", teacher: null } })).toEqual(["sufei", null, false]);
  expect(pick({ generating: { teacher: null } })).toEqual(["sufei", null, false]);
  expect(pick({})).toEqual(["sufei", null, false]);
});
