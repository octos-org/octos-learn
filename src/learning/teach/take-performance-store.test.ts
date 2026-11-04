import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { AVATAR_TRACK_SCHEMA, type AvatarTrack } from "../avatar/performance-track";
import { deleteRecordingPerformances, readTakePerformance, saveTakePerformance } from "./take-performance-store";

const track: AvatarTrack = { schema: AVATAR_TRACK_SCHEMA, durationMs: 1000, frames: [
  { timeMs: 0, source: "mediapipe", tracked: true, channels: { eyeBlinkLeft: .5 }, rotation: [0, .1, 0] },
  { timeMs: 1000, source: "mediapipe", tracked: false, channels: {}, rotation: [0, 0, 0] }] };

it("keeps each take's performance per profile and recording, and removes a recording's takes together", async () => {
  const factory = new IDBFactory();
  const key = { profileId: "p1", recordingId: "rec-1", cardKey: "card-1", take: 1 };
  await saveTakePerformance(key, track, factory);
  await saveTakePerformance({ ...key, take: 2 }, track, factory);
  await saveTakePerformance({ ...key, recordingId: "rec-2" }, track, factory);
  expect((await readTakePerformance(key, factory))?.frames).toHaveLength(2);
  expect(await readTakePerformance({ ...key, profileId: "p2" }, factory)).toBeNull();
  // Extra fields (such as an image) never reach storage.
  await saveTakePerformance(key, { ...track, frames: [{ ...track.frames[0]!, image: "data:" } as never, track.frames[1]!] }, factory);
  expect(JSON.stringify(await readTakePerformance(key, factory))).not.toContain("data:");
  await deleteRecordingPerformances("p1", "rec-1", factory);
  expect(await readTakePerformance(key, factory)).toBeNull();
  expect(await readTakePerformance({ ...key, take: 2 }, factory)).toBeNull();
  expect(await readTakePerformance({ ...key, recordingId: "rec-2" }, factory)).not.toBeNull();
  await expect(saveTakePerformance({ ...key, take: 0 }, track, factory)).rejects.toThrow("invalid_take_key");
});
