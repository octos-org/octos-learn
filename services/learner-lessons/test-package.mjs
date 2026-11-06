import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const sha = data => createHash("sha256").update(data).digest("hex");
const AUTHOR = { learner_ref: "learner:abc", avatar_ref: "avatar:octo", voice_ref: "voice:learner-default" };

/** A final-audio mouth track for `audio`, as the app's envelope analysis writes one. */
export function mouthTrack(audio, durationMs = 900) {
  return { schema: "octos.avatar-lip-sync.v1", audioSha256: sha(audio), durationMs, method: "envelope-v1",
    keys: [{ timeMs: 0, channels: { jawOpen: 0 } }, { timeMs: 400, channels: { jawOpen: 0.6 } }, { timeMs: durationMs, channels: { jawOpen: 0 } }] };
}

/**
 * A package laid out exactly as the app's buildLearnerPackage writes one; `mouth` makes the v2 package with lip-sync.
 * `steps` is the lesson's cards: by default two cards saved the older way (one "teach" step, a beat per card).
 */
export function makePackage({ lessonId = "rec-one", extra = {}, tamper, tasks = 1, mouth = false, mouthTrack: track,
  steps = [{ id: "l:step:teach", beats: [{ id: "b1", narration: { text: "Hi" } }, { id: "b2" }] }] } = {}) {
  const lesson = [
    JSON.stringify({ lesson: { author: { learner_ref: AUTHOR.learner_ref, presented_by: { avatar_ref: AUTHOR.avatar_ref, voice_ref: AUTHOR.voice_ref } },
      tasks: Array.from({ length: tasks }, (_, index) => ({ as: `task-${index}` })) } }),
    ...steps.map(step => JSON.stringify({ step })),
  ].join("\n");
  const audio = Buffer.from("ID3 fake mp3");
  const entries = { "lesson.canonical.jsonl": Buffer.from(lesson), "narration/1.mp3": audio };
  const roles = { "lesson.canonical.jsonl": ["lesson", "application/x-ndjson"], "narration/1.mp3": ["narration", "audio/mpeg"] };
  if (mouth) {
    entries["mouth/1.json"] = Buffer.from(JSON.stringify(track ?? mouthTrack(audio)));
    roles["mouth/1.json"] = ["lip-sync", "application/json"];
  }
  Object.assign(entries, extra);
  const files = Object.entries(roles).map(([path, [role, mediaType]]) => ({ path, sha256: sha(entries[path]), bytes: entries[path].length, mediaType, role }));
  const manifest = { schema: mouth ? "octos.learner-lesson-package.v2" : "octos.learner-lesson-package.v1",
    ...(mouth ? { requiredCapabilities: ["avatar-lip-sync-v1"], lipSync: [{ beatId: "b1", file: "mouth/1.json", audioSha256: sha(audio), textSha256: sha("Hi") }] } : {}),
    lessonId, title: "Slope", language: "en-US", createdAt: "2026-11-02T00:00:00.000Z",
    author: { ...AUTHOR }, lesson: "lesson.canonical.jsonl",
    ink: [], narration: [{ beatId: "b1", file: "narration/1.mp3", textSha256: sha("Hi"), durationMs: 900 }], files, contentSha256: "" };
  const digest = () => { manifest.contentSha256 = sha([...manifest.files].sort((a, b) => a.path.localeCompare(b.path)).map(file => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join("\n")); };
  digest();
  // `tamper` may change the manifest or files; return "rehash" to keep the content hash consistent with a changed file list.
  if (tamper?.(manifest, entries, { sha }) === "rehash") digest();
  return Buffer.from(zipSync({ "manifest.json": Buffer.from(JSON.stringify(manifest)), ...entries }));
}
