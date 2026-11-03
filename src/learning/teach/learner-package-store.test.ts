import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { deleteStoredLearnerPackage, readStoredLearnerPackage, writeStoredLearnerPackage } from "./learner-package-store";

describe("learner package store", () => {
  it("keeps one package per lesson with the fingerprint it was made from", async () => {
    const factory = new IDBFactory();
    expect(await readStoredLearnerPackage("rec-1", factory)).toBeUndefined();
    const archive = new Uint8Array([1, 2, 3]).buffer;
    await writeStoredLearnerPackage({ recordingId: "rec-1", lessonFingerprint: "abc", contentSha256: "f".repeat(64), archive, builtAt: "2026-11-01T12:00:00.000Z" }, factory);
    await writeStoredLearnerPackage({ recordingId: "rec-1", lessonFingerprint: "def", contentSha256: "e".repeat(64), archive, builtAt: "2026-11-01T13:00:00.000Z" }, factory);
    const stored = await readStoredLearnerPackage("rec-1", factory);
    expect(stored?.lessonFingerprint).toBe("def");
    expect(new Uint8Array(stored!.archive)).toEqual(new Uint8Array([1, 2, 3]));
    await deleteStoredLearnerPackage("rec-1", factory);
    expect(await readStoredLearnerPackage("rec-1", factory)).toBeUndefined();
  });
});
