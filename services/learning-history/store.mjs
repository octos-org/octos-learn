import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalHistoryJson, historyCourseKey, validateHistoryEvent, HISTORY_BATCH_LIMIT, HistoryValidationError } from "./event-contract.mjs";
import { validateCourseMaterial } from "./course-material.mjs";
import { createAnalysisSchema, enqueueAnalysis, deleteAnalysisRun } from "./topic-analysis-store.mjs";

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
    if (versions.length > 1 || versions.some(row => ![1, 2, 3, 4, 5].includes(row.version))) throw new Error("Unsupported history database version");
    const version = versions[0]?.version ?? 1;
    this.db.exec(`
      BEGIN IMMEDIATE;
      INSERT INTO history_schema SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM history_schema);
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
      CREATE TABLE IF NOT EXISTS delivery_tasks(
        owner TEXT NOT NULL, event_id TEXT NOT NULL, run_id TEXT NOT NULL,
        question_id TEXT NOT NULL, role TEXT NOT NULL, seq INTEGER NOT NULL,
        payload TEXT, state TEXT NOT NULL DEFAULT 'pending',
        lease_id TEXT, lease_until INTEGER, committed_seq INTEGER,
        PRIMARY KEY(owner,event_id)
      );
      CREATE INDEX IF NOT EXISTS delivery_owner_state ON delivery_tasks(owner,state,seq);
      CREATE INDEX IF NOT EXISTS delivery_owner_run ON delivery_tasks(owner,run_id);
      CREATE INDEX IF NOT EXISTS events_owner_session ON events(owner,session_id);
      CREATE TABLE IF NOT EXISTS deleted_sessions(
        owner TEXT NOT NULL, session_id TEXT NOT NULL, seq INTEGER NOT NULL,
        state TEXT NOT NULL, lease_id TEXT, lease_until INTEGER,
        PRIMARY KEY(owner,session_id)
      );
      ${version === 1 ? `
      ALTER TABLE events ADD COLUMN occurred_at TEXT;
      ALTER TABLE events ADD COLUMN question_preview TEXT;
      ALTER TABLE events ADD COLUMN beat_id TEXT;
      ALTER TABLE events ADD COLUMN task_id TEXT;
      ALTER TABLE events ADD COLUMN operation_id TEXT;
      UPDATE events SET occurred_at=json_extract(body,'$.occurred_at'),
        question_preview=CASE WHEN kind='question_submitted' THEN substr(json_extract(body,'$.data.text'),1,140) END,
        beat_id=json_extract(body,'$.data.beat_id'), task_id=json_extract(body,'$.data.task_id'),
        operation_id=json_extract(body,'$.data.operation_id');
      UPDATE history_schema SET version=2;
      ` : ""}
      CREATE INDEX IF NOT EXISTS events_owner_course ON events(owner,course_key,course_digest,seq);
      CREATE TABLE IF NOT EXISTS course_materials(
        owner TEXT NOT NULL, event_id TEXT NOT NULL, run_id TEXT NOT NULL,
        sha256 TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        PRIMARY KEY(owner,event_id)
      );
      CREATE INDEX IF NOT EXISTS materials_owner_run ON course_materials(owner,run_id);
      ${version < 5 ? "ALTER TABLE events ADD COLUMN delivery_digest TEXT;" : ""}
      CREATE INDEX IF NOT EXISTS events_owner_delivery ON events(owner,delivery_digest,kind,seq);
    `);
    createAnalysisSchema(this.db);
    this.db.exec("UPDATE history_schema SET version=5; COMMIT;");
    } catch (error) { this.db.close(); throw error; }
  }

  close() { this.db.close(); }
  upperBound(owner) { return Number(this.db.prepare("SELECT COALESCE(MAX(seq),0) AS n FROM changes WHERE owner=?").get(owner).n); }
  checkSnapshot(owner, through) {
    if (this.db.prepare("SELECT 1 FROM changes WHERE owner=? AND seq>? AND change_kind IN ('deleted','session_deleted') LIMIT 1").get(owner, through)) {
      throw new HistorySnapshotChanged("History was deleted during pagination; restart the query");
    }
  }

  append(owner, candidates, materials = []) {
    if (!Array.isArray(candidates) || !candidates.length || candidates.length > HISTORY_BATCH_LIMIT) throw new Error("Invalid history batch");
    const events = candidates.map(validateHistoryEvent);
    if (!Array.isArray(materials) || materials.length > events.length) throw new HistoryValidationError("Invalid material batch");
    const byId = new Map(events.map(event => [event.id, event]));
    if (materials.length && byId.size !== events.length) throw new HistoryValidationError("Duplicate delivery identifiers in material batch");
    const materialIds = new Set();
    const checked = materials.map(material => {
      if (!material || Object.keys(material).some(key => !["event_id", "snapshot_json"].includes(key))
        || materialIds.has(material.event_id)) throw new HistoryValidationError("Invalid material batch");
      materialIds.add(material.event_id);
      return validateCourseMaterial(byId.get(material.event_id), material.snapshot_json);
    });
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = events.map(event => this.appendOne(owner, event));
      for (const material of checked) {
        const receipt = results.find(row => row.id === material.event_id);
        if (!["accepted", "exists"].includes(receipt.status)) continue;
        const event = byId.get(material.event_id);
        this.db.prepare("INSERT OR IGNORE INTO course_materials(owner,event_id,run_id,sha256,snapshot_json) VALUES(?,?,?,?,?)")
          .run(owner, event.id, event.run_id, material.sha256, material.snapshot_json);
      }
      for (const receipt of results) if (["accepted", "exists"].includes(receipt.status)) enqueueAnalysis(this, owner, receipt.id);
      this.db.exec("COMMIT");
      return { results, through: this.upperBound(owner) };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  courseMaterial(owner, eventId) {
    return this.db.prepare("SELECT event_id,sha256,snapshot_json FROM course_materials WHERE owner=? AND event_id=?").get(owner, eventId) ?? null;
  }

  appendOne(owner, event) {
    const body = canonicalHistoryJson(event);
    const fingerprint = createHash("sha256").update(body).digest("hex");
    if (this.db.prepare("SELECT 1 FROM deleted_sessions WHERE owner=? AND session_id=?").get(owner, event.session_id)) return { id: event.id, status: "deleted" };
    const prior = this.db.prepare("SELECT * FROM receipts WHERE owner=? AND event_id=?").get(owner, event.id);
    if (prior) return { id: event.id, status: prior.fingerprint !== fingerprint ? "conflict" : prior.deleted ? "deleted" : "exists", seq: prior.seq };
    if (this.db.prepare("SELECT 1 FROM deleted_runs WHERE owner=? AND run_id=?").get(owner, event.run_id)) return { id: event.id, status: "deleted" };
    // A Runtime operation id is only meaningful within its durable log and run.
    const operation = event.kind === "task_attempt" ? ["task", event.run_id, event.log_id, event.data.task_id, event.data.operation_id]
      : event.kind === "question_submitted" ? ["question", event.question_id]
        : event.kind === "question_routed" ? ["route", event.question_id]
        : event.kind === "answer_delivered" ? ["answer", event.question_id, event.data.part_id] : null;
    const operationKey = operation && canonicalHistoryJson(operation);
    if (operationKey && this.db.prepare("SELECT 1 FROM receipts WHERE owner=? AND operation_key=?").get(owner, operationKey)) return { id: event.id, status: "conflict" };
    const parent = this.db.prepare("SELECT session_id FROM events WHERE owner=? AND run_id=? LIMIT 1").get(owner, event.run_id);
    if (parent && parent.session_id !== event.session_id) return { id: event.id, status: "conflict" };
    if (["question_submitted", "question_routed", "answer_delivered", "course_delivered"].includes(event.kind)) {
      const question = this.db.prepare(`SELECT run_id,session_id FROM events WHERE owner=? AND question_id=?
        AND kind IN ('question_submitted','question_routed','answer_delivered','course_delivered') LIMIT 1`).get(owner, event.question_id);
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
    this.db.prepare(`INSERT INTO events(seq,owner,event_id,run_id,session_id,question_id,kind,course_key,course_digest,body,occurred_at,question_preview,beat_id,task_id,operation_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(seq, owner, event.id, event.run_id, event.session_id, event.question_id ?? null, event.kind, courseKey, event.course?.sha256 ?? null, body,
        event.occurred_at, event.kind === "question_submitted" ? [...event.data.text].slice(0,140).join("") : null,
        event.data.beat_id ?? null, event.data.task_id ?? null, event.data.operation_id ?? null);
    this.db.prepare("INSERT INTO receipts(owner,event_id,fingerprint,run_id,seq,operation_key) VALUES(?,?,?,?,?,?)")
      .run(owner, event.id, fingerprint, event.run_id, seq, operationKey);
    if (event.data.delivery_sha256) this.db.prepare("UPDATE events SET delivery_digest=? WHERE seq=?").run(event.data.delivery_sha256, seq);
    if (["question_submitted", "question_routed", "answer_delivered"].includes(event.kind)) this.stageDeliveries(owner, event);
    return { id: event.id, status: "accepted", seq };
  }

  stageDeliveries(owner, event) {
    const route = this.db.prepare("SELECT body FROM events WHERE owner=? AND question_id=? AND kind='question_routed' LIMIT 1").get(owner, event.question_id);
    if (!route || JSON.parse(route.body).data.conversation_route !== "direct-action") return;
    const question = this.db.prepare("SELECT body,seq FROM events WHERE owner=? AND question_id=? AND kind='question_submitted' LIMIT 1").get(owner, event.question_id);
    if (!question) return;
    const original = JSON.parse(question.body), routing = JSON.parse(route.body);
    const userId = `learn:user:${original.question_id}`;
    const stage = (row, message) => this.db.prepare("INSERT OR IGNORE INTO delivery_tasks(owner,event_id,run_id,question_id,role,seq,payload) VALUES(?,?,?,?,?,?,?)")
      .run(owner, row.id, row.run_id, row.question_id, message.role, row.seq, JSON.stringify(message));
    stage({ ...original, seq: question.seq }, { session_id: original.session_id, role: "user", content: original.data.text,
      media: routing.data.media ?? original.data.media ?? [], source: "external_record:octos-learn", client_message_id: userId });
    const answers = event.kind === "answer_delivered" ? [event] : this.db.prepare("SELECT body FROM events WHERE owner=? AND question_id=? AND kind='answer_delivered'")
      .all(owner, event.question_id).map(row => JSON.parse(row.body));
    for (const answer of answers) {
      const seq = this.db.prepare("SELECT seq FROM events WHERE owner=? AND event_id=?").get(owner, answer.id).seq;
      stage({ ...answer, seq }, { session_id: answer.session_id, role: "assistant", content: answer.data.text,
        media: answer.data.media ?? [], source: "external_record:octos-learn", client_message_id: `learn:answer:${answer.id}`, thread_id: userId });
    }
  }

  listRuns(owner, { limit = 20, before = Number.MAX_SAFE_INTEGER, through = this.upperBound(owner) } = {}) {
    this.checkSnapshot(owner, through);
    const rows = this.db.prepare(`
      SELECT run_id,session_id,MAX(seq) AS updated_seq,
        MIN(question_preview) AS question_preview,
        MIN(occurred_at) AS first_occurred_at,
        MAX(course_key) AS course_key, MAX(course_digest) AS course_sha256,
        COUNT(DISTINCT CASE WHEN kind='question_submitted' THEN question_id END) AS question_count,
        MAX(CASE WHEN kind='run_started' THEN 1 ELSE 0 END) AS start_recorded,
        COUNT(DISTINCT CASE WHEN kind='beat_completed' THEN json_array(course_key,beat_id) END) AS completed_beats,
        COUNT(CASE WHEN kind='task_attempt' THEN 1 END) AS task_attempts
      FROM events WHERE owner=? AND seq<=? GROUP BY run_id
      HAVING updated_seq<? ORDER BY updated_seq DESC LIMIT ?
    `).all(owner, through, before, limit + 1);
    const page = rows.slice(0, limit);
    return { runs: page.map(({ course_key, course_sha256, ...row }) => ({ ...row,
      course: course_key ? (() => { const [kind,id,version] = JSON.parse(course_key); return { kind,id,version,...(course_sha256 ? {sha256:course_sha256} : {}) }; })() : null,
      start_recorded: Boolean(row.start_recorded) })), through,
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
    return { changes: rows.slice(0, limit).map(row => row.change_kind === "session_deleted"
      ? { seq: row.seq, session_id: row.run_id, change_kind: row.change_kind, received_at: row.received_at } : row), through, next_after: rows.length > limit ? rows[limit - 1].seq : null };
  }

  claimDeliveries(owner, limit = 10) {
    const now = Date.parse(this.now());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rows = this.db.prepare(`SELECT event_id,payload FROM delivery_tasks t WHERE owner=? AND payload IS NOT NULL
        AND (state='pending' OR (state='leased' AND lease_until<=?))
        AND (role='user' OR EXISTS(SELECT 1 FROM delivery_tasks u WHERE u.owner=t.owner
          AND u.question_id=t.question_id AND u.role='user' AND u.state='delivered'))
        ORDER BY seq LIMIT ?`).all(owner, now, limit);
      const tasks = rows.map(row => {
        const lease = randomUUID();
        this.db.prepare("UPDATE delivery_tasks SET state='leased',lease_id=?,lease_until=? WHERE owner=? AND event_id=?")
          .run(lease, now + 30000, owner, row.event_id);
        return { id: row.event_id, lease_id: lease, message: JSON.parse(row.payload) };
      });
      this.db.exec("COMMIT");
      return { tasks };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  acknowledgeDelivery(owner, id, lease, committedSeq) {
    const result = this.db.prepare(`UPDATE delivery_tasks SET state='delivered',committed_seq=?,lease_id=NULL,lease_until=NULL
      WHERE owner=? AND event_id=? AND state='leased' AND lease_id=?`).run(committedSeq, owner, id, lease);
    // A stale or cancelled lease cannot acknowledge a newly assigned task.
    return { id, recorded: Number(result.changes) === 1 };
  }

  deliveryStatus(owner) {
    return this.db.prepare("SELECT state,COUNT(*) AS count FROM delivery_tasks WHERE owner=? GROUP BY state").all(owner);
  }

  deliveryProbeSession(owner) {
    return this.db.prepare(`SELECT json_extract(payload,'$.session_id') AS session_id FROM delivery_tasks
      WHERE owner=? AND state IN ('pending','leased') AND payload IS NOT NULL ORDER BY seq LIMIT 1`).get(owner)?.session_id ?? null;
  }

  pendingSessionDeletions(owner) {
    return this.db.prepare("SELECT COUNT(*) AS n FROM deleted_sessions WHERE owner=? AND state IN ('pending','leased')").get(owner).n;
  }

  deleteSession(owner, sessionId, deleteOctos = false) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let prior = this.db.prepare("SELECT seq,state FROM deleted_sessions WHERE owner=? AND session_id=?").get(owner, sessionId);
      if (!prior) {
        const row = this.db.prepare("INSERT INTO changes(owner,run_id,change_kind,received_at) VALUES(?,?,'session_deleted',?)").run(owner, sessionId, this.now());
        prior = { seq: Number(row.lastInsertRowid), state: deleteOctos ? "pending" : "not_requested" };
        this.db.prepare("INSERT INTO deleted_sessions(owner,session_id,seq,state) VALUES(?,?,?,?)").run(owner, sessionId, prior.seq, prior.state);
        const runs = this.db.prepare("SELECT DISTINCT run_id FROM events WHERE owner=? AND session_id=?").all(owner, sessionId);
        for (const { run_id: run } of runs) {
          this.db.prepare("INSERT OR IGNORE INTO deleted_runs VALUES(?,?,?)").run(owner, run, prior.seq);
          this.db.prepare("UPDATE receipts SET deleted=1 WHERE owner=? AND run_id=?").run(owner, run);
          this.db.prepare("UPDATE delivery_tasks SET state='cancelled',payload=NULL,lease_id=NULL,lease_until=NULL WHERE owner=? AND run_id=?").run(owner, run);
          this.db.prepare("DELETE FROM course_materials WHERE owner=? AND run_id=?").run(owner, run);
          deleteAnalysisRun(this.db, owner, run);
        }
        this.db.prepare("DELETE FROM events WHERE owner=? AND session_id=?").run(owner, sessionId);
      } else if (deleteOctos && prior.state === "not_requested") {
        prior.state = "pending";
        this.db.prepare("UPDATE deleted_sessions SET state='pending' WHERE owner=? AND session_id=?").run(owner, sessionId);
      }
      this.db.exec("COMMIT");
      return { session_id: sessionId, seq: prior.seq, status: "deleted", octos_cleanup: prior.state };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  claimSessionDeletions(owner, limit = 10) {
    const now = Date.parse(this.now());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rows = this.db.prepare("SELECT session_id FROM deleted_sessions WHERE owner=? AND (state='pending' OR (state='leased' AND lease_until<=?)) ORDER BY seq LIMIT ?").all(owner, now, limit);
      const tasks = rows.map(row => {
        const lease_id = randomUUID();
        this.db.prepare("UPDATE deleted_sessions SET state='leased',lease_id=?,lease_until=? WHERE owner=? AND session_id=?").run(lease_id, now + 30000, owner, row.session_id);
        return { session_id: row.session_id, lease_id };
      });
      this.db.exec("COMMIT"); return { tasks };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  acknowledgeSessionDeletion(owner, sessionId, lease) {
    const result = this.db.prepare("UPDATE deleted_sessions SET state='completed',lease_id=NULL,lease_until=NULL WHERE owner=? AND session_id=? AND state='leased' AND lease_id=?").run(owner, sessionId, lease);
    return { recorded: Number(result.changes) === 1 };
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
        this.db.prepare("UPDATE delivery_tasks SET state='cancelled',payload=NULL,lease_id=NULL,lease_until=NULL WHERE owner=? AND run_id=?").run(owner, runId);
        this.db.prepare("DELETE FROM course_materials WHERE owner=? AND run_id=?").run(owner, runId);
        deleteAnalysisRun(this.db, owner, runId);
      }
      this.db.exec("COMMIT");
      return { run_id: runId, seq: prior.seq, status: "deleted" };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
