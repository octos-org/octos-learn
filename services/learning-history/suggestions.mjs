import { localDay, queryLearningMap, topicFacts } from "./map-progress.mjs";
import { topicCatalog, topicStructure } from "./topic-catalog.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

// Next-step suggestions decided by program rules over the learning map and the
// taxonomy's hard prerequisites, never by a model. A missing record is only
// "not visited together yet", time away is only "a while", and did-it is one
// unassisted success. A learner can dismiss a suggestion for 14 days.
export const SUGGESTION_RULES_VERSION = "suggestions-v1";
export const SUGGESTION_LIMIT = 3;
export const REVISIT_AFTER_DAYS = 14;
export const DISMISS_DAYS = 14;
const ORDER = ["continue", "foundation", "next", "revisit"];
const DAY_MS = 86_400_000;
const learning = event => event.kind === "beat_completed" || event.kind === "task_attempt";

export function createSuggestionSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS suggestion_dismissals(owner TEXT NOT NULL,suggestion_id TEXT NOT NULL,dismissed_at TEXT NOT NULL,
    PRIMARY KEY(owner,suggestion_id))`);
}

export const suggestionId = (type, topicId, targetId = "") => `${type}:${topicId}:${targetId}`;

export function dismissSuggestion(store, owner, id) {
  createSuggestionSchema(store.db);
  store.db.prepare(`INSERT INTO suggestion_dismissals VALUES(?,?,?) ON CONFLICT(owner,suggestion_id) DO UPDATE SET dismissed_at=excluded.dismissed_at`)
    .run(owner, id, store.now());
  return { dismissed: true };
}

export function querySuggestions(store, owner, { utcOffsetMinutes = 0 } = {}, mappings = TOPIC_MAPPINGS) {
  createSuggestionSchema(store.db);
  const map = queryLearningMap(store, owner, { utcOffsetMinutes }, mappings);
  const now = store.now(), catalog = topicCatalog(), structure = topicStructure();
  const recorded = new Set(map.topics.map(topic => topic.topic_id));
  const hiddenSince = new Date(Date.parse(now) - DISMISS_DAYS * DAY_MS).toISOString();
  const hidden = new Set(store.db.prepare("SELECT suggestion_id FROM suggestion_dismissals WHERE owner=? AND dismissed_at>?").all(owner, hiddenSince).map(row => row.suggestion_id));
  const today = Date.parse(`${localDay(now, utcOffsetMinutes)}T00:00:00.000Z`);
  const target = (edge, id) => { const [topic] = catalog.read([id]); return { topic_id: id, name: topic.name, subject: topic.subject, domain: topic.domain, strength: edge.strength, reason: edge.reason }; };
  const candidates = [];
  for (const topic of map.topics) {
    const last = topicFacts(store, owner, topic.topic_id, map.through, mappings).filter(learning)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id)).at(-1);
    const base = { topic: { topic_id: topic.topic_id, name: topic.name, subject: topic.subject, domain: topic.domain, state: topic.state, last_at: last.occurred_at },
      resume: { session_id: last.session_id, run_id: last.run_id } };
    const unvisited = (edges, pick) => edges.filter(edge => edge.strength === "hard" && !recorded.has(pick(edge)) && catalog.read([pick(edge)])[0].subject === topic.subject);
    if (topic.state === "practising") candidates.push({ type: "continue", ...base });
    if (topic.state !== "did-it") for (const edge of unvisited(structure.prerequisitesOf(topic.topic_id), edge => edge.prerequisiteId)) candidates.push({ type: "foundation", ...base, target: target(edge, edge.prerequisiteId) });
    if (topic.state === "did-it") for (const edge of unvisited(structure.dependentsOf(topic.topic_id), edge => edge.topicId)) candidates.push({ type: "next", ...base, target: target(edge, edge.topicId) });
    const away = Math.round((today - Date.parse(`${localDay(last.occurred_at, utcOffsetMinutes)}T00:00:00.000Z`)) / DAY_MS);
    if (away > REVISIT_AFTER_DAYS) candidates.push({ type: "revisit", ...base, days_away: away });
  }
  candidates.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || b.topic.last_at.localeCompare(a.topic.last_at)
    || (a.target?.topic_id ?? "").localeCompare(b.target?.topic_id ?? ""));
  const used = new Set(), suggestions = [];
  for (const candidate of candidates) {
    const id = suggestionId(candidate.type, candidate.topic.topic_id, candidate.target?.topic_id);
    // Each suggested topic appears once, and a learned topic leads to at most
    // one suggestion of each type (so one practised topic can still show
    // "continue" and one of its foundations).
    const keys = [`focus:${candidate.target?.topic_id ?? candidate.topic.topic_id}`, `${candidate.type}:${candidate.topic.topic_id}`];
    if (hidden.has(id) || keys.some(key => used.has(key))) continue;
    keys.forEach(key => used.add(key));
    suggestions.push({ id, ...candidate });
    if (suggestions.length === SUGGESTION_LIMIT) break;
  }
  return { rules_version: SUGGESTION_RULES_VERSION, map_rules_version: map.rules_version, through: map.through,
    meaning: "Suggestions from recorded map states and hard prerequisites. No record is not inability; time away is not forgetting.", suggestions };
}
