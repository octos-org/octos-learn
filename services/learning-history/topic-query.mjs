import { historyCourseKey } from "./event-contract.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

export const COUNTING_RULE = "observed-beats-and-task-operations-v1";
const metadata = map => ({ mapping_id: map.id, status: map.status, course: map.course, taxonomy: map.taxonomy });
// Only explicit IDs in an approved, exact-version mapping contribute. A
// question elsewhere on the same whiteboard is never classified by proximity.
function filter(map, objective) {
  return {
    sql: `course_key=? AND course_digest=? AND (
      (kind='beat_completed' AND beat_id IN (SELECT value FROM json_each(?))) OR
      (kind IN ('task_attempt','task_hint') AND task_id IN (SELECT value FROM json_each(?))))`,
    args: [historyCourseKey(map.course), map.course.sha256, JSON.stringify(objective.beat_ids), JSON.stringify(objective.task_ids)],
  };
}
function counts(store, owner, map, objective, { through, from, until, runId } = {}) {
  const match = filter(map, objective);
  return store.db.prepare(`SELECT
    COUNT(DISTINCT CASE WHEN kind='beat_completed' THEN run_id END) AS played_runs,
    COUNT(DISTINCT CASE WHEN kind='beat_completed' THEN json_array(run_id,beat_id) END) AS played_beats,
    COUNT(CASE WHEN kind='task_attempt' THEN 1 END) AS task_attempts,
    COUNT(CASE WHEN kind='task_hint' THEN 1 END) AS hints
    FROM events WHERE owner=? AND seq<=? AND occurred_at>=? AND occurred_at<? AND (? IS NULL OR run_id=?) AND ${match.sql}`)
    .get(owner, through, from, until, runId ?? null, runId ?? null, ...match.args);
}
const bounds = (store, owner, options) => ({ through: options.through ?? store.upperBound(owner), from: options.from ?? "0000-01-01T00:00:00.000Z", until: options.until ?? "9999-12-31T23:59:59.999Z" });
export function queryTopic(store, owner, topicId, options = {}, mappings = TOPIC_MAPPINGS) {
  const range = bounds(store, owner, options); store.checkSnapshot(owner, range.through);
  const candidates = mappings.filter(map => map.objectives.some(item => item.topic_id === topicId));
  const objectives = candidates.flatMap(map => map.objectives.filter(item => item.topic_id === topicId).map(objective => ({
    ...metadata(map), objective_key: objective.key, title: objective.title, topic_coverage: "partial",
    counts: map.status === "approved" ? { ...counts(store, owner, map, objective, range), question_count: null } : null,
  })));
  const active = candidates.filter(map => map.status === "approved");
  const conditions = active.flatMap(map => map.objectives.filter(item => item.topic_id === topicId).map(objective => filter(map, objective)));
  let events = [];
  if (conditions.length) {
    events = store.db.prepare(`SELECT seq,body FROM events WHERE owner=? AND seq>? AND seq<=? AND occurred_at>=? AND occurred_at<?
      AND (${conditions.map(item => `(${item.sql})`).join(" OR ")}) ORDER BY seq LIMIT ?`)
      .all(owner, options.after ?? 0, range.through, range.from, range.until, ...conditions.flatMap(item => item.args), (options.limit ?? 50) + 1);
  }
  const page = events.slice(0, options.limit ?? 50);
  return { topic_id: topicId, counting_rule: COUNTING_RULE, ...range,
    status: !candidates.length ? "unmapped" : active.length ? "available" : "pending-review",
    question_association: "not-recorded", objectives,
    events: page.map(row => ({ seq: row.seq, event: JSON.parse(row.body) })),
    next_after: events.length > page.length ? page.at(-1).seq : null };
}

export function queryRunCoverage(store, owner, runId, options = {}, mappings = TOPIC_MAPPINGS) {
  const range = bounds(store, owner, options); store.checkSnapshot(owner, range.through);
  const course = store.db.prepare("SELECT course_key,course_digest FROM events WHERE owner=? AND run_id=? AND seq<=? AND course_key IS NOT NULL LIMIT 1").get(owner, runId, range.through);
  const map = course && mappings.find(item => historyCourseKey(item.course) === course.course_key && item.course.sha256 === course.course_digest);
  if (!map) return { run_id: runId, through: range.through, status: "unmapped", counting_rule: COUNTING_RULE, objectives: [], course_playback: null };
  const approved = map.status === "approved";
  const played = approved ? store.db.prepare(`SELECT COUNT(DISTINCT beat_id) AS n FROM events WHERE owner=? AND run_id=? AND seq<=?
    AND course_key=? AND course_digest=? AND kind='beat_completed' AND beat_id IN (SELECT value FROM json_each(?))`)
    .get(owner, runId, range.through, course.course_key, course.course_digest, JSON.stringify(map.required_beats)).n : null;
  return { run_id: runId, through: range.through, ...metadata(map), counting_rule: COUNTING_RULE,
    course_playback: approved ? { required_beats: map.required_beats.length, played_beats: played, complete: played === map.required_beats.length } : null,
    objectives: map.objectives.map(objective => ({ topic_id: objective.topic_id, objective_key: objective.key, title: objective.title,
      counts: approved ? counts(store, owner, map, objective, { ...range, runId }) : null })) };
}
