import { test } from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, ACHIEVEMENT_CATEGORIES, TITLES } from "./achievement-catalog.mjs";
import { accountAwards } from "./achievements.mjs";

let n = 0;
const ev = (kind, when, data = {}, { run = "r1", session = "board-1" } = {}) => ({ version: 1, id: `e${n++}`, kind, occurred_at: when, device_id: "tv", session_id: session, run_id: run, data });
const beat = (when, run = "r1") => ev("beat_completed", when, { step_id: "s", beat_id: "b", presentation: "text" }, { run });
const attempt = (when, task, result, hints = 0, run = "r1") => ev("task_attempt", when, { task_id: task, operation_id: `o${n}`, result, hints_used: hints }, { run });
const question = (when, modality = "text", session = "board-1") => ev("question_submitted", when, { text: "为什么", modality }, { session });
const day = (d, hour = 8) => `${d}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const run = (events, extra = {}) => accountAwards({ events, factsByTopic: new Map(), topics: [], teacherOfRun: () => null, ...extra });
const earned = result => new Map(result.awards.map(award => [`${award.achievement_id}${award.scope ? `@${award.scope}` : ""}`, award.event.id]));

test("the catalog has 74 achievements in 8 categories, unique titles, and no mastery claims", () => {
  assert.equal(ACHIEVEMENTS.length, 74);
  assert.equal(new Set(ACHIEVEMENTS.map(item => item.id)).size, 74);
  assert.deepEqual(ACHIEVEMENT_CATEGORIES.map(category => ACHIEVEMENTS.filter(item => item.category === category.id).length), [10, 9, 9, 8, 8, 10, 10, 10]);
  assert.equal(TITLES.length, 17);
  assert.equal(new Set(TITLES.map(title => title.name)).size, 17);
  for (const item of ACHIEVEMENTS) {
    assert.ok(["b", "s", "g", "x"].includes(item.rarity), item.id);
    assert.doesNotMatch(`${item.name}${item.condition}`, /掌握|学会|精通|满分/, item.id);
  }
});

test("days and weeks count local study days, forgive gaps, and report progress", () => {
  // Weeks start on Monday: 10-05 (Mon) and 10-10/10-11 (Sat-Sun) share a week; then four more weeks and a 31-day gap.
  const events = [beat(day("2026-10-05")), question(day("2026-10-06")), beat(day("2026-10-10")), beat(day("2026-10-11")), beat(day("2026-10-13")),
    beat(day("2026-10-19")), beat(day("2026-10-26")), beat(day("2026-11-02")), beat(day("2026-12-03"))];
  const result = run(events);
  const got = earned(result);
  assert.equal(got.get("three-days"), events[2].id);
  assert.equal(got.get("seven-days"), events[6].id);
  assert.equal(got.get("weekend"), events[3].id);
  assert.equal(got.get("four-weeks"), events[6].id);
  assert.equal(got.get("return-30"), events[8].id);
  assert.deepEqual(result.progress.get("thirty-days"), { current: 9, target: 30 });
  assert.deepEqual(result.progress.get("twelve-weeks"), { current: 5, target: 12 });
  // 23:30 UTC on 10-05 is already 10-06 at UTC+8: only one local day.
  assert.equal(earned(run([beat("2026-10-05T23:30:00.000Z"), beat("2026-10-06T08:00:00.000Z")], { utcOffsetMinutes: 480 })).has("three-days"), false);
});

test("lessons are runs with a completed segment, counted per presenting teacher and by local hour", () => {
  const teachers = { r1: "alan", r2: "doudou", r3: "sufei", r4: "alan" };
  const events = [beat("2026-10-05T13:30:00.000Z", "r1"), beat("2026-10-05T14:00:00.000Z", "r2"), beat("2026-10-05T22:10:00.000Z", "r3"),
    ev("run_started", "2026-10-20T08:00:00.000Z", { mode: "resume" }, { run: "r1" }), attempt("2026-10-04T21:30:00.000Z", "t", "failed", 0, "r4")];
  const got = earned(run(events, { teacherOfRun: id => teachers[id] ?? null, utcOffsetMinutes: 480 }));
  assert.equal(got.get("alan-1"), events[0].id);
  assert.equal(got.get("three-teachers"), events[2].id); // the third teacher's first lesson
  assert.equal(got.has("three-a-day"), false); // 21:30 and 22:00 local, then 06:10 the next day
  assert.equal(got.get("night-owl"), events[0].id);   // 21:30 local
  assert.equal(got.get("early-star"), events[4].id);  // 05:30 local
  assert.equal(got.get("revisit"), events[3].id);
});

test("practice rules use the first success of each task", () => {
  const events = [attempt(day("2026-10-01"), "a", "succeeded", 0), attempt(day("2026-10-01", 9), "b", "failed"), attempt(day("2026-10-01", 10), "b", "succeeded", 1),
    ...[1, 2, 3, 4].map(i => attempt(day("2026-10-02", i), "c", "failed", 0, "r2")), attempt(day("2026-10-02", 9), "c", "succeeded", 2, "r2")];
  const result = run(events);
  const got = earned(result);
  assert.equal(got.get("did-it-alone"), events[0].id);
  assert.equal(got.get("first-try"), events[0].id);
  assert.equal(got.get("try-again"), events[2].id);
  assert.equal(got.get("five-tries"), events[7].id);
  assert.equal(got.get("full-board"), events[2].id); // r1 had two tasks, both met
  assert.deepEqual(result.progress.get("hint-wise"), { current: 2, target: 5 });
  assert.deepEqual(result.progress.get("ten-alone"), { current: 1, target: 10 });
});

test("question rules: kinds, an interruption within a minute, five on one board in a day, and a chain of three", () => {
  const stop = ev("narration_ended", "2026-10-01T08:00:00.000Z", { beat_id: "b", reason: "cancelled" });
  const events = [question("2026-10-01T07:00:00.000Z", "voice"), stop, question("2026-10-01T08:00:40.000Z", "selection"),
    question("2026-10-01T08:20:00.000Z", "image"), question("2026-10-01T08:25:00.000Z"), question("2026-10-01T09:00:00.000Z", "text", "board-2")];
  const result = run(events);
  const got = earned(result);
  assert.equal(got.get("first-question"), events[0].id);
  assert.equal(got.get("first-voice"), events[0].id);
  assert.equal(got.get("first-circle"), events[2].id);
  assert.equal(got.get("first-image"), events[3].id);
  assert.equal(got.get("interrupt"), events[2].id);
  assert.equal(got.has("follow-up"), false); // 08:00:40 → 08:20 is more than ten minutes
  const more = [...events, question("2026-10-01T08:30:00.000Z")];
  assert.equal(earned(run(more)).get("follow-up"), more.at(-1).id);
  assert.equal(earned(run(more)).get("five-in-lesson"), more.at(-1).id);
});

test("map rules: lit stars, constellations, schools, domains, rings, two teachers on one topic, three in a day", () => {
  // mt_PgsHGYJMH- is the only hard prerequisite of mt_yJmvUCCym7 (both primary); mt_M1tnXqmYbn is middle; mt_Yw27nweoTj high.
  const facts = new Map(), topics = [];
  const lit = (id, when, extra = []) => {
    const success = attempt(when, `t-${id}`, "succeeded", 0, `run-${id}`);
    facts.set(id, [...extra, success]); topics.push({ topic_id: id, name: id, state: "did-it" });
    return success;
  };
  const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map(d => beat(day(d), "run-ring"));
  const a = lit("mt_PgsHGYJMH-", day("2026-10-05"), days), b = lit("mt_yJmvUCCym7", day("2026-10-05", 9)), c = lit("mt_M1tnXqmYbn", day("2026-10-05", 10)), d = lit("mt_Yw27nweoTj", day("2026-10-06"));
  const result = accountAwards({ events: [], factsByTopic: facts, topics, teacherOfRun: id => ({ "run-ring": "alan", "run-mt_PgsHGYJMH-": "sufei" })[id] ?? null });
  const got = earned(result);
  assert.equal(got.get("first-star"), a.id);
  assert.equal(got.get("first-constellation"), b.id);
  assert.equal(got.get("three-schools"), d.id);
  assert.equal(got.get("three-stars-day"), c.id);
  assert.ok(got.has("new-domain")); // footprints in more than one domain
  assert.equal(got.get("ring-max"), a.id); // five different days on that star
  assert.equal(got.get("two-teachers-topic"), a.id); // 阿澜 then 苏绯 on the same topic
  assert.deepEqual(result.progress.get("ten-stars"), { current: 4, target: 10 });
  assert.equal(got.has("one-domain"), false);
});

test("seasonal awards repeat per year and follow the lunar table", () => {
  const circle = [beat(day("2027-03-14"), "pi")];
  const events = [beat(day("2026-09-02")), beat(day("2027-09-03")), beat(day("2026-09-27")), beat(day("2027-02-05")), attempt(day("2027-02-20"), "x", "succeeded", 0),
    beat(day("2028-02-29")), beat(day("2026-10-01")), beat(day("2026-10-03")), beat(day("2026-10-07")), ...circle];
  const result = accountAwards({ events, factsByTopic: new Map([["mt_xq3YHZ2zeR", circle]]), topics: [{ topic_id: "mt_xq3YHZ2zeR", name: "Parts of a circle", state: "explored" }], teacherOfRun: () => null });
  const got = earned(result);
  assert.equal(got.get("school-start@2026"), events[0].id);
  assert.equal(got.get("school-start@2027"), events[1].id);
  assert.equal(got.get("mid-autumn@2026"), events[2].id);     // 2026-09-25 ± 3 days
  assert.equal(got.get("spring-festival@2027"), events[3].id); // 除夕 2027-02-05
  assert.equal(got.get("lantern@2027"), events[4].id);         // 元宵 2027-02-20
  assert.equal(got.get("leap-day@2028"), events[5].id);
  assert.equal(got.get("national-day@2026"), events[8].id);
  assert.equal(got.get("pi-day@2027"), circle[0].id);
  for (const award of result.awards) assert.ok(ACHIEVEMENT_BY_ID.has(award.achievement_id));
});
