import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthenticatedFileUrl,
  buildFileUrl,
  fetchAuthenticatedFileBlob,
} from "@/api/files";
import { TOKEN_KEY } from "@/lib/constants";

afterEach(() => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("selected_profile");
  vi.unstubAllGlobals();
});

describe("buildFileUrl", () => {
  it("includes session context for workspace-relative upload paths", () => {
    expect(
      buildFileUrl("uploads/video-1782874133859.webm", {
        sessionId: "web-1782873684428-f5emdc",
      }),
    ).toBe(
      "/api/files?path=uploads%2Fvideo-1782874133859.webm&session=web-1782873684428-f5emdc",
    );
  });

  it("keeps legacy file paths on the path endpoint", () => {
    expect(
      buildFileUrl("skill-output/report.md", {
        sessionId: "web-1782873684428-f5emdc",
      }),
    ).toBe("/api/files/skill-output%2Freport.md");
  });

  it("scopes Studio source paths to their workspace session when requested", () => {
    expect(
      buildFileUrl("notebook-sources/report/source.md", {
        sessionId: "web-abc",
        workspaceScoped: true,
      }),
    ).toBe(
      "/api/files?path=notebook-sources%2Freport%2Fsource.md&session=web-abc",
    );
  });

  it("scopes legacy Studio output paths without changing default file URL semantics", () => {
    expect(
      buildFileUrl("notebook-outputs/video/final.mp4", {
        sessionId: "web-abc",
        workspaceScoped: true,
      }),
    ).toBe(
      "/api/files?path=notebook-outputs%2Fvideo%2Ffinal.mp4&session=web-abc",
    );
    expect(
      buildFileUrl("notebook-outputs/video/final.mp4", {
        sessionId: "web-abc",
      }),
    ).toBe("/api/files/notebook-outputs%2Fvideo%2Ffinal.mp4");
  });

  it("includes session context for opaque workspace handles", () => {
    expect(
      buildFileUrl("ws/cXVpei5tZA/quiz.md", { sessionId: "web-abc" }),
    ).toBe(
      "/api/files?path=ws%2FcXVpei5tZA%2Fquiz.md&session=web-abc",
    );
  });

  it("uses the query endpoint for absolute workspace artifact paths", () => {
    expect(
      buildFileUrl(
        "/Users/alan0x/.octos/profiles/alan0x/data/users/web-abc/workspace/notebook-outputs/study/quiz/quiz.md",
        { sessionId: "web-abc" },
      ),
    ).toBe("/api/files?path=%2FUsers%2Falan0x%2F.octos%2Fprofiles%2Falan0x%2Fdata%2Fusers%2Fweb-abc%2Fworkspace%2Fnotebook-outputs%2Fstudy%2Fquiz%2Fquiz.md&session=web-abc");
  });

  it("appends auth tokens after existing session query parameters", () => {
    localStorage.setItem(TOKEN_KEY, "abc 123");

    expect(
      buildAuthenticatedFileUrl("uploads/video.webm", {
        sessionId: "web-1",
      }),
    ).toBe("/api/files?path=uploads%2Fvideo.webm&session=web-1&token=abc%20123");
  });

  it("recovers a legacy image after refreshing a stale selected profile", async () => {
    localStorage.setItem(TOKEN_KEY, "camera-token");
    localStorage.setItem("selected_profile", "stale-profile");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        profile: { id: "admin" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("jpeg", {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const blob = await fetchAuthenticatedFileBlob(
      "up/opaque/frame.jpg",
      { sessionId: "learn-camera" },
    );

    expect(blob.type).toBe("image/jpeg");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "X-Profile-Id": "stale-profile" }),
    }));
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "X-Profile-Id": "admin" }),
    }));
  });
});
