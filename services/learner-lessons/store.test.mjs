import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "../learning-history/store.mjs";
import { LearnerLessonStore, LessonError, TRANSITIONS } from "./store.mjs";
import { checkLearnerPackage, LearnerPackageError } from "./package-check.mjs";
import { makePackage } from "./test-package.mjs";

const recording = (id = "rec-one", topic = { text: "Slope", type: "on_map_lit", starTopicId: "mt_slope" }) =>
  ({ schema: "octos.learner-recording.v1", id, topic, goals: ["Read slope"], cards: [], createdAt: "x", updatedAt: "x" });

let lessons, history;
beforeEach(() => { lessons = new LearnerLessonStore(":memory:", { now: () => "2026-11-02T10:00:00.000Z" }); history = new HistoryStore(":memory:"); });
afterEach(() => { lessons.close(); history.close(); });

test("a package is kept only when every file matches its manifest", () => {
  assert.equal(checkLearnerPackage(makePackage(), "rec-one").cards, 2);
  assert.equal(checkLearnerPackage(makePackage({ tasks: 2 }), "rec-one").practice_tasks, 2);
  const refuse = (archive, pattern) => assert.throws(() => checkLearnerPackage(archive, "rec-one"), error => error instanceof LearnerPackageError && pattern.test(error.message));
  refuse(makePackage({ lessonId: "rec-two" }), /different lesson/);
  refuse(makePackage({ tamper: (_manifest, entries) => { entries["narration/1.mp3"] = Buffer.from("changed"); } }), /does not match/);
  refuse(makePackage({ extra: { "voice/raw.wav": Buffer.from("RIFF") } }), /does not list/);
  refuse(makePackage({ tamper: manifest => { manifest.files[1].path = "narration/../x.mp3"; } }), /may not hold/);
  refuse(makePackage({ tamper: manifest => { manifest.contentSha256 = "0".repeat(64); } }), /content hash/);
  refuse(makePackage({ tamper: manifest => { manifest.author.real_name = "Jordan"; } }), /author/);
  refuse(Buffer.from("not a zip"), /Not a lesson package/);
});

test("drafts save with revisions and refuse a stale device", () => {
  assert.deepEqual(lessons.putDraft("alice", "rec-one", { base_revision: null, recording: recording(), ink: {} }), { status: "saved", revision: 1 });
  assert.equal(lessons.putDraft("alice", "rec-one", { base_revision: null, recording: recording(), ink: {} }).status, "conflict");
  assert.equal(lessons.putDraft("alice", "rec-one", { base_revision: 1, recording: recording(), ink: {} }).status, "unchanged");
  const changed = { ...recording(), goals: ["Find slope"] };
  assert.deepEqual(lessons.putDraft("alice", "rec-one", { base_revision: 1, recording: changed, ink: { "ink-1": { svg: "<svg/>", width: 1, height: 1 } } }), { status: "saved", revision: 2 });
  assert.deepEqual(lessons.putDraft("alice", "rec-one", { base_revision: 1, recording: changed, ink: {} }), { status: "conflict", revision: 2 });
  assert.equal(lessons.read("alice", "rec-one").ink["ink-1"].svg, "<svg/>");
  assert.throws(() => lessons.read("bob", "rec-one"), error => error instanceof LessonError && error.status === 404);
  assert.throws(() => lessons.putDraft("alice", "rec-one", { base_revision: 2, recording: recording("rec-two"), ink: {} }), /different lesson/);
  assert.equal(lessons.list("alice")[0].state, "draft");
});

test("the state machine allows only its transitions, and only for the right actor", () => {
  lessons.putDraft("alice", "rec-one", { base_revision: null, recording: recording(), ink: {} });
  assert.throws(() => lessons.transition("alice", "rec-one", "withdraw", "owner"), error => error.status === 409);
  const saved = lessons.save("alice", "rec-one", makePackage());
  assert.equal(saved.state, "submitted");
  assert.equal(saved.saved.cards, 2);
  assert.equal(saved.changed_since_saved, false);
  assert.throws(() => lessons.transition("alice", "rec-one", "approve", "owner"), error => error.status === 403);
  assert.throws(() => lessons.transition("alice", "rec-one", "publish", "owner"), error => error.status === 409);
  assert.equal(lessons.transition("alice", "rec-one", "approve", "reviewer").state, "approved");
  assert.equal(lessons.transition("alice", "rec-one", "publish", "owner").state, "published");
  // Saving a changed lesson again needs approval again.
  assert.equal(lessons.save("alice", "rec-one", makePackage({ tasks: 0 })).state, "submitted");
  assert.equal(lessons.transition("alice", "rec-one", "withdraw", "owner").state, "withdrawn");
  assert.equal(lessons.save("alice", "rec-one", makePackage()).state, "submitted");
  assert.deepEqual(lessons.exportLesson("alice", "rec-one").log.map(row => `${row.action}:${row.from_state}>${row.to_state}`),
    ["save:draft>submitted", "approve:submitted>approved", "publish:approved>published", "save:published>submitted", "withdraw:submitted>withdrawn", "save:withdrawn>submitted"]);
  lessons.putDraft("alice", "rec-one", { base_revision: 1, recording: { ...recording(), goals: ["Changed"] }, ink: {} });
  assert.equal(lessons.list("alice")[0].changed_since_saved, true);
  assert.equal(Object.keys(TRANSITIONS).every(action => TRANSITIONS[action].from.every(state => typeof state === "string")), true);
});

test("saving records one taught lesson per saved version; deleting removes it", () => {
  lessons.putDraft("alice", "rec-one", { base_revision: null, recording: recording(), ink: {} });
  lessons.save("alice", "rec-one", makePackage());
  lessons.reconcileHistory("alice", history);
  lessons.reconcileHistory("alice", history);
  const taught = () => history.runEvents("alice", "taught:rec-one").events.map(row => row.event);
  assert.equal(taught().length, 1);
  assert.deepEqual(taught()[0].data, { lesson_id: "rec-one", topic_id: "mt_slope", cards: 2, practice_tasks: 1, content_sha256: lessons.list("alice")[0].saved.content_sha256 });
  lessons.save("alice", "rec-one", makePackage({ tasks: 0 }));
  lessons.reconcileHistory("alice", history);
  assert.equal(taught().length, 2);
  lessons.delete("alice", "rec-one");
  lessons.reconcileHistory("alice", history);
  assert.equal(taught().length, 0);
  assert.deepEqual(lessons.list("alice"), []);
  assert.equal(lessons.db.prepare("SELECT COUNT(*) AS n FROM learner_lesson_log").get().n, 0);
});

test("a history outage keeps the lesson and records it on a later request", () => {
  lessons.putDraft("alice", "rec-one", { base_revision: null, recording: recording(), ink: {} });
  lessons.save("alice", "rec-one", makePackage());
  assert.throws(() => lessons.reconcileHistory("alice", { append() { throw new Error("busy"); }, deleteRun() {} }), /busy/);
  assert.equal(lessons.list("alice")[0].state, "submitted");
  lessons.reconcileHistory("alice", history);
  assert.equal(history.runEvents("alice", "taught:rec-one").events.length, 1);
});
