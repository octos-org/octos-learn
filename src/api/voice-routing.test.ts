import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearVoiceRouting, getVoiceRouting, markPrivateAsrFailed, markPrivateTtsFailed } from "./voice-routing";
import type { VoiceReadiness } from "@/settings/settings-api";

const mocks = vi.hoisted(() => ({ request: vi.fn(), cloud: vi.fn(), token: "alice", profile: "alice" }));
vi.mock("./client", () => ({
  request: mocks.request, getToken: () => mocks.token, getSelectedProfileId: () => mocks.profile,
}));
vi.mock("./cloud-asr", () => ({ fetchCloudAsrStatus: mocks.cloud, isCloudAsrEnabled: () => true }));

function readiness(online: boolean): VoiceReadiness {
  return { ready: online, asr: { ready: online, mode: "private", detail: online ? "ready" : "bridge offline" },
    llm: { ready: true, detail: "ready" }, tts: { ready: false, mode: "local", detail: "not available" } };
}

beforeEach(() => {
  clearVoiceRouting(); mocks.request.mockReset(); mocks.cloud.mockReset();
  mocks.token = "alice"; mocks.profile = "alice";
  mocks.cloud.mockResolvedValue({ available: true, detail: "configured" });
  mocks.request.mockImplementation(async path => path === "/api/voice/readiness" ? readiness(true) : { available: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); delete window.OctosNativeTts; clearVoiceRouting(); });

describe("uniform private-first voice routing", () => {
  it.each(["development", "public", "android"])("prefers private voice on %s", async mode => {
    vi.stubEnv("MODE", mode);
    expect(await getVoiceRouting()).toMatchObject({ asr: "private", tts: "private" });
  });
  it("uses cloud ASR and TTS when the bridge is offline", async () => {
    mocks.request.mockImplementation(async path => path === "/api/voice/readiness" ? readiness(false) : { available: true });
    expect(await getVoiceRouting()).toMatchObject({ asr: "cloud", tts: "cloud" });
  });
  it("keeps local ASR/TTS as the primary when provided by a local Octos runtime", async () => {
    mocks.request.mockResolvedValueOnce({ ...readiness(true), asr: { ready: true, mode: "ominix" }, tts: { ready: true, mode: "local" } });
    expect(await getVoiceRouting()).toMatchObject({ asr: "backend", tts: "backend" });
  });
  it("does not let an unavailable TTS route disable usable ASR", async () => {
    mocks.request.mockImplementation(async path => path === "/api/voice/readiness" ? readiness(false) : { available: false });
    expect(await getVoiceRouting()).toMatchObject({ asr: "cloud", tts: "unavailable" });
  });
  it("reports unavailable rather than pretending an unconfigured cloud fallback works", async () => {
    mocks.cloud.mockResolvedValue({ available: false, detail: "missing credentials" });
    mocks.request.mockImplementation(async path => path === "/api/voice/readiness" ? readiness(false) : { available: false });
    expect(await getVoiceRouting()).toMatchObject({ asr: "unavailable", tts: "unavailable" });
  });
  it("caches and coalesces health checks for the current identity", async () => {
    const [first, second] = await Promise.all([getVoiceRouting(), getVoiceRouting()]);
    expect(first).toBe(second);
    expect(await getVoiceRouting()).toBe(first);
    expect(mocks.cloud).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it("does not carry one account's routing into a second account", async () => {
    await getVoiceRouting(); mocks.token = "bob";
    await getVoiceRouting(); expect(mocks.cloud).toHaveBeenCalledTimes(2);
  });
  it("backs off after RTC failure, then probes private recovery", async () => {
    vi.useFakeTimers();
    expect((await getVoiceRouting()).asr).toBe("private");
    markPrivateAsrFailed(); markPrivateTtsFailed();
    expect(await getVoiceRouting()).toMatchObject({ asr: "cloud", tts: "cloud" });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await getVoiceRouting()).toMatchObject({ asr: "private", tts: "private" });
  });
  it("never hides an authentication failure behind a cloud fallback", async () => {
    mocks.request.mockRejectedValue(Object.assign(new Error("authentication required"), { status: 401 }));
    await expect(getVoiceRouting()).rejects.toThrow("authentication required");
  });
  it("can still select cloud ASR/TTS when private health probing itself times out", async () => {
    mocks.request.mockImplementation(async path => {
      if (path === "/api/voice/readiness") throw new Error("health timeout");
      return { available: true };
    });
    expect(await getVoiceRouting()).toMatchObject({ asr: "cloud", tts: "cloud", readinessKnown: false,
      readiness: { llm: { ready: false } },
    });
  });
});
