import { createHash } from "node:crypto";
import { canonicalHistoryJson } from "./event-contract.mjs";
import { createAchievementSchema } from "./achievements.mjs";
import { MAP_STATE_RANK, localDay, queryLearningMap, topicFacts, topicState } from "./map-progress.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

// A weekly report is computed on request from the same facts as the learning
// map, for one local Monday-to-Sunday week. It describes what happened and
// which map states changed, with the fact behind each change. It never says
// "mastered" or "improved": a state change is not evidence of either.
export const REPORT_RULES_VERSION = "report-v1";
const DAY_MS = 86_400_000;

/** The Monday (local calendar day) of the week containing a local day. */
export function weekStartOf(day) {
  const date = new Date(`${day}T00:00:00.000Z`);
  return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

export const isWeekStart = day => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00.000Z`))
  && new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) === day && weekStartOf(day) === day;

const learning = event => event.kind === "beat_completed" || event.kind === "task_attempt";
const ordered = events => [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));

function raisingEvent(before, within) {
  // The fact this week that first reached the week's final state, when that
  // state is higher than before the week.
  const start = topicState(before), end = topicState([...before, ...within]);
  if (!end || (start && MAP_STATE_RANK[end] <= MAP_STATE_RANK[start])) return null;
  for (let i = 1; i <= within.length; i++) if (topicState([...before, ...within.slice(0, i)]) === end) return within[i - 1];
  return null;
}

/** Activity, map-state changes and awards between two instants, from the
 * same facts as the learning map. Shared by the weekly and monthly reports. */
function periodFacts(store, owner, { from, until, utcOffsetMinutes }, mappings) {
  const inPeriod = event => event.occurred_at >= from && event.occurred_at < until;
  const map = queryLearningMap(store, owner, { utcOffsetMinutes }, mappings);

  const events = store.db.prepare(`SELECT body FROM events WHERE owner=? AND seq<=?
    AND kind IN ('beat_completed','task_attempt','question_submitted')`).all(owner, map.through).map(row => JSON.parse(row.body));
  const period = ordered(events.filter(inPeriod));
  const learned = period.filter(learning), attempts = period.filter(event => event.kind === "task_attempt");
  const firstLearning = ordered(events.filter(learning))[0];
  const activity = {
    days: [...new Set(learned.map(event => localDay(event.occurred_at, utcOffsetMinutes)))].sort(),
    runs: new Set(learned.map(event => event.run_id)).size,
    played_beats: period.filter(event => event.kind === "beat_completed").length,
    task_attempts: attempts.length,
    unassisted_successes: attempts.filter(event => event.data.result === "succeeded" && event.data.hints_used === 0).length,
    questions: period.filter(event => event.kind === "question_submitted").length,
  };

  const topics = [];
  for (const topic of map.topics) {
    const facts = ordered(topicFacts(store, owner, topic.topic_id, map.through, mappings).filter(learning));
    const before = facts.filter(event => event.occurred_at < from), within = facts.filter(inPeriod);
    if (!within.length) continue;
    const raised = raisingEvent(before, within);
    topics.push({ topic_id: topic.topic_id, subject: topic.subject, domain: topic.domain, name: topic.name,
      state_before: topicState(before), state_after: topicState([...before, ...within]),
      change: raised ? { evidence_event_id: raised.id, occurred_at: raised.occurred_at, kind: raised.kind } : null,
      played_beats: within.filter(event => event.kind === "beat_completed").length,
      task_attempts: within.filter(event => event.kind === "task_attempt").length });
  }

  // Awards are evaluated after each upload; the report only reads them, so it
  // never consumes the "new" announcement shown in the classroom.
  createAchievementSchema(store.db);
  const achievements = store.db.prepare(`SELECT achievement_id,scope,earned_at,teacher_id FROM achievements
    WHERE owner=? AND earned_at>=? AND earned_at<? ORDER BY earned_at,achievement_id,scope`).all(owner, from, until)
    .map(row => ({ ...row, topic_name: row.scope ? map.topics.find(topic => topic.topic_id === row.scope)?.name ?? null : null }));
  return { map, firstLearning, activity, topics, achievements };
}

export function queryWeeklyReport(store, owner, { weekStart, utcOffsetMinutes = 0 } = {}, mappings = TOPIC_MAPPINGS) {
  if (!isWeekStart(weekStart)) throw new TypeError("Week must start on a Monday");
  const startMs = Date.parse(`${weekStart}T00:00:00.000Z`) - utcOffsetMinutes * 60_000;
  const from = new Date(startMs).toISOString(), until = new Date(startMs + 7 * DAY_MS).toISOString();
  const { map, firstLearning, activity, topics, achievements } = periodFacts(store, owner, { from, until, utcOffsetMinutes }, mappings);
  const facts = { week_start: weekStart, utc_offset_minutes: utcOffsetMinutes, activity, topics, achievements };
  return { rules_version: REPORT_RULES_VERSION, map_rules_version: map.rules_version, through: map.through,
    first_week: firstLearning ? weekStartOf(localDay(firstLearning.occurred_at, utcOffsetMinutes)) : null,
    report_sha256: createHash("sha256").update(canonicalHistoryJson({ rules_version: REPORT_RULES_VERSION, ...facts })).digest("hex"),
    meaning: "Describes recorded learning in this week and map state changes with their evidence. Neither is mastery or improvement.",
    ...facts };
}

// The monthly report is the same description over one local calendar month,
// plus how many days fell in each of its weeks. No model comment.
export const MONTHLY_REPORT_RULES_VERSION = "report-month-v1";
export const isMonth = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
const nextMonth = month => { const [y, m] = month.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

export function queryMonthlyReport(store, owner, { month, utcOffsetMinutes = 0 } = {}, mappings = TOPIC_MAPPINGS) {
  if (!isMonth(month)) throw new TypeError("Month must be YYYY-MM");
  const local = day => new Date(Date.parse(`${day}T00:00:00.000Z`) - utcOffsetMinutes * 60_000).toISOString();
  const from = local(`${month}-01`), until = local(`${nextMonth(month)}-01`);
  const { map, firstLearning, activity, topics, achievements } = periodFacts(store, owner, { from, until, utcOffsetMinutes }, mappings);
  const weeks = [];
  for (const day of activity.days) {
    const week = weekStartOf(day), last = weeks.at(-1);
    if (last?.week_start === week) last.days++; else weeks.push({ week_start: week, days: 1 });
  }
  const facts = { month, utc_offset_minutes: utcOffsetMinutes, activity, weeks, topics, achievements };
  return { rules_version: MONTHLY_REPORT_RULES_VERSION, map_rules_version: map.rules_version, through: map.through,
    first_month: firstLearning ? localDay(firstLearning.occurred_at, utcOffsetMinutes).slice(0, 7) : null,
    report_sha256: createHash("sha256").update(canonicalHistoryJson({ rules_version: MONTHLY_REPORT_RULES_VERSION, ...facts })).digest("hex"),
    meaning: "Describes recorded learning in this month and map state changes with their evidence. Neither is mastery or improvement.",
    ...facts };
}
