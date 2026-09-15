import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedCoursePack } from "octos-course-library/browser";
import {
  coursePackNarrationBlob,
  loadBuiltinCoursePack,
  parseBuiltinCoursePackId,
} from "./course-pack-loader";

const library = vi.hoisted(() => ({
  load: vi.fn(),
  blob: vi.fn(),
}));

vi.mock("octos-course-library/browser", () => ({
  loadCoursePackArchive: library.load,
  coursePackFileBlob: library.blob,
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
});
