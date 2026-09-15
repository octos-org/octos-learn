import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedCoursePack } from "octos-course-library/browser";
import {
  coursePackNarrationBlob,
  loadBuiltinCoursePack,
  loadPublishedCoursePack,
  parseCoursePackId,
  parseBuiltinCoursePackId,
} from "./course-pack-loader";

const library = vi.hoisted(() => ({
  load: vi.fn(),
  blob: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("octos-course-library/browser", () => ({
  loadCoursePackArchive: library.load,
  coursePackFileBlob: library.blob,
}));

vi.mock("./course-pack-store", () => ({
  readStoredCoursePack: storage.read,
  writeStoredCoursePack: storage.write,
  deleteStoredCoursePack: storage.remove,
}));

function pack(): LoadedCoursePack {
  return {
    manifest: {
      packId: "contract-smoke",
      version: "0.0.1",
      narration: {
        voiceId: "fixture",
        segments: [{
          beatId: "beat-1",
          file: "audio/intro.mp3",
          textSha256: "0".repeat(64),
          durationMs: 1000,
        }],
      },
    },
  } as LoadedCoursePack;
}

describe("CoursePack loader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    library.load.mockReset();
    library.blob.mockReset();
    storage.read.mockReset().mockResolvedValue(null);
    storage.write.mockReset().mockResolvedValue(true);
    storage.remove.mockReset().mockResolvedValue(undefined);
  });

  it("loads the pinned local fixture and checks its identity", async () => {
    const archive = new ArrayBuffer(8);
    const loaded = pack();
    library.load.mockResolvedValue(loaded);
    const fetchMock = vi.fn(async () => new Response(archive, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const source = await loadBuiltinCoursePack("contract-smoke");

    expect(source.pack).toBe(loaded);
    expect(fetchMock).toHaveBeenCalledWith(
      "/course-packs/contract-smoke-0.0.1.ocpack",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(library.load).toHaveBeenCalledWith(expect.any(ArrayBuffer));
  });

  it("resolves narration from verified pack bytes", () => {
    const audio = new Blob(["audio"], { type: "audio/mpeg" });
    library.blob.mockReturnValue(audio);
    const source = { id: "contract-smoke" as const, pack: pack() };

    expect(coursePackNarrationBlob(source, "beat-1")).toBe(audio);
    expect(library.blob).toHaveBeenCalledWith(source.pack, "audio/intro.mp3");
    expect(coursePackNarrationBlob(source, "unknown")).toBeNull();
  });

  it("ignores unregistered pack identifiers", () => {
    expect(parseBuiltinCoursePackId("contract-smoke")).toBe("contract-smoke");
    expect(parseBuiltinCoursePackId("untrusted-pack")).toBeUndefined();
  });

  it("loads a published archive only when its catalog digest matches", async () => {
    const expectedDigest = "a".repeat(64);
    const release = {
      packId: "grade-3-math",
      version: "1.0.0",
      title: "数学",
      description: "互动课",
      locale: "zh-CN",
      subject: "mathematics",
      grade: "3",
      durationSeconds: 60,
      minimumPlayerVersion: "0.1.0",
      capabilities: {
        offlinePlayback: true,
        offlineNarration: true,
        interactiveWhiteboard: true,
        liveAi: "optional",
      },
      archiveSha256: expectedDigest,
      archiveBytes: 8,
      recommended: true,
      archiveUrl: "/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack",
      manifestUrl: "/api/learn/course-packs/grade-3-math/1.0.0/manifest.json",
      thumbnailUrl: "/api/learn/course-packs/grade-3-math/1.0.0/files/thumbnail.webp",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-09-15T00:00:00Z",
        packs: [release],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(8), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    library.load.mockResolvedValue({
      manifest: { packId: "grade-3-math", version: "1.0.0", minimumPlayerVersion: "0.1.0" },
      archiveSha256: expectedDigest,
    });

    expect((await loadPublishedCoursePack("grade-3-math", "1.0.0")).id).toBe("grade-3-math");
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      release.archiveUrl,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(storage.write).toHaveBeenCalledWith(expect.objectContaining({
      identity: "grade-3-math@1.0.0",
      archiveSha256: expectedDigest,
      archiveBytes: 8,
    }));
    library.load.mockResolvedValueOnce({
      manifest: { packId: "grade-3-math", version: "1.0.0", minimumPlayerVersion: "0.1.0" },
      archiveSha256: "b".repeat(64),
    });
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-09-15T00:00:00Z",
        packs: [release],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(8), { status: 200 }));
    await expect(loadPublishedCoursePack("grade-3-math", "1.0.0")).rejects.toThrow(/摘要/u);
  });

  it("plays a verified installed version without requesting the network", async () => {
    const expectedDigest = "a".repeat(64);
    const archive = new ArrayBuffer(8);
    storage.read.mockResolvedValue({
      identity: "grade-3-math@1.0.0",
      packId: "grade-3-math",
      version: "1.0.0",
      archiveSha256: expectedDigest,
      archiveBytes: 8,
      minimumPlayerVersion: "0.1.0",
      installedAt: 1,
      lastOpenedAt: 1,
      archive,
      thumbnail: null,
    });
    library.load.mockResolvedValue({
      manifest: { packId: "grade-3-math", version: "1.0.0", minimumPlayerVersion: "0.1.0" },
      archiveSha256: expectedDigest,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect((await loadPublishedCoursePack("grade-3-math", "1.0.0")).id).toBe("grade-3-math");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discards a corrupt installed archive and downloads the locked release", async () => {
    const expectedDigest = "a".repeat(64);
    storage.read.mockResolvedValue({
      identity: "grade-3-math@1.0.0",
      packId: "grade-3-math",
      version: "1.0.0",
      archiveSha256: expectedDigest,
      archiveBytes: 8,
      minimumPlayerVersion: "0.1.0",
      installedAt: 1,
      lastOpenedAt: 1,
      archive: new ArrayBuffer(8),
      thumbnail: null,
    });
    library.load
      .mockRejectedValueOnce(new Error("corrupt zip"))
      .mockResolvedValueOnce({
        manifest: {
          packId: "grade-3-math",
          version: "1.0.0",
          minimumPlayerVersion: "0.1.0",
          thumbnail: "thumbnail.webp",
        },
        archiveSha256: expectedDigest,
      });
    const release = {
      packId: "grade-3-math", version: "1.0.0", title: "数学", description: "互动课",
      locale: "zh-CN", subject: "mathematics", grade: "3", durationSeconds: 60,
      minimumPlayerVersion: "0.1.0", archiveSha256: expectedDigest, archiveBytes: 8,
      recommended: true,
      capabilities: { offlinePlayback: true, offlineNarration: true, interactiveWhiteboard: true, liveAi: "optional" },
      archiveUrl: "/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack",
      manifestUrl: "/api/learn/course-packs/grade-3-math/1.0.0/manifest.json",
      thumbnailUrl: "/api/learn/course-packs/grade-3-math/1.0.0/files/thumbnail.webp",
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: 1, generatedAt: "2026-09-15T00:00:00Z", packs: [release],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(8), { status: 200 })));

    await loadPublishedCoursePack("grade-3-math", "1.0.0");
    expect(storage.remove).toHaveBeenCalledWith("grade-3-math", "1.0.0");
    expect(storage.write).toHaveBeenCalled();
  });

  it("accepts only normalized catalog pack IDs", () => {
    expect(parseCoursePackId("grade-3-math")).toBe("grade-3-math");
    expect(parseCoursePackId("../elsewhere")).toBeUndefined();
  });
});
