import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "./store.mjs";
import { evaluateAchievements } from "./achievements.mjs";
import { isMonth, isWeekStart, queryMonthlyReport, queryWeeklyReport, weekStartOf } from "./weekly-report.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

const candidate = TOPIC_MAPPINGS[0];
const approved = [{ ...candidate, status: "approved" }]; // Test content only; no production activation.
const slope = "mt_WBdHkc2HTf";
const base = (id, run, when) => ({ version: 1, id, occurred_at: when, device_id: "tv", session_id: `board-${run}`, run_id: run, log_id: `log-${run}`, course: candidate.course });
const beat = (id, run, when) => ({ ...base(id, run, when), kind: "beat_completed",
  data: { step_id: candidate.required_beats[2].split(":beat:")[0], beat_id: candidate.required_beats[2], presentation: "text" } });
const attempt = (id, run, when, hints, result = "succeeded") => ({ ...base(id, run, when), kind: "task_attempt",
  data: { task_id: "section-02-task-01", operation_id: id, result, hints_used: hints, value: 1 } });
const question = (id, run, when) => ({ ...base(id, run, when), kind: "question_submitted", question_id: `q-${id}`, data: { text: "斜率是什么？", modality: "text" } });
const report = (store, weekStart, utcOffsetMinutes = 480) => queryWeeklyReport(store, "alice", { weekStart, utcOffsetMinutes }, approved);

test("weeks start on the local Monday", () => {
  assert.equal(weekStartOf("2026-10-18"), "2026-10-12");
  assert.equal(weekStartOf("2026-10-12"), "2026-10-12");
  assert.deepEqual(["2026-10-12", "2026-10-13", "2026-02-30", "x"].map(isWeekStart), [true, false, false, false]);
});

test("a week reports what happened and which states changed, with the fact behind each change", () => {
  const store = new HistoryStore(":memory:");
  try {
    // Previous week: explored. This week: a hinted success, then one without hints.
    store.append("alice", [beat("b1", "r1", "2026-10-08T02:00:00.000Z")]);
    store.append("alice", [question("q1", "r2", "2026-10-13T02:00:00.000Z"), attempt("a1", "r2", "2026-10-13T02:05:00.000Z", 1),
      attempt("a2", "r3", "2026-10-15T02:00:00.000Z", 0), beat("b2", "r3", "2026-10-15T02:10:00.000Z")]);
    evaluateAchievements(store, "alice", { utcOffsetMinutes: 480 }, approved);
    const week = report(store, "2026-10-12");
    assert.deepEqual(week.activity, { days: ["2026-10-13", "2026-10-15"], runs: 2, played_beats: 1, task_attempts: 2, unassisted_successes: 1, questions: 1 });
    assert.deepEqual(week.topics.map(topic => [topic.topic_id, topic.state_before, topic.state_after, topic.change?.evidence_event_id]),
      [[slope, "explored", "did-it", "a2"]]);
    // Third local learning day on the topic (10-08, 10-13, 10-15).
    assert.deepEqual(week.achievements.map(item => item.achievement_id).filter(id => ["first-footprint", "did-it-alone", "regular-guest", "reunion"].includes(id)), ["did-it-alone", "regular-guest"]);
    assert.equal(week.first_week, "2026-10-05");
    // The earlier week shows the first footprint only.
    const earlier = report(store, "2026-10-05");
    assert.deepEqual(earlier.topics.map(topic => [topic.state_before, topic.state_after]), [[null, "explored"]]);
    assert.deepEqual(earlier.achievements.map(item => item.achievement_id).filter(id => ["first-footprint", "did-it-alone", "regular-guest", "reunion"].includes(id)), ["first-footprint"]);
    // An empty week has no topics and no changes, not a negative statement.
    const empty = report(store, "2026-10-19");
    assert.deepEqual([empty.activity.runs, empty.topics, empty.achievements], [0, [], []]);
    assert.notEqual(empty.report_sha256, week.report_sha256);
    assert.equal(queryWeeklyReport(store, "bob", { weekStart: "2026-10-12" }, approved).activity.runs, 0);
  } finally { store.close(); }
});

test("a topic practised again without a higher state has no change", () => {
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [attempt("a1", "r1", "2026-10-06T02:00:00.000Z", 0), attempt("a2", "r2", "2026-10-14T02:00:00.000Z", 0)]);
    const [topic] = report(store, "2026-10-12").topics;
    assert.deepEqual([topic.state_before, topic.state_after, topic.change, topic.task_attempts], ["did-it", "did-it", null, 1]);
  } finally { store.close(); }
});

test("the week boundary follows the learner's offset, and deleted facts leave the report", () => {
  const store = new HistoryStore(":memory:");
  try {
    // Sunday 23:30 at UTC+8 is still the earlier week there, but Monday at UTC+9.
    store.append("alice", [beat("b1", "r1", "2026-10-18T15:30:00.000Z")]);
    assert.equal(report(store, "2026-10-12", 480).activity.played_beats, 1);
    assert.equal(report(store, "2026-10-19", 540).activity.played_beats, 1);
    store.deleteRun("alice", "r1");
    assert.deepEqual([report(store, "2026-10-12").activity.played_beats, report(store, "2026-10-12").first_week], [0, null]);
  } finally { store.close(); }
});

test("a month reports the same facts over the local calendar month, with days per week", () => {
  const store = new HistoryStore(":memory:");
  try {
    // 09-30 23:30 local (UTC+8) is still September; 10-31 16:30 UTC is 11-01 local.
    store.append("alice", [beat("b0", "r0", "2026-09-30T15:30:00.000Z"), beat("b1", "r1", "2026-10-08T02:00:00.000Z"),
      question("q1", "r2", "2026-10-13T02:00:00.000Z"), attempt("a1", "r2", "2026-10-13T02:05:00.000Z", 1),
      attempt("a2", "r3", "2026-10-15T02:00:00.000Z", 0), beat("b9", "r9", "2026-10-31T16:30:00.000Z")]);
    evaluateAchievements(store, "alice", { utcOffsetMinutes: 480 }, approved);
    const month = queryMonthlyReport(store, "alice", { month: "2026-10", utcOffsetMinutes: 480 }, approved);
    assert.equal(month.rules_version, "report-month-v1");
    assert.deepEqual(month.activity, { days: ["2026-10-08", "2026-10-13", "2026-10-15"], runs: 3, played_beats: 1, task_attempts: 2, unassisted_successes: 1, questions: 1 });
    assert.deepEqual(month.weeks, [{ week_start: "2026-10-05", days: 1 }, { week_start: "2026-10-12", days: 2 }]);
    assert.deepEqual(month.topics.map(topic => [topic.state_before, topic.state_after, topic.change?.evidence_event_id]), [["explored", "did-it", "a2"]]);
    assert.equal(month.first_month, "2026-09");
    assert.deepEqual(queryMonthlyReport(store, "alice", { month: "2026-11", utcOffsetMinutes: 480 }, approved).activity.days, ["2026-11-01"]);
    assert.deepEqual(["2026-10", "2026-13", "2026-1", "x"].map(isMonth), [true, false, false, false]);
    assert.throws(() => queryMonthlyReport(store, "alice", { month: "2026-13" }, approved), /YYYY-MM/);
  } finally { store.close(); }
});

