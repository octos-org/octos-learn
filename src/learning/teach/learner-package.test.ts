import { unzipSync, zipSync } from "fflate";
import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";
import { describe, expect, it } from "vitest";

import { compileRecording } from "./compile-recording";
import { buildLearnerPackage, lessonNarration, readLearnerPackage, LearnerPackageError, type NarrationClip } from "./learner-package";
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
  const compiled = compileRecording(recording, { author: learnerAuthor("Jordan Lee", { avatar: "avatar-3", voice: "zh_male_linjiananhai_uranus_bigtts" }), language: "en-US" });
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
    expect(manifest.author).toMatchObject({ avatar_ref: "avatar:avatar-3", voice_ref: "voice:zh_male_linjiananhai_uranus_bigtts" });
    expect(manifest.author.learner_ref).toMatch(/^learner:[a-f0-9]{32}$/);
    const loaded = await readLearnerPackage(archive);
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
});
