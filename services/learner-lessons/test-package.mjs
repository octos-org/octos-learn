import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const sha = data => createHash("sha256").update(data).digest("hex");

/** A package laid out exactly as the app's buildLearnerPackage writes one. */
export function makePackage({ lessonId = "rec-one", extra = {}, tamper, tasks = 1 } = {}) {
  const lesson = [
    JSON.stringify({ lesson: { author: {}, tasks: Array.from({ length: tasks }, (_, index) => ({ as: `task-${index}` })) } }),
    JSON.stringify({ step: { id: "s1", beats: [{ id: "b1", narration: { text: "Hi" } }, { id: "b2" }] } }),
  ].join("\n");
  const entries = { "lesson.canonical.jsonl": Buffer.from(lesson), "narration/1.mp3": Buffer.from("ID3 fake mp3"), ...extra };
  const roles = { "lesson.canonical.jsonl": ["lesson", "application/x-ndjson"], "narration/1.mp3": ["narration", "audio/mpeg"] };
  const files = Object.entries(roles).map(([path, [role, mediaType]]) => ({ path, sha256: sha(entries[path]), bytes: entries[path].length, mediaType, role }));
  const contentSha256 = sha([...files].sort((a, b) => a.path.localeCompare(b.path)).map(file => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join("\n"));
  const manifest = { schema: "octos.learner-lesson-package.v1", lessonId, title: "Slope", language: "en-US", createdAt: "2026-11-02T00:00:00.000Z",
    author: { learner_ref: "learner:abc", avatar_ref: "avatar:octo", voice_ref: "voice:learner-default" }, lesson: "lesson.canonical.jsonl",
    ink: [], narration: [{ beatId: "b1", file: "narration/1.mp3", textSha256: sha("Hi"), durationMs: 900 }], files, contentSha256 };
  tamper?.(manifest, entries);
  return Buffer.from(zipSync({ "manifest.json": Buffer.from(JSON.stringify(manifest)), ...entries }));
}
