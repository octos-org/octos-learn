import { tr } from "@/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ServiceMetadata } from "@/byok/services";
const state = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), synthesize: vi.fn(), credential: vi.fn(), mic: vi.fn(), stop: vi.fn(async () => {}), captureError: vi.fn() }));
vi.mock("@/byok/services", () => ({
  listClientServices: state.list, saveClientService: state.save, getServiceForTest: state.credential,
  serviceRequest: (signal: AbortSignal) => ({ signal, dispose: vi.fn() }),
}));
vi.mock("@/byok/providers", async importOriginal => ({ ...await importOriginal<typeof import("@/byok/providers")>(), synthesizeDirect: state.synthesize, validateService: vi.fn(), directJson: vi.fn(), markVerified: vi.fn(), serviceFailure: (_id: string, error: Error) => error, transcribeDirect: vi.fn() }));
vi.mock("@/home/voice/use-voice-capture", () => ({ useVoiceCapture: () => ({ start: state.mic, stop: state.stop, capturing: false, error: null, getError: state.captureError }) }));
vi.mock("@/home/voice/audio-playback", () => ({ unlockAudio: vi.fn(), playAudioBlob: vi.fn(async () => true) }));
import { VoiceTab } from "./voice-tab";
import type { Profile } from "./settings-api";
const tts: ServiceMetadata = { provider: "volcano", enabled: false, params: { auth_mode: "api-key", resource_id: "seed-tts-2.0", voice: "old-voice" }, revision: "r1", has_credential: true, execution_target: "client" };
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: 1, voices: [] }), { headers: { "Content-Type": "application/json" } })));
  state.list.mockReset(); state.list.mockResolvedValue({ profile_id: "alice", services: { tts } });
  state.save.mockReset(); state.save.mockImplementation(async (_capability, draft) => ({ ...draft, revision: "r2", has_credential: true, execution_target: "client" }));
  state.synthesize.mockReset(); state.synthesize.mockResolvedValue(new Blob(["audio"]));
  state.credential.mockReset(); state.credential.mockResolvedValue({ ...tts, key: "synthetic-own-key" });
  state.mic.mockReset(); state.mic.mockResolvedValue(true); state.stop.mockClear(); state.captureError.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => render(<VoiceTab profile={{ id: "alice" } as Profile} onProfileUpdated={vi.fn()} />);
describe("BYOK voice settings", () => {
  it("uses settings sections, keeps credentials in API Keys and starts no tests", async () => {
    show(); await screen.findByRole("region", { name: tr("Text to Speech") });
    expect(screen.getByRole("region", { name: tr("Speech Recognition") })).toBeTruthy();
    expect(screen.getByRole("region", { name: tr("Input Understanding") })).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByRole("link", { name: tr("Manage API key") }).getAttribute("href")).toContain("tab=api-keys");
    expect(screen.getByRole("button", { name: tr("Save Changes") })).toHaveProperty("disabled", true);
    expect(state.synthesize).not.toHaveBeenCalled(); expect(state.mic).not.toHaveBeenCalled();
  });
  it("saves only edited parameters with their revision and leaves the credential untouched", async () => {
    show(); const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    fireEvent.change(within(region).getByLabelText(tr("Custom Voice ID")), { target: { value: "new-voice" } });
    fireEvent.click(screen.getByRole("button", { name: tr("Save Changes") }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith("tts", { provider: "volcano", enabled: true, params: { auth_mode: "api-key", resource_id: "seed-tts-2.0", voice: "new-voice" } }, "r1"));
    expect(state.save).toHaveBeenCalledOnce();
    await screen.findByRole("button", { name: tr("Saved") });
    expect(state.synthesize).not.toHaveBeenCalled(); expect(state.mic).not.toHaveBeenCalled();
  });
  it("resets edits and disables save again", async () => {
    show(); const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    fireEvent.change(within(region).getByLabelText(tr("Custom Voice ID")), { target: { value: "draft-voice" } });
    fireEvent.click(screen.getByRole("button", { name: tr("Reset") }));
    expect(within(region).getByLabelText(tr("Custom Voice ID"))).toHaveProperty("value", "old-voice");
    expect(screen.getByRole("button", { name: tr("Save Changes") })).toHaveProperty("disabled", true);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("uses a previously saved key without an activation switch and keeps tests separate from saving", async () => {
    show(); const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    fireEvent.click(within(region).getByRole("button", { name: tr("Test voice") }));
    await screen.findByText(tr("Voice synthesized and played successfully."));
    expect(state.synthesize.mock.calls[0][2]).toMatchObject({ key: "synthetic-own-key", enabled: true });
    expect(within(region).queryByRole("switch")).toBeNull();
    expect(within(region).getByText(new RegExp(tr("Connected automatically with your saved API key. Remove the key in API Keys to disconnect.").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""))).toBeTruthy();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("preserves unsaved parameters after a failed test", async () => {
    state.synthesize.mockRejectedValue(new Error("资源无权限")); show();
    const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    fireEvent.change(within(region).getByLabelText(tr("Custom Voice ID")), { target: { value: "draft-voice" } });
    fireEvent.click(within(region).getByRole("button", { name: tr("Test voice") }));
    await screen.findByText("资源无权限");
    expect(within(region).getByLabelText(tr("Custom Voice ID"))).toHaveProperty("value", "draft-voice");
    expect(state.save).not.toHaveBeenCalled();
  });
  it("distinguishes a successful draft preview from a saved lesson voice", async () => {
    state.list.mockResolvedValue({ profile_id: "alice", services: { tts: { ...tts, params: { ...tts.params, voice: "" } } } });
    show(); const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    expect(within(region).getByText(tr("Voice required"))).toBeTruthy();
    expect(within(region).getByRole("button", { name: tr("Test voice") })).toHaveProperty("disabled", true);
    fireEvent.change(within(region).getByLabelText(tr("Voice ID"), { exact: true }), { target: { value: "__custom__" } });
    fireEvent.change(within(region).getByLabelText(tr("Custom Voice ID")), { target: { value: "previewed-voice" } });
    fireEvent.click(within(region).getByRole("button", { name: tr("Test voice") }));
    await screen.findByText(tr("Voice synthesized and played successfully."));
    expect(within(region).getByText(new RegExp(tr("Unsaved changes. Tests preview these edits; lessons still use your saved settings.").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""))).toBeTruthy();
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(within(region).getByRole("button", { name: tr("Save voice for lessons") }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith("tts", expect.objectContaining({ params: expect.objectContaining({ voice: "previewed-voice" }) }), "r1"));
    await waitFor(() => expect(within(region).queryByText(tr("Voice required"))).toBeNull());
    expect(within(region).queryByText(new RegExp(tr("Unsaved changes. Tests preview these edits; lessons still use your saved settings.").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""))).toBeNull();
  });
  it("cancels a running draft test when its parameters change", async () => {
    let signal: AbortSignal | undefined;
    state.synthesize.mockImplementation((_text, value: AbortSignal) => { signal = value; return new Promise((_resolve, reject) => value.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")))); });
    show(); const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    fireEvent.click(within(region).getByRole("button", { name: tr("Test voice") }));
    await waitFor(() => expect(state.synthesize).toHaveBeenCalledOnce());
    fireEvent.change(within(region).getByLabelText(tr("Custom Voice ID")), { target: { value: "another-voice" } });
    expect(signal?.aborted).toBe(true);
  });
  it("keeps paid tests unavailable until an API Key is saved", async () => {
    state.list.mockResolvedValue({ profile_id: "alice", services: {} }); show();
    const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    expect(within(region).queryByRole("switch")).toBeNull();
    expect(within(region).getByRole("button", { name: tr("Test voice") })).toHaveProperty("disabled", true);
    expect(within(region).getByRole("link", { name: tr("Set up API key") })).toBeTruthy();
  });
  it("never reinterprets a legacy credential as a new API Key", async () => {
    state.list.mockResolvedValue({ profile_id: "alice", services: { tts: { ...tts, params: { ...tts.params, auth_mode: "legacy", app_id: "old-app" } } } }); show();
    const region = await screen.findByRole("region", { name: tr("Text to Speech") });
    fireEvent.change(within(region).getByLabelText(tr("Custom Voice ID")), { target: { value: "new-voice" } });
    fireEvent.click(screen.getByRole("button", { name: tr("Save Changes") }));
    await screen.findByText(tr("Replace the {{v0}} credential in API Keys first.", {v0: tr("Text to Speech")}));
    expect(state.save).not.toHaveBeenCalled(); expect(state.credential).not.toHaveBeenCalled();
  });
  it("shows the capture initialization cause instead of blaming the supplier key", async () => {
    state.list.mockResolvedValue({ profile_id: "alice", services: { asr: { ...tts, params: { auth_mode: "api-key", resource_id: "volc.bigasr.auc_turbo" } } } });
    state.mic.mockResolvedValue(false);
    state.captureError.mockReturnValue("Voice capture could not initialize: failed to load ONNX runtime");
    show(); const region = await screen.findByRole("region", { name: tr("Speech Recognition") });
    fireEvent.click(within(region).getByRole("button", { name: tr("Test microphone") }));
    await screen.findByText("Voice capture could not initialize: failed to load ONNX runtime");
    expect(state.save).not.toHaveBeenCalled();
  });

});
