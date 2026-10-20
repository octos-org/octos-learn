import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiKeysTab } from "./api-keys-tab";
import {
  normalizeProfileConfig,
  type Profile,
  type ProfileConfig,
} from "./settings-api";

const serviceMocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
vi.mock("@/byok/services", () => ({ listClientServices: serviceMocks.list, saveClientService: serviceMocks.save }));
const apiMocks = vi.hoisted(() => ({
  updateMyProfileConfig: vi.fn(),
  formatSettingsError: vi.fn((e: unknown, fb = "failed") =>
    e instanceof Error ? e.message : fb,
  ),
}));
// Keep the real module (normalizeProfileConfig etc.) and only spy the two
// functions ApiKeysTab calls at runtime.
vi.mock("./settings-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settings-api")>();
  return { ...actual, ...apiMocks };
});

/** Build a fully-typed Profile from a partial config (no `as any`). */
function makeProfile(config: Partial<ProfileConfig>): Profile {
  return {
    id: "p1",
    name: "p1",
    enabled: true,
    data_dir: null,
    config: normalizeProfileConfig(config),
    created_at: "",
    updated_at: "",
    status: { running: false, pid: null, started_at: null, uptime_secs: null },
  };
}

const baseProfile = makeProfile({
  env_vars: {
    OPENAI_API_KEY: "sk-p***xyz", // masked => already set
    SERPER_API_KEY: "se***er", // unrelated key must survive the save
  },
});

describe("ApiKeysTab", () => {
  beforeEach(() => {
    cleanup();
    serviceMocks.list.mockReset(); serviceMocks.list.mockResolvedValue({ profile_id: "p1", services: {} });
    serviceMocks.save.mockReset(); serviceMocks.save.mockImplementation(async (_capability, draft) => ({ ...draft, has_credential: !!draft.key, revision: "r2", execution_target: "client" }));
    apiMocks.updateMyProfileConfig.mockReset();
    apiMocks.updateMyProfileConfig.mockResolvedValue(baseProfile);
  });

  it("renders the three groups with fields for every documented key", () => {
    render(<ApiKeysTab profile={baseProfile} onProfileUpdated={() => {}} />);

    expect(screen.getByText("LLM Providers")).toBeTruthy();
    expect(screen.getByText("Channels")).toBeTruthy();
    expect(screen.getByText("Infrastructure")).toBeTruthy();

    for (const key of [
      "OPENAI_API_KEY",
      "DASHSCOPE_API_KEY",
      "DEEPSEEK_API_KEY",
      "MOONSHOT_API_KEY",
      "MINIMAX_API_KEY",
      "GEMINI_API_KEY",
      "NVIDIA_API_KEY",
      "ZAI_API_KEY",
      "PERPLEXITY_API_KEY",
      "TELEGRAM_BOT_TOKEN",
      "LARK_APP_ID",
      "LARK_APP_SECRET",
      "SMTP_PASSWORD",
      "NGROK_AUTHTOKEN",
    ]) {
      expect(
        screen.getByLabelText(key),
        `missing input for ${key}`,
      ).toBeTruthy();
    }
  });

  it("shows stored keys as masked values and disables save until dirty", () => {
    render(<ApiKeysTab profile={baseProfile} onProfileUpdated={() => {}} />);
    const openaiInput = screen.getByLabelText(
      "OPENAI_API_KEY",
    ) as HTMLInputElement;
    expect(openaiInput.value).toBe("sk-p***xyz");

    const saveBtn = screen.getByRole("button", {
      name: /save changes/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("writes newly typed keys, echoes masked ones, and keeps unrelated vars", async () => {
    render(<ApiKeysTab profile={baseProfile} onProfileUpdated={() => {}} />);

    fireEvent.change(screen.getByLabelText("DASHSCOPE_API_KEY"), {
      target: { value: "sk-dash-123" },
    });
    fireEvent.change(screen.getByLabelText("NGROK_AUTHTOKEN"), {
      target: { value: "ngrok-token-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(apiMocks.updateMyProfileConfig).toHaveBeenCalled(),
    );
    const [, patch] = apiMocks.updateMyProfileConfig.mock.calls[0];
    expect(patch.env_vars.DASHSCOPE_API_KEY).toBe("sk-dash-123");
    expect(patch.env_vars.NGROK_AUTHTOKEN).toBe("ngrok-token-1");
    // untouched: masked value echoed so the backend restores the real secret
    expect(patch.env_vars.OPENAI_API_KEY).toBe("sk-p***xyz");
    // unrelated key managed elsewhere is preserved
    expect(patch.env_vars.SERPER_API_KEY).toBe("se***er");
  });

  it("removes a key when its field is cleared before saving", async () => {
    render(<ApiKeysTab profile={baseProfile} onProfileUpdated={() => {}} />);

    fireEvent.change(screen.getByLabelText("OPENAI_API_KEY"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(apiMocks.updateMyProfileConfig).toHaveBeenCalled(),
    );
    const [, patch] = apiMocks.updateMyProfileConfig.mock.calls[0];
    expect("OPENAI_API_KEY" in patch.env_vars).toBe(false);
    expect(patch.env_vars.SERPER_API_KEY).toBe("se***er");
  });
  it("saving a speech key connects the service without changing model env vars", async () => {
    render(<ApiKeysTab profile={baseProfile} onProfileUpdated={() => {}} />);
    const input = await screen.findByLabelText("Volcano TTS API Key");
    fireEvent.change(input, { target: { value: "synthetic-own-speech-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(serviceMocks.save).toHaveBeenCalledWith("tts", expect.objectContaining({ provider: "volcano", key: "synthetic-own-speech-key", enabled: true }), undefined));
    await screen.findByRole("button", { name: "Saved" });
    expect(input).toHaveProperty("value", "••••••••");
    expect(apiMocks.updateMyProfileConfig).not.toHaveBeenCalled();
    expect(serviceMocks.save).toHaveBeenCalledOnce();
  });
  it("clearing a stored service key disables it while preserving its parameters", async () => {
    serviceMocks.list.mockResolvedValue({ profile_id: "p1", services: { tts: { provider: "volcano", enabled: true, has_credential: true, revision: "r1", params: { auth_mode: "api-key", resource_id: "my-resource", voice: "my-voice" } } } });
    render(<ApiKeysTab profile={baseProfile} onProfileUpdated={() => {}} />);
    const input = await screen.findByLabelText("Volcano TTS API Key");
    expect(input).toHaveProperty("value", "••••••••");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(serviceMocks.save).toHaveBeenCalledWith("tts", { provider: "volcano", key: "", enabled: false, params: { auth_mode: "api-key", resource_id: "my-resource", voice: "my-voice" } }, "r1"));
    expect(apiMocks.updateMyProfileConfig).not.toHaveBeenCalled();
  });
  it("keeps a rejected key draft until reset, without changing other saved keys", async () => {
    serviceMocks.save.mockRejectedValue(new Error("Configuration changed; reload before saving"));
    render(<ApiKeysTab profile={baseProfile} onProfileUpdated={() => {}} />);
    const input = await screen.findByLabelText("TypeSafe Jev API Key");
    fireEvent.change(input, { target: { value: "synthetic-jev-draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await screen.findByText("Configuration changed; reload before saving");
    expect(input).toHaveProperty("value", "synthetic-jev-draft");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(input).toHaveProperty("value", "");
    expect(apiMocks.updateMyProfileConfig).not.toHaveBeenCalled();
  });

});
