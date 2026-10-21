import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalHistoryJson, historyCourseKey, validateHistoryEvent, HISTORY_BATCH_LIMIT } from "./event-contract.mjs";

export class HistorySnapshotChanged extends Error {}
export class HistoryStore {
  constructor(path, { now = () => new Date().toISOString() } = {}) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.now = now;
    try {
      if (path !== ":memory:") chmodSync(path, 0o600);
      this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA busy_timeout=0;
      CREATE TABLE IF NOT EXISTS history_schema(version INTEGER PRIMARY KEY);
    `);
    const versions = this.db.prepare("SELECT version FROM history_schema").all();
    if (versions.some(row => row.version !== 1)) throw new Error("Unsupported history database version");
    this.db.exec(`
      BEGIN IMMEDIATE;
      INSERT OR IGNORE INTO history_schema VALUES(1);
      CREATE TABLE IF NOT EXISTS changes(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, run_id TEXT NOT NULL,
        change_kind TEXT NOT NULL, event_id TEXT, received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS changes_owner_seq ON changes(owner,seq);
      CREATE TABLE IF NOT EXISTS events(
        seq INTEGER PRIMARY KEY, owner TEXT NOT NULL, event_id TEXT NOT NULL,
        run_id TEXT NOT NULL, session_id TEXT NOT NULL, question_id TEXT,
        kind TEXT NOT NULL, course_key TEXT, course_digest TEXT,
        body TEXT NOT NULL, UNIQUE(owner,event_id)
      );
      CREATE INDEX IF NOT EXISTS events_owner_run ON events(owner,run_id,seq);
      CREATE INDEX IF NOT EXISTS events_owner_question ON events(owner,question_id);
      CREATE TABLE IF NOT EXISTS receipts(
        owner TEXT NOT NULL, event_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
        run_id TEXT NOT NULL, seq INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
        operation_key TEXT, PRIMARY KEY(owner,event_id), UNIQUE(owner,operation_key)
      );
      CREATE TABLE IF NOT EXISTS deleted_runs(
        owner TEXT NOT NULL, run_id TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY(owner,run_id)
      );
      COMMIT;
    `);
    } catch (error) { this.db.close(); throw error; }
  }

  close() { this.db.close(); }
  upperBound(owner) { return Number(this.db.prepare("SELECT COALESCE(MAX(seq),0) AS n FROM changes WHERE owner=?").get(owner).n); }
  checkSnapshot(owner, through) {
    if (this.db.prepare("SELECT 1 FROM changes WHERE owner=? AND seq>? AND change_kind='deleted' LIMIT 1").get(owner, through)) {
      throw new HistorySnapshotChanged("History was deleted during pagination; restart the query");
    }
  }

  append(owner, candidates) {
    if (!Array.isArray(candidates) || !candidates.length || candidates.length > HISTORY_BATCH_LIMIT) throw new Error("Invalid history batch");
    const events = candidates.map(validateHistoryEvent);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = events.map(event => this.appendOne(owner, event));
      this.db.exec("COMMIT");
      return { results, through: this.upperBound(owner) };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  appendOne(owner, event) {
    const body = canonicalHistoryJson(event);
    const fingerprint = createHash("sha256").update(body).digest("hex");
    const prior = this.db.prepare("SELECT * FROM receipts WHERE owner=? AND event_id=?").get(owner, event.id);
    if (prior) return { id: event.id, status: prior.fingerprint !== fingerprint ? "conflict" : prior.deleted ? "deleted" : "exists", seq: prior.seq };
    if (this.db.prepare("SELECT 1 FROM deleted_runs WHERE owner=? AND run_id=?").get(owner, event.run_id)) return { id: event.id, status: "deleted" };
    // A Runtime operation id is only meaningful within its durable log and run.
    const operation = event.kind === "task_attempt" ? ["task", event.run_id, event.log_id, event.data.task_id, event.data.operation_id]
      : event.kind === "question_submitted" ? ["question", event.question_id]
        : event.kind === "answer_delivered" ? ["answer", event.question_id, event.data.part_id] : null;
    const operationKey = operation && canonicalHistoryJson(operation);
    if (operationKey && this.db.prepare("SELECT 1 FROM receipts WHERE owner=? AND operation_key=?").get(owner, operationKey)) return { id: event.id, status: "conflict" };
    const parent = this.db.prepare("SELECT session_id FROM events WHERE owner=? AND run_id=? LIMIT 1").get(owner, event.run_id);
    if (parent && parent.session_id !== event.session_id) return { id: event.id, status: "conflict" };
    if (["question_submitted", "answer_delivered", "course_delivered"].includes(event.kind)) {
      const question = this.db.prepare(`SELECT run_id,session_id FROM events WHERE owner=? AND question_id=?
        AND kind IN ('question_submitted','answer_delivered','course_delivered') LIMIT 1`).get(owner, event.question_id);
      if (question && (question.run_id !== event.run_id || question.session_id !== event.session_id)) return { id: event.id, status: "conflict" };
    }
    const courseKey = event.course ? historyCourseKey(event.course) : null;
    if (courseKey) {
      const old = this.db.prepare("SELECT course_key,course_digest FROM events WHERE owner=? AND run_id=? AND course_key IS NOT NULL").all(owner, event.run_id);
      if (old.some(row => row.course_key !== courseKey || (row.course_digest && event.course.sha256 && row.course_digest !== event.course.sha256))) return { id: event.id, status: "conflict" };
    }
    const received = this.now();
    const result = this.db.prepare("INSERT INTO changes(owner,run_id,change_kind,event_id,received_at) VALUES(?,?,'event',?,?)")
      .run(owner, event.run_id, event.id, received);
    const seq = Number(result.lastInsertRowid);
    this.db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(seq, owner, event.id, event.run_id, event.session_id, event.question_id ?? null, event.kind, courseKey, event.course?.sha256 ?? null, body);
    this.db.prepare("INSERT INTO receipts(owner,event_id,fingerprint,run_id,seq,operation_key) VALUES(?,?,?,?,?,?)")
      .run(owner, event.id, fingerprint, event.run_id, seq, operationKey);
    return { id: event.id, status: "accepted", seq };
  }

  listRuns(owner, { limit = 20, before = Number.MAX_SAFE_INTEGER, through = this.upperBound(owner) } = {}) {
    this.checkSnapshot(owner, through);
    const rows = this.db.prepare(`
      SELECT run_id,session_id,MAX(seq) AS updated_seq,
        COUNT(DISTINCT CASE WHEN kind='question_submitted' THEN question_id END) AS question_count,
        MAX(CASE WHEN kind='run_started' THEN 1 ELSE 0 END) AS start_recorded,
        COUNT(DISTINCT CASE WHEN kind='beat_completed' THEN json_array(course_key,json_extract(body,'$.data.beat_id')) END) AS completed_beats,
        COUNT(DISTINCT CASE WHEN kind='task_attempt' THEN json_array(json_extract(body,'$.log_id'),json_extract(body,'$.data.task_id'),json_extract(body,'$.data.operation_id')) END) AS task_attempts
      FROM events WHERE owner=? AND seq<=? GROUP BY run_id
      HAVING updated_seq<? ORDER BY updated_seq DESC LIMIT ?
    `).all(owner, through, before, limit + 1);
    const page = rows.slice(0, limit);
    return { runs: page.map(row => ({ ...row, start_recorded: Boolean(row.start_recorded) })), through,
      next_before: rows.length > limit ? page.at(-1).updated_seq : null };
  }

  runEvents(owner, runId, { after = 0, limit = 100, through = this.upperBound(owner) } = {}) {
    this.checkSnapshot(owner, through);
    const rows = this.db.prepare("SELECT seq,body FROM events WHERE owner=? AND run_id=? AND seq>? AND seq<=? ORDER BY seq LIMIT ?")
      .all(owner, runId, after, through, limit + 1);
    const page = rows.slice(0, limit);
    return { events: page.map(row => ({ seq: row.seq, event: JSON.parse(row.body) })), through,
      next_after: rows.length > limit ? page.at(-1).seq : null };
  }

  changes(owner, { after = 0, limit = 100, through = this.upperBound(owner) } = {}) {
    const rows = this.db.prepare(`SELECT seq,run_id,change_kind,event_id,received_at FROM changes
      WHERE owner=? AND seq>? AND seq<=? ORDER BY seq LIMIT ?`).all(owner, after, through, limit + 1);
    return { changes: rows.slice(0, limit), through, next_after: rows.length > limit ? rows[limit - 1].seq : null };
  }

  deleteRun(owner, runId) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let prior = this.db.prepare("SELECT seq FROM deleted_runs WHERE owner=? AND run_id=?").get(owner, runId);
      if (!prior) {
        const row = this.db.prepare("INSERT INTO changes(owner,run_id,change_kind,received_at) VALUES(?,?,'deleted',?)").run(owner, runId, this.now());
        prior = { seq: Number(row.lastInsertRowid) };
        this.db.prepare("INSERT INTO deleted_runs VALUES(?,?,?)").run(owner, runId, prior.seq);
        this.db.prepare("DELETE FROM events WHERE owner=? AND run_id=?").run(owner, runId);
        this.db.prepare("UPDATE receipts SET deleted=1 WHERE owner=? AND run_id=?").run(owner, runId);
      }
      this.db.exec("COMMIT");
      return { run_id: runId, seq: prior.seq, status: "deleted" };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
