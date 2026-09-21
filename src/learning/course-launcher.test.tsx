import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseLauncher } from "./course-launcher";
import {
  createProvisionalLearningSession,
  getLearningSession,
  promoteLearningSession,
  updateLearningSession,
} from "./learning-session-store";

const storage = vi.hoisted(() => ({ list: vi.fn(async () => []) }));
const auth = vi.hoisted(() => ({
  token: null as string | null,
  logout: vi.fn(async () => undefined),
}));
const sessionApi = vi.hoisted(() => ({
  delete: vi.fn(async () => undefined),
  getFiles: vi.fn(async () => [] as Array<{ filename: string; path: string }>),
  list: vi.fn(async () => [] as Array<{ id: string; title?: string }>),
  setTitle: vi.fn(async () => ({})),
}));

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ token: auth.token, logout: auth.logout }),
}));

vi.mock("@/api/sessions", () => ({
  deleteSession: sessionApi.delete,
  getSessionFiles: sessionApi.getFiles,
  listSessions: sessionApi.list,
  setSessionTitle: sessionApi.setTitle,
}));

vi.mock("./course-pack/course-pack-store", () => ({
  listInstalledCoursePacks: storage.list,
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

import { resetEmbeddedCoursePackCatalogCache } from "./course-pack/course-pack-catalog";

describe("shared course launcher", () => {
  beforeEach(() => {
    resetEmbeddedCoursePackCatalogCache();
    auth.token = null;
    auth.logout.mockClear();
    sessionApi.delete.mockClear();
    sessionApi.getFiles.mockReset().mockResolvedValue([]);
    sessionApi.list.mockReset().mockResolvedValue([]);
    sessionApi.setTitle.mockClear();
    storage.list.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("always offers a blank whiteboard while no packs are published", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog([])), { status: 200 })));
    showLauncher();
    expect(screen.getByRole("link", { name: /新建空白白板/u }).getAttribute("href")).toBe("/board?new-board=1");
    expect(await screen.findByText("课程包还在准备中")).toBeTruthy();
  });

  it("offers separate preview and interactive entry for a version-pinned pack", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog([release])), { status: 200 })));
    showLauncher();
    const preview = await screen.findByRole("link", { name: /预览/u });
    expect(preview.getAttribute("href")).toBe(
      "/course/grade-3-math?version=1.0.0&title=%E4%B8%89%E5%B9%B4%E7%BA%A7%E6%95%B0%E5%AD%A6&mode=preview",
    );
    expect(screen.getByRole("button", { name: /开始互动/u })).toBeTruthy();
    expect(screen.getByText("三年级数学")).toBeTruthy();
  });

  it("offers embedded courses offline without claiming a download", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(JSON.stringify(catalog([release])), { status: 200 });
      }
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    showLauncher();

    expect(await screen.findByText("内置课程 · 可离线")).toBeTruthy();
    expect(screen.getByRole("link", { name: /预览/u })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/course-packs/embedded/catalog.json",
      expect.objectContaining({ cache: "no-store" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /开始互动/u }));
    expect(localStorage.getItem("octos_learning_sessions_v2:anonymous"))
      .toContain('"mode":"instance"');
  });

  it("keeps only the single latest version per course when multiple versions exist in catalogs", async () => {
    const makePack = (version: string) => ({
      ...release,
      packId: "slope-and-intercept",
      version,
      title: "一次函数 y = mx + b 的图像与性质",
      archiveUrl: `/api/learn/course-packs/slope-and-intercept/${version}/archive.ocpack`,
      manifestUrl: `/api/learn/course-packs/slope-and-intercept/${version}/manifest.json`,
      thumbnailUrl: `/api/learn/course-packs/slope-and-intercept/${version}/files/thumbnail.webp`,
    });
    const embeddedV016 = makePack("0.1.6");
    const publicV015 = makePack("0.1.5");
    const publicV014 = makePack("0.1.4");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(JSON.stringify(catalog([embeddedV016])), { status: 200 });
      }
      if (url.includes("/api/learn/course-packs")) {
        return new Response(JSON.stringify(catalog([publicV015, publicV014])), { status: 200 });
      }
      throw new Error("unexpected url");
    });
    vi.stubGlobal("fetch", fetchMock);

    showLauncher();

    const titles = await screen.findAllByRole("heading", {
      name: "一次函数 y = mx + b 的图像与性质",
    });
    expect(titles).toHaveLength(1);

    expect(screen.getByText("课程包 v0.1.6")).toBeTruthy();
    expect(screen.queryByText("课程包 v0.1.5")).toBeNull();
    expect(screen.queryByText("课程包 v0.1.4")).toBeNull();
  });

  it("shows empty state when no embedded or saved catalog is available and network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("catalog missing"); }));

    showLauncher();

    expect(await screen.findByText("课程包还在准备中")).toBeTruthy();
    expect(screen.queryByText("三年级数学")).toBeNull();
  });

  it("shows a saved catalog but does not claim offline playback is ready", async () => {
    localStorage.setItem("octos:course-pack-catalog:v1", JSON.stringify(catalog([release])));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    showLauncher();
    expect(await screen.findByText("联网后可打开")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /预览/u })).toBeNull();
    expect(screen.getByRole("link", { name: /新建空白白板/u })).toBeTruthy();
  });

  it("opens an installed pinned version when the catalog is offline", async () => {
    localStorage.setItem("octos:course-pack-catalog:v1", JSON.stringify(catalog([release])));
    storage.list.mockResolvedValue([{
      identity: "grade-3-math@1.0.0",
      packId: "grade-3-math",
      version: "1.0.0",
      thumbnail: null,
      catalogEntry: release,
    }]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    showLauncher();

    expect(await screen.findByText("已下载 · 可离线")).toBeTruthy();
    expect(screen.getByRole("link", { name: /预览/u }).getAttribute("href"))
      .toContain("mode=preview");
  });

  it("keeps an installed course discoverable without the localStorage catalog", async () => {
    storage.list.mockResolvedValue([{
      identity: "grade-3-math@1.0.0",
      packId: "grade-3-math",
      version: "1.0.0",
      thumbnail: null,
      catalogEntry: release,
    }]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    showLauncher();

    expect(await screen.findByText("三年级数学")).toBeTruthy();
    expect(screen.getByText("已下载 · 可离线")).toBeTruthy();
  });

  it("creates one instance explicitly, then offers continue and restart", async () => {
    auth.token = "token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog([release])), { status: 200 })));
    showLauncher();
    fireEvent.click(await screen.findByRole("button", { name: /开始互动/u }));

    const raw = localStorage.getItem("octos_learning_sessions_v2:anonymous");
    expect(raw).toContain('"mode":"instance"');
    cleanup();
    showLauncher();
    expect(await screen.findByRole("link", { name: /继续学习/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /重新开始/u })).toBeTruthy();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /删除.*学习记录/u }));
    expect(screen.getByRole("button", { name: /开始互动/u })).toBeTruthy();
  });

  it("manages ordinary whiteboards and logout from the launcher", async () => {
    auth.token = "token";
    const session = createProvisionalLearningSession(100);
    promoteLearningSession(session.id, "代数白板", 110);
    updateLearningSession(session.id, { status: "paused" }, 120);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog([])), { status: 200 })));

    showLauncher();

    expect(await screen.findByRole("heading", { name: "最近白板" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "代数白板 继续学习" }));
    expect(getLearningSession(session.id)?.status).toBe("active");
    fireEvent.click(screen.getByRole("button", { name: "退出" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("discovers server-backed learning sessions on the launcher", async () => {
    auth.token = "token";
    sessionApi.list.mockResolvedValue([{
      id: "learn-900-server",
      title: "几何证明",
    }]);
    sessionApi.getFiles.mockResolvedValue([{
      filename: "turn-1.octos-lesson.json",
      path: "sessions/learn-900-server/turn-1.octos-lesson.json",
    }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(catalog([])), { status: 200 })));

    showLauncher();

    expect(await screen.findByRole("button", { name: "几何证明 继续学习" })).toBeTruthy();
  });
});
