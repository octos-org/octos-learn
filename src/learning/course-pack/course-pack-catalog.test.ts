import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareCoursePackVersions,
  fetchCoursePackCatalog,
  fetchEmbeddedCoursePackCatalog,
  findEmbeddedCoursePackEntry,
  loadSavedCoursePackCatalog,
  parseCoursePackCatalog,
  resetEmbeddedCoursePackCatalogCache,
  saveCoursePackCatalog,
  selectLatestCoursePacks,
  supportsCoursePackPlayer,
} from "./course-pack-catalog";

export function sampleCatalog() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-15T00:00:00.000Z",
    packs: [{
      packId: "grade-3-math",
      version: "1.0.0",
      title: "三年级数学",
      description: "已经审核的互动数学课。",
      locale: "zh-CN",
      subject: "mathematics",
      grade: "三年级",
      durationSeconds: 420,
      minimumPlayerVersion: "0.1.0",
      capabilities: {
        offlinePlayback: true,
        offlineNarration: true,
        interactiveWhiteboard: true,
        liveAi: "optional",
      },
      archiveSha256: "a".repeat(64),
      archiveBytes: 1000,
      recommended: true,
      archiveUrl: "/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack",
      manifestUrl: "/api/learn/course-packs/grade-3-math/1.0.0/manifest.json",
      thumbnailUrl: "/api/learn/course-packs/grade-3-math/1.0.0/files/thumbnail.webp",
    }],
  };
}

describe("CoursePack public catalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it("parses a pinned same-origin release", () => {
    expect(parseCoursePackCatalog(sampleCatalog()).packs[0]?.packId).toBe("grade-3-math");
    expect(supportsCoursePackPlayer("0.1.0")).toBe(true);
    expect(supportsCoursePackPlayer("0.2.0")).toBe(false);
  });

  it("rejects URL injection and duplicate versions", () => {
    const remote = sampleCatalog();
    remote.packs[0]!.archiveUrl = "https://elsewhere.example/pack.ocpack";
    expect(() => parseCoursePackCatalog(remote)).toThrow(/元数据/u);
    const duplicate = sampleCatalog();
    duplicate.packs.push({ ...duplicate.packs[0]! });
    expect(() => parseCoursePackCatalog(duplicate)).toThrow(/重复版本/u);
  });

  it("keeps only a validated last-known directory for degraded display", () => {
    saveCoursePackCatalog(parseCoursePackCatalog(sampleCatalog()));
    expect(loadSavedCoursePackCatalog()?.packs[0]?.title).toBe("三年级数学");
    localStorage.setItem("octos:course-pack-catalog:v1", "{broken");
    expect(loadSavedCoursePackCatalog()).toBeNull();
  });

  it("fetches the public same-origin catalog without credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(sampleCatalog()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchCoursePackCatalog();
    expect(result.packs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learn/course-packs",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("loads a locked embedded catalog and rewrites only its thumbnail locally", async () => {
    resetEmbeddedCoursePackCatalogCache();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(sampleCatalog()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmbeddedCoursePackCatalog();

    expect(fetchMock).toHaveBeenCalledWith(
      "/course-packs/embedded/catalog.json",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result.packs[0]?.thumbnailUrl).toBe(
      "/course-packs/embedded/grade-3-math/1.0.0/files/thumbnail.webp",
    );
    expect(result.packs[0]?.archiveUrl).toBe(
      "/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack",
    );
  });

  it("finds embedded course entries using cached catalog lookup", async () => {
    resetEmbeddedCoursePackCatalogCache();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(sampleCatalog()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const hit = await findEmbeddedCoursePackEntry("grade-3-math", "1.0.0");
    expect(hit?.packId).toBe("grade-3-math");
    expect(hit?.version).toBe("1.0.0");

    // Second call should hit the in-memory cache without refetching
    const hit2 = await findEmbeddedCoursePackEntry("grade-3-math");
    expect(hit2?.packId).toBe("grade-3-math");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const miss = await findEmbeddedCoursePackEntry("unknown");
    expect(miss).toBeNull();
  });

  it("compares course pack semver versions accurately", () => {
    expect(compareCoursePackVersions("0.1.6", "0.1.5")).toBeGreaterThan(0);
    expect(compareCoursePackVersions("0.1.5", "0.1.6")).toBeLessThan(0);
    expect(compareCoursePackVersions("0.1.5", "0.1.5")).toBe(0);
    expect(compareCoursePackVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareCoursePackVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareCoursePackVersions("0.1.5-beta", "0.1.5")).toBeLessThan(0);
  });

  it("selects only the latest version per course pack", () => {
    const baseEntry = sampleCatalog().packs[0]!;
    const v1 = { ...baseEntry, version: "0.1.4", title: "v0.1.4" };
    const v2 = { ...baseEntry, version: "0.1.5", title: "v0.1.5" };
    const v3 = { ...baseEntry, version: "0.1.6", title: "v0.1.6" };
    const other = { ...baseEntry, packId: "other-pack", version: "1.0.0", title: "Other" };

    const selected = selectLatestCoursePacks([v1, v3, v2, other]);
    expect(selected).toHaveLength(2);
    expect(selected.find((p) => p.packId === "grade-3-math")?.version).toBe("0.1.6");
    expect(selected.find((p) => p.packId === "other-pack")?.version).toBe("1.0.0");
  });

  it("prefers embedded entry when versions tie in selectLatestCoursePacks", () => {
    const remote = { ...sampleCatalog().packs[0]!, version: "0.1.6", description: "remote" };
    const embedded = { ...sampleCatalog().packs[0]!, version: "0.1.6", description: "embedded" };

    const selected = selectLatestCoursePacks([remote, embedded], {
      isEmbedded: (entry) => entry.description === "embedded",
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.description).toBe("embedded");
  });
});

