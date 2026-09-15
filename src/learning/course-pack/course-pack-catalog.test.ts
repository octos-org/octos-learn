import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCoursePackCatalog,
  loadSavedCoursePackCatalog,
  parseCoursePackCatalog,
  saveCoursePackCatalog,
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
});
