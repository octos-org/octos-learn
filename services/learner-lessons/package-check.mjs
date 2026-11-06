import { createHash } from "node:crypto";
import { readZip, ZipError } from "./zip.mjs";

// The service keeps a learner lesson package only when every file matches the
// manifest the app wrote (see src/learning/teach/learner-package.ts) and the
// manifest matches the lesson inside it. The package may hold the lesson,
// frozen handwriting, pre-made narration and, in v2, the mouth motion made
// from that narration and optionally the learner's expression and head
// parameters re-timed onto it, and nothing else: no recorded voice, no camera frames,
// no images of the learner, no other files or manifest fields.
export const LEARNER_PACKAGE_SCHEMA = "octos.learner-lesson-package.v1";
export const LEARNER_MOUTH_PACKAGE_SCHEMA = "octos.learner-lesson-package.v2";
export const LIP_SYNC_SCHEMA = "octos.avatar-lip-sync.v1";
/** The account keeps packages up to this size (nginx allows 33 MiB per request). The app builds up to 100 MB for local use. */
export const PACKAGE_MAX_BYTES = 32 * 1024 * 1024;
const FILE_MAX_BYTES = 25_000_000;
const MAX_FILES = 512;
const MAX_LIP_SYNC_MS = 60_000;
const MAX_LIP_KEYS = 6001;
// The mouth, jaw and tongue channels of FACE_CHANNELS (src/learning/avatar/face-frame.ts);
// a test keeps the two lists equal.
export const MOUTH_CHANNELS = Object.freeze([
  "jawForward", "jawLeft", "jawOpen", "jawRight", "mouthClose", "mouthDimpleLeft", "mouthDimpleRight",
  "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper",
  "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight",
  "mouthUpperUpLeft", "mouthUpperUpRight", "tongueOut",
]);
const MOUTH = new Set(MOUTH_CHANNELS);
export const LESSON_PERFORMANCE_SCHEMA = "octos.avatar-lesson-performance.v1";
// PERFORMANCE_CHANNELS of src/learning/avatar/lesson-performance.ts: expression only,
// never jaw or lip articulation; a test keeps the two lists equal.
export const PERFORMANCE_CHANNELS = Object.freeze([
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "cheekPuff", "cheekSquintLeft", "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight",
  "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
  "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
  "mouthFrownLeft", "mouthFrownRight", "mouthSmileLeft", "mouthSmileRight", "noseSneerLeft", "noseSneerRight",
]);
const PERFORMANCE = new Set(PERFORMANCE_CHANNELS);
const MAX_PERFORMANCE_KEYS = MAX_LIP_SYNC_MS / 50 + 2;
const AUDIO = Object.freeze({ mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4" });
const ROLES = Object.freeze({
  lesson: { path: /^lesson\.canonical\.jsonl$/, mediaType: () => "application/x-ndjson" },
  ink: { path: /^ink\/[a-f0-9]{64}\.svg$/, mediaType: () => "image/svg+xml" },
  narration: { path: /^narration\/[1-9]\d{0,3}\.(mp3|wav|ogg|m4a)$/, mediaType: path => AUDIO[path.slice(path.lastIndexOf(".") + 1)] },
  "lip-sync": { path: /^mouth\/[1-9]\d{0,3}\.json$/, mediaType: () => "application/json", mouthOnly: true },
  performance: { path: /^performance\/[1-9]\d{0,3}\.json$/, mediaType: () => "application/json", mouthOnly: true },
});
const MANIFEST_KEYS = new Set(["schema", "requiredCapabilities", "lessonId", "title", "language", "createdAt", "author", "lesson", "ink", "narration", "lipSync", "performance", "files", "contentSha256"]);
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;

export class LearnerPackageError extends Error {}
const fail = message => { throw new LearnerPackageError(message); };
const sha256 = data => createHash("sha256").update(data).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const keysAre = (value, keys) => object(value) && Object.keys(value).sort().join() === [...keys].sort().join();

function listDigest(files) {
  // The same order and lines as the app's listDigest.
  return sha256([...files].sort((a, b) => a.path.localeCompare(b.path)).map(file => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join("\n"));
}

/** The same rules as the app's parseLipSyncTrack (src/learning/avatar/lip-sync.ts). */
function checkLipSyncTrack(raw, expected) {
  const bad = () => fail("The package has an invalid mouth track");
  if (!keysAre(raw, ["schema", "audioSha256", "durationMs", "method", "keys"]) || raw.schema !== LIP_SYNC_SCHEMA) bad();
  if (raw.audioSha256 !== expected.audioSha256) fail("The mouth track does not match its narration");
  if (!positive(raw.durationMs) || raw.durationMs > MAX_LIP_SYNC_MS || Math.abs(raw.durationMs - expected.durationMs) > 50
    || !["envelope-v1", "aligned-visemes-v1"].includes(raw.method) || !Array.isArray(raw.keys) || raw.keys.length < 2 || raw.keys.length > MAX_LIP_KEYS) bad();
  let previous = -1;
  for (const key of raw.keys) {
    if (!keysAre(key, ["timeMs", "channels"]) || typeof key.timeMs !== "number" || !Number.isFinite(key.timeMs)
      || key.timeMs <= previous || key.timeMs < 0 || key.timeMs > raw.durationMs || !object(key.channels)) bad();
    for (const [channel, weight] of Object.entries(key.channels)) {
      if (!MOUTH.has(channel) || typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) bad();
    }
    previous = key.timeMs;
  }
  if (raw.keys[0].timeMs !== 0 || raw.keys.at(-1).timeMs !== raw.durationMs) bad();
}

/** The same rules as the app's parseLessonPerformance (src/learning/avatar/lesson-performance.ts). */
function checkPerformanceTrack(raw, expected) {
  const bad = () => fail("The package has an invalid camera performance");
  if (!keysAre(raw, ["schema", "audioSha256", "durationMs", "keys"]) || raw.schema !== LESSON_PERFORMANCE_SCHEMA) bad();
  if (raw.audioSha256 !== expected.audioSha256) fail("The camera performance does not match its narration");
  if (!positive(raw.durationMs) || raw.durationMs > MAX_LIP_SYNC_MS || Math.abs(raw.durationMs - expected.durationMs) > 50
    || !Array.isArray(raw.keys) || raw.keys.length < 2 || raw.keys.length > MAX_PERFORMANCE_KEYS) bad();
  let previous = -1;
  for (const key of raw.keys) {
    if (!keysAre(key, ["timeMs", "channels", "rotation"]) || typeof key.timeMs !== "number" || !Number.isFinite(key.timeMs)
      || key.timeMs <= previous || key.timeMs < 0 || key.timeMs > raw.durationMs || !object(key.channels)
      || !Array.isArray(key.rotation) || key.rotation.length !== 3 || !key.rotation.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1.25)) bad();
    for (const [channel, weight] of Object.entries(key.channels)) {
      if (!PERFORMANCE.has(channel) || typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) bad();
    }
    previous = key.timeMs;
  }
  if (raw.keys[0].timeMs !== 0 || raw.keys.at(-1).timeMs !== raw.durationMs) bad();
}

/** Checks a package archive and returns what the service records about it. */

/**
 * A learner lesson has one step per card (its beats are runs of sentences),
 * continued in steps "<card>-part2", … when a card has more beats than a step
 * holds; lessons saved before that have one step, "teach", with a beat per card.
 */
function cardCount(events, beats) {
  const steps = events.flatMap(event => event?.step ? [event.step] : []);
  if (steps.length === 1 && String(steps[0].id).endsWith(":step:teach")) return beats.length;
  return new Set(steps.map(step => String(step.id).split(":step:").at(-1).split("-part")[0])).size;
}

export function checkLearnerPackage(archive, lessonId) {
  if (!Buffer.isBuffer(archive) || !archive.length) fail("Empty lesson package");
  if (archive.length > PACKAGE_MAX_BYTES) fail("Lesson package too large");
  let entries;
  try { entries = readZip(archive, { maxEntries: MAX_FILES + 1, maxBytes: 4 * PACKAGE_MAX_BYTES }); }
  catch (error) { if (error instanceof ZipError) fail(`Not a lesson package: ${error.message}`); throw error; }
  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) fail("The package has no manifest");
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); } catch { fail("The package manifest is not JSON"); }
  if (!object(manifest) || ![LEARNER_PACKAGE_SCHEMA, LEARNER_MOUTH_PACKAGE_SCHEMA].includes(manifest.schema)) fail("Unknown lesson package schema");
  if (Object.keys(manifest).some(key => !MANIFEST_KEYS.has(key))) fail("The package manifest has unknown fields");
  const animated = manifest.schema === LEARNER_MOUTH_PACKAGE_SCHEMA;
  const capabilities = Array.isArray(manifest.requiredCapabilities) ? manifest.requiredCapabilities.join() : "";
  const moving = capabilities === "avatar-lip-sync-v1,avatar-performance-v1";
  if (animated) {
    if ((capabilities !== "avatar-lip-sync-v1" && !moving) || !Array.isArray(manifest.lipSync) || !manifest.lipSync.length) fail("Invalid mouth motion in the package manifest");
    if (moving ? !Array.isArray(manifest.performance) || !manifest.performance.length : manifest.performance !== undefined) fail("Invalid camera performance in the package manifest");
  } else if (manifest.requiredCapabilities !== undefined || manifest.lipSync !== undefined || manifest.performance !== undefined) fail("Unknown lesson package schema");
  if (manifest.lessonId !== lessonId) fail("The package belongs to a different lesson");
  if (typeof manifest.title !== "string" || !manifest.title.trim() || manifest.title.length > 200) fail("Invalid lesson title");
  if (typeof manifest.language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(manifest.language)) fail("Invalid lesson language");
  if (typeof manifest.createdAt !== "string" || manifest.createdAt.length > 40 || Number.isNaN(Date.parse(manifest.createdAt))) fail("Invalid package date");
  const author = manifest.author;
  if (!keysAre(author, ["avatar_ref", "learner_ref", "voice_ref"])
    || !Object.values(author).every(value => typeof value === "string" && REFERENCE.test(value))) fail("Invalid lesson author");
  if (!HASH.test(manifest.contentSha256 ?? "")) fail("The package content hash does not match");

  // Every listed file is one the package may hold, and is what the manifest says.
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES) fail("The package lists no files");
  const listed = new Map();
  for (const file of manifest.files) {
    const role = object(file) ? ROLES[file.role] : undefined;
    if (!role || (role.mouthOnly && !animated) || !keysAre(file, ["path", "sha256", "bytes", "mediaType", "role"]) || typeof file.path !== "string"
      || !role.path.test(file.path) || file.mediaType !== role.mediaType(file.path) || listed.has(file.path)
      || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > FILE_MAX_BYTES || !HASH.test(file.sha256)) fail("The package lists a file it may not hold");
    listed.set(file.path, file);
    const data = entries.get(file.path);
    if (!data || data.length !== file.bytes || sha256(data) !== file.sha256) fail(`${file.path} does not match the package manifest`);
  }
  if ([...entries.keys()].some(path => path !== "manifest.json" && !listed.has(path))) fail("The package holds files its manifest does not list");
  if (listDigest(manifest.files) !== manifest.contentSha256) fail("The package content hash does not match");

  // Every file is used exactly once, by an entry of its own role.
  const used = new Set();
  const use = (path, role) => {
    const file = typeof path === "string" ? listed.get(path) : undefined;
    if (!file || file.role !== role || used.has(path)) fail("The package manifest refers to its files wrongly");
    used.add(path);
    return file;
  };
  if (manifest.files.filter(file => file.role === "lesson").length !== 1) fail("The package needs exactly one lesson");
  use(manifest.lesson, "lesson");
  if (!Array.isArray(manifest.ink) || !Array.isArray(manifest.narration)) fail("Invalid package manifest");
  const snapshots = new Set();
  for (const entry of manifest.ink) {
    if (!keysAre(entry, ["snapshotId", "file", "width", "height", "regions"]) || typeof entry.snapshotId !== "string" || !entry.snapshotId || entry.snapshotId.length > 200
      || snapshots.has(entry.snapshotId) || !positive(entry.width) || !positive(entry.height) || !object(entry.regions)
      || !Object.values(entry.regions).every(region => keysAre(region, ["x", "y", "width", "height"]) && Object.values(region).every(Number.isFinite))) fail("Invalid handwriting in the package manifest");
    snapshots.add(entry.snapshotId);
    use(entry.file, "ink");
  }
  const narration = new Map();
  for (const entry of manifest.narration) {
    if (!keysAre(entry, ["beatId", "file", "textSha256", "durationMs"]) || typeof entry.beatId !== "string" || narration.has(entry.beatId)
      || !HASH.test(entry.textSha256) || !positive(entry.durationMs)) fail("Invalid narration in the package manifest");
    narration.set(entry.beatId, { ...entry, audioSha256: use(entry.file, "narration").sha256 });
  }
  if (animated) {
    if (manifest.lipSync.length !== manifest.narration.length) fail("Every narrated card needs its mouth track");
    const mouths = new Set();
    for (const entry of manifest.lipSync) {
      const clip = object(entry) ? narration.get(entry.beatId) : undefined;
      if (!keysAre(entry, ["beatId", "file", "audioSha256", "textSha256"]) || !clip || mouths.has(entry.beatId)) fail("Invalid mouth motion in the package manifest");
      if (entry.audioSha256 !== clip.audioSha256 || entry.textSha256 !== clip.textSha256) fail("The mouth track does not match its narration");
      mouths.add(entry.beatId);
      const file = use(entry.file, "lip-sync");
      let track;
      try { track = JSON.parse(entries.get(file.path).toString("utf8")); } catch { fail("The package has an invalid mouth track"); }
      checkLipSyncTrack(track, clip);
    }
    const moves = new Set();
    for (const entry of manifest.performance ?? []) {
      const clip = object(entry) ? narration.get(entry.beatId) : undefined;
      if (!keysAre(entry, ["beatId", "file", "audioSha256", "textSha256"]) || !clip || moves.has(entry.beatId)) fail("Invalid camera performance in the package manifest");
      if (entry.audioSha256 !== clip.audioSha256 || entry.textSha256 !== clip.textSha256) fail("The camera performance does not match its narration");
      moves.add(entry.beatId);
      const file = use(entry.file, "performance");
      let track;
      try { track = JSON.parse(entries.get(file.path).toString("utf8")); } catch { fail("The package has an invalid camera performance"); }
      checkPerformanceTrack(track, clip);
    }
  }
  if (used.size !== listed.size) fail("The package manifest refers to its files wrongly");

  // The manifest describes the lesson inside it: the same author and the same narrated words.
  const lines = entries.get(manifest.lesson).toString("utf8").split("\n").filter(Boolean);
  let events;
  try { events = lines.map(line => JSON.parse(line)); } catch { fail("The lesson is not canonical JSON lines"); }
  const beats = events.flatMap(event => Array.isArray(event?.step?.beats) ? event.step.beats : []);
  if (!beats.length) fail("The lesson has no cards");
  const found = events.find(event => event?.lesson?.author)?.lesson?.author;
  if (!found || found.learner_ref !== author.learner_ref || found.presented_by?.avatar_ref !== author.avatar_ref || found.presented_by?.voice_ref !== author.voice_ref) {
    fail("The package author does not match its lesson");
  }
  const spoken = beats.flatMap(beat => typeof beat?.narration?.text === "string" && beat.narration.text.trim() ? [[beat.id, beat.narration.text.trim()]] : []);
  if (spoken.length !== narration.size || spoken.some(([beatId, text]) => narration.get(beatId)?.textSha256 !== sha256(text))) {
    fail("The package narration does not match its lesson");
  }
  return {
    content_sha256: manifest.contentSha256, title: manifest.title.trim(), language: manifest.language, author,
    cards: cardCount(events, beats), practice_tasks: events.flatMap(event => Array.isArray(event?.lesson?.tasks) ? event.lesson.tasks : []).length, bytes: archive.length,
  };
}
