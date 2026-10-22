import { createHash } from "node:crypto";
import { HistoryValidationError } from "./event-contract.mjs";

// Validate bytes against the observed delivery, not a mutable artifact path.
// Structural checks make the material readable; they do not prove mathematics
// or classify any topic. Octos remains responsible for semantic analysis.
export function validateCourseMaterial(event, snapshotJson) {
  const fail = () => { throw new HistoryValidationError("Course material does not match its delivery"); };
  if (event?.kind !== "course_delivered" || typeof snapshotJson !== "string"
    || Buffer.byteLength(snapshotJson) > 8 * 1024 * 1024
    || createHash("sha256").update(snapshotJson).digest("hex") !== event.data.snapshot_sha256) fail();
  let events;
  try { events = JSON.parse(snapshotJson); } catch { fail(); }
  if (!Array.isArray(events) || !events.length || events.length !== event.data.event_count
    || events.some(item => !item || typeof item !== "object" || Array.isArray(item) || typeof item.event !== "string")) fail();
  return { event_id: event.id, sha256: event.data.snapshot_sha256, snapshot_json: snapshotJson };
}
