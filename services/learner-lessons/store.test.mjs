import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "../learning-history/store.mjs";
import { LearnerLessonStore, LessonError, TRANSITIONS } from "./store.mjs";
import { checkLearnerPackage, LearnerPackageError } from "./package-check.mjs";
import { makePackage, mouthTrack } from "./test-package.mjs";

const recording = (id = "rec-one", topic = { text: "Slope", type: "on_map_lit", starTopicId: "mt_slope" }) =>
  ({ schema: "octos.learner-recording.v1", id, topic, goals: ["Read slope"], cards: [], createdAt: "x", updatedAt: "x" });

let lessons, history;
beforeEach(() => { lessons = new LearnerLessonStore(":memory:", { now: () => "2026-11-02T10:00:00.000Z" }); history = new HistoryStore(":memory:"); });
afterEach(() => { lessons.close(); history.close(); });

test("a package is kept only when every file matches its manifest", () => {
  assert.equal(checkLearnerPackage(makePackage(), "rec-one").cards, 2);
  // Now a card is a step, and its beats are runs of sentences.
  assert.equal(checkLearnerPackage(makePackage({ steps: [
    { id: "l:step:card-1", beats: [{ id: "b1", narration: { text: "Hi" } }, { id: "b3" }] },
    { id: "l:step:card-2", beats: [{ id: "b2" }] },
    { id: "l:step:card-3", beats: [{ id: "b4" }] },
    { id: "l:step:card-3-part2", beats: [{ id: "b5" }] },
  ] }), "rec-one").cards, 3);
  assert.equal(checkLearnerPackage(makePackage({ tasks: 2 }), "rec-one").practice_tasks, 2);
  const refuse = (archive, pattern) => assert.throws(() => checkLearnerPackage(archive, "rec-one"), error => error instanceof LearnerPackageError && pattern.test(error.message));
  refuse(makePackage({ lessonId: "rec-two" }), /different lesson/);
  refuse(makePackage({ tamper: (_manifest, entries) => { entries["narration/1.mp3"] = Buffer.from("changed"); } }), /does not match/);
  refuse(makePackage({ extra: { "voice/raw.wav": Buffer.from("RIFF") } }), /does not list/);
  refuse(makePackage({ tamper: manifest => { manifest.files[1].path = "narration/../x.mp3"; } }), /may not hold/);
  refuse(makePackage({ tamper: manifest => { manifest.contentSha256 = "0".repeat(64); } }), /content hash/);
  refuse(makePackage({ tamper: manifest => { manifest.author.real_name = "Jordan"; } }), /author/);
  refuse(Buffer.from("not a zip"), /Not a lesson package/);
  refuse(makePackage({ tamper: manifest => { manifest.learnerPhoto = "x"; } }), /unknown fields/);
  refuse(makePackage({ tamper: manifest => { manifest.author.avatar_ref = "avatar:other"; } }), /author does not match/);
  refuse(makePackage({ tamper: manifest => { manifest.narration[0].textSha256 = "0".repeat(64); } }), /narration does not match/);
  refuse(makePackage({ tamper: manifest => { manifest.narration = []; } }), /refers to its files wrongly/);
  // A v1 package cannot carry mouth files, and mouth fields do not make a v1 package v2.
  refuse(makePackage({ mouth: true, tamper: manifest => { manifest.schema = "octos.learner-lesson-package.v1"; } }), /Unknown lesson package schema/);
  refuse(makePackage({ tamper: (manifest, entries, { sha }) => {
    entries["mouth/1.json"] = Buffer.from("{}");
    manifest.files.push({ path: "mouth/1.json", sha256: sha(entries["mouth/1.json"]), bytes: 2, mediaType: "application/json", role: "lip-sync" });
    return "rehash";
  } }), /may not hold/);
});

test("a v2 package keeps final-audio mouth motion only when it matches its narration", () => {
  assert.equal(checkLearnerPackage(makePackage({ mouth: true }), "rec-one").cards, 2);
  const refuse = (options, pattern) => assert.throws(() => checkLearnerPackage(makePackage({ mouth: true, ...options }), "rec-one"),
    error => error instanceof LearnerPackageError && pattern.test(error.message));
  const track = changes => ({ ...mouthTrack(Buffer.from("ID3 fake mp3")), ...changes });
  refuse({ tamper: manifest => { delete manifest.requiredCapabilities; } }, /Invalid mouth motion/);
  refuse({ tamper: manifest => { manifest.requiredCapabilities = ["avatar-lip-sync-v1", "avatar-camera-v1"]; } }, /Invalid mouth motion/);
  refuse({ tamper: manifest => { manifest.lipSync = []; } }, /Invalid mouth motion/);
  refuse({ tamper: manifest => { manifest.lipSync[0].beatId = "b2"; } }, /Invalid mouth motion/);
  refuse({ tamper: manifest => { manifest.lipSync[0].textSha256 = "1".repeat(64); } }, /does not match its narration/);
  refuse({ tamper: manifest => { manifest.lipSync[0].audioSha256 = "1".repeat(64); } }, /does not match its narration/);
  refuse({ tamper: manifest => { manifest.lipSync[0].file = "narration/1.mp3"; } }, /refers to its files wrongly/);
  // The track inside the file is checked too, not only its hash.
  refuse({ mouthTrack: track({ audioSha256: "2".repeat(64) }) }, /does not match its narration/);
  refuse({ mouthTrack: track({ durationMs: 2_000, keys: [{ timeMs: 0, channels: {} }, { timeMs: 2_000, channels: {} }] }) }, /invalid mouth track/);
  refuse({ mouthTrack: track({ keys: [{ timeMs: 0, channels: {} }, { timeMs: 900, channels: { eyeBlinkLeft: 1 } }] }) }, /invalid mouth track/);
  refuse({ mouthTrack: track({ keys: [{ timeMs: 0, channels: {} }, { timeMs: 900, channels: { jawOpen: 1.5 } }] }) }, /invalid mouth track/);
  refuse({ mouthTrack: track({ keys: [{ timeMs: 0, channels: {} }, { timeMs: 0, channels: {} }, { timeMs: 900, channels: {} }] }) }, /invalid mouth track/);
  refuse({ mouthTrack: track({ keys: [{ timeMs: 10, channels: {} }, { timeMs: 900, channels: {} }] }) }, /invalid mouth track/);
  refuse({ mouthTrack: track({ method: "camera-v1" }) }, /invalid mouth track/);
  refuse({ mouthTrack: track({ head: [0, 0, 0] }) }, /invalid mouth track/);
});

test("narration may be any audio type the app writes, with a matching name", () => {
  const as = (path, mediaType) => makePackage({ tamper: (manifest, entries) => {
    entries[path] = entries["narration/1.mp3"]; delete entries["narration/1.mp3"];
    Object.assign(manifest.files[1], { path, mediaType }); manifest.narration[0].file = path;
    return "rehash";
  } });
  assert.equal(checkLearnerPackage(as("narration/1.m4a", "audio/mp4"), "rec-one").cards, 2);
  assert.equal(checkLearnerPackage(as("narration/1.wav", "audio/wav"), "rec-one").cards, 2);
  assert.throws(() => checkLearnerPackage(as("narration/1.wav", "audio/mpeg"), "rec-one"), /may not hold/);
});

test("drafts save with revisions and refuse a stale device", () => {
  assert.deepEqual(lessons.putDraft("alice", "rec-one", { base_revision: null, recording: recording(), ink: {} }), { status: "saved", revision: 1 });
  assert.equal(lessons.putDraft("alice", "rec-one", { base_revision: null, recording: recording(), ink: {} }).status, "conflict");
  assert.equal(lessons.putDraft("alice", "rec-one", { base_revision: 1, recording: recording(), ink: {} }).status, "unchanged");
  const changed = { ...recording(), goals: ["Find slope"] };
  assert.deepEqual(lessons.putDraft("alice", "rec-one", { base_revision: 1, recording: changed, ink: { "ink-snap:rec-one-card-1-t1-n1@v1": { svg: "<svg/>", width: 1, height: 1 } } }), { status: "saved", revision: 2 });
  // Handwriting is keyed by its OLL snapshot id; anything else is refused.
  assert.throws(() => lessons.putDraft("alice", "rec-one", { base_revision: 2, recording: changed, ink: { "ink-1": { svg: "<svg/>", width: 1, height: 1 } } }), /Invalid handwriting/);
  assert.deepEqual(lessons.putDraft("alice", "rec-one", { base_revision: 1, recording: changed, ink: {} }), { status: "conflict", revision: 2 });
  assert.equal(lessons.read("alice", "rec-one").ink["ink-snap:rec-one-card-1-t1-n1@v1"].svg, "<svg/>");
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
