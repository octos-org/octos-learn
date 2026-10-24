import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { canonicalHistoryJson, HistoryValidationError } from "./event-contract.mjs";
import { analysisHash } from "./topic-analysis.mjs";
import { localDay } from "./map-progress.mjs";
import { queryWeeklyReport, REPORT_RULES_VERSION, weekStartOf } from "./weekly-report.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";
export { REPORT_COMMENT_INSTRUCTIONS, buildReportCommentPrompt } from "./report-comment-instructions.mjs";

// A teacher comment on a finished week, written by the model through a
// single-use Octos peer, like topic analysis. The facts come only from the
// weekly report; the comment is checked by program before it is shown, and a
// failed or rejected comment leaves the teacher's fixed lines. One comment per
// account, week, teacher and report content; a started model request is never
// repeated automatically.
export const REPORT_COMMENT_VERSION = "report-comment-v1";
export const REPORT_COMMENT_DAILY_LIMIT = 3;
const TEACHER_NAMES = { alan: "阿澜", doudou: "豆豆" };
const STATE_NAMES = { explored: "已探索", practising: "正在练习", "did-it": "做出来过" };
const ACHIEVEMENT_NAMES = { "first-footprint": "初来乍到", "did-it-alone": "亲手搞定", "regular-guest": "常驻嘉宾", reunion: "老朋友重逢" };
// Draft Chinese topic names shared with the learning map (pending review).
const TOPIC_NAMES = JSON.parse(readFileSync(new URL("../../src/learning/map/topic-names-zh.json", import.meta.url), "utf8")).names;
const FORBIDDEN = /掌握|学会|会了|精通|进步|提高|提升|退步|变好|更好|更强|忘|落后|偷懒|笨|排名|分数|考试|测验|应该多|太少/;

/** The report facts a comment may use, with the learner-facing Chinese names. */
export function buildCommentInput(report, teacherId) {
  const facts = {
    teacher: TEACHER_NAMES[teacherId], week: `${report.week_start}起的一周`,
    activity: { 学习天数: report.activity.days.length, 课数: report.activity.runs, 播放讲解段数: report.activity.played_beats,
      练习次数: report.activity.task_attempts, 不用提示达到练习要求次数: report.activity.unassisted_successes, 提问数: report.activity.questions },
    topics: report.topics.map(topic => ({ name: TOPIC_NAMES[topic.topic_id] ?? topic.name, before: topic.state_before ? STATE_NAMES[topic.state_before] : "暂无记录",
      after: STATE_NAMES[topic.state_after] })),
    achievements: report.achievements.map(item => ACHIEVEMENT_NAMES[item.achievement_id]),
  };
  return { input_sha256: analysisHash({ version: REPORT_COMMENT_VERSION, report_sha256: report.report_sha256, teacher_id: teacherId, facts }), ...facts };
}

export function validateReportComment(input, candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || Object.keys(candidate).sort().join() !== "comment,input_sha256,schema"
    || candidate.schema !== 1 || candidate.input_sha256 !== input.input_sha256 || typeof candidate.comment !== "string") throw new HistoryValidationError("Invalid report comment shape");
  const comment = candidate.comment.trim();
  if ([...comment].length < 6 || [...comment].length > 120 || /[\r\n]/.test(comment)) throw new HistoryValidationError("Report comment length");
  if (FORBIDDEN.test(comment)) throw new HistoryValidationError("Report comment claims more than the facts");
  if (Object.entries(TEACHER_NAMES).some(([, name]) => name !== input.teacher && comment.includes(name))) throw new HistoryValidationError("Report comment speaks for another teacher");
  const allowed = new Set([...Object.values(input.activity), input.topics.length, input.achievements.length].map(String));
  if ((comment.match(/\d+/g) ?? []).some(number => !allowed.has(String(Number(number))))) throw new HistoryValidationError("Report comment uses a number not in the report");
  return comment;
}

export function createReportCommentSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS report_comment_settings(owner TEXT PRIMARY KEY,enabled INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS report_comment_jobs(
      owner TEXT NOT NULL,id TEXT NOT NULL,week_start TEXT NOT NULL,teacher_id TEXT NOT NULL,report_sha256 TEXT NOT NULL,run_ids TEXT NOT NULL,
      input_json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',lease_id TEXT,lease_until INTEGER,
      octos_session_id TEXT,octos_turn_id TEXT,started_at TEXT,comment TEXT,error TEXT,
      PRIMARY KEY(owner,id));`);
}

/** Deleting learning removes every comment written from it. */
export function deleteReportComments(db, owner, runId) {
  db.prepare("DELETE FROM report_comment_jobs WHERE owner=? AND EXISTS(SELECT 1 FROM json_each(run_ids) WHERE value=?)").run(owner, runId);
}

function weekRunIds(store, owner, report) {
  const startMs = Date.parse(`${report.week_start}T00:00:00.000Z`) - report.utc_offset_minutes * 60_000;
  return store.db.prepare(`SELECT DISTINCT run_id FROM events WHERE owner=? AND kind IN ('beat_completed','task_attempt','question_submitted')
    AND json_extract(body,'$.occurred_at')>=? AND json_extract(body,'$.occurred_at')<? ORDER BY run_id`)
    .all(owner, new Date(startMs).toISOString(), new Date(startMs + 7 * 86_400_000).toISOString()).map(row => row.run_id);
}

export class ReportCommentStore {
  // Mappings are a parameter only so trials and tests can use reviewed test content.
  constructor(history, mappings = TOPIC_MAPPINGS) { this.history = history; this.db = history.db; this.mappings = mappings; createReportCommentSchema(this.db); }
  // Comments are on by default (user decision, 2026-10-23); a learner can turn them off.
  settings(owner) { const row = this.db.prepare("SELECT enabled FROM report_comment_settings WHERE owner=?").get(owner); return { enabled: row ? Boolean(row.enabled) : true }; }
  configure(owner, value) {
    if (!value || Object.keys(value).some(key => key !== "enabled") || typeof value.enabled !== "boolean") throw new HistoryValidationError("Choose whether teachers comment on weekly reports");
    this.db.prepare("INSERT INTO report_comment_settings VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled").run(owner, Number(value.enabled));
    return this.settings(owner);
  }
  quotaUsed(owner) {
    const from = `${this.history.now().slice(0, 10)}T00:00:00.000Z`, until = new Date(Date.parse(from) + 86400000).toISOString();
    return this.db.prepare("SELECT COUNT(*) AS n FROM report_comment_jobs WHERE owner=? AND started_at>=? AND started_at<?").get(owner, from, until).n;
  }
  /** The shown comment for this report, only when it was written for the same facts and teacher. */
  commentFor(owner, report, teacherId) {
    if (!teacherId || !this.settings(owner).enabled) return null;
    const row = this.db.prepare("SELECT comment FROM report_comment_jobs WHERE owner=? AND week_start=? AND teacher_id=? AND report_sha256=? AND state='complete'")
      .get(owner, report.week_start, teacherId, report.report_sha256);
    return row?.comment ?? null;
  }
  /** Lease the comment for the last finished week, or recover a started one. */
  claim(owner, utcOffsetMinutes) {
    if (!this.settings(owner).enabled) return { tasks: [], reason: "disabled" };
    const now = Date.parse(this.history.now());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.db.prepare("SELECT 1 FROM report_comment_jobs WHERE owner=? AND state='leased' AND lease_until>?").get(owner, now)) { this.db.exec("COMMIT"); return { tasks: [], reason: "active-task" }; }
      // A started execution is only reconciled, never replaced.
      let job = this.db.prepare("SELECT * FROM report_comment_jobs WHERE owner=? AND octos_session_id IS NOT NULL AND state IN ('leased','uncertain') AND lease_until<=? ORDER BY lease_until LIMIT 1").get(owner, now);
      if (!job) {
        // Same default as the app when the account never chose a teacher.
        const teacherId = this.history.teacherChoice(owner)?.teacher_id ?? "alan";
        const lastWeek = new Date(Date.parse(`${weekStartOf(localDay(new Date(now).toISOString(), utcOffsetMinutes))}T00:00:00.000Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
        const report = queryWeeklyReport(this.history, owner, { weekStart: lastWeek, utcOffsetMinutes }, this.mappings);
        if (!TEACHER_NAMES[teacherId] || !report.activity.runs || this.quotaUsed(owner) >= REPORT_COMMENT_DAILY_LIMIT) {
          this.db.exec("COMMIT"); return { tasks: [], ...(this.quotaUsed(owner) >= REPORT_COMMENT_DAILY_LIMIT ? { reason: "daily-task-limit" } : {}) };
        }
        const input = buildCommentInput(report, teacherId);
        const id = analysisHash([owner, REPORT_RULES_VERSION, REPORT_COMMENT_VERSION, report.week_start, teacherId, report.report_sha256]);
        this.db.prepare(`INSERT OR IGNORE INTO report_comment_jobs(owner,id,week_start,teacher_id,report_sha256,run_ids,input_json) VALUES(?,?,?,?,?,?,?)`)
          .run(owner, id, report.week_start, teacherId, report.report_sha256, JSON.stringify(weekRunIds(this.history, owner, report)), canonicalHistoryJson(input));
        job = this.db.prepare("SELECT * FROM report_comment_jobs WHERE owner=? AND id=? AND (state='pending' OR (state IN ('leased','uncertain') AND lease_until<=?))").get(owner, id, now);
        if (!job) { this.db.exec("COMMIT"); return { tasks: [] }; }
      }
      const lease = randomUUID();
      this.db.prepare("UPDATE report_comment_jobs SET state='leased',lease_id=?,lease_until=? WHERE owner=? AND id=?").run(lease, now + 180000, owner, job.id);
      this.db.exec("COMMIT");
      return { tasks: [{ id: job.id, lease_id: lease, teacher_id: job.teacher_id, input: JSON.parse(job.input_json),
        execution: job.octos_session_id ? { session_id: job.octos_session_id, turn_id: job.octos_turn_id } : null }] };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  execution(owner, id, lease, value) {
    if (!value || Object.keys(value).some(key => !["session_id", "turn_id"].includes(key))
      || typeof value.session_id !== "string" || !/^learn-report-[a-f0-9]{32}#peer-[a-z0-9-]+$/.test(value.session_id)
      || typeof value.turn_id !== "string" || !/^[a-f0-9-]{36}$/.test(value.turn_id)) throw new HistoryValidationError("Invalid Octos report comment execution");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const job = this.db.prepare("SELECT * FROM report_comment_jobs WHERE owner=? AND id=? AND state='leased' AND lease_id=?").get(owner, id, lease);
      if (!job) { this.db.exec("COMMIT"); return { recorded: false }; }
      if (job.octos_session_id) { this.db.exec("COMMIT"); return { recorded: job.octos_session_id === value.session_id && job.octos_turn_id === value.turn_id }; }
      if (!this.settings(owner).enabled || this.quotaUsed(owner) >= REPORT_COMMENT_DAILY_LIMIT) { this.db.exec("COMMIT"); return { recorded: false, reason: "daily-task-limit" }; }
      this.db.prepare("UPDATE report_comment_jobs SET octos_session_id=?,octos_turn_id=?,started_at=? WHERE owner=? AND id=?")
        .run(value.session_id, value.turn_id, this.history.now(), owner, id);
      this.db.exec("COMMIT"); return { recorded: true };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  complete(owner, id, lease, candidate) {
    const job = this.db.prepare("SELECT * FROM report_comment_jobs WHERE owner=? AND id=?").get(owner, id);
    if (!job || !job.octos_session_id || job.lease_id !== lease || !["leased", "complete"].includes(job.state)) return { recorded: false };
    const comment = validateReportComment(JSON.parse(job.input_json), candidate);
    if (job.state === "complete" && job.comment !== comment) throw new HistoryValidationError("Conflicting report comment; original retained");
    this.db.prepare("UPDATE report_comment_jobs SET state='complete',comment=?,error=NULL WHERE owner=? AND id=?").run(comment, owner, id);
    return { recorded: true };
  }
  pause(owner, id, lease) {
    return { recorded: Number(this.db.prepare("UPDATE report_comment_jobs SET state=CASE WHEN octos_session_id IS NULL THEN 'pending' ELSE 'uncertain' END,lease_until=? WHERE owner=? AND id=? AND state='leased' AND lease_id=?")
      .run(Date.parse(this.history.now()) + 180000, owner, id, lease).changes) > 0 };
  }
  reject(owner, id, lease) {
    return { recorded: Number(this.db.prepare("UPDATE report_comment_jobs SET state='blocked',error='invalid-report-comment' WHERE owner=? AND id=? AND state='leased' AND lease_id=?")
      .run(owner, id, lease).changes) > 0 };
  }
  job(owner, id) { return this.db.prepare("SELECT id,state FROM report_comment_jobs WHERE owner=? AND id=?").get(owner, id) ?? null; }
}
