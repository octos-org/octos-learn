import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "./store.mjs";
import { evaluateAchievements } from "./achievements.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

const candidate = TOPIC_MAPPINGS[0];
const approved = [{ ...candidate, status: "approved" }]; // Test content only; no production activation.
const slope = "mt_WBdHkc2HTf";
const at = (month, day) => `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T08:00:00.000Z`;
const base = (id, run, when) => ({ version: 1, id, occurred_at: when, device_id: "tv", session_id: `board-${run}`, run_id: run, log_id: `log-${run}`, course: candidate.course });
const beat = (id, run, when) => ({ ...base(id, run, when), kind: "beat_completed",
  data: { step_id: candidate.required_beats[2].split(":beat:")[0], beat_id: candidate.required_beats[2], presentation: "text" } });
const attempt = (id, run, when, hints) => ({ ...base(id, run, when), kind: "task_attempt",
  data: { task_id: "section-02-task-01", operation_id: id, result: "succeeded", hints_used: hints, value: 1 } });
const routed = (run, when, teacher) => ({ ...base(`route-${run}`, run, when), kind: "question_routed", question_id: `q-${run}`,
  data: { conversation_route: "direct-action", ...(teacher ? { teacher_id: teacher, teacher_name: teacher === "alan" ? "阿澜" : "豆豆" } : {}) } });
// The original four rules; the account-wide rules have their own tests.
const V1 = new Set(["first-footprint", "did-it-alone", "regular-guest", "reunion"]);
const ids = result => result.achievements.filter(item => V1.has(item.achievement_id)).map(item => `${item.achievement_id}:${item.scope}:${item.teacher_id}:${item.new}`);

test("achievements follow the rules once each, name the presenting teacher, and never repeat", () => {
  const store = new HistoryStore(":memory:");
  try {
    let n = 0;
    const clock = () => `2026-12-01T00:00:${String(n++).padStart(2, "0")}.000Z`;
    store.append("alice", [routed("r1", at(10, 1), "doudou"), beat("b1", "r1", at(10, 1)), attempt("a1", "r1", at(10, 1), 1)]);
    assert.deepEqual(ids(evaluateAchievements(store, "alice", { now: clock }, approved)), [`first-footprint::doudou:true`]);
    // A hinted success is not "did it alone"; the plain one is, in 阿澜's lesson.
    store.append("alice", [routed("r2", at(10, 3), "alan"), attempt("a2", "r2", at(10, 3), 0)]);
    store.append("alice", [routed("r3", at(10, 5), "doudou"), beat("b3", "r3", at(10, 5))]);
    const second = evaluateAchievements(store, "alice", { now: clock }, approved);
    assert.deepEqual(ids(second), [`first-footprint::doudou:false`, `did-it-alone::alan:true`, `regular-guest:${slope}:doudou:true`]);
    const guest = second.achievements.find(item => item.achievement_id === "regular-guest");
    assert.equal(guest.topic_name, "Linear Function Graphs");
    assert.equal(guest.evidence_event_id, "b3");
    // Back after more than 14 days, in a course-pack run without a teacher.
    store.append("alice", [beat("b4", "r4", at(10, 25))]);
    const third = evaluateAchievements(store, "alice", { now: clock }, approved);
    assert.deepEqual(ids(third).at(-1), `reunion:${slope}:null:true`);
    assert.equal(evaluateAchievements(store, "alice", { now: clock }, approved).achievements.every(item => !item.new), true);
    assert.deepEqual(evaluateAchievements(store, "bob", { now: clock }, approved).achievements, []);
  } finally { store.close(); }
});

test("an award whose evidence was deleted is withdrawn and re-earned only from what remains", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [routed("r1", at(10, 1), "alan"), attempt("a1", "r1", at(10, 1), 0)]);
    store.append("alice", [routed("r2", at(10, 2), "doudou"), attempt("a2", "r2", at(10, 2), 0)]);
    assert.equal(evaluateAchievements(store, "alice", {}, approved).achievements.find(item => item.achievement_id === "did-it-alone").teacher_id, "alan");
    store.deleteRun("alice", "r1");
    const after = evaluateAchievements(store, "alice", {}, approved).achievements.find(item => item.achievement_id === "did-it-alone");
    assert.deepEqual([after.evidence_event_id, after.teacher_id, after.new], ["a2", "doudou", true]);
  } finally { store.close(); }
});

test("regular guest counts the learner's local days, not UTC days", () => {
  const store = new HistoryStore(":memory:");
  try {
    // 15:30 and 16:30 UTC fall on the same UTC day but different days at UTC+8.
    store.append("alice", [beat("b1", "r1", "2026-10-01T15:30:00.000Z"), beat("b2", "r2", "2026-10-01T16:30:00.000Z"), beat("b3", "r3", "2026-10-03T08:00:00.000Z")]);
    assert.equal(evaluateAchievements(store, "alice", { utcOffsetMinutes: 0 }, approved).achievements.some(item => item.achievement_id === "regular-guest"), false);
    const store2 = new HistoryStore(":memory:");
    try {
      store2.append("alice", [beat("b1", "r1", "2026-10-01T15:30:00.000Z"), beat("b2", "r2", "2026-10-01T16:30:00.000Z"), beat("b3", "r3", "2026-10-03T08:00:00.000Z")]);
      assert.equal(evaluateAchievements(store2, "alice", { utcOffsetMinutes: 480 }, approved).achievements.some(item => item.achievement_id === "regular-guest"), true);
    } finally { store2.close(); }
  } finally { store.close(); }
});

test("awards stay when the counting basis changes later; only deleted evidence withdraws them", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [routed("r1", at(10, 1), "alan"), attempt("a1", "r1", at(10, 1), 0)]);
    assert.equal(evaluateAchievements(store, "alice", {}, approved).achievements.some(item => item.achievement_id === "did-it-alone"), true);
    // The course mapping is withdrawn (or a catalog upgrade supersedes analysis): the map
    // no longer counts the fact, but the earned award and its evidence remain.
    const later = evaluateAchievements(store, "alice", {}, []);
    assert.deepEqual(later.achievements.filter(item => V1.has(item.achievement_id)).map(item => [item.achievement_id, item.evidence_event_id]), [["did-it-alone", "a1"]]);
  } finally { store.close(); }
});
