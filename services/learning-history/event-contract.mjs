// Shared by the device queue and product service. These are observations, not
// instructions to Octos and not evidence that a learner has mastered a topic.
export const HISTORY_VERSION = 1;
export const HISTORY_BATCH_LIMIT = 100;
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
export class HistoryValidationError extends Error {}
const fail = message => { throw new HistoryValidationError(message); };

function fields(value, allowed, required = []) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail("Unknown or invalid fields");
  for (const key of required) if (value[key] === undefined) fail(`Missing ${key}`);
}
function text(value, name, max = 128) {
  if (typeof value !== "string" || !value.trim() || new TextEncoder().encode(value).length > max) fail(`Invalid ${name}`);
  return value;
}
function id(value, name) {
  if (typeof value !== "string" || !identifier.test(value)) fail(`Invalid ${name}`);
  return value;
}
function choice(value, name, options) { if (!options.includes(value)) fail(`Invalid ${name}`); }
function integer(value, name) { if (!Number.isSafeInteger(value) || value < 0) fail(`Invalid ${name}`); }
function media(value) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 16) fail("Invalid media");
  value.forEach(item => text(item, "media reference", 2048));
}
function course(value) {
  fields(value, ["kind", "id", "version", "sha256"], ["kind", "id", "version"]);
  choice(value.kind, "course kind", ["course-pack", "generated"]);
  id(value.id, "course id"); id(value.version, "course version");
  if (value.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(value.sha256)) fail("Invalid course digest");
  if (value.kind === "course-pack" && value.sha256 === undefined) fail("CoursePack digest required");
}

export function validateHistoryEvent(candidate) {
  fields(candidate, ["version", "id", "kind", "occurred_at", "device_id", "session_id", "question_id", "run_id", "log_id", "course", "data"],
    ["version", "id", "kind", "occurred_at", "device_id", "session_id", "run_id", "data"]);
  const e = candidate;
  if (e.version !== HISTORY_VERSION) fail("Unsupported history version");
  for (const key of ["id", "device_id", "session_id", "run_id"]) id(e[key], key);
  for (const key of ["question_id", "run_id", "log_id"]) if (e[key] !== undefined) id(e[key], key);
  if (typeof e.occurred_at !== "string" || !/^\d{4}-\d\d-\d\dT.*Z$/.test(e.occurred_at)
    || !Number.isFinite(Date.parse(e.occurred_at)) || new Date(e.occurred_at).toISOString() !== e.occurred_at) fail("Invalid occurrence time");
  if (e.course !== undefined) course(e.course);
  const question = () => id(e.question_id, "question_id");
  const run = (needsLog = false) => {
    id(e.run_id, "run_id"); course(e.course);
    if (needsLog) id(e.log_id, "log_id");
  };
  const d = e.data;
  switch (e.kind) {
    case "question_submitted":
      question(); fields(d, ["text", "modality", "media"], ["text", "modality"]);
      text(d.text, "question", 65536); choice(d.modality, "modality", ["text", "voice", "image", "selection"]); media(d.media);
      break;
    case "question_routed":
      question(); fields(d, ["conversation_route", "media"], ["conversation_route"]);
      choice(d.conversation_route, "conversation route", ["direct-action", "turn"]); media(d.media);
      break;
    case "answer_delivered":
      question(); fields(d, ["text", "part_id", "media"], ["text", "part_id"]);
      text(d.text, "answer", 65536); id(d.part_id, "part_id"); media(d.media);
      break;
    case "course_delivered":
      question(); course(e.course); fields(d, ["artifact", "status", "snapshot_sha256", "event_count"], ["artifact", "status"]);
      text(d.artifact, "artifact", 2048); choice(d.status, "delivery status", ["partial", "complete"]);
      if (d.snapshot_sha256 !== undefined || d.event_count !== undefined) {
        if (typeof d.snapshot_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(d.snapshot_sha256)) fail("Invalid delivered snapshot digest");
        integer(d.event_count, "event_count");
        if (!d.event_count) fail("Empty delivered snapshot");
      }
      break;
    case "run_started":
      run(); fields(d, ["mode", "previous_run_id"], ["mode"]);
      choice(d.mode, "run mode", ["start", "resume", "restart"]);
      if (d.previous_run_id !== undefined) id(d.previous_run_id, "previous_run_id");
      break;
    case "playback_position":
      run(true); fields(d, ["cursor", "step_id", "beat_id", "reason"], ["cursor", "reason"]);
      integer(d.cursor, "cursor"); choice(d.reason, "position reason", ["play", "view", "seek", "skip", "restore"]);
      for (const key of ["step_id", "beat_id"]) if (d[key] !== undefined) text(d[key], key, 256);
      break;
    case "beat_completed":
      run(true); fields(d, ["step_id", "beat_id", "presentation", "delivery_sha256"], ["step_id", "beat_id", "presentation"]);
      text(d.step_id, "step_id", 256); text(d.beat_id, "beat_id", 256);
      choice(d.presentation, "presentation", ["audio", "text"]);
      if (d.delivery_sha256 !== undefined && !/^[a-f0-9]{64}$/.test(d.delivery_sha256)) fail("Invalid playback delivery digest");
      break;
    case "narration_ended":
      run(true); fields(d, ["beat_id", "reason"], ["beat_id", "reason"]);
      text(d.beat_id, "beat_id", 256);
      choice(d.reason, "narration reason", ["ended", "disabled", "failed", "cancelled"]);
      break;
    case "task_attempt":
      run(true); fields(d, ["task_id", "operation_id", "result", "hints_used", "value"], ["task_id", "operation_id", "result", "hints_used"]);
      text(d.task_id, "task_id", 256); text(d.operation_id, "operation_id", 256);
      choice(d.result, "task result", ["succeeded", "failed"]); integer(d.hints_used, "hints_used");
      if (d.value !== undefined && (typeof d.value !== "number" || !Number.isFinite(d.value))) fail("Invalid task value");
      break;
    case "task_hint":
      run(true); fields(d, ["task_id", "hint_index"], ["task_id", "hint_index"]);
      text(d.task_id, "task_id", 256); integer(d.hint_index, "hint_index");
      break;
    default: fail("Unknown history event kind");
  }
  // Copy only after validation; the caller cannot mutate a queued event later.
  return JSON.parse(JSON.stringify(e));
}

export function canonicalHistoryJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalHistoryJson).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalHistoryJson(value[key])}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("Non-JSON value");
  return encoded;
}

export function historyCourseKey(value) {
  course(value);
  return canonicalHistoryJson([value.kind, value.id, value.version]);
}
