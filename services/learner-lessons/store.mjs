import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { checkLearnerPackage } from "./package-check.mjs";

// Lessons learners teach: the working draft (the recording and its frozen
// handwriting) and the checked package of the version they saved. Every
// state change goes through TRANSITIONS and is kept in the lesson's log.
//
//   draft ──save──▶ submitted ──approve──▶ approved ──publish──▶ published
//                       ▲  └──────────────┴──withdraw─────────────┴──▶ withdrawn
//                       └──────────────────── save again ─────────────────┘
//
// Phase 1 (only the learner sees their lessons) offers save, delete and
// export. Approving and publishing need a parent or teacher (M7); the rules
// are here so that phase only adds who may act, not what may happen.
export const LESSON_STATES = Object.freeze(["draft", "submitted", "approved", "published", "withdrawn"]);
export const TRANSITIONS = Object.freeze({
  save: { from: ["draft", "submitted", "approved", "published", "withdrawn"], to: "submitted", actors: ["owner"] },
  approve: { from: ["submitted"], to: "approved", actors: ["reviewer"] },
  publish: { from: ["approved"], to: "published", actors: ["owner", "reviewer"] },
  withdraw: { from: ["submitted", "approved", "published"], to: "withdrawn", actors: ["owner", "reviewer"] },
});
export const LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const RECORDING_SCHEMA = "octos.learner-recording.v1";
export const DRAFT_MAX_BYTES = 8 * 1024 * 1024;

export class LessonError extends Error { constructor(status, message) { super(message); this.status = status; } }
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = data => createHash("sha256").update(data).digest("hex");

/** The run and event a saved lesson records in the learning history. */
export function taughtEvent(lesson, occurredAt) {
  return {
    version: 1, id: `taught:${lesson.lesson_id}:${lesson.content_sha256.slice(0, 16)}`, kind: "lesson_taught", occurred_at: occurredAt,
    device_id: "learner-lessons", session_id: "learner-lessons", run_id: `taught:${lesson.lesson_id}`,
    data: { lesson_id: lesson.lesson_id, ...(lesson.star_topic_id ? { topic_id: lesson.star_topic_id } : {}),
      cards: lesson.cards, practice_tasks: lesson.practice_tasks, content_sha256: lesson.content_sha256 },
  };
}

function checkDraft(lessonId, recording, ink) {
  if (!object(recording) || recording.schema !== RECORDING_SCHEMA) throw new LessonError(400, "Unknown recording schema");
  if (recording.id !== lessonId) throw new LessonError(400, "The recording belongs to a different lesson");
  if (!object(recording.topic) || typeof recording.topic.text !== "string" || !recording.topic.text.trim() || recording.topic.text.length > 200) throw new LessonError(400, "Invalid lesson topic");
  const star = recording.topic.starTopicId;
  if (star !== undefined && (typeof star !== "string" || !/^mt_[A-Za-z0-9_-]{1,64}$/.test(star))) throw new LessonError(400, "Invalid star map topic");
  if (!Array.isArray(recording.cards) || recording.cards.length > 40) throw new LessonError(400, "Invalid lesson cards");
  if (!object(ink) || Object.entries(ink).some(([key, value]) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key) || !object(value) || typeof value.svg !== "string")) {
    throw new LessonError(400, "Invalid handwriting");
  }
}

export class LearnerLessonStore {
  constructor(path, { now = () => new Date().toISOString() } = {}) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.now = now;
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS learner_lessons(
        owner TEXT NOT NULL, lesson_id TEXT NOT NULL, state TEXT NOT NULL,
        title TEXT NOT NULL, star_topic_id TEXT, revision INTEGER NOT NULL,
        draft_json TEXT NOT NULL, draft_sha256 TEXT NOT NULL,
        package BLOB, content_sha256 TEXT, package_bytes INTEGER, language TEXT,
        cards INTEGER, practice_tasks INTEGER, author_json TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, saved_at TEXT,
        saved_draft_sha256 TEXT, taught_recorded INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(owner, lesson_id)
      );
      CREATE TABLE IF NOT EXISTS learner_lesson_log(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, lesson_id TEXT NOT NULL,
        action TEXT NOT NULL, from_state TEXT NOT NULL, to_state TEXT NOT NULL,
        actor TEXT NOT NULL, content_sha256 TEXT, at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS learner_lesson_log_lesson ON learner_lesson_log(owner, lesson_id, seq);
      -- A deleted lesson's history run still to remove, kept until the history store confirms.
      CREATE TABLE IF NOT EXISTS learner_lesson_history_deletions(
        owner TEXT NOT NULL, run_id TEXT NOT NULL, PRIMARY KEY(owner, run_id)
      );
    `);
  }
  close() { this.db.close(); }
  rollback() { try { this.db.exec("ROLLBACK"); } catch { /* no open transaction */ } }

  row(owner, lessonId) { return this.db.prepare("SELECT * FROM learner_lessons WHERE owner=? AND lesson_id=?").get(owner, lessonId); }
  require(owner, lessonId) {
    const row = this.row(owner, lessonId);
    if (!row) throw new LessonError(404, "No such lesson");
    return row;
  }

  summary(row) {
    return {
      lesson_id: row.lesson_id, state: row.state, title: row.title, star_topic_id: row.star_topic_id, revision: row.revision,
      created_at: row.created_at, updated_at: row.updated_at, saved_at: row.saved_at,
      changed_since_saved: Boolean(row.content_sha256) && row.saved_draft_sha256 !== row.draft_sha256,
      saved: row.content_sha256 ? { content_sha256: row.content_sha256, bytes: row.package_bytes, language: row.language,
        cards: row.cards, practice_tasks: row.practice_tasks, author: JSON.parse(row.author_json) } : null,
    };
  }

  list(owner) {
    return this.db.prepare("SELECT * FROM learner_lessons WHERE owner=? ORDER BY updated_at DESC, lesson_id").all(owner).map(row => this.summary(row));
  }

  read(owner, lessonId) {
    const row = this.require(owner, lessonId);
    const draft = JSON.parse(row.draft_json);
    return { ...this.summary(row), recording: draft.recording, ink: draft.ink };
  }

  /** Saves the working draft. `baseRevision` is the revision the device last saw, or null for a new lesson. */
  putDraft(owner, lessonId, { base_revision: baseRevision, recording, ink }) {
    if (!LESSON_ID.test(lessonId)) throw new LessonError(400, "Invalid lesson id");
    checkDraft(lessonId, recording, ink);
    const json = JSON.stringify({ recording, ink });
    if (Buffer.byteLength(json) > DRAFT_MAX_BYTES) throw new LessonError(413, "Lesson draft too large");
    const digest = sha256(json), now = this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.row(owner, lessonId);
      if ((row?.revision ?? null) !== baseRevision) {
        this.db.exec("ROLLBACK");
        return { status: "conflict", revision: row?.revision ?? null };
      }
      if (row && row.draft_sha256 === digest) { this.db.exec("ROLLBACK"); return { status: "unchanged", revision: row.revision }; }
      const title = recording.topic.text.trim(), star = recording.topic.starTopicId ?? null;
      if (row) {
        this.db.prepare("UPDATE learner_lessons SET title=?,star_topic_id=?,revision=revision+1,draft_json=?,draft_sha256=?,updated_at=? WHERE owner=? AND lesson_id=?")
          .run(title, star, json, digest, now, owner, lessonId);
      } else {
        this.db.prepare(`INSERT INTO learner_lessons(owner,lesson_id,state,title,star_topic_id,revision,draft_json,draft_sha256,created_at,updated_at)
          VALUES(?,?,'draft',?,?,1,?,?,?,?)`).run(owner, lessonId, title, star, json, digest, now, now);
      }
      this.db.exec("COMMIT");
      return { status: "saved", revision: (row?.revision ?? 0) + 1 };
    } catch (error) { this.rollback(); throw error; }
  }

  /** Moves a lesson along TRANSITIONS; refuses a change the rules do not allow for this actor. */
  transition(owner, lessonId, action, actor, apply = () => {}) {
    const rule = TRANSITIONS[action];
    if (!rule) throw new LessonError(400, "Unknown lesson action");
    if (!rule.actors.includes(actor)) throw new LessonError(403, `Only ${rule.actors.join(" or ")} may ${action} a lesson`);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.require(owner, lessonId);
      if (!rule.from.includes(row.state)) throw new LessonError(409, `A ${row.state} lesson cannot be ${action === "save" ? "saved" : `${action}d`}`);
      const now = this.now();
      const changes = apply(row, now) ?? {};
      const fields = { ...changes, state: rule.to, updated_at: now };
      this.db.prepare(`UPDATE learner_lessons SET ${Object.keys(fields).map(key => `${key}=?`).join(",")} WHERE owner=? AND lesson_id=?`)
        .run(...Object.values(fields), owner, lessonId);
      this.db.prepare("INSERT INTO learner_lesson_log(owner,lesson_id,action,from_state,to_state,actor,content_sha256,at) VALUES(?,?,?,?,?,?,?,?)")
        .run(owner, lessonId, action, row.state, rule.to, actor, changes.content_sha256 ?? row.content_sha256, now);
      this.db.exec("COMMIT");
      return this.summary(this.row(owner, lessonId));
    } catch (error) { this.rollback(); throw error; }
  }

  /** Saves the checked package as the lesson's saved version. */
  save(owner, lessonId, archive) {
    this.require(owner, lessonId);
    const checked = checkLearnerPackage(archive, lessonId);
    return this.transition(owner, lessonId, "save", "owner", (row, now) => ({ saved_draft_sha256: row.draft_sha256,
      package: archive, content_sha256: checked.content_sha256, package_bytes: checked.bytes, language: checked.language,
      cards: checked.cards, practice_tasks: checked.practice_tasks, author_json: JSON.stringify(checked.author), saved_at: now, taught_recorded: 0,
    }));
  }

  packageOf(owner, lessonId) {
    const row = this.require(owner, lessonId);
    if (!row.package) throw new LessonError(404, "This lesson has not been saved yet");
    return { archive: Buffer.from(row.package), content_sha256: row.content_sha256 };
  }

  /** Everything the service keeps about one lesson, except the package bytes (exported separately). */
  exportLesson(owner, lessonId) {
    const lesson = this.read(owner, lessonId);
    const log = this.db.prepare("SELECT action,from_state,to_state,actor,content_sha256,at FROM learner_lesson_log WHERE owner=? AND lesson_id=? ORDER BY seq").all(owner, lessonId);
    return { schema: "octos.learner-lesson-export.v1", exported_at: this.now(), lesson, log };
  }

  /** Removes the lesson and its log; its history run is removed by the caller and remembered until then. */
  delete(owner, lessonId) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.require(owner, lessonId);
      this.db.prepare("DELETE FROM learner_lessons WHERE owner=? AND lesson_id=?").run(owner, lessonId);
      this.db.prepare("DELETE FROM learner_lesson_log WHERE owner=? AND lesson_id=?").run(owner, lessonId);
      this.db.prepare("INSERT OR IGNORE INTO learner_lesson_history_deletions(owner,run_id) VALUES(?,?)").run(owner, `taught:${lessonId}`);
      this.db.exec("COMMIT");
      return { lesson_id: lessonId, deleted: true };
    } catch (error) { this.rollback(); throw error; }
  }

  /** Brings the learning history in line with the saved lessons: records each
   * saved version once and removes deleted lessons' runs. Safe to repeat. */
  reconcileHistory(owner, history) {
    for (const { run_id: runId } of this.db.prepare("SELECT run_id FROM learner_lesson_history_deletions WHERE owner=?").all(owner)) {
      history.deleteRun(owner, runId);
      this.db.prepare("DELETE FROM learner_lesson_history_deletions WHERE owner=? AND run_id=?").run(owner, runId);
    }
    for (const row of this.db.prepare("SELECT * FROM learner_lessons WHERE owner=? AND taught_recorded=0 AND content_sha256 IS NOT NULL").all(owner)) {
      const [result] = history.append(owner, [taughtEvent(row, row.saved_at)]).results;
      if (!["accepted", "exists"].includes(result.status)) throw new Error(`The taught lesson could not be recorded (${result.status})`);
      this.db.prepare("UPDATE learner_lessons SET taught_recorded=1 WHERE owner=? AND lesson_id=? AND content_sha256=?").run(owner, row.lesson_id, row.content_sha256);
    }
  }
}
