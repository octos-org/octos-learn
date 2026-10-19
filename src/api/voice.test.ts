import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn(), direct: vi.fn() }));
vi.mock("./client", () => ({ request: api.request }));
vi.mock("@/byok/providers", () => ({ synthesizeDirect: api.direct }));
import { getVoices, setVoice, synthesizeSpeech, synthesizeCloudSpeech, fetchNativeTtsConfig, isHostedTtsEnabled } from "./voice";
beforeEach(() => { api.request.mockReset(); api.direct.mockReset(); });
describe("voice API", () => {
  it("retains the generic voice catalog and selection APIs", async () => {
    api.request.mockResolvedValue({ voices: [], current: "test" }); await getVoices();
    expect(api.request).toHaveBeenCalledWith("/api/voices");
    await setVoice("test"); expect(api.request).toHaveBeenCalledWith("/api/my/voice", { method: "PUT", body: '{"voice":"test"}' });
  });
  it("uses only the direct BYOK adapter for both synthesis entrypoints", async () => {
    const blob = new Blob(["mp3"]); api.direct.mockResolvedValue(blob);
    expect(await synthesizeSpeech("hi")).toBe(blob); expect(await synthesizeCloudSpeech("hi")).toBe(blob);
    expect(api.request).not.toHaveBeenCalled();
  });
  it("does not retry through platform TTS after failure", async () => {
    api.direct.mockRejectedValue(new Error("missing own key"));
    await expect(synthesizeSpeech("hi")).rejects.toThrow("missing own key");
    expect(api.direct).toHaveBeenCalledOnce(); expect(api.request).not.toHaveBeenCalled();
  });
  it("clears legacy APK credentials without requesting a platform grant", async () => {
    expect(await fetchNativeTtsConfig()).toEqual({ version: 1, enabled: false });
    expect(isHostedTtsEnabled()).toBe(false); expect(api.request).not.toHaveBeenCalled();
  });
});
