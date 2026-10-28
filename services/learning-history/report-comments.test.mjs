import { test } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "./store.mjs";
import { ReportCommentStore, REPORT_COMMENT_DAILY_LIMIT, buildCommentInput, validateReportComment } from "./report-comments.mjs";
import { queryWeeklyReport } from "./weekly-report.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

const candidate = TOPIC_MAPPINGS[0];
const base = (id, run, when) => ({ version: 1, id, occurred_at: when, device_id: "tv", session_id: `board-${run}`, run_id: run, log_id: `log-${run}`, course: candidate.course });
const beat = (id, run, when) => ({ ...base(id, run, when), kind: "beat_completed",
  data: { step_id: candidate.required_beats[2].split(":beat:")[0], beat_id: candidate.required_beats[2], presentation: "text" } });
const execution = turn => ({ session_id: "learn-report-0123456789abcdef0123456789abcdef#peer-report-1", turn_id: turn });
const TURN = "11111111-2222-3333-4444-555555555555";
let clock = "2026-10-21T02:00:00.000Z";
const open = () => new HistoryStore(":memory:", { now: () => clock });

test("a comment may only restate the report, in the right teacher's voice", () => {
  const store = open();
  try {
    store.append("alice", [beat("b1", "r1", "2026-10-13T02:00:00.000Z"), beat("b2", "r2", "2026-10-15T02:00:00.000Z")]);
    const input = buildCommentInput(queryWeeklyReport(store, "alice", { weekStart: "2026-10-12", utcOffsetMinutes: 480 }), "doudou");
    assert.deepEqual([input.teacher, input.activity.学习天数, input.activity.课数], ["窦鸢", 2, 2]);
    const check = comment => validateReportComment(input, { schema: 1, input_sha256: input.input_sha256, comment });
    assert.equal(check(" 这周你来了 2 天，讲解一段段听下来，节奏不错！ "), "这周你来了 2 天，讲解一段段听下来，节奏不错！");
    for (const bad of ["这周你已经掌握了斜率！", "你比上周进步了！", "你来了 5 天，真棒！", "阿澜也说你很棒！", "苏绯说这一步做得准确。", "好", "第一句。\n第二句。"]) {
      assert.throws(() => check(bad), /Report comment/, bad);
    }
    assert.throws(() => validateReportComment(input, { schema: 1, input_sha256: "x", comment: "这周来了 2 天。" }), /shape/);
    assert.equal(buildCommentInput(queryWeeklyReport(store, "alice", { weekStart: "2026-10-12", utcOffsetMinutes: 480 }), "sufei").teacher, "苏绯");
  } finally { store.close(); }
});

test("a topic's own name may be quoted even when it contains 分数 or an age", () => {
  const store = open();
  try {
    store.append("alice", [beat("b1", "r1", "2026-10-13T02:00:00.000Z"), beat("b2", "r2", "2026-10-15T02:00:00.000Z")]);
    const input = buildCommentInput(queryWeeklyReport(store, "alice", { weekStart: "2026-10-12", utcOffsetMinutes: 480 }), "doudou");
    input.topics = [{ name: "分数乘整数应用题", before: "暂无记录", after: "已探索" }, { name: "6、7、9、25、1000 个一数", before: "暂无记录", after: "已探索" }];
    const check = comment => validateReportComment(input, { schema: 1, input_sha256: input.input_sha256, comment });
    assert.equal(check("这周你探索了分数乘整数应用题，还有6、7、9、25、1000 个一数！"), "这周你探索了分数乘整数应用题，还有6、7、9、25、1000 个一数！");
    // Outside a topic's name the same words and numbers are still refused.
    assert.throws(() => check("这周你的分数提高了！"), /Report comment/);
    assert.throws(() => check("你在分数乘整数应用题上做对了 9 题！"), /number not in the report/);
  } finally { store.close(); }
});

test("every achievement in the week is named from the shared catalog, so a claim never carries an empty value", () => {
  const input = buildCommentInput({ week_start: "2026-10-12", report_sha256: "x".repeat(64),
    activity: { days: ["2026-10-13"], runs: 1, played_beats: 1, task_attempts: 0, unassisted_successes: 0, questions: 1 }, topics: [],
    achievements: [{ achievement_id: "first-footprint" }, { achievement_id: "first-question" }, { achievement_id: "regular-guest" }, { achievement_id: "retired-one" }] }, "sufei");
  assert.deepEqual(input.achievements, ["第一个脚印", "第一个问题", "常客", "retired-one"]);
});

test("one comment for the last finished week; a started request is reconciled, never repeated", () => {
  const store = open();
  try {
    const comments = new ReportCommentStore(store);
    assert.deepEqual(comments.claim("alice", 480).tasks, []); // nothing learned last week
    store.append("alice", [beat("b1", "r1", "2026-10-13T02:00:00.000Z")]);
    store.chooseTeacher("alice", "doudou");
    const [task] = comments.claim("alice", 480).tasks;
    assert.deepEqual([task.teacher_id, task.execution, task.input.week], ["doudou", null, "2026-10-12起的一周"]);
    assert.deepEqual(comments.claim("alice", 480), { tasks: [], reason: "active-task" });
    assert.deepEqual(comments.execution("alice", task.id, task.lease_id, execution(TURN)), { recorded: true });
    // The lease lapses without a result: the same execution comes back for reconciliation.
    clock = "2026-10-21T02:10:00.000Z";
    const [again] = comments.claim("alice", 480).tasks;
    assert.deepEqual([again.id, again.execution], [task.id, execution(TURN)]);
    assert.deepEqual(comments.execution("alice", again.id, again.lease_id, execution("99999999-2222-3333-4444-555555555555")), { recorded: false });
    assert.throws(() => comments.complete("alice", again.id, again.lease_id, { schema: 1, input_sha256: again.input.input_sha256, comment: "这周你已经掌握了一次函数！" }), /claims more/);
    assert.deepEqual(comments.complete("alice", again.id, again.lease_id, { schema: 1, input_sha256: again.input.input_sha256, comment: "这周有 1 段讲解陪你走过，地图亮起来啦！" }), { recorded: true });
    assert.deepEqual(comments.claim("alice", 480).tasks, []);
    const report = queryWeeklyReport(store, "alice", { weekStart: "2026-10-12", utcOffsetMinutes: 480 });
    assert.equal(comments.commentFor("alice", report, "doudou"), "这周有 1 段讲解陪你走过，地图亮起来啦！");
    assert.equal(comments.commentFor("alice", report, "alan"), null); // another teacher keeps fixed lines
    comments.configure("alice", { enabled: false });
    assert.equal(comments.commentFor("alice", report, "doudou"), null);
    assert.deepEqual(comments.claim("alice", 480), { tasks: [], reason: "disabled" });
    comments.configure("alice", { enabled: true });
    // Deleting the lesson removes the comment written from it.
    store.deleteRun("alice", "r1");
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM report_comment_jobs").get().n, 0);
  } finally { store.close(); clock = "2026-10-21T02:00:00.000Z"; }
});

test("comment requests stop at the daily limit", () => {
  const store = open();
  try {
    const comments = new ReportCommentStore(store);
    for (let i = 0; i < REPORT_COMMENT_DAILY_LIMIT + 1; i++) {
      store.append("alice", [beat(`b${i}`, `r${i}`, `2026-10-1${3 + (i % 3)}T0${i}:00:00.000Z`)]);
      const [task] = comments.claim("alice", 480).tasks;
      if (i < REPORT_COMMENT_DAILY_LIMIT) {
        assert.deepEqual(comments.execution("alice", task.id, task.lease_id, execution(`${i}1111111-2222-3333-4444-555555555555`)), { recorded: true });
        comments.reject("alice", task.id, task.lease_id);
      } else assert.equal(task, undefined);
    }
    assert.equal(comments.claim("alice", 480).reason, "daily-task-limit");
  } finally { store.close(); }
});
