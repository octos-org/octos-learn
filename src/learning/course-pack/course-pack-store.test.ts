import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteStoredCoursePack,
  listInstalledCoursePacks,
  readStoredCoursePack,
  writeStoredCoursePack,
  type StoredCoursePack,
} from "./course-pack-store";

function storedPack(): StoredCoursePack {
  const catalogEntry = {
    packId: "grade-3-math",
    version: "1.0.0",
    title: "三年级数学",
    description: "互动数学课程",
    locale: "zh-CN",
    subject: "mathematics",
    grade: "三年级",
    durationSeconds: 180,
    minimumPlayerVersion: "0.1.0",
    archiveSha256: "a".repeat(64),
    archiveBytes: 8,
    recommended: true,
    archiveUrl: "/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack",
    manifestUrl: "/api/learn/course-packs/grade-3-math/1.0.0/manifest.json",
    thumbnailUrl: "/api/learn/course-packs/grade-3-math/1.0.0/files/thumbnail.webp",
    capabilities: {
      offlinePlayback: true,
      offlineNarration: true,
      interactiveWhiteboard: true,
      liveAi: "optional" as const,
    },
  };
  return {
    identity: "grade-3-math@1.0.0",
    packId: "grade-3-math",
    version: "1.0.0",
    archiveSha256: "a".repeat(64),
    archiveBytes: 8,
    minimumPlayerVersion: "0.1.0",
    installedAt: 100,
    lastOpenedAt: 100,
    archive: new ArrayBuffer(8),
    thumbnail: null,
    catalogEntry,
  };
}

describe("CoursePack IndexedDB store", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  it("persists an immutable archive and lists metadata without archive bytes", async () => {
    expect(await writeStoredCoursePack(storedPack())).toBe(true);

    const restored = await readStoredCoursePack("grade-3-math", "1.0.0");
    expect(restored?.archive.byteLength).toBe(8);
    expect(restored?.archiveSha256).toBe("a".repeat(64));
    const installed = await listInstalledCoursePacks();
    expect(installed).toEqual([
      expect.objectContaining({ identity: "grade-3-math@1.0.0", archiveBytes: 8 }),
    ]);
    expect(installed[0]).not.toHaveProperty("archive");
  });

  it("removes an installed release by its exact identity", async () => {
    await writeStoredCoursePack(storedPack());
    await deleteStoredCoursePack("grade-3-math", "1.0.0");
    expect(await readStoredCoursePack("grade-3-math", "1.0.0")).toBeNull();
  });

  it("refuses metadata that does not match the immutable archive", async () => {
    expect(await writeStoredCoursePack({ ...storedPack(), archiveBytes: 7 })).toBe(false);
    expect(await listInstalledCoursePacks()).toEqual([]);
  });

  it("degrades safely when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await writeStoredCoursePack(storedPack())).toBe(false);
    expect(await readStoredCoursePack("grade-3-math", "1.0.0")).toBeNull();
    expect(await listInstalledCoursePacks()).toEqual([]);
  });
});
