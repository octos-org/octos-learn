import { queryTopic } from "./topic-query.mjs";
import { topicCatalog, TOPIC_RULES_VERSION, TOPIC_TAXONOMY } from "./topic-catalog.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

// Map states come only from recorded facts already associated with a topic:
// an approved course mapping or an active automatic analysis result. Playback
// can only reach "explored"; an attempt reaches "practising"; a program-checked
// success without any opened hint reaches "did-it". Nothing here is mastery.
export const MAP_RULES_VERSION = "map-states-v1";
export const MAP_STATE_RANK = { explored: 1, practising: 2, "did-it": 3 };
const ALL = 1_000_000;

function candidateTopics(store, owner, through, mappings) {
  const mapped = mappings.filter(map => map.status === "approved").flatMap(map => map.objectives.map(objective => objective.topic_id));
  const automatic = store.db.prepare(`WITH ranked AS (
    SELECT r.seq,ROW_NUMBER() OVER(PARTITION BY r.source_event_id ORDER BY j.revision DESC,r.seq DESC) AS position
    FROM topic_analysis_results r JOIN topic_analysis_jobs j ON j.owner=r.owner AND j.id=r.job_id
    WHERE r.owner=? AND j.source_seq<=? AND j.rules_version=? AND j.taxonomy_sha256=?)
    SELECT DISTINCT l.topic_id FROM ranked r JOIN topic_analysis_links l ON l.owner=? AND l.result_seq=r.seq WHERE r.position=1`)
    .all(owner, through, TOPIC_RULES_VERSION, TOPIC_TAXONOMY.catalog_sha256, owner).map(row => row.topic_id);
  return [...new Set([...mapped, ...automatic])].filter(id => topicCatalog().has(id)).sort();
}

/** The learner's local calendar day of a fact; the client supplies its offset. */
export function localDay(occurredAt, utcOffsetMinutes) {
  return new Date(Date.parse(occurredAt) + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Facts for one topic, deduplicated by event id across both association paths. */
export function topicFacts(store, owner, topicId, through, mappings = TOPIC_MAPPINGS) {
  const result = queryTopic(store, owner, topicId, { through, limit: ALL, analysis_through: undefined }, mappings);
  const events = new Map();
  for (const row of [...result.events, ...(result.automatic?.events ?? [])]) events.set(row.event.id, { seq: row.seq, event: row.event });
  return [...events.values()].sort((a, b) => a.seq - b.seq).map(row => row.event);
}

export function topicState(facts) {
  let state = null;
  const raise = next => { if (!state || MAP_STATE_RANK[next] > MAP_STATE_RANK[state]) state = next; };
  for (const event of facts) {
    if (event.kind === "beat_completed") raise("explored");
    if (event.kind === "task_attempt") {
      raise("practising");
      if (event.data.result === "succeeded" && event.data.hints_used === 0) raise("did-it");
    }
  }
  return state;
}

export function summarizeFacts(facts, utcOffsetMinutes = 0) {
  const learning = facts.filter(event => event.kind === "beat_completed" || event.kind === "task_attempt");
  const attempts = facts.filter(event => event.kind === "task_attempt");
  const successes = attempts.filter(event => event.data.result === "succeeded");
  return {
    played_beats: facts.filter(event => event.kind === "beat_completed").length,
    runs: new Set(learning.map(event => event.run_id)).size,
    task_attempts: attempts.length,
    unassisted_successes: successes.filter(event => event.data.hints_used === 0).length,
    assisted_successes: successes.filter(event => event.data.hints_used > 0).length,
    days: [...new Set(learning.map(event => localDay(event.occurred_at, utcOffsetMinutes)))].sort(),
    first_at: learning[0]?.occurred_at ?? null,
    last_at: learning.at(-1)?.occurred_at ?? null,
  };
}

/** Star map topics the learner taught a saved lesson on; the map draws these with an outer ring. */
export function taughtTopics(store, owner, through) {
  const rows = store.db.prepare(`SELECT json_extract(body,'$.data.topic_id') AS topic_id, json_extract(body,'$.data.lesson_id') AS lesson_id, occurred_at
    FROM events WHERE owner=? AND seq<=? AND kind='lesson_taught' AND json_extract(body,'$.data.topic_id') IS NOT NULL ORDER BY occurred_at, seq`).all(owner, through);
  const byTopic = new Map();
  for (const row of rows) {
    if (!topicCatalog().has(row.topic_id)) continue;
    const entry = byTopic.get(row.topic_id) ?? { topic_id: row.topic_id, lessons: new Set(), first_at: row.occurred_at, last_at: row.occurred_at };
    entry.lessons.add(row.lesson_id); entry.last_at = row.occurred_at;
    byTopic.set(row.topic_id, entry);
  }
  return [...byTopic.values()].sort((a, b) => a.topic_id.localeCompare(b.topic_id)).map(entry => {
    const [topic] = topicCatalog().read([entry.topic_id]);
    return { topic_id: entry.topic_id, name: topic.name, lessons: entry.lessons.size, first_at: entry.first_at, last_at: entry.last_at };
  });
}

export function queryLearningMap(store, owner, { through, utcOffsetMinutes = 0 } = {}, mappings = TOPIC_MAPPINGS) {
  const upper = Math.min(through ?? store.upperBound(owner), store.upperBound(owner));
  store.checkSnapshot(owner, upper);
  const catalog = topicCatalog();
  const topics = [];
  for (const topicId of candidateTopics(store, owner, upper, mappings)) {
    const facts = topicFacts(store, owner, topicId, upper, mappings);
    const state = topicState(facts);
    if (!state) continue;
    const [topic] = catalog.read([topicId]);
    topics.push({ topic_id: topicId, subject: topic.subject, domain: topic.domain, name: topic.name, state, evidence: summarizeFacts(facts, utcOffsetMinutes) });
  }
  return { rules_version: MAP_RULES_VERSION, taxonomy: { commit: TOPIC_TAXONOMY.commit, catalog_sha256: TOPIC_TAXONOMY.catalog_sha256 },
    through: upper, utc_offset_minutes: utcOffsetMinutes,
    meaning: "explored = played associated teaching; practising = attempted an associated task; did-it = met a task's program check without hints. taught = the learner saved a lesson they taught on the topic. None of these is mastery.",
    topics, taught: taughtTopics(store, owner, upper) };
}
