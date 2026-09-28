import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoverServerLearningSessions } from "./learning-session-sync";
import { adoptLearningSession, getLearningSession } from "./learning-session-store";
const api = vi.hoisted(() => ({ list: vi.fn(), files: vi.fn(), messages: vi.fn() }));
vi.mock("@/api/sessions", () => ({ listSessions: api.list, getSessionFiles: api.files, getMessages: api.messages }));
vi.mock("@/api/client", () => ({ buildApiHeaders: () => ({}), getSelectedProfileId: () => null }));
vi.mock("@/api/files", () => ({ buildFileUrl: (path: string) => path }));
const saved = { id: "learn-100-saved", title: "已保存的学习", status: "paused" as const, createdAt: 100, updatedAt: 100 };
describe("historical learning titles", () => {
  beforeEach(() => {
    localStorage.clear(); vi.unstubAllGlobals(); vi.resetAllMocks();
    api.list.mockResolvedValue([{ id: saved.id, title: "[[LEARNING_SESSION]]" }]);
    api.files.mockResolvedValue([{ filename: "one.octos-lesson.json", path: "/lesson.json" }]);
    api.messages.mockResolvedValue([]);
  });
  it("recovers a real lesson title and repairs an already cached fallback without changing content", async () => {
    adoptLearningSession(saved);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ lesson: { title: "认识等高线" } })));
    vi.stubGlobal("fetch", fetcher);
    const [found] = await discoverServerLearningSessions();
    adoptLearningSession(found);
    expect(getLearningSession(saved.id)?.title).toBe("认识等高线");
    expect(api.messages).not.toHaveBeenCalled();
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it("retains a user-renamed local title without rereading the lesson", async () => {
    adoptLearningSession({ ...saved, title: "我的复习课" });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const [found] = await discoverServerLearningSessions(); adoptLearningSession(found);
    expect(getLearningSession(saved.id)?.title).toBe("我的复习课");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("falls back to a substantive user message, excluding internal markers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    api.messages.mockResolvedValue([{ role: "user", content: "[[LEARNING_SESSION]]" }, { role: "user", content: "如何求导数？" }]);
    expect((await discoverServerLearningSessions())[0].title).toBe("如何求导数？");
  });
  it("does not download historical titles on the critical board-entry path", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await discoverServerLearningSessions({ recoverTitles: false })).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(api.messages).not.toHaveBeenCalled();
  });
  it("does not convert an incomplete file listing into authoritative deletion evidence", async () => {
    api.files.mockRejectedValue(new Error("offline"));
    await expect(discoverServerLearningSessions()).rejects.toThrow("offline");
  });
});
