import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseLauncher } from "./course-launcher";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ token: null }),
}));

const release = {
  packId: "grade-3-math",
  version: "1.0.0",
  title: "三年级数学",
  description: "一门互动课",
  locale: "zh-CN",
  subject: "mathematics",
  grade: "三年级",
  durationSeconds: 180,
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
};

function catalog(packs: unknown[]) {
  return { schemaVersion: 1, generatedAt: "2026-09-15T00:00:00Z", packs };
}

function showLauncher() {
  return render(<MemoryRouter><CourseLauncher /></MemoryRouter>);
}

describe("shared course launcher", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("always offers a blank whiteboard while no packs are published", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog([])), { status: 200 })));
    showLauncher();
    expect(screen.getByRole("link", { name: /新建空白白板/u }).getAttribute("href")).toBe("/board?new-board=1");
    expect(await screen.findByText("课程包还在准备中")).toBeTruthy();
  });

  it("opens a reviewed, version-pinned pack on the same board", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog([release])), { status: 200 })));
    showLauncher();
    const start = await screen.findByRole("link", { name: /开始课程/u });
    expect(start.getAttribute("href")).toBe("/course/grade-3-math?version=1.0.0");
    expect(screen.getByText("三年级数学")).toBeTruthy();
  });

  it("shows a saved catalog but does not claim offline playback is ready", async () => {
    localStorage.setItem("octos:course-pack-catalog:v1", JSON.stringify(catalog([release])));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    showLauncher();
    expect(await screen.findByText("联网后可打开")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /开始课程/u })).toBeNull();
    expect(screen.getByRole("link", { name: /新建空白白板/u })).toBeTruthy();
  });
});
