import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client", () => ({ getToken: () => "token" }));

import { ACCOUNT_PACKAGE_MAX_BYTES, LessonsUnavailable, saveLessonPackage } from "./learner-lessons-api";

afterEach(() => { vi.unstubAllGlobals(); });

describe("saving a lesson package to My lessons", () => {
  it("says a package is too large without uploading it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const error = await saveLessonPackage("rec-1", new ArrayBuffer(ACCOUNT_PACKAGE_MAX_BYTES + 1)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LessonsUnavailable);
    expect((error as LessonsUnavailable).status).toBe(413);
    expect((error as Error).message).toContain("32 MB");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("explains a size refusal from the service instead of reporting a lost connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Request too large" }, { status: 413 })));
    await expect(saveLessonPackage("rec-1", new ArrayBuffer(8))).rejects.toThrow("32 MB");
  });
});
