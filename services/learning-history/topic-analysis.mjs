import { createHash } from "node:crypto";
import { canonicalHistoryJson, HistoryValidationError } from "./event-contract.mjs";
import { topicCatalog, TOPIC_RULES_VERSION, TOPIC_TAXONOMY } from "./topic-catalog.mjs";

export const analysisHash = value => createHash("sha256").update(typeof value === "string" ? value : canonicalHistoryJson(value)).digest("hex");
const fail = message => { throw new HistoryValidationError(message); };
const exactFields = (value, fields) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every(key => fields.includes(key)) && fields.every(key => Object.hasOwn(value, key));

export function buildAnalysisInput(store, owner, eventId) {
  const row = store.db.prepare("SELECT body FROM events WHERE owner=? AND event_id=?").get(owner, eventId);
  if (!row) fail("Analysis source was deleted or is unavailable");
  const event = JSON.parse(row.body);
  let units, delivered;
  if (event.kind === "question_submitted") {
    const route = store.db.prepare("SELECT body FROM events WHERE owner=? AND question_id=? AND kind='question_routed'").get(owner, event.question_id);
    const media = route ? JSON.parse(route.body).data.media ?? event.data.media ?? [] : event.data.media ?? [];
    units = [{ unit_id: "question", kind: "question", content: event.data.text,
      media_references: media, missing_media: ["image", "selection"].includes(event.data.modality) || media.length > 0 }];
  } else if (event.kind === "course_delivered") {
    const material = store.courseMaterial(owner, eventId);
    if (!material) fail("Exact delivered course material is unavailable");
    delivered = JSON.parse(material.snapshot_json);
    units = delivered.flatMap(item => item.event === "lesson.step" && item.step
      ? (item.step.beats ?? []).map(beat => ({ unit_id: JSON.stringify(["beat", item.step.id, beat.id]), kind: "beat",
        step_id: item.step.id, beat_id: beat.id, content: canonicalHistoryJson(beat) })) : []);
    if (units.some(unit => typeof unit.step_id !== "string" || typeof unit.beat_id !== "string")) fail("Delivered beat identity is invalid");
  } else fail("Unsupported analysis source");
  if (!units.length || units.length > 100 || new Set(units.map(unit => unit.unit_id)).size !== units.length) fail("Analysis needs 1 to 100 uniquely identified units");
  const input = { schema: 1, source_event_id: event.id, source_kind: event.kind,
    source_sha256: event.kind === "course_delivered" ? event.data.snapshot_sha256 : analysisHash(event),
    rules_version: TOPIC_RULES_VERSION, taxonomy: TOPIC_TAXONOMY, units, ...(delivered ? { delivered_events: delivered } : {}) };
  // Fail closed before a model is called. Large lessons need a future chunking
  // policy; silently truncating them would create misleading associations.
  if (Buffer.byteLength(canonicalHistoryJson(input)) > 256 * 1024) fail("Analysis material exceeds the supported input size");
  return { ...input, input_sha256: analysisHash(input) };
}

export function validateAnalysisResult(input, candidate, catalog = topicCatalog()) {
  if (!exactFields(candidate, ["schema", "input_sha256", "units"]) || candidate.schema !== 1 || candidate.input_sha256 !== input.input_sha256
    || !Array.isArray(candidate.units) || candidate.units.length !== input.units.length) fail("Analysis result does not match its input");
  const seen = new Set();
  for (const unit of candidate.units) {
    const source = input.units.find(item => item.unit_id === unit?.unit_id);
    if (!exactFields(unit, ["unit_id", "status", "topics", "reason"]) || !source || seen.has(unit.unit_id)
      || !["mapped", "unknown", "outside-catalog"].includes(unit.status) || typeof unit.reason !== "string" || !unit.reason.trim() || unit.reason.length > 2048
      || !Array.isArray(unit.topics) || unit.topics.length > 8 || new Set(unit.topics.map(topic => topic?.topic_id)).size !== unit.topics.length) fail("Invalid analysis unit");
    seen.add(unit.unit_id);
    if (unit.status === "mapped" ? !unit.topics.length || source.missing_media : unit.topics.length) fail("Uncertain material cannot produce a topic count");
    for (const topic of unit.topics) {
      if (!exactFields(topic, ["topic_id", "quote"]) || !catalog.has(topic.topic_id) || typeof topic.quote !== "string"
        || topic.quote.trim().length < 2 || topic.quote.length > 1024 || !source.content.includes(topic.quote)) fail("Analysis evidence or catalog reference is invalid");
    }
  }
  // These are model associations with checked references, not editorial
  // approval or evidence that the learner understood the material.
  return JSON.parse(canonicalHistoryJson(candidate));
}
