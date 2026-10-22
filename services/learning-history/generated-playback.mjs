import { createHash } from "node:crypto";
import { canonicalHistoryJson } from "./event-contract.mjs";

export const GENERATED_PLAYBACK_RULE = "complete-delivery-matching-beats-v1";
const digest = text => createHash("sha256").update(text).digest("hex");
const object = value => value && typeof value === "object" && !Array.isArray(value);
const identity = value => typeof value === "string" && value.trim() && value.length <= 256;

// A whole-course denominator comes only from one actual complete delivery.
// Earlier streamed beats count only if their content, step/global context
// and all preceding beats match after canonical JSON serialization. Earlier
// actions can change the state in which a later identical beat is shown.
function indexMaterial(row) {
  if (!row?.snapshot_json || digest(row.snapshot_json) !== row.sha256) return null;
  const events = JSON.parse(row.snapshot_json);
  if (!Array.isArray(events) || !events.length) return null;
  const steps = new Set(), beats = new Map(), lessonIds = new Set(), context = [];
  let opens = 0, closes = 0, prefix = digest("generated-playback-prefix-v1");
  for (const event of events) {
    if (!object(event) || !identity(event.lesson_id)) return null;
    lessonIds.add(event.lesson_id);
    if (event.event === "lesson.close") { closes++; continue; }
    if (event.event === "lesson.open") opens++;
    else if (event.event !== "lesson.step") return null;
    if (event.event !== "lesson.step") { context.push(event); prefix = digest(canonicalHistoryJson([prefix, event])); continue; }
    const step = event.step;
    if (!object(step) || !identity(step.id) || steps.has(step.id) || !Array.isArray(step.beats)) return null;
    steps.add(step.id);
    const { beats: entries, ...stepContext } = step;
    const { step: _step, ...eventContext } = event;
    prefix = digest(canonicalHistoryJson([prefix, eventContext, stepContext]));
    for (const beat of entries) {
      if (!object(beat) || !identity(beat.id)) return null;
      const key = canonicalHistoryJson([step.id, beat.id]);
      if (beats.has(key) || beats.size >= 1000) return null;
      prefix = digest(canonicalHistoryJson([prefix, beat]));
      beats.set(key, prefix);
    }
  }
  if (lessonIds.size !== 1 || !beats.size || opens !== 1 || events[0].event !== "lesson.open"
    || closes > 1 || (closes && events.at(-1).event !== "lesson.close")) return null;
  return { beats, context: digest(canonicalHistoryJson(context)), closed: events.at(-1).event === "lesson.close" };
}

export function generatedPlaybackCoverage(store, owner, runId, course, through) {
  const unknown = reason => ({ course_playback: null, generated_playback: { rule: GENERATED_PLAYBACK_RULE, status: "unknown", reason } });
  const latest = store.db.prepare(`SELECT e.event_id,e.body,m.sha256,m.snapshot_json FROM events e
    LEFT JOIN course_materials m ON m.owner=e.owner AND m.event_id=e.event_id
    WHERE e.owner=? AND e.session_id=? AND e.course_key=? AND e.kind='course_delivered' AND e.seq<=?
    ORDER BY e.seq DESC LIMIT 1`).get(owner, course.session_id, course.course_key, through);
  if (!latest) return unknown("missing-delivery");
  let final;
  try { final = indexMaterial(latest); } catch { return unknown("unreadable-delivery"); }
  if (!final) return unknown("unreadable-delivery");
  if (JSON.parse(latest.body).data.status !== "complete" || !final.closed) return unknown("incomplete-delivery");
  const rows = store.db.prepare(`SELECT event_id,body,delivery_digest FROM events
    WHERE owner=? AND run_id=? AND course_key=? AND kind='beat_completed' AND seq<=? ORDER BY seq`)
    .all(owner, runId, course.course_key, through);
  const cache = new Map([[latest.sha256, final]]), played = new Map();
  for (const row of rows) {
    if (!row.delivery_digest) continue; // Older records cannot establish their content version.
    if (!cache.has(row.delivery_digest)) {
      // Bound expensive snapshot decoding in one inspection request. Unknown
      // is preferable to truncating a long history into a false completion.
      if (cache.size >= 32) return unknown("too-many-versions");
      const source = store.db.prepare(`SELECT m.sha256,m.snapshot_json FROM course_materials m
        JOIN events e ON e.owner=m.owner AND e.event_id=m.event_id
        WHERE e.owner=? AND e.session_id=? AND e.course_key=? AND m.sha256=? AND e.seq<=? LIMIT 1`)
        .get(owner, course.session_id, course.course_key, row.delivery_digest, through);
      let indexed = null;
      try { indexed = indexMaterial(source); } catch { /* Keep unavailable versions uncounted. */ }
      cache.set(row.delivery_digest, indexed);
    }
    const version = cache.get(row.delivery_digest), event = JSON.parse(row.body);
    const key = canonicalHistoryJson([event.data.step_id, event.data.beat_id]);
    if (!version || version.context !== final.context || !final.beats.has(key) || version.beats.get(key) !== final.beats.get(key)) continue;
    if (!played.has(key)) played.set(key, { event_id: row.event_id, step_id: event.data.step_id, beat_id: event.data.beat_id, delivery_sha256: row.delivery_digest });
  }
  return { course_playback: { required_beats: final.beats.size, played_beats: played.size, complete: played.size === final.beats.size },
    generated_playback: { rule: GENERATED_PLAYBACK_RULE, status: "available", source_event_id: latest.event_id,
      delivery_sha256: latest.sha256, evidence: [...played.values()] } };
}
