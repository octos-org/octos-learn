import { afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { normalizeProfile, type Profile } from "@/settings/settings-api";
import { LearningSetupGate, SetupWhiteboard } from "./setup-whiteboard";
import { LearningModelContext, needsLearningSetup } from "./setup-state";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  request: vi.fn(),
  selectProfile: vi.fn((profileId: string) => {
    localStorage.setItem("selected_profile", profileId);
  }),
}));
vi.mock("@/settings/settings-api", async () => {
  const real = await vi.importActual<typeof import("@/settings/settings-api")>(
    "@/settings/settings-api",
  );
  return {
    ...real,
    getMyProfile: mocks.get,
    updateMyProfileConfig: mocks.save,
  };
});
vi.mock("@/api/client", () => ({
  request: mocks.request,
  setSelectedProfileId: mocks.selectProfile,
}));
vi.mock("@/home/voice/audio-playback", () => ({
  unlockAudio: vi.fn(),
  playAudioBlob: vi.fn(async () => true),
}));
vi.mock("@/api/voice", () => ({ synthesizeSpeech: vi.fn() }));
vi.mock("@/home/use-ominix-runtime-summary", () => ({
  refreshOminixRuntimeSummary: vi.fn(),
}));
vi.mock("@/settings/shared-tts", () => ({
  SharedTtsPanel: () => <p>平台语音额度</p>,
}));
const blank = () =>
  normalizeProfile({
    id: "alice",
    name: "Alice",
    config: {},
    enabled: true,
  } as Profile);
import { resetEmbeddedCoursePackCatalogCache } from "./course-pack/course-pack-catalog";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetEmbeddedCoursePackCatalogCache();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("first-run setup whiteboard", () => {
  it("allows configured models for embedded courses without blocking offline playback", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-09-18T00:00:00Z",
          packs: [{
            packId: "rectangle-area-from-tiles",
            version: "0.1.5",
            title: "矩形面积",
            description: "矩形面积练习",
            locale: "zh-CN",
            subject: "math",
            grade: "3",
            durationSeconds: 60,
            minimumPlayerVersion: "0.1.0",
            archiveSha256: "a".repeat(64),
            archiveBytes: 8,
            recommended: true,
            archiveUrl: "/api/learn/course-packs/rectangle-area-from-tiles/0.1.5/archive.ocpack",
            manifestUrl: "/api/learn/course-packs/rectangle-area-from-tiles/0.1.5/manifest.json",
            thumbnailUrl: "/api/learn/course-packs/rectangle-area-from-tiles/0.1.5/files/thumb.webp",
            capabilities: { offlinePlayback: true, offlineNarration: true, interactiveWhiteboard: true, liveAi: "none" },
          }],
        }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const profile = blank();
    profile.config.llm.primary = { family_id: "google", model_id: "gemini-test" };
    mocks.get.mockResolvedValue(profile);
    render(
      <MemoryRouter initialEntries={["/board?course-pack=rectangle-area-from-tiles&course-version=0.1.5"]}>
        <LearningSetupGate>
          <p>offline-course</p>
          <LearningModelContext.Consumer>
            {(configured) => <output>{configured ? "model-ready" : "model-unavailable"}</output>}
          </LearningModelContext.Consumer>
        </LearningSetupGate>
      </MemoryRouter>,
    );
    expect(await screen.findByText("offline-course")).toBeTruthy();
    expect(await screen.findByText("model-ready")).toBeTruthy();
    expect(mocks.selectProfile).toHaveBeenCalledWith("alice");
  });

  it("returns to a selected CoursePack after onboarding", async () => {
    mocks.get.mockResolvedValue(blank());
    const destination = "/board?course-pack=grade-3-math&course-version=1.0.0";
    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="path">{location.pathname}{location.search}</output>;
    }
    render(
      <MemoryRouter initialEntries={[destination]}>
        <Routes>
          <Route path="/board" element={(
            <LearningSetupGate><p>learning-board</p></LearningSetupGate>
          )} />
          <Route path="/setup" element={<SetupWhiteboard />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "把白板准备好，就可以开始了" });
    expect(screen.getByTestId("path").textContent).toContain("/setup?redirect=");
    fireEvent.click(await screen.findByText("先用白板，稍后设置 AI"));
    await screen.findByText("learning-board");
    expect(screen.getByTestId("path").textContent).toBe(destination);
  });

  it("establishes the authenticated storage scope before opening the board", async () => {
    const profile = blank();
    profile.config.llm.primary = {
      family_id: "google",
      model_id: "gemini-test",
    };
    localStorage.setItem("octos-learn:setup-skipped:alice", "yes");
    mocks.get.mockResolvedValue(profile);

    render(
      <MemoryRouter>
        <LearningSetupGate>
          <p>learning-board</p>
        </LearningSetupGate>
      </MemoryRouter>,
    );

    await screen.findByText("learning-board");
    expect(mocks.selectProfile).toHaveBeenCalledWith("alice");
    expect(localStorage.getItem("selected_profile")).toBe("alice");
  });

  it("records onboarding completion independently for every account", () => {
    const p = blank();
    expect(needsLearningSetup(p)).toBe(true);
    localStorage.setItem("octos-learn:setup-skipped:alice", "yes");
    expect(needsLearningSetup(p)).toBe(false);
    expect(needsLearningSetup({ ...p, id: "bob" })).toBe(true);
    p.config.llm.primary = { family_id: "google", model_id: "gemini-test" };
    expect(needsLearningSetup({ ...p, id: "bob" })).toBe(true);
    localStorage.setItem("octos-learn:setup-skipped:bob", "yes");
    expect(needsLearningSetup({ ...p, id: "bob" })).toBe(false);
  });
  it("offers manual use and saves credentials only through the authenticated profile API", async () => {
    mocks.get.mockResolvedValue(blank());
    mocks.request.mockResolvedValue({ ok: true });
    mocks.save.mockImplementation(async (p, patch) => ({
      ...p,
      config: { ...p.config, ...patch },
    }));
    render(
      <MemoryRouter>
        <SetupWhiteboard />
      </MemoryRouter>,
    );
    await screen.findByText("先用白板，稍后设置 AI");
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "test-secret-do-not-store" },
    });
    fireEvent.click(screen.getByText("测试连接并保存"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][1].env_vars.GEMINI_API_KEY).toBe(
      "test-secret-do-not-store",
    );
    expect(localStorage.length).toBe(0);
    await waitFor(() =>
      expect((screen.getByLabelText("API Key") as HTMLInputElement).value).toBe(
        "",
      ),
    );
    expect(screen.getByText("进入我的白板")).toBeTruthy();
  });

  it("lets the learner choose the whiteboard teacher without leaving onboarding", async () => {
    mocks.get.mockResolvedValue(blank());

    render(
      <MemoryRouter>
        <SetupWhiteboard />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "选择右下角老师形象" });
    expect(screen.queryByRole("link", {
      name: /选择右下角的老师形象/,
    })).toBeNull();
    expect(screen.getByTestId("teacher-skin-ocean")).toBeTruthy();
    expect(screen.getByTestId("teacher-skin-bee-3d")).toBeTruthy();
    expect(
      screen.getByTestId("teacher-skin-bee-3d").querySelector("img")
        ?.getAttribute("src"),
    ).toBe("/models/companions/bee-thumbnail.png");
    expect(
      screen.getByTestId("teacher-skin-bee-3d").querySelector("model-viewer"),
    ).toBeNull();

    fireEvent.click(screen.getByTestId("teacher-skin-bee-3d"));

    expect(screen.getByTestId("teacher-skin-bee-3d").getAttribute("aria-pressed"))
      .toBe("true");
    expect(localStorage.getItem("octos-teacher-skin")).toBe("bee-3d");
  });
});
