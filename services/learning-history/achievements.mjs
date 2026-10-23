import { localDay, queryLearningMap, topicFacts } from "./map-progress.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

// Achievements are decided by these rules over the same facts as the learning
// map, never by a model. Each is awarded once per account (per topic where it
// is topic-scoped); the teacher who presents it is the teacher of the lesson
// whose fact met the rule. An award whose evidence was deleted is withdrawn and
// the rule is evaluated again on what remains.
export const ACHIEVEMENT_RULES_VERSION = "achievements-v1";
export const REGULAR_GUEST_DAYS = 3;
export const REUNION_GAP_DAYS = 14;

export function createAchievementSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS achievements(
    owner TEXT NOT NULL, achievement_id TEXT NOT NULL, scope TEXT NOT NULL,
    rules_version TEXT NOT NULL, evidence_event_id TEXT NOT NULL, earned_at TEXT NOT NULL,
    teacher_id TEXT, awarded_at TEXT NOT NULL,
    PRIMARY KEY(owner, achievement_id, scope)
  )`);
}

const learning = event => event.kind === "beat_completed" || event.kind === "task_attempt";
const dayNumber = day => Date.parse(`${day}T00:00:00.000Z`) / 86_400_000;

/** Candidate awards from the map facts, earliest qualifying fact first. */
export function qualifyingAwards(factsByTopic, utcOffsetMinutes = 0) {
  const awards = [];
  const all = [...factsByTopic.values()].flat().filter(learning).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
  const firstPlayed = all.find(event => event.kind === "beat_completed");
  if (firstPlayed) awards.push({ achievement_id: "first-footprint", scope: "", event: firstPlayed });
  const firstAlone = all.find(event => event.kind === "task_attempt" && event.data.result === "succeeded" && event.data.hints_used === 0);
  if (firstAlone) awards.push({ achievement_id: "did-it-alone", scope: "", event: firstAlone });
  for (const [topicId, facts] of factsByTopic) {
    const ordered = facts.filter(learning).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
    const days = [];
    for (const event of ordered) {
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

function lessonTeacher(store, owner, runId) {
  const row = store.db.prepare(`SELECT json_extract(body,'$.data.teacher_id') AS teacher FROM events
    WHERE owner=? AND run_id=? AND kind='question_routed' AND json_extract(body,'$.data.teacher_id') IS NOT NULL ORDER BY seq LIMIT 1`).get(owner, runId);
  return row?.teacher ?? null;
}

export function evaluateAchievements(store, owner, { utcOffsetMinutes = 0, now = () => new Date().toISOString() } = {}, mappings = TOPIC_MAPPINGS) {
  createAchievementSchema(store.db);
  const map = queryLearningMap(store, owner, { utcOffsetMinutes }, mappings);
  const factsByTopic = new Map(map.topics.map(topic => [topic.topic_id, topicFacts(store, owner, topic.topic_id, map.through, mappings)]));
  const names = new Map(map.topics.map(topic => [topic.topic_id, topic.name]));
  const fresh = new Set();
  store.db.exec("BEGIN IMMEDIATE");
  try {
    // Withdraw awards whose evidence no longer exists (deleted run or session).
    store.db.prepare(`DELETE FROM achievements WHERE owner=? AND NOT EXISTS(
      SELECT 1 FROM events e WHERE e.owner=achievements.owner AND e.event_id=achievements.evidence_event_id)`).run(owner);
    const insert = store.db.prepare(`INSERT OR IGNORE INTO achievements(owner,achievement_id,scope,rules_version,evidence_event_id,earned_at,teacher_id,awarded_at)
      VALUES(?,?,?,?,?,?,?,?)`);
    for (const award of qualifyingAwards(factsByTopic, utcOffsetMinutes)) {
      const inserted = insert.run(owner, award.achievement_id, award.scope, ACHIEVEMENT_RULES_VERSION, award.event.id, award.event.occurred_at,
        lessonTeacher(store, owner, award.event.run_id), now());
      if (inserted.changes) fresh.add(`${award.achievement_id}\u0000${award.scope}`);
    }
    store.db.exec("COMMIT");
  } catch (error) { store.db.exec("ROLLBACK"); throw error; }
  const rows = store.db.prepare(`SELECT achievement_id,scope,rules_version,evidence_event_id,earned_at,teacher_id,awarded_at
    FROM achievements WHERE owner=? ORDER BY earned_at,achievement_id,scope`).all(owner);
  return { rules_version: ACHIEVEMENT_RULES_VERSION, through: map.through,
    achievements: rows.map(row => ({ ...row, topic_name: row.scope ? names.get(row.scope) ?? null : null, new: fresh.has(`${row.achievement_id}\u0000${row.scope}`) })) };
}
