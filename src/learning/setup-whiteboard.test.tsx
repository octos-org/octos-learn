import { afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { normalizeProfile, type Profile } from "@/settings/settings-api";
import { LearningSetupGate, SetupWhiteboard } from "./setup-whiteboard";
import { needsLearningSetup } from "./setup-state";

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
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("first-run setup whiteboard", () => {
  it("establishes the authenticated storage scope before opening the board", async () => {
    const profile = blank();
    profile.config.llm.primary = {
      family_id: "google",
      model_id: "gemini-test",
    };
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

  it("does not interrupt configured users and scopes skipping to one account", () => {
    const p = blank();
    expect(needsLearningSetup(p)).toBe(true);
    localStorage.setItem("octos-learn:setup-skipped:alice", "yes");
    expect(needsLearningSetup(p)).toBe(false);
    expect(needsLearningSetup({ ...p, id: "bob" })).toBe(true);
    p.config.llm.primary = { family_id: "google", model_id: "gemini-test" };
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
});
