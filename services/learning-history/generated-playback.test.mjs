import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HistoryStore, HistorySnapshotChanged } from "./store.mjs";
import { analysisHash } from "./topic-analysis.mjs";
import { queryRunCoverage } from "./topic-query.mjs";

const course = { kind: "generated", id: "generated-question", version: "one" };
const common = { version: 1, occurred_at: "2026-10-22T00:00:00.000Z", device_id: "tv", session_id: "board", run_id: "run", question_id: "question", course };
const open = { event: "lesson.open", lesson_id: "lesson", lesson: { title: "Test", variables: [] } };
const beat = (id, text) => ({ id, narration: { text }, stage: { before_speech: [], during_speech: [], after_speech: [] } });
const step = (id, beats) => ({ event: "lesson.step", lesson_id: "lesson", step: { id, purpose: "Test", beats } });
const close = { event: "lesson.close", lesson_id: "lesson", result: { summary: "Test" } };
const first = beat("one", "Slope direction"), second = beat("two", "Y intercept");
function delivery(store, id, events, status = events.at(-1).event === "lesson.close" ? "complete" : "partial", owner = "alice", extra = {}) {
  const json = JSON.stringify(events), hash = analysisHash(json);
  const event = { ...common, id, kind: "course_delivered", ...extra, data: { artifact: "lesson.jsonl", status, snapshot_sha256: hash, event_count: events.length } };
  assert.equal(store.append(owner, [event], [{ event_id: id, snapshot_json: json }]).results[0].status, "accepted");
  return hash;
}
function played(store, id, hash, beatId = "one", extra = {}, owner = "alice") {
  return store.append(owner, [{ ...common, id, log_id: "log", kind: "beat_completed", ...extra,
    data: { step_id: "section", beat_id: beatId, presentation: "text", ...(hash ? { delivery_sha256: hash } : {}) } }]);
}
const coverage = (store, owner = "alice", run = "run", options) => queryRunCoverage(store, owner, run, options);

test("a final delivered course counts unchanged streamed beats and distinct actual playback, without requiring topic analysis", () => {
  const store = new HistoryStore(":memory:");
  try {
    const partial = delivery(store, "part", [open, step("section", [first])]);
    played(store, "played-part", partial);
    assert.equal(coverage(store).course_playback, null);
    const complete = delivery(store, "final", [open, step("section", [first, second]), close]);
    assert.deepEqual(coverage(store).course_playback, { required_beats: 2, played_beats: 1, complete: false });
    played(store, "played-second", complete, "two"); played(store, "replay", partial);
    const result = coverage(store);
    assert.deepEqual(result.course_playback, { required_beats: 2, played_beats: 2, complete: true });
    assert.equal(result.generated_playback.source_event_id, "final");
    assert.deepEqual(result.generated_playback.evidence.map(item => item.event_id), ["played-part", "played-second"]);
    assert.deepEqual(result.automatic_topics, []);
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM topic_analysis_results").get().n, 0);
  } finally { store.close(); }
});

test("rewriting a beat or its step/global context never applies old playback to new content", () => {
  for (const change of ["beat", "step", "global"]) {
    const store = new HistoryStore(":memory:");
    try {
      const initial = delivery(store, "original", [open, step("section", [first]), close]);
      played(store, "old-playback", initial);
      const originalRange = store.upperBound("alice");
      const changedStep = step("section", [change === "beat" ? beat("one", "Changed explanation") : first]);
      if (change === "step") changedStep.step.purpose = "Changed context";
      const changedOpen = change === "global" ? { ...open, lesson: { ...open.lesson, variables: [{ id: "m", initial: 2 }] } } : open;
      const next = delivery(store, "revised", [changedOpen, changedStep, close]);
      assert.equal(coverage(store).course_playback.complete, false);
      assert.equal(coverage(store, "alice", "run", { through: originalRange }).course_playback.complete, true);
      played(store, "new-playback", next);
      assert.equal(coverage(store).course_playback.complete, true);
    } finally { store.close(); }
  }
});

test("seek-only and legacy/missing/wrong-version records cannot prove whole-course playback; runs and owners stay separate", () => {
  const store = new HistoryStore(":memory:");
  try {
    const source = delivery(store, "final", [open, step("section", [first]), close]);
    played(store, "no-version"); played(store, "unknown-version", "0".repeat(64));
    store.append("alice", [{ ...common, id: "wrong-step", kind: "beat_completed", log_id: "log", data: { step_id: "different-section", beat_id: "one", presentation: "text", delivery_sha256: source } }]);
    store.append("alice", [{ ...common, id: "seek", kind: "playback_position", log_id: "log", data: { cursor: 999, reason: "seek" } }]);
    assert.equal(coverage(store).course_playback.played_beats, 0);
    played(store, "other-run", source, "one", { run_id: "run-two" });
    assert.equal(coverage(store).course_playback.complete, false);
    assert.equal(coverage(store, "alice", "run-two").course_playback.complete, true);
    played(store, "wrong-step", source, "one", {}, "bob");
    assert.equal(coverage(store, "bob").course_playback, null);
    assert.equal(coverage(store).course_playback.complete, false);
    const range = store.upperBound("alice"); store.deleteRun("alice", "run");
    assert.throws(() => coverage(store, "alice", "run", { through: range }), HistorySnapshotChanged);
  } finally { store.close(); }
});

test("missing snapshots, partial deliveries, duplicate identities and incomplete close markers remain unknown", () => {
  const cases = [
    [open, step("section", [first])],
    [open, step("section", [first, first]), close],
    [open, step("section", [first]), step("section", [second]), close],
    [open, step("section", [first]), close, close],
    [open, close, step("section", [first]), close],
    [open, step("section", [first]), { ...close, lesson_id: "different" }],
    [step("section", [first]), close],
  ];
  for (const events of cases) {
    const store = new HistoryStore(":memory:");
    try { delivery(store, "source", events); assert.equal(coverage(store).course_playback, null); }
    finally { store.close(); }
  }
  const store = new HistoryStore(":memory:");
  try {
    store.append("alice", [{ ...common, id: "legacy", kind: "course_delivered", data: { artifact: "unavailable", status: "complete" } }]);
    assert.equal(coverage(store).course_playback, null);
  } finally { store.close(); }
});

test("step IDs disambiguate repeated beat IDs, and real canonical material is readable", () => {
  const store = new HistoryStore(":memory:");
  try {
    const hash = delivery(store, "source", [open, step("section", [first]), step("other-section", [first]), close]);
    played(store, "first-step", hash);
    assert.deepEqual(coverage(store).course_playback, { required_beats: 2, played_beats: 1, complete: false });
  } finally { store.close(); }
  const actual = new HistoryStore(":memory:");
  try {
    const events = readFileSync(new URL("../../src/learning/oll/fixtures/math-two-points.canonical.jsonl", import.meta.url), "utf8").trim().split("\n").map(line => JSON.parse(line));
    const hash = delivery(actual, "actual", events);
    for (const event of events) if (event.event === "lesson.step") for (const item of event.step.beats) {
      actual.append("alice", [{ ...common, id: "actual-play", kind: "beat_completed", log_id: "log", data: { step_id: event.step.id, beat_id: item.id, presentation: "audio", delivery_sha256: hash } }]);
    }
    assert.equal(coverage(actual).course_playback.complete, true);
  } finally { actual.close(); }
});


test("oversized or excessively revised material stays unknown instead of truncating completion evidence", () => {
  const store = new HistoryStore(":memory:");
  try {
    delivery(store, "too-many-beats", [open, step("section", Array.from({ length: 1001 }, (_, i) => beat(`b${i}`, "Text"))), close]);
    assert.equal(coverage(store).course_playback, null);
    for (let i = 0; i < 32; i++) {
      const hash = delivery(store, `version-${i}`, [open, step("section", [beat("one", `Version ${i}`)]), close]);
      played(store, `play-${i}`, hash);
    }
    delivery(store, "latest", [open, step("section", [first]), close]);
    assert.equal(coverage(store).generated_playback.reason, "too-many-versions");
  } finally { store.close(); }
});


test("changed earlier board state invalidates later identical beats until they play in the revised sequence", () => {
  const store = new HistoryStore(":memory:");
  try {
    const original = delivery(store, "original", [open, step("section", [first, second]), close]);
    played(store, "old-later-beat", original, "two");
    const revised = delivery(store, "revised", [open, step("section", [beat("one", "Set a different board state"), second]), close]);
    played(store, "new-first-beat", revised);
    assert.deepEqual(coverage(store).course_playback, { required_beats: 2, played_beats: 1, complete: false });
    played(store, "new-later-beat", revised, "two");
    assert.equal(coverage(store).course_playback.complete, true);
  } finally { store.close(); }
});
