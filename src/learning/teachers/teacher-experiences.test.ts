import { afterEach, expect, it } from "vitest";

import { TEACHER_EXPERIENCES, chooseExperiences } from "./teacher-experiences";

afterEach(() => localStorage.clear());

const lesson = (teacher: "alan" | "doudou" | "sufei", account = "learner") => {
  const offer = chooseExperiences(account, teacher);
  offer.commit();
  return offer.text;
};

it("offers experiences with about one lesson in three, the teacher's least recently offered facts first", () => {
  const offers = Array.from({ length: 9 }, () => lesson("alan"));
  expect(offers.map(Boolean)).toEqual([false, false, true, false, false, true, false, false, true]);
  const lines = (text: string | undefined) => text!.split("\n");
  const [first, second, third] = [offers[2], offers[5], offers[8]].map(lines);
  expect(first).toHaveLength(12);
  const all = TEACHER_EXPERIENCES.alan.map((fact) => `- ${fact.text}`);
  for (const fact of all.filter((line) => !first.includes(line))) expect(second).toContain(fact);
  expect(new Set([...first, ...second]).size).toBe(all.length);
  expect(third.filter((line) => second.includes(line)).length).toBeLessThan(12);
});

it("never offers two lessons in a row, even when the learner switches teachers", () => {
  expect([lesson("alan"), lesson("alan"), lesson("alan"), lesson("sufei"), lesson("sufei"), lesson("sufei")].map(Boolean))
    .toEqual([false, false, true, false, false, true]);
});

it("counts a lesson only once it has started, and each account keeps its own count", () => {
  lesson("alan"); lesson("alan");
  // The third lesson is due, but its request fails: nothing is used up.
  expect(chooseExperiences("learner", "alan").text).toBeTruthy();
  expect(chooseExperiences("learner", "alan").text).toBeTruthy();
  expect(lesson("alan", "sibling")).toBeUndefined();
});

it("recovers from a damaged log instead of failing the lesson", () => {
  localStorage.setItem("octos-learn-teacher-experiences:learner", JSON.stringify({ lessons: 5, lastOffer: "2", offered: "x" }));
  // The unreadable last offer counts as long ago, so this lesson is due.
  expect(lesson("alan")).toBeTruthy();
  expect(lesson("alan")).toBeUndefined();
});

it("keeps every experience to ordinary life and gives nothing of the novel away", () => {
  for (const facts of Object.values(TEACHER_EXPERIENCES)) {
    expect(facts.length).toBeGreaterThanOrEqual(15);
    expect(new Set(facts.map((fact) => fact.id)).size).toBe(facts.length);
    for (const { text } of facts) {
      expect(text).toMatch(/我/);
      expect(text).not.toMatch(/熄灯|熄灭|名单|澄|司衡|小川|哥哥|雾线|起雾|抄错|幻象|法术|魔法/);
    }
  }
});
