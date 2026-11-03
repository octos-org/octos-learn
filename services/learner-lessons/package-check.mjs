import { createHash } from "node:crypto";
import { readZip, ZipError } from "./zip.mjs";

// The service keeps a learner lesson package only when every file matches the
// manifest the app wrote (see src/learning/teach/learner-package.ts). The
// package may hold the lesson, frozen handwriting and pre-made narration and
// nothing else: no recorded voice, no images of the learner, no other files.
export const LEARNER_PACKAGE_SCHEMA = "octos.learner-lesson-package.v1";
export const PACKAGE_MAX_BYTES = 32 * 1024 * 1024;
const ROLES = Object.freeze({
  lesson: { path: /^lesson\.canonical\.jsonl$/, mediaType: "application/x-ndjson" },
  ink: { path: /^ink\/[a-f0-9]{64}\.svg$/, mediaType: "image/svg+xml" },
  narration: { path: /^narration\/[1-9]\d{0,3}\.mp3$/, mediaType: "audio/mpeg" },
});
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class LearnerPackageError extends Error {}
const fail = message => { throw new LearnerPackageError(message); };
const sha256 = data => createHash("sha256").update(data).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function listDigest(files) {
  // The same order and lines as the app's listDigest.
  return sha256([...files].sort((a, b) => a.path.localeCompare(b.path)).map(file => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join("\n"));
}

/** Checks a package archive and returns what the service records about it. */
export function checkLearnerPackage(archive, lessonId) {
  if (!Buffer.isBuffer(archive) || !archive.length) fail("Empty lesson package");
  if (archive.length > PACKAGE_MAX_BYTES) fail("Lesson package too large");
  let entries;
  try { entries = readZip(archive, { maxBytes: 4 * PACKAGE_MAX_BYTES }); }
  catch (error) { if (error instanceof ZipError) fail(`Not a lesson package: ${error.message}`); throw error; }
  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) fail("The package has no manifest");
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); } catch { fail("The package manifest is not JSON"); }
  if (!object(manifest) || manifest.schema !== LEARNER_PACKAGE_SCHEMA) fail("Unknown lesson package schema");
  if (manifest.lessonId !== lessonId) fail("The package belongs to a different lesson");
  if (typeof manifest.title !== "string" || !manifest.title.trim() || manifest.title.length > 200) fail("Invalid lesson title");
  if (typeof manifest.language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(manifest.language)) fail("Invalid lesson language");
  const author = manifest.author;
  if (!object(author) || Object.keys(author).sort().join() !== "avatar_ref,learner_ref,voice_ref"
    || !Object.values(author).every(value => typeof value === "string" && REFERENCE.test(value))) fail("Invalid lesson author");
  if (!Array.isArray(manifest.files) || !manifest.files.length) fail("The package lists no files");
  const listed = new Set();
  for (const file of manifest.files) {
    if (!object(file) || !ROLES[file.role] || typeof file.path !== "string" || !ROLES[file.role].path.test(file.path)
      || file.mediaType !== ROLES[file.role].mediaType || listed.has(file.path)) fail("The package lists a file it may not hold");
    listed.add(file.path);
    const data = entries.get(file.path);
    if (!data || data.length !== file.bytes || sha256(data) !== file.sha256) fail(`${file.path} does not match the package manifest`);
  }
  if ([...entries.keys()].some(path => path !== "manifest.json" && !listed.has(path))) fail("The package holds files its manifest does not list");
  if (manifest.files.filter(file => file.role === "lesson").length !== 1 || manifest.files.find(file => file.role === "lesson").path !== manifest.lesson) fail("The package needs exactly one lesson");
  if (listDigest(manifest.files) !== manifest.contentSha256) fail("The package content hash does not match");
  const lines = entries.get(manifest.lesson).toString("utf8").split("\n").filter(Boolean);
  let events;
  try { events = lines.map(line => JSON.parse(line)); } catch { fail("The lesson is not canonical JSON lines"); }
  const beats = events.flatMap(event => event?.step?.beats ?? []);
  if (!beats.length) fail("The lesson has no cards");
  return {
    content_sha256: manifest.contentSha256, title: manifest.title.trim(), language: manifest.language, author,
    cards: beats.length, practice_tasks: events.flatMap(event => Array.isArray(event?.lesson?.tasks) ? event.lesson.tasks : []).length, bytes: archive.length,
  };
}
