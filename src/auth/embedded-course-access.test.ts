import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isEmbeddedCourseLocation,
  isKnownEmbeddedCourseLocation,
  parseCoursePackRouteParams,
} from "./embedded-course-access";
import {
  resetEmbeddedCoursePackCatalogCache,
} from "@/learning/course-pack/course-pack-catalog";

describe("embedded-course-access", () => {
  beforeEach(() => {
    resetEmbeddedCoursePackCatalogCache();
    vi.restoreAllMocks();
  });

  it("parses course route parameters", () => {
    expect(parseCoursePackRouteParams("?course-pack=math&course-version=1.0.0")).toEqual({
      packId: "math",
      version: "1.0.0",
    });
    expect(parseCoursePackRouteParams("?course-pack=math")).toEqual({
      packId: "math",
      version: undefined,
    });
    expect(parseCoursePackRouteParams("?other=123")).toBeNull();
  });

  it("identifies embedded course locations from catalog", async () => {
    const catalog = {
      schemaVersion: 1,
      generatedAt: "2026-09-18T00:00:00Z",
      packs: [
        {
          packId: "rectangle-area",
          version: "0.1.5",
          title: "矩形面积",
          description: "课程",
          locale: "zh-CN",
          subject: "math",
          grade: "3",
          durationSeconds: 120,
          minimumPlayerVersion: "0.1.0",
          archiveSha256: "a".repeat(64),
          archiveBytes: 100,
          recommended: true,
          archiveUrl: "/api/learn/course-packs/rectangle-area/0.1.5/archive.ocpack",
          manifestUrl: "/api/learn/course-packs/rectangle-area/0.1.5/manifest.json",
          thumbnailUrl: "/api/learn/course-packs/rectangle-area/0.1.5/files/thumb.webp",
          capabilities: {
            offlinePlayback: true,
            offlineNarration: true,
            interactiveWhiteboard: true,
            liveAi: "none",
          },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 })),
    );

    const hit = {
      pathname: "/board",
      search: "?course-pack=rectangle-area&course-version=0.1.5",
    };
    const missPack = {
      pathname: "/board",
      search: "?course-pack=unknown-course&course-version=0.1.5",
    };
    const missPath = {
      pathname: "/setup",
      search: "?course-pack=rectangle-area&course-version=0.1.5",
    };

    expect(await isEmbeddedCourseLocation(hit)).toBe(true);
    expect(isKnownEmbeddedCourseLocation(hit)).toBe(true);
    expect(await isEmbeddedCourseLocation(missPack)).toBe(false);
    expect(await isEmbeddedCourseLocation(missPath)).toBe(false);
  });

  it("handles missing embedded catalog gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    const loc = {
      pathname: "/board",
      search: "?course-pack=rectangle-area&course-version=0.1.5",
    };
    expect(await isEmbeddedCourseLocation(loc)).toBe(false);
    expect(isKnownEmbeddedCourseLocation(loc)).toBe(false);
  });
});
