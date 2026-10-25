import { ACHIEVEMENT_BY_ID, MID_AUTUMN, SPRING_FESTIVAL } from "./achievement-catalog.mjs";
import { localDay, queryLearningMap, topicFacts } from "./map-progress.mjs";
import { topicCatalog, topicStructure } from "./topic-catalog.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

// Achievements are decided by these rules over recorded facts, never by a
// model, and none of them means mastery. Each is awarded once per account
// (per topic where it is topic-scoped, per year where it is seasonal); the
// teacher who presents it is the teacher of the lesson whose fact met the
// rule. An award whose evidence was deleted is withdrawn and the rule is
// evaluated again on what remains. Awards stay when only the counting basis
// changes later (for example a withdrawn course mapping).
export const ACHIEVEMENT_RULES_VERSION = "achievements-v2";
export const REGULAR_GUEST_DAYS = 3;
export const REUNION_GAP_DAYS = 14;
const DAY_MS = 86_400_000;

export function createAchievementSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS achievements(
    owner TEXT NOT NULL, achievement_id TEXT NOT NULL, scope TEXT NOT NULL,
    rules_version TEXT NOT NULL, evidence_event_id TEXT NOT NULL, earned_at TEXT NOT NULL,
    teacher_id TEXT, awarded_at TEXT NOT NULL,
    PRIMARY KEY(owner, achievement_id, scope)
  )`);
}

const byTime = (a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id);
const learning = event => event.kind === "beat_completed" || event.kind === "task_attempt";
const studying = event => learning(event) || event.kind === "question_submitted";
const dayNumber = day => Date.parse(`${day}T00:00:00.000Z`) / DAY_MS;
const dayString = number => new Date(number * DAY_MS).toISOString().slice(0, 10);
const localHour = (event, offset) => new Date(Date.parse(event.occurred_at) + offset * 60_000).getUTCHours();
const weekday = day => new Date(`${day}T00:00:00.000Z`).getUTCDay();
const mondayOf = day => dayString(dayNumber(day) - ((weekday(day) + 6) % 7));
const unassisted = event => event.kind === "task_attempt" && event.data.result === "succeeded" && event.data.hints_used === 0;

/** Topic-scoped awards from the map facts, earliest qualifying fact first. */
export function qualifyingAwards(factsByTopic, utcOffsetMinutes = 0) {
  const awards = [];
  for (const [topicId, facts] of factsByTopic) {
    const days = [];
    for (const event of facts.filter(learning).sort(byTime)) {
      const day = localDay(event.occurred_at, utcOffsetMinutes);
      if (days.at(-1) === day) continue;
      const previous = days.at(-1);
      days.push(day);
      if (days.length === REGULAR_GUEST_DAYS) awards.push({ achievement_id: "regular-guest", scope: topicId, event });
      if (previous && dayNumber(day) - dayNumber(previous) > REUNION_GAP_DAYS
        && !awards.some(award => award.achievement_id === "reunion" && award.scope === topicId)) {
        awards.push({ achievement_id: "reunion", scope: topicId, event });
      }
    }
  }
  return awards;
}

/** Every account-wide rule over all recorded events and the lit map.
 * Returns the awards (with the event that met each rule) and progress
 * toward counted ones. Pure: the caller supplies events, map and teachers. */
export function accountAwards({ events, factsByTopic, topics, teacherOfRun, utcOffsetMinutes = 0 }) {
  const awards = [], progress = new Map();
  const award = (id, event, scope = "") => { if (event) awards.push({ achievement_id: id, scope, event }); };
  // The nth item of a time-ordered list meets a "reach n" rule; progress counts the rest.
  const reach = (id, ordered, target) => {
    if (ordered.length >= target) award(id, ordered[target - 1]);
    else progress.set(id, { current: ordered.length, target });
  };
  const day = event => localDay(event.occurred_at, utcOffsetMinutes);
  const all = [...events].sort(byTime);

  // Days and weeks of study.
  const firstOfDay = new Map();
  for (const event of all.filter(studying)) if (!firstOfDay.has(day(event))) firstOfDay.set(day(event), event);
  const days = [...firstOfDay.keys()];
  reach("three-days", days.map(d => firstOfDay.get(d)), 3);
  reach("seven-days", days.map(d => firstOfDay.get(d)), 7);
  reach("thirty-days", days.map(d => firstOfDay.get(d)), 30);
  reach("hundred-days", days.map(d => firstOfDay.get(d)), 100);
  for (let i = 1; i < days.length; i++) if (dayNumber(days[i]) - dayNumber(days[i - 1]) >= 30) { award("return-30", firstOfDay.get(days[i])); break; }
  for (const d of days) if (weekday(d) === 0 && firstOfDay.has(dayString(dayNumber(d) - 1))) { award("weekend", firstOfDay.get(d)); break; }
  let streak = 0, best = 0, lastWeek = null;
  for (const d of days) {
    const week = mondayOf(d);
    if (week === lastWeek) continue;
    streak = lastWeek && dayNumber(week) - dayNumber(lastWeek) === 7 ? streak + 1 : 1;
    lastWeek = week; best = Math.max(best, streak);
    if (streak === 4) award("four-weeks", firstOfDay.get(d));
    if (streak === 12) award("twelve-weeks", firstOfDay.get(d));
  }
  if (best < 4) progress.set("four-weeks", { current: best, target: 4 });
  if (best < 12) progress.set("twelve-weeks", { current: best, target: 12 });

  // Lessons: a run in which at least one explanation segment was completed.
  const lessons = new Map();
  for (const event of all) if (event.kind === "beat_completed" && !lessons.has(event.run_id)) lessons.set(event.run_id, event);
  const beats = all.filter(event => event.kind === "beat_completed");
  award("first-footprint", beats[0]);
  award("night-owl", beats.find(event => localHour(event, utcOffsetMinutes) >= 21));
  award("early-star", all.filter(learning).find(event => { const hour = localHour(event, utcOffsetMinutes); return hour >= 4 && hour < 7; }));
  const lessonsByDay = new Map();
  for (const first of lessons.values()) {
    const list = lessonsByDay.get(day(first)) ?? [];
    list.push(first); lessonsByDay.set(day(first), list);
    if (list.length === 3) { award("three-a-day", first); break; }
  }
  const lessonsByTeacher = new Map();
  for (const [run, first] of lessons) {
    const teacher = teacherOfRun(run);
    if (teacher) lessonsByTeacher.set(teacher, [...(lessonsByTeacher.get(teacher) ?? []), first]);
  }
  for (const teacher of ["alan", "doudou", "sufei"]) {
    const list = lessonsByTeacher.get(teacher) ?? [];
    reach(`${teacher}-1`, list, 1); reach(`${teacher}-10`, list, 10); reach(`${teacher}-30`, list, 30);
  }
  const firstWithEach = ["alan", "doudou", "sufei"].map(teacher => lessonsByTeacher.get(teacher)?.[0]).filter(Boolean).sort(byTime);
  reach("three-teachers", firstWithEach, 3);
  const hundredth = [...lessonsByTeacher.values()].filter(list => list.length >= 100).map(list => list[99]).sort(byTime)[0];
  award("old-friend", hundredth);
  // Returning to a lesson after a week or more.
  const lastByRun = new Map();
  for (const event of all) {
    const previous = lastByRun.get(event.run_id);
    if (event.kind === "run_started" && event.data.mode !== "start" && previous && Date.parse(event.occurred_at) - Date.parse(previous.occurred_at) >= 7 * DAY_MS) {
      award("revisit", event); break;
    }
    lastByRun.set(event.run_id, event);
  }

  // Practice, one task per run and task id.
  const tasks = new Map();
  for (const event of all.filter(event => event.kind === "task_attempt")) {
    const key = `${event.run_id}\u0000${event.data.task_id}`;
    tasks.set(key, [...(tasks.get(key) ?? []), event]);
  }
  const successes = [], alone = [], hinted = [];
  let firstTry, tryAgain, fiveTries;
  for (const attempts of tasks.values()) {
    const index = attempts.findIndex(event => event.data.result === "succeeded");
    if (index < 0) continue;
    const success = attempts[index];
    successes.push(success);
    (success.data.hints_used === 0 ? alone : hinted).push(success);
    if (index === 0 && (!firstTry || byTime(success, firstTry) < 0)) firstTry = success;
    if (index >= 1 && (!tryAgain || byTime(success, tryAgain) < 0)) tryAgain = success;
    if (index >= 4 && (!fiveTries || byTime(success, fiveTries) < 0)) fiveTries = success;
  }
  for (const list of [successes, alone, hinted]) list.sort(byTime);
  award("did-it-alone", alone[0]);
  award("first-try", firstTry); award("try-again", tryAgain); award("five-tries", fiveTries);
  reach("hint-wise", hinted, 5);
  reach("ten-alone", alone, 10); reach("fifty-alone", alone, 50);
  reach("two-hundred", successes, 200);
  if (successes.length >= 100 && successes[99].data.hints_used === 0) award("hundredth", successes[99]);
  const byRun = new Map();
  for (const [key, attempts] of tasks) {
    const run = key.split("\u0000")[0];
    byRun.set(run, [...(byRun.get(run) ?? []), attempts]);
  }
  const fullBoards = [...byRun.values()].filter(list => list.length >= 2 && list.every(attempts => attempts.some(event => event.data.result === "succeeded")))
    .map(list => list.map(attempts => attempts.find(event => event.data.result === "succeeded")).sort(byTime).at(-1)).sort(byTime);
  award("full-board", fullBoards[0]);

  // Questions.
  const questions = all.filter(event => event.kind === "question_submitted");
  award("first-question", questions[0]);
  award("first-circle", questions.find(event => event.data.modality === "selection"));
  award("first-image", questions.find(event => event.data.modality === "image"));
  award("first-voice", questions.find(event => event.data.modality === "voice"));
  reach("ten-questions", questions, 10); reach("fifty-questions", questions, 50);
  const cancelled = all.filter(event => event.kind === "narration_ended" && event.data.reason === "cancelled");
  award("interrupt", questions.find(question => cancelled.some(stop => stop.session_id === question.session_id
    && Date.parse(question.occurred_at) - Date.parse(stop.occurred_at) >= 0 && Date.parse(question.occurred_at) - Date.parse(stop.occurred_at) <= 60_000)));
  const perBoardDay = new Map();
  let fiveInLesson, followUp;
  const lastQuestion = new Map(), chain = new Map();
  for (const question of questions) {
    const key = `${question.session_id}\u0000${day(question)}`;
    const count = (perBoardDay.get(key) ?? 0) + 1;
    perBoardDay.set(key, count);
    if (count === 5 && !fiveInLesson) fiveInLesson = question;
    const previous = lastQuestion.get(question.session_id);
    const length = previous && Date.parse(question.occurred_at) - Date.parse(previous.occurred_at) <= 10 * 60_000 ? chain.get(question.session_id) + 1 : 1;
    chain.set(question.session_id, length); lastQuestion.set(question.session_id, question);
    if (length === 3 && !followUp) followUp = question;
  }
  award("five-in-lesson", fiveInLesson); award("follow-up", followUp);

  // The map: footprints, lit stars, domains, schools, constellations, rings.
  const catalog = topicCatalog(), structure = topicStructure();
  const info = new Map(catalog.read(topics.map(topic => topic.topic_id)).map(topic => [topic.id, topic]));
  const footprint = new Map(), litAt = new Map(), daysOf = new Map();
  for (const topic of topics) {
    const facts = (factsByTopic.get(topic.topic_id) ?? []).slice().sort(byTime);
    if (facts[0]) footprint.set(topic.topic_id, facts[0]);
    const lit = facts.find(unassisted);
    if (topic.state === "did-it" && lit) litAt.set(topic.topic_id, lit);
    const seen = new Map();
    for (const event of facts.filter(learning)) if (!seen.has(day(event))) seen.set(day(event), event);
    daysOf.set(topic.topic_id, [...seen.values()]);
  }
  const litList = [...litAt.entries()].sort((a, b) => byTime(a[1], b[1]));
  const litEvents = litList.map(([, event]) => event);
  award("first-star", litEvents[0]);
  reach("ten-stars", litEvents, 10); reach("fifty-stars", litEvents, 50); reach("hundred-stars", litEvents, 100); reach("many-stars", litEvents, 300);
  const domainFirst = new Map();
  for (const [id, event] of [...footprint.entries()].sort((a, b) => byTime(a[1], b[1]))) {
    const topic = info.get(id);
    const key = topic ? `${topic.subject}/${topic.domain}` : id;
    if (!domainFirst.has(key)) domainFirst.set(key, event);
  }
  const domainEvents = [...domainFirst.values()];
  reach("new-domain", domainEvents, 2); reach("three-domains", domainEvents, 3); reach("five-domains", domainEvents, 5);
  const band = topic => Number(topic.ageRangeStart) <= 9 ? 0 : Number(topic.ageRangeStart) <= 12 ? 1 : 2;
  const schoolFirst = new Map();
  for (const [id, event] of litList) { const topic = info.get(id); if (topic && !schoolFirst.has(band(topic))) schoolFirst.set(band(topic), event); }
  reach("three-schools", [...schoolFirst.values()].sort(byTime), 3);
  const constellations = [];
  for (const [id, event] of litList) {
    const prerequisites = structure.prerequisitesOf(id).filter(edge => edge.strength === "hard").map(edge => edge.prerequisiteId);
    if (prerequisites.length && prerequisites.every(prerequisite => litAt.has(prerequisite))) {
      constellations.push([event, ...prerequisites.map(prerequisite => litAt.get(prerequisite))].sort(byTime).at(-1));
    }
  }
  constellations.sort(byTime);
  award("first-constellation", constellations[0]); reach("five-constellations", constellations, 5);
  const rings = litList.map(([id]) => daysOf.get(id)).filter(list => list.length >= 5).map(list => list[4]).sort(byTime);
  award("ring-max", rings[0]); reach("ten-ring-max", rings, 10);
  const everyTopic = catalog.list();
  const fullyLit = topicsIn => topicsIn.length && topicsIn.every(topic => litAt.has(topic.id))
    ? topicsIn.map(topic => litAt.get(topic.id)).sort(byTime).at(-1) : undefined;
  const domainsLit = [...new Set(litList.map(([id]) => info.get(id)).filter(Boolean).map(topic => `${topic.subject}/${topic.domain}`))]
    .map(key => fullyLit(everyTopic.filter(topic => `${topic.subject}/${topic.domain}` === key))).filter(Boolean).sort(byTime);
  award("one-domain", domainsLit[0]);
  const math = everyTopic.filter(topic => topic.subject === "Mathematics");
  ["qiming-full", "xinghui-full", "xingqiong-full"].forEach((id, ring) => award(id, fullyLit(math.filter(topic => band(topic) === ring))));
  const litByDay = new Map();
  for (const event of litEvents) {
    const list = [...(litByDay.get(day(event)) ?? []), event];
    litByDay.set(day(event), list);
    if (list.length === 3) { award("three-stars-day", event); break; }
  }
  const secondTeacher = topics.map(topic => {
    const seen = new Map();
    for (const event of (factsByTopic.get(topic.topic_id) ?? []).slice().sort(byTime)) {
      const teacher = teacherOfRun(event.run_id);
      if (teacher && !seen.has(teacher)) seen.set(teacher, event);
    }
    return [...seen.values()][1];
  }).filter(Boolean).sort(byTime);
  award("two-teachers-topic", secondTeacher[0]);

  // Seasons: once per calendar year, from the learner's local dates.
  const inWindow = (event, from, to) => { const d = day(event); return d >= from && d <= to; };
  const shift = (date, days) => dayString(dayNumber(date) + days);
  const years = [...new Set(days.map(d => d.slice(0, 4)))];
  const daysIn = (from, to) => days.filter(d => d >= from && d <= to).map(d => firstOfDay.get(d));
  for (const year of years) {
    const seasonal = (id, event) => award(id, event, year);
    seasonal("school-start", beats.find(event => inWindow(event, `${year}-09-01`, `${year}-09-14`)));
    seasonal("new-year", beats.find(event => inWindow(event, `${year}-01-01`, `${year}-01-03`)));
    seasonal("leap-day", beats.find(event => day(event) === `${year}-02-29`));
    const national = daysIn(`${year}-10-01`, `${year}-10-07`); if (national.length >= 3) seasonal("national-day", national[2]);
    const winter = daysIn(`${year}-01-15`, `${year}-02-20`); if (winter.length >= 7) seasonal("winter", winter[6]);
    const summer = daysIn(`${year}-07-01`, `${year}-08-31`); if (summer.length >= 10) seasonal("summer", summer[9]);
    if (MID_AUTUMN[year]) { const center = `${year}-${MID_AUTUMN[year]}`; seasonal("mid-autumn", beats.find(event => inWindow(event, shift(center, -3), shift(center, 3)))); }
    if (SPRING_FESTIVAL[year]) {
      const newYear = `${year}-${SPRING_FESTIVAL[year]}`;
      seasonal("spring-festival", beats.find(event => inWindow(event, shift(newYear, -1), shift(newYear, 6))));
      seasonal("lantern", successes.find(event => inWindow(event, shift(newYear, 13), shift(newYear, 15))));
    }
    const circles = topics.filter(topic => /circle|\bpi\b|π/i.test(info.get(topic.topic_id)?.name ?? topic.name));
    seasonal("pi-day", circles.flatMap(topic => factsByTopic.get(topic.topic_id) ?? []).filter(learning).sort(byTime).find(event => day(event) === `${year}-03-14`));
  }

  return { awards: awards.filter(item => ACHIEVEMENT_BY_ID.has(item.achievement_id)), progress };
}

function teacherLookup(store, owner) {
  const rows = store.db.prepare(`SELECT run_id, json_extract(body,'$.data.teacher_id') AS teacher FROM events
    WHERE owner=? AND kind='question_routed' AND json_extract(body,'$.data.teacher_id') IS NOT NULL ORDER BY seq`).all(owner);
  const teachers = new Map();
  for (const row of rows) if (!teachers.has(row.run_id)) teachers.set(row.run_id, row.teacher);
  return run => teachers.get(run) ?? null;
}

export function evaluateAchievements(store, owner, { utcOffsetMinutes = 0, now = () => new Date().toISOString() } = {}, mappings = TOPIC_MAPPINGS) {
  createAchievementSchema(store.db);
  const map = queryLearningMap(store, owner, { utcOffsetMinutes }, mappings);
  const factsByTopic = new Map(map.topics.map(topic => [topic.topic_id, topicFacts(store, owner, topic.topic_id, map.through, mappings)]));
  const names = new Map(map.topics.map(topic => [topic.topic_id, topic.name]));
  const events = store.db.prepare("SELECT body FROM events WHERE owner=? AND seq<=? ORDER BY seq").all(owner, map.through).map(row => JSON.parse(row.body));
  const teacherOfRun = teacherLookup(store, owner);
  const { awards, progress } = accountAwards({ events, factsByTopic, topics: map.topics, teacherOfRun, utcOffsetMinutes });
  awards.push(...qualifyingAwards(factsByTopic, utcOffsetMinutes));
  const fresh = new Set();
  store.db.exec("BEGIN IMMEDIATE");
  try {
    // Withdraw awards whose evidence no longer exists (deleted run or session).
    store.db.prepare(`DELETE FROM achievements WHERE owner=? AND NOT EXISTS(
      SELECT 1 FROM events e WHERE e.owner=achievements.owner AND e.event_id=achievements.evidence_event_id)`).run(owner);
    const insert = store.db.prepare(`INSERT OR IGNORE INTO achievements(owner,achievement_id,scope,rules_version,evidence_event_id,earned_at,teacher_id,awarded_at)
      VALUES(?,?,?,?,?,?,?,?)`);
    for (const award of awards) {
      const inserted = insert.run(owner, award.achievement_id, award.scope, ACHIEVEMENT_RULES_VERSION, award.event.id, award.event.occurred_at,
        teacherOfRun(award.event.run_id), now());
      if (inserted.changes) fresh.add(`${award.achievement_id}\u0000${award.scope}`);
    }
    store.db.exec("COMMIT");
  } catch (error) { store.db.exec("ROLLBACK"); throw error; }
  const rows = store.db.prepare(`SELECT achievement_id,scope,rules_version,evidence_event_id,earned_at,teacher_id,awarded_at
    FROM achievements WHERE owner=? ORDER BY earned_at,achievement_id,scope`).all(owner);
  const earned = new Set(rows.map(row => row.achievement_id));
  return { rules_version: ACHIEVEMENT_RULES_VERSION, through: map.through,
    achievements: rows.map(row => ({ ...row, topic_name: row.scope && names.has(row.scope) ? names.get(row.scope) : null, new: fresh.has(`${row.achievement_id}\u0000${row.scope}`) })),
    progress: [...progress].filter(([id]) => !earned.has(id)).map(([achievement_id, value]) => ({ achievement_id, ...value })) };
}
