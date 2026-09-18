import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedCoursePack } from "octos-course-library/browser";
import type { AuthoringLesson } from "octos-lesson-language";
import { materializeOllLesson } from "../oll/oll-materialization";
import {
  coursePackNarrationBlob,
  loadBuiltinCoursePack,
  loadPublishedCoursePack,
  parseCoursePackId,
  parseBuiltinCoursePackId,
  resolveCoursePackRegion,
  resolveCoursePackPlaybackEvents,
} from "./course-pack-loader";
import { resetEmbeddedCoursePackCatalogCache } from "./course-pack-catalog";

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
      version: "0.0.2",
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
    board: { items: [] },
  } as LoadedCoursePack;
}

describe("CoursePack loader", () => {
  afterEach(() => {
    resetEmbeddedCoursePackCatalogCache();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
      "/course-packs/contract-smoke-0.0.2.ocpack",
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

  it("accepts an embedded Authoring lesson only when it matches live materialization", () => {
    const authoring: AuthoringLesson = {
      dsl: "octos.lesson",
      version: "0.1",
      profile: "authoring",
      lesson: {
        mode: "explain",
        language: "zh-CN",
        title: "课程包一致性",
        goals: ["验证课程"],
      },
      steps: [{
        key: "show",
        purpose: "展示",
        beats: [{
          key: "result",
          say: "这是结论。",
          actions: [{
            do: "write",
            as: "result",
            kind: "note",
            role: "conclusion",
            content: { text: "结论" },
            place: { relation: "new_region", region_role: "lesson_origin" },
          }],
        }],
      }],
      close: { summary: "完成", focus: ["result"] },
    };
    const events = materializeOllLesson(authoring, {
      lessonId: "pack-lesson",
      boardId: "pack-board",
      baseRevision: 0,
      regionIntent: "new_topic",
      regionId: "pack-region",
    });
    const bytes = new TextEncoder().encode(JSON.stringify(authoring));
    const loaded = {
      manifest: {
        files: [{ path: "course.authoring.json", role: "asset" }],
      },
      files: new Map([["course.authoring.json", bytes]]),
      events,
    } as unknown as LoadedCoursePack;

    expect(resolveCoursePackPlaybackEvents(loaded)).toEqual(events);
    const changed = structuredClone(events);
    changed[0]!.lesson!.title = "被单独修改";
    expect(() => resolveCoursePackPlaybackEvents({
      ...loaded,
      events: changed,
    })).toThrow("differs from the live materialization pipeline");
  });

  it("reads the portable course region used by the shared board layout", () => {
    const loaded = pack();
    loaded.board.items = [{
      id: "course-region",
      kind: "playback.course-region",
      x: 20,
      y: 20,
      reservedWidth: 1300,
    }];
    expect(resolveCoursePackRegion(loaded)).toEqual({
      x: 20,
      y: 20,
      reservedWidth: 1300,
    });
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack")) {
        return new Response(new ArrayBuffer(8), { status: 200 });
      }
      if (url.includes("/api/learn/course-packs")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-09-15T00:00:00Z",
          packs: [release],
        }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    library.load.mockResolvedValue({
      manifest: { packId: "grade-3-math", version: "1.0.0", minimumPlayerVersion: "0.1.0" },
      archiveSha256: expectedDigest,
    });

    expect((await loadPublishedCoursePack("grade-3-math", "1.0.0")).id).toBe("grade-3-math");
    expect(fetchMock).toHaveBeenCalledWith(
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
    await expect(loadPublishedCoursePack("grade-3-math", "1.0.0")).rejects.toThrow(/摘要/u);
  });

  it("loads an embedded archive from APK assets without persisting a duplicate", async () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-09-17T00:00:00Z",
          packs: [release],
        }), { status: 200 });
      }
      if (url.includes("/course-packs/embedded/grade-3-math/1.0.0/archive.ocpack")) {
        return new Response(new ArrayBuffer(8), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    storage.read.mockResolvedValue({
      identity: "grade-3-math@1.0.0",
      packId: "grade-3-math",
      version: "1.0.0",
      archiveSha256: "b".repeat(64),
      archiveBytes: 8,
      minimumPlayerVersion: "0.1.0",
      installedAt: 1,
      lastOpenedAt: 1,
      archive: new ArrayBuffer(8),
      thumbnail: null,
    });
    library.load.mockResolvedValue({
      manifest: {
        packId: "grade-3-math",
        version: "1.0.0",
        minimumPlayerVersion: "0.1.0",
      },
      archiveSha256: expectedDigest,
    });

    const source = await loadPublishedCoursePack("grade-3-math", "1.0.0");

    expect(source.isEmbedded).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/course-packs/embedded/grade-3-math/1.0.0/archive.ocpack",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.write).not.toHaveBeenCalled();
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(null, { status: 404 });
      }
      throw new Error(`Unexpected network request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await loadPublishedCoursePack("grade-3-math", "1.0.0")).id).toBe("grade-3-math");
    expect(fetchMock).toHaveBeenCalledWith(
      "/course-packs/embedded/catalog.json",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("refuses to silently move a learning instance to different archive bytes", async () => {
    const catalogDigest = "a".repeat(64);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(null, { status: 404 });
      }
      return new Response(JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-09-15T00:00:00Z",
        packs: [{
          packId: "grade-3-math", version: "1.0.0", title: "数学", description: "互动课",
          locale: "zh-CN", subject: "mathematics", grade: "3", durationSeconds: 60,
          minimumPlayerVersion: "0.1.0", archiveSha256: catalogDigest, archiveBytes: 8,
          recommended: true,
          capabilities: { offlinePlayback: true, offlineNarration: true, interactiveWhiteboard: true, liveAi: "optional" },
          archiveUrl: "/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack",
          manifestUrl: "/api/learn/course-packs/grade-3-math/1.0.0/manifest.json",
          thumbnailUrl: "/api/learn/course-packs/grade-3-math/1.0.0/files/thumbnail.webp",
        }],
      }), { status: 200 });
    }));

    await expect(loadPublishedCoursePack(
      "grade-3-math",
      "1.0.0",
      undefined,
      "b".repeat(64),
    )).rejects.toThrow(/锁定的版本/u);
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack")) {
        return new Response(new ArrayBuffer(8), { status: 200 });
      }
      if (url.includes("/api/learn/course-packs")) {
        return new Response(JSON.stringify({
          schemaVersion: 1, generatedAt: "2026-09-15T00:00:00Z", packs: [release],
        }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await loadPublishedCoursePack("grade-3-math", "1.0.0");
    expect(storage.remove).toHaveBeenCalledWith("grade-3-math", "1.0.0");
    expect(storage.write).toHaveBeenCalled();
  });

  it("accepts only normalized catalog pack IDs", () => {
    expect(parseCoursePackId("grade-3-math")).toBe("grade-3-math");
    expect(parseCoursePackId("../elsewhere")).toBeUndefined();
  });
});
