import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { listAvatarClips, readAvatarClip, renameAvatarClip, saveAvatarClip, trashAvatarClip } from "./performance-store";
import { expressionSample, EXPRESSION_SAMPLES } from "./expression-samples";
import { parseAvatarTrack, sampleAvatarTrack } from "./performance-track";

describe("on-device expression library", () => {
  it("isolates profiles, including IDs that collide and profile IDs containing punctuation", async () => {
    const factory = new IDBFactory();
    await saveAvatarClip("a:b", { id: "same", name: "One", track: expressionSample("mouth") }, factory);
    await saveAvatarClip("a", { id: "same", name: "Two", track: expressionSample("blink") }, factory);
    expect((await listAvatarClips("a:b", factory)).map((clip) => clip.name)).toEqual(["One"]);
    expect((await listAvatarClips("a", factory)).map((clip) => clip.name)).toEqual(["Two"]);
    expect(await listAvatarClips("stranger", factory)).toEqual([]);
    await expect(readAvatarClip("stranger", "same", factory)).rejects.toThrow("clip_not_found");
    await expect(renameAvatarClip("stranger", "same", "Changed", factory)).rejects.toThrow("clip_not_found");
    await expect(trashAvatarClip("stranger", "same", true, factory)).rejects.toThrow("clip_not_found");
    expect((await listAvatarClips("a:b", factory))[0]!.name).toBe("One");
  });
  it("persists a clean copy, reopens, renames, and recovers a removed clip without altering motion", async () => {
    const factory = new IDBFactory();
    const track = expressionSample("loss");
    const expected = structuredClone(track);
    await saveAvatarClip("learner", { id: "one", name: "  My rehearsal  ", track }, factory);
    track.frames[0]!.channels.jawOpen = 0;
    expect(await readAvatarClip("learner", "one", factory)).toEqual(expected);
    await renameAvatarClip("learner", "one", "Renamed", factory);
    await trashAvatarClip("learner", "one", true, factory);
    const removed = (await listAvatarClips("learner", factory))[0]!;
    expect(removed).toMatchObject({ name: "Renamed", sources: ["demo"], frameCount: 121 });
    expect(removed.deletedAt).toBeTruthy();
    expect(removed).not.toHaveProperty("track");
    await expect(readAvatarClip("learner", "one", factory)).rejects.toThrow("clip_not_found");
    await trashAvatarClip("learner", "one", false, factory);
    expect(await readAvatarClip("learner", "one", factory)).toEqual(expected);
    expect((await listAvatarClips("learner", factory))[0]).not.toHaveProperty("deletedAt");
  });
  it("rejects a duplicate save atomically and keeps the original motion and title", async () => {
    const factory = new IDBFactory();
    const original = expressionSample("blink");
    await saveAvatarClip("a", { id: "same", name: "Original", track: original }, factory);
    await expect(saveAvatarClip("a", { id: "same", name: "Replacement", track: expressionSample("mouth") }, factory)).rejects.toThrow();
    expect((await listAvatarClips("a", factory))[0]!.name).toBe("Original");
    expect(await readAvatarClip("a", "same", factory)).toEqual(original);
  });
  it("validates imported motion and removes extraneous fields before persistence", async () => {
    const factory = new IDBFactory();
    const input = { ...expressionSample("head"), video: "must not persist" };
    await saveAvatarClip("a", { id: "one", name: "Safe", track: input }, factory);
    expect(await readAvatarClip("a", "one", factory)).not.toHaveProperty("video");
    await expect(saveAvatarClip("a", { id: "two", name: " ", track: input }, factory)).rejects.toThrow("invalid_clip_name");
    await expect(saveAvatarClip("a", { id: "bad", name: "Invalid", track: { ...input, durationMs: 90_000 } }, factory)).rejects.toThrow("invalid_track");
    expect(await listAvatarClips("a", factory)).toHaveLength(1);
  });
  it("propagates unavailable storage instead of claiming the clip was saved", async () => {
    const broken = { open() { throw new Error("storage unavailable"); } } as unknown as IDBFactory;
    await expect(saveAvatarClip("a", { id: "one", name: "Test", track: expressionSample("head") }, broken)).rejects.toThrow("storage unavailable");
  });
});

describe("synthetic expression rehearsals", () => {
  it.each(EXPRESSION_SAMPLES)("is deterministic and portable without a camera: $id", ({ id }) => {
    const track = expressionSample(id);
    expect(track).toEqual(expressionSample(id));
    expect(parseAvatarTrack(JSON.parse(JSON.stringify(track)))).toEqual(track);
    expect(new Set(track.frames.map((frame) => frame.source))).toEqual(new Set(["demo"]));
    expect(track.durationMs).toBe(4000);
    expect(track.frames).toHaveLength(121);
  });
  it("isolates left and right blinks and shows loss decay and reacquisition", () => {
    const blink = expressionSample("blink");
    expect(sampleAvatarTrack(blink, 800).channels).toMatchObject({ eyeBlinkLeft: 1, eyeBlinkRight: 0 });
    expect(sampleAvatarTrack(blink, 1800).channels).toMatchObject({ eyeBlinkLeft: 0, eyeBlinkRight: 1 });
    const loss = expressionSample("loss");
    expect(sampleAvatarTrack(loss, 1300).tracked).toBe(false);
    expect(sampleAvatarTrack(loss, 1300).channels.jawOpen).toBeGreaterThan(.1);
    expect(sampleAvatarTrack(loss, 2500).channels.jawOpen).toBeLessThan(.01);
    expect(sampleAvatarTrack(loss, 3000).tracked).toBe(true);
    expect(sampleAvatarTrack(loss, 3000).channels.jawOpen).toBeGreaterThan(.6);
  });
});
