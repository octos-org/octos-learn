import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { deriveExecutionRequirements, normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";
import { describe, expect, it } from "vitest";

import { compileRecording } from "./compile-recording";
import { buildLearnerPackage, lessonNarration, readLearnerPackage, LearnerPackageError, sha256, LEARNER_PACKAGE_SCHEMA, LEARNER_MOUTH_PACKAGE_SCHEMA, type NarrationClip, type LearnerPackageManifest } from "./learner-package";
import { LIP_SYNC_SCHEMA, MOUTH_CHANNELS } from "../avatar/lip-sync";
import { checkLearnerPackage, MOUTH_CHANNELS as SERVICE_MOUTH_CHANNELS, PERFORMANCE_CHANNELS as SERVICE_PERFORMANCE_CHANNELS } from "../../../services/learner-lessons/package-check.mjs";
import { PERFORMANCE_CHANNELS, retimePerformance } from "../avatar/lesson-performance";
import { AVATAR_TRACK_SCHEMA } from "../avatar/performance-track";
import { addTakeInk, appendEvent, createRecording, finishTake, planCards, startTake } from "./recording";
import { learnerAuthor, learnerReference } from "./studio-helpers";

const now = "2026-11-01T12:00:00.000Z";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path d="M0 0L40 20"/></svg>';

function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function inkChecksum(svg: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function lessonEvents() {
  const storage = new Map<string, string>();
  const fakeStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } } as Storage;
  learnerReference("Jordan Lee", fakeStorage);
  let recording = planCards(createRecording({ id: "rec-1", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "Points" }, { title: "Rise over run" }]);
  recording = startTake(recording, "card-1", now);
  recording = appendEvent(recording, "card-1", { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now);
  recording = finishTake(recording, "card-1", now, { durationMs: 5_000, asrText: "Here is a grid." });
  recording = startTake(recording, "card-2", now);
  recording = addTakeInk(recording, "card-2", { snapshotId: "ink-snap:rec-1-card-2-t1-n1@v1", sha256: await inkChecksum(SVG), selections: ["sel-n1"], neat: { selection: "sel-n1", latex: "m=2", alias: "formula-1" } }, now);
  recording = appendEvent(recording, "card-2", { t: 100, type: "make_neat.confirmed", selection: "sel-n1", latex: "m=2", alias: "formula-1", replacesInk: true }, now);
  recording = finishTake(recording, "card-2", now, { durationMs: 5_000, asrText: "Six over three is two." });
  const compiled = compileRecording(recording, { author: learnerAuthor("Jordan Lee", { avatar: "moon-cat" }), language: "en-US" });
  const events = normalizeAuthoringLesson(compiled.lesson, { lessonId: "learner-rec-1", boardId: "board", baseRevision: 0, resourceContext: compiled.resourceContext });
  const snapshots = { "ink-snap:rec-1-card-2-t1-n1@v1": { svg: SVG, width: 40, height: 20, regions: {} } };
  const narration: NarrationClip[] = lessonNarration(events).map((entry, index) => ({ ...entry, audio: new Uint8Array([0xff, 0xfb, index + 1]), durationMs: 2_000 + index }));
  return { events, snapshots, narration };
}

describe("learner lesson package", () => {
  it("round-trips the lesson, handwriting and narration, and plays to the same board", async () => {
    const { events, snapshots, narration } = await lessonEvents();
    const { archive, manifest } = await buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration });
    expect(manifest.narration.map((entry) => entry.durationMs)).toEqual([2000, 2001]);
    expect(manifest.author).toMatchObject({ avatar_ref: "avatar:moon-cat", voice_ref: "voice:moon-cat" });
    expect(manifest.author.learner_ref).toMatch(/^learner:[a-f0-9]{32}$/);
    const loaded = await readLearnerPackage(archive);
    expect(manifest.schema).toBe(LEARNER_PACKAGE_SCHEMA);
    expect(loaded.mouthTrack(narration[0]!.beatId, narration[0]!.text)).toBeNull();
    expect(reduceCanonicalEvents(loaded.events)).toEqual(reduceCanonicalEvents(events));
    expect(loaded.resolveAsset("ink-snap:rec-1-card-2-t1-n1@v1")?.svg).toBe(SVG);
    const [first] = lessonNarration(events);
    const clip = await loaded.narration(first!.beatId, first!.text);
    expect(await bytesOf(clip!)).toEqual(new Uint8Array([0xff, 0xfb, 1]));
    // A clip made for other words is never played for these.
    expect(await loaded.narration(first!.beatId, "Something else.")).toBeNull();
    // The same content makes the same archive.
    expect((await buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration })).archive).toEqual(archive);
  });

  async function withMouth() {
    const input = await lessonEvents();
    for (const clip of input.narration) clip.lipSync = { schema: LIP_SYNC_SCHEMA, audioSha256: await sha256(clip.audio), method: "envelope-v1", durationMs: clip.durationMs,
      keys: [{ timeMs: 0, channels: {} }, { timeMs: 1000, channels: { jawOpen: .7 } }, { timeMs: clip.durationMs, channels: {} }] };
    return { lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, ...input };
  }

  it("round-trips versioned final-audio mouth tracks and retains v1 compatibility", async () => {
    const input = await withMouth();
    const { archive, manifest } = await buildLearnerPackage(input);
    expect(manifest.schema).toBe(LEARNER_MOUTH_PACKAGE_SCHEMA);
    expect(manifest.requiredCapabilities).toEqual(["avatar-lip-sync-v1"]);
    const loaded = await readLearnerPackage(archive), first = input.narration[0]!;
    expect(loaded.mouthTrack(first.beatId, first.text)).toEqual(first.lipSync);
    expect(loaded.mouthTrack(first.beatId, "Changed words")).toBeNull();
    const copy = loaded.mouthTrack(first.beatId, first.text)!; copy.keys[1]!.channels.jawOpen = 0;
    expect(loaded.mouthTrack(first.beatId, first.text)!.keys[1]!.channels.jawOpen).toBe(.7);
    expect((await buildLearnerPackage(input)).archive).toEqual(archive);
  });

  it("refuses stale, missing or duplicated tracks while building", async () => {
    const input = await withMouth();
    input.narration[0]!.lipSync!.audioSha256 = "f".repeat(64);
    await expect(buildLearnerPackage(input)).rejects.toThrow("lip_audio_mismatch");
    const missing = await withMouth(); delete missing.narration[1]!.lipSync;
    await expect(buildLearnerPackage(missing)).rejects.toThrow("mouth track");
    const duplicate = await withMouth(); duplicate.narration.push(duplicate.narration[0]!);
    await expect(buildLearnerPackage(duplicate)).rejects.toThrow("Duplicate narration clips");
  });

  it("declares what the lesson needs from the OLL player, and refuses a lesson it cannot play before reading it", async () => {
    const { events, snapshots, narration } = await lessonEvents();
    const { archive, manifest } = await buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration });
    expect(manifest.oll).toEqual(deriveExecutionRequirements(events));
    expect(manifest.oll!.requiredCapabilities.length).toBeGreaterThan(0);
    expect(() => checkLearnerPackage(Buffer.from(archive), "rec-1")).not.toThrow();

    const rewrite = (change: (manifest: LearnerPackageManifest) => void) => {
      const files = unzipSync(archive), edited = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as LearnerPackageManifest;
      change(edited);
      files["manifest.json"] = new TextEncoder().encode(JSON.stringify(edited));
      return zipSync(files);
    };
    // A package made before the block existed still loads.
    await expect(readLearnerPackage(rewrite((edited) => { delete edited.oll; }))).resolves.toBeTruthy();
    expect(() => checkLearnerPackage(Buffer.from(rewrite((edited) => { delete edited.oll; })), "rec-1")).not.toThrow();
    // A newer player, an unknown feature or a missing plugin: refused by name of the problem, not by a failed lesson.
    await expect(readLearnerPackage(rewrite((edited) => { edited.oll!.minimumPlayerVersion = "99.0.0"; }))).rejects.toThrow("needs a newer app");
    await expect(readLearnerPackage(rewrite((edited) => { edited.oll!.requiredCapabilities.push("plugin:physics/vectors@1"); }))).rejects.toThrow("needs a newer app");
    // A declaration that leaves out what the lesson uses.
    await expect(readLearnerPackage(rewrite((edited) => { edited.oll = { minimumPlayerVersion: "0.1.0", requiredCapabilities: [] }; }))).rejects.toThrow("does not match its lesson");
    // Malformed blocks.
    await expect(readLearnerPackage(rewrite((edited) => { (edited.oll as unknown as { minimumPlayerVersion: number }).minimumPlayerVersion = 1; }))).rejects.toThrow("Invalid lesson package manifest");
    expect(() => checkLearnerPackage(Buffer.from(rewrite((edited) => { (edited.oll as unknown as Record<string, unknown>).code = "x"; })), "rec-1")).toThrow("Invalid player requirements");
  });

  // Rebuild integrity hashes as a file editor could. Semantic binding must
  // still reject a mismatched audio/text/track pair after those hashes agree.
  async function editedPackage(edit: (files: Record<string, Uint8Array>, manifest: LearnerPackageManifest) => void) {
    const { archive } = await buildLearnerPackage(await withMouth());
    const files = unzipSync(archive), manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as LearnerPackageManifest;
    edit(files, manifest);
    for (const entry of manifest.files) { entry.sha256 = await sha256(files[entry.path]!); entry.bytes = files[entry.path]!.byteLength; }
    manifest.contentSha256 = await sha256([...manifest.files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join("\n"));
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));
    return zipSync(files);
  }

  it("rejects a changed audio pair even when its file hashes were updated", async () => {
    const archive = await editedPackage((files) => { files["narration/1.mp3"] = new Uint8Array([1, 2, 3]); });
    await expect(readLearnerPackage(archive)).rejects.toThrow("mouth track does not match its narration");
  });

  it("rejects a changed lesson transcript or illegal motion even with updated hashes", async () => {
    const changed = await editedPackage((files, manifest) => {
      files[manifest.lesson] = new TextEncoder().encode(new TextDecoder().decode(files[manifest.lesson]!).replace("Here is a grid.", "Here are changed words."));
    });
    await expect(readLearnerPackage(changed)).rejects.toThrow("narration does not match its lesson");
    const illegal = await editedPackage((files) => {
      const track = JSON.parse(new TextDecoder().decode(files["mouth/1.json"]!)); track.keys[1].channels.eyeBlinkLeft = 1;
      files["mouth/1.json"] = new TextEncoder().encode(JSON.stringify(track));
    });
    await expect(readLearnerPackage(illegal)).rejects.toThrow("invalid mouth track");
  });

  it("rejects schema downgrades, unknown required capabilities and ambiguous file references", async () => {
    for (const edit of [
      (_files: Record<string, Uint8Array>, manifest: LearnerPackageManifest) => { manifest.schema = LEARNER_PACKAGE_SCHEMA; },
      (_files: Record<string, Uint8Array>, manifest: LearnerPackageManifest) => { manifest.requiredCapabilities = ["future-rig"] as unknown as ["avatar-lip-sync-v1"]; },
      (_files: Record<string, Uint8Array>, manifest: LearnerPackageManifest) => { manifest.narration[1]!.file = manifest.narration[0]!.file; },
    ]) await expect(readLearnerPackage(await editedPackage(edit))).rejects.toThrow("Invalid lesson package manifest");
  });

  it("preserves the actual audio media type in the archive and offline reader", async () => {
    const input = await withMouth(); input.narration[0]!.mediaType = "audio/wav";
    const loaded = await readLearnerPackage((await buildLearnerPackage(input)).archive);
    expect(loaded.manifest.narration[0]!.file).toBe("narration/1.wav");
    expect((await loaded.narration(input.narration[0]!.beatId, input.narration[0]!.text))?.type).toBe("audio/wav");
  });

  it("carries no real name, and no audio but the made narration", async () => {
    const { events, snapshots, narration } = await lessonEvents();
    const { archive } = await buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration });
    const files = unzipSync(archive);
    const text = Object.entries(files).filter(([path]) => !path.endsWith(".mp3")).map(([, data]) => new TextDecoder().decode(data)).join("\n");
    expect(text).not.toMatch(/Jordan|Lee/);
    expect(Object.keys(files).filter((path) => /\.(mp3|wav|webm|ogg|m4a)$/.test(path))).toEqual(["narration/1.mp3", "narration/2.mp3"]);
  });

  it("refuses a changed file, an unlisted file, and narration that is missing or out of date", async () => {
    const { events, snapshots, narration } = await lessonEvents();
    const { archive } = await buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration });
    const files = unzipSync(archive);
    files["narration/1.mp3"] = new Uint8Array([1, 2, 3]);
    await expect(readLearnerPackage(zipSync(files))).rejects.toThrow("narration/1.mp3 does not match the package manifest");
    const extra = unzipSync(archive);
    extra["notes.txt"] = new TextEncoder().encode("hello");
    await expect(readLearnerPackage(zipSync(extra))).rejects.toThrow(LearnerPackageError);
    await expect(buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration: narration.slice(1) })).rejects.toThrow("missing or out of date");
    await expect(buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration: narration.map((clip) => ({ ...clip, text: "Old words." })) })).rejects.toThrow("missing or out of date");
    await expect(buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots: {}, narration })).rejects.toThrow("missing on this device");
  });

  // The account service (services/learner-lessons) checks packages on its own; it must keep
  // accepting exactly what this builder writes, with and without mouth motion.
  it("is accepted by the account service as v1 and as v2 with mouth motion", async () => {
    expect([...SERVICE_MOUTH_CHANNELS]).toEqual([...MOUTH_CHANNELS]);
    const { events, snapshots, narration } = await lessonEvents();
    const plain = await buildLearnerPackage({ lessonId: "rec-1", title: "Slope", language: "en-US", createdAt: now, events, snapshots, narration });
    expect(checkLearnerPackage(Buffer.from(plain.archive), "rec-1")).toMatchObject({ cards: 2, author: plain.manifest.author, content_sha256: plain.manifest.contentSha256 });
    const input = await withMouth(); input.narration[1]!.mediaType = "audio/mp4";
    const animated = await buildLearnerPackage(input);
    expect(animated.manifest.schema).toBe(LEARNER_MOUTH_PACKAGE_SCHEMA);
    expect(checkLearnerPackage(Buffer.from(animated.archive), "rec-1").content_sha256).toBe(animated.manifest.contentSha256);
    const changed = await editedPackage((files, manifest) => {
      files[manifest.lesson] = new TextEncoder().encode(new TextDecoder().decode(files[manifest.lesson]!).replace("Here is a grid.", "Here are changed words."));
    });
    expect(() => checkLearnerPackage(Buffer.from(changed), "rec-1")).toThrow("narration does not match its lesson");
    const calibration = readFileSync("docs/avatar-animation-phase-a/calibration-mouth-course.olesson");
    expect(checkLearnerPackage(calibration, "synthetic-mouth-calibration").cards).toBe(2);
    const swapped = await editedPackage((files) => { files["narration/1.mp3"] = new Uint8Array([1, 2, 3]); });
    expect(() => checkLearnerPackage(Buffer.from(swapped), "rec-1")).toThrow("mouth track does not match its narration");
  });

  async function withPerformance() {
    const input = await withMouth();
    const take = { schema: AVATAR_TRACK_SCHEMA, durationMs: 3000, frames: [
      { timeMs: 0, source: "mediapipe" as const, tracked: true, channels: { browInnerUp: .2 }, rotation: [0, 0, 0] as [number, number, number] },
      { timeMs: 3000, source: "mediapipe" as const, tracked: true, channels: { browInnerUp: .8, jawOpen: 1 }, rotation: [0, .3, 0] as [number, number, number] }] };
    // Only the first card was recorded with the camera on.
    const first = input.narration[0]!;
    first.performance = retimePerformance(take, [500, 2500], { sha256: await sha256(first.audio), durationMs: first.durationMs });
    return input;
  }

  it("carries the learner's re-timed camera performance for the cards recorded with the camera", async () => {
    expect([...SERVICE_PERFORMANCE_CHANNELS]).toEqual([...PERFORMANCE_CHANNELS]);
    const input = await withPerformance();
    const { archive, manifest } = await buildLearnerPackage(input);
    expect(manifest.requiredCapabilities).toEqual(["avatar-lip-sync-v1", "avatar-performance-v1"]);
    expect(manifest.performance).toHaveLength(1);
    const loaded = await readLearnerPackage(archive), [first, second] = input.narration;
    expect(loaded.performanceTrack(first!.beatId, first!.text)).toEqual(first!.performance);
    expect(loaded.performanceTrack(first!.beatId, "Changed words")).toBeNull();
    expect(loaded.performanceTrack(second!.beatId, second!.text)).toBeNull();
    expect(checkLearnerPackage(Buffer.from(archive), "rec-1").content_sha256).toBe(manifest.contentSha256);
    // Without mouth motion there is no performance; the capability cannot be dropped or faked.
    const silent = await withPerformance(); for (const clip of silent.narration) delete clip.lipSync;
    await expect(buildLearnerPackage(silent)).rejects.toThrow("Camera performance needs mouth motion");
  });

  it("refuses a camera performance that does not match its narration or carries articulation", async () => {
    const built = async (edit: (files: Record<string, Uint8Array>, manifest: LearnerPackageManifest) => void) => {
      const { archive } = await buildLearnerPackage(await withPerformance());
      const files = unzipSync(archive), manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as LearnerPackageManifest;
      edit(files, manifest);
      for (const entry of manifest.files) { entry.sha256 = await sha256(files[entry.path]!); entry.bytes = files[entry.path]!.byteLength; }
      manifest.contentSha256 = await sha256([...manifest.files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join("\n"));
      files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));
      return zipSync(files);
    };
    const talking = await built((files) => {
      const track = JSON.parse(new TextDecoder().decode(files["performance/1.json"]!)); track.keys[1].channels.jawOpen = 1;
      files["performance/1.json"] = new TextEncoder().encode(JSON.stringify(track));
    });
    await expect(readLearnerPackage(talking)).rejects.toThrow("invalid camera performance");
    expect(() => checkLearnerPackage(Buffer.from(talking), "rec-1")).toThrow("invalid camera performance");
    const moved = await built((_files, manifest) => { manifest.performance![0]!.beatId = manifest.narration[1]!.beatId; });
    await expect(readLearnerPackage(moved)).rejects.toThrow("camera performance does not match");
    expect(() => checkLearnerPackage(Buffer.from(moved), "rec-1")).toThrow("camera performance does not match");
    const undeclared = await built((_files, manifest) => { manifest.requiredCapabilities = ["avatar-lip-sync-v1"]; });
    await expect(readLearnerPackage(undeclared)).rejects.toThrow("Invalid lesson package manifest");
    expect(() => checkLearnerPackage(Buffer.from(undeclared), "rec-1")).toThrow("Invalid camera performance");
  });
});
