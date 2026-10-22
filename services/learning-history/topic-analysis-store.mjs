import { randomUUID } from "node:crypto";
import { canonicalHistoryJson, HistoryValidationError } from "./event-contract.mjs";
import { buildAnalysisInput, validateAnalysisResult, analysisHash } from "./topic-analysis.mjs";
import { TOPIC_RULES_VERSION, TOPIC_TAXONOMY } from "./topic-catalog.mjs";

export function createAnalysisSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS topic_analysis_settings(owner TEXT PRIMARY KEY,enabled INTEGER NOT NULL,max_daily_tasks INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS topic_analysis_jobs(
      owner TEXT NOT NULL,id TEXT NOT NULL,source_event_id TEXT NOT NULL,source_seq INTEGER NOT NULL,run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,rules_version TEXT NOT NULL,taxonomy_sha256 TEXT NOT NULL,revision INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',lease_id TEXT,lease_until INTEGER,input_sha256 TEXT,
      input_json TEXT,octos_session_id TEXT,octos_turn_id TEXT,started_at TEXT,error TEXT,
      PRIMARY KEY(owner,id),UNIQUE(owner,source_event_id,rules_version,taxonomy_sha256,revision));
    CREATE INDEX IF NOT EXISTS analysis_owner_state ON topic_analysis_jobs(owner,state,source_seq);
    CREATE TABLE IF NOT EXISTS topic_analysis_results(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL,job_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL,run_id TEXT NOT NULL,result_json TEXT NOT NULL,UNIQUE(owner,job_id));
    CREATE TABLE IF NOT EXISTS topic_analysis_units(owner TEXT NOT NULL,result_seq INTEGER NOT NULL,unit_id TEXT NOT NULL,
      kind TEXT NOT NULL,step_id TEXT,beat_id TEXT,status TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(owner,result_seq,unit_id));
    CREATE TABLE IF NOT EXISTS topic_analysis_links(owner TEXT NOT NULL,result_seq INTEGER NOT NULL,unit_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,quote TEXT NOT NULL,PRIMARY KEY(owner,result_seq,unit_id,topic_id));
    CREATE INDEX IF NOT EXISTS analysis_owner_topic ON topic_analysis_links(owner,topic_id,result_seq);`);
  db.exec("CREATE TABLE IF NOT EXISTS topic_analysis_starts(owner TEXT NOT NULL,job_id TEXT NOT NULL,started_at TEXT NOT NULL,PRIMARY KEY(owner,job_id));");
}

export function enqueueAnalysis(store, owner, eventId, revision = 1) {
  const row = store.db.prepare("SELECT event_id,seq,run_id,session_id,kind FROM events WHERE owner=? AND event_id=?").get(owner, eventId);
  if (!row || (row.kind !== "question_submitted" && (row.kind !== "course_delivered" || !store.courseMaterial(owner, eventId)))) return;
  const id = analysisHash([owner, eventId, TOPIC_RULES_VERSION, TOPIC_TAXONOMY.catalog_sha256, revision]);
  store.db.prepare(`INSERT OR IGNORE INTO topic_analysis_jobs(owner,id,source_event_id,source_seq,run_id,session_id,rules_version,taxonomy_sha256,revision)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(owner, id, row.event_id, row.seq, row.run_id, row.session_id, TOPIC_RULES_VERSION, TOPIC_TAXONOMY.catalog_sha256, revision);
  return id;
}

export class TopicAnalysisStore {
  constructor(history) { this.history = history; this.db = history.db; }
  settings(owner) { const row = this.db.prepare("SELECT enabled,max_daily_tasks FROM topic_analysis_settings WHERE owner=?").get(owner); return { enabled: Boolean(row?.enabled), max_daily_tasks: row?.max_daily_tasks ?? 0 }; }
  configure(owner, value) {
    if (!value || Object.keys(value).some(key => !["enabled", "max_daily_tasks"].includes(key)) || typeof value.enabled !== "boolean"
      || !Number.isSafeInteger(value.max_daily_tasks) || value.max_daily_tasks < (value.enabled ? 1 : 0) || value.max_daily_tasks > 20) throw new HistoryValidationError("Choose an explicit daily analysis task limit from 1 to 20");
    this.db.prepare("INSERT INTO topic_analysis_settings VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled,max_daily_tasks=excluded.max_daily_tasks")
      .run(owner, Number(value.enabled), value.max_daily_tasks);
    return this.settings(owner);
  }
  status(owner) {
    return { ...this.settings(owner), states: this.db.prepare("SELECT state,COUNT(*) AS count FROM topic_analysis_jobs WHERE owner=? GROUP BY state").all(owner),
      analysis_through: this.db.prepare("SELECT COALESCE(MAX(seq),0) AS n FROM topic_analysis_results WHERE owner=?").get(owner).n };
  }
  quotaUsed(owner) {
    const from = `${this.history.now().slice(0, 10)}T00:00:00.000Z`, until = new Date(Date.parse(from) + 86400000).toISOString();
    return this.db.prepare("SELECT COUNT(*) AS n FROM topic_analysis_starts WHERE owner=? AND started_at>=? AND started_at<?").get(owner, from, until).n;
  }
  seed(owner, after = 0) {
    const rows = this.db.prepare("SELECT event_id,seq FROM events WHERE owner=? AND seq>? AND kind IN ('question_submitted','course_delivered') ORDER BY seq LIMIT 100").all(owner, after);
    this.db.exec("BEGIN IMMEDIATE");
    try { for (const row of rows) enqueueAnalysis(this.history, owner, row.event_id); this.db.exec("COMMIT"); }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return { next_after: rows.length === 100 ? rows.at(-1).seq : null };
  }
  claim(owner) {
    if (!this.settings(owner).enabled) return { tasks: [], reason: "disabled" };
    const now = Date.parse(this.history.now());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.db.prepare("SELECT 1 FROM topic_analysis_jobs WHERE owner=? AND state='leased' AND lease_until>?").get(owner, now)) { this.db.exec("COMMIT"); return { tasks: [], reason: "active-task" }; }
      const quotaAvailable = this.quotaUsed(owner) < this.settings(owner).max_daily_tasks;
      // Unresolved executions are read-only reconciliation, never replacement
      // turns. Prefer unattempted material, then rotate older recovery attempts;
      // an old missing turn must not win every 5-minute coordinator retry.
      // An exhausted start quota still permits recovering existing executions.
      const job = this.db.prepare(`SELECT * FROM topic_analysis_jobs WHERE owner=? AND (rules_version=? OR octos_session_id IS NOT NULL) AND taxonomy_sha256=?
        AND (state='pending' OR (state IN ('leased','uncertain') AND lease_until<=?))
        AND (octos_session_id IS NOT NULL OR ?) ORDER BY COALESCE(lease_until,0),source_seq,revision LIMIT 1`)
        .get(owner, TOPIC_RULES_VERSION, TOPIC_TAXONOMY.catalog_sha256, now, Number(quotaAvailable));
      if (!job) { this.db.exec("COMMIT"); return { tasks: [], ...(quotaAvailable ? {} : { reason: "daily-task-limit" }) }; }
      let input;
      try { input = job.input_json ? JSON.parse(job.input_json) : buildAnalysisInput(this.history, owner, job.source_event_id); }
      catch (error) {
        if (!(error instanceof HistoryValidationError)) throw error;
        this.db.prepare("UPDATE topic_analysis_jobs SET state='blocked',error=? WHERE owner=? AND id=?").run(error.message, owner, job.id);
        this.db.exec("COMMIT"); return { tasks: [], reason: "unsupported-material" };
      }
      const lease = randomUUID();
      this.db.prepare("UPDATE topic_analysis_jobs SET state='leased',lease_id=?,lease_until=?,input_sha256=?,input_json=? WHERE owner=? AND id=?")
        .run(lease, now + 180000, input.input_sha256, canonicalHistoryJson(input), owner, job.id);
      this.db.exec("COMMIT");
      return { tasks: [{ id: job.id, lease_id: lease, input, execution: job.octos_session_id ? { session_id: job.octos_session_id, turn_id: job.octos_turn_id } : null }] };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  execution(owner, id, lease, value) {
    if (!value || Object.keys(value).some(key => !["session_id", "turn_id"].includes(key))
      || typeof value.session_id !== "string" || !/^learn-topic-[a-f0-9]{32}#peer-[a-z0-9-]+$/.test(value.session_id)
      || typeof value.turn_id !== "string" || !/^[a-f0-9-]{36}$/.test(value.turn_id)) throw new HistoryValidationError("Invalid Octos analysis execution");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const job = this.db.prepare("SELECT * FROM topic_analysis_jobs WHERE owner=? AND id=? AND state='leased' AND lease_id=?").get(owner, id, lease);
      if (!job) { this.db.exec("COMMIT"); return { recorded: false }; }
      if (job.octos_session_id) {
        this.db.exec("COMMIT"); return { recorded: job.octos_session_id === value.session_id && job.octos_turn_id === value.turn_id };
      }
      const settings = this.settings(owner), used = this.quotaUsed(owner);
      if (!settings.enabled || used >= settings.max_daily_tasks) { this.db.exec("COMMIT"); return { recorded: false, reason: "daily-task-limit" }; }
      this.db.prepare("UPDATE topic_analysis_jobs SET octos_session_id=?,octos_turn_id=?,started_at=? WHERE owner=? AND id=?")
        .run(value.session_id, value.turn_id, this.history.now(), owner, id);
      this.db.prepare("INSERT INTO topic_analysis_starts VALUES(?,?,?)").run(owner, id, this.history.now());
      this.db.exec("COMMIT"); return { recorded: true };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  complete(owner, id, lease, candidate) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const job = this.db.prepare("SELECT * FROM topic_analysis_jobs WHERE owner=? AND id=?").get(owner, id);
      if (!job || !job.octos_session_id || job.lease_id !== lease || !["leased", "complete"].includes(job.state)) { this.db.exec("COMMIT"); return { recorded: false }; }
      const input = JSON.parse(job.input_json);
      if (input.input_sha256 !== job.input_sha256) throw new HistoryValidationError("Analysis input changed; result is not accepted");
      const result = canonicalHistoryJson(validateAnalysisResult(input, candidate));
      const prior = this.db.prepare("SELECT result_json FROM topic_analysis_results WHERE owner=? AND job_id=?").get(owner, id);
      if (prior && prior.result_json !== result) throw new HistoryValidationError("Conflicting analysis result; original retained");
      if (!prior) {
        const seq = Number(this.db.prepare("INSERT INTO topic_analysis_results(owner,job_id,source_event_id,run_id,result_json) VALUES(?,?,?,?,?)").run(owner, id, job.source_event_id, job.run_id, result).lastInsertRowid);
        for (const unit of JSON.parse(result).units) {
          const source = input.units.find(item => item.unit_id === unit.unit_id);
          this.db.prepare("INSERT INTO topic_analysis_units VALUES(?,?,?,?,?,?,?,?)").run(owner, seq, unit.unit_id, source.kind, source.step_id ?? null, source.beat_id ?? null, unit.status, unit.reason);
          for (const topic of unit.topics) this.db.prepare("INSERT INTO topic_analysis_links VALUES(?,?,?,?,?)").run(owner, seq, unit.unit_id, topic.topic_id, topic.quote);
        }
      }
      this.db.prepare("UPDATE topic_analysis_jobs SET state='complete',error=NULL WHERE owner=? AND id=?").run(owner, id);
      this.db.exec("COMMIT"); return { recorded: true };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  pause(owner, id, lease, reason = "outcome-unknown") {
    return { recorded: Number(this.db.prepare("UPDATE topic_analysis_jobs SET state=CASE WHEN octos_session_id IS NULL THEN 'pending' ELSE 'uncertain' END,lease_until=?,error=? WHERE owner=? AND id=? AND state='leased' AND lease_id=?")
      .run(Date.parse(this.history.now()) + 180000, String(reason).slice(0, 256), owner, id, lease).changes) > 0 };
  }
  reject(owner, id, lease) {
    return { recorded: Number(this.db.prepare("UPDATE topic_analysis_jobs SET state='blocked',error='invalid-analysis-result' WHERE owner=? AND id=? AND state='leased' AND lease_id=?")
      .run(owner, id, lease).changes) > 0 };
  }
  reanalyze(owner, eventId) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const latest = this.db.prepare("SELECT MAX(revision) AS n FROM topic_analysis_jobs WHERE owner=? AND source_event_id=? AND rules_version=? AND taxonomy_sha256=?")
        .get(owner, eventId, TOPIC_RULES_VERSION, TOPIC_TAXONOMY.catalog_sha256).n ?? 0;
      const id = enqueueAnalysis(this.history, owner, eventId, latest + 1);
      // Explicit reanalysis can replace an unresolved attempt. Otherwise its
      // conservative reconciliation would keep reclaiming the older job and
      // prevent the newly requested revision from ever running. Old completed
      // results remain until a newer result is actually saved.
      if (id) this.db.prepare("UPDATE topic_analysis_jobs SET state='blocked',error='superseded-by-explicit-reanalysis' WHERE owner=? AND source_event_id=? AND id<>? AND state IN ('pending','leased','uncertain')")
        .run(owner, eventId, id);
      this.db.exec("COMMIT"); return { id: id ?? null };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}

export function deleteAnalysisRun(db, owner, runId) {
  const results = "SELECT seq FROM topic_analysis_results WHERE owner=? AND run_id=?";
  db.prepare(`DELETE FROM topic_analysis_links WHERE owner=? AND result_seq IN (${results})`).run(owner, owner, runId);
  db.prepare(`DELETE FROM topic_analysis_units WHERE owner=? AND result_seq IN (${results})`).run(owner, owner, runId);
  db.prepare("DELETE FROM topic_analysis_results WHERE owner=? AND run_id=?").run(owner, runId);
  db.prepare("DELETE FROM topic_analysis_jobs WHERE owner=? AND run_id=?").run(owner, runId);
}
