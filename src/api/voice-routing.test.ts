import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({ asr: false, tts: false }));
vi.mock("@/byok/providers", () => ({ availableService: (id: "asr" | "tts") => services[id] }));
vi.mock("@/byok/services", () => ({ getService: () => services.tts ? { key: "synthetic-tts-key", params: { voice: "" } } : undefined, hasServiceCredential: (value: unknown) => !!value, getServiceStatus: () => ({ detail: "账号已配置，此设备尚未验证。" }), subscribeServices: vi.fn(), getLessonConfigured: () => true }));
import { getVoiceRouting, selectVoiceRoutes } from "./voice-routing";
import type { VoiceReadiness } from "@/settings/settings-api";
beforeEach(() => { services.asr = false; services.tts = false; });
describe("BYOK routes have no platform or private fallback", () => {
  it("never selects server speech even if server readiness claims it is ready", () => {
    const legacy = { asr: { ready: true, mode: "private" }, tts: { ready: true, mode: "local" } } as VoiceReadiness;
    expect(selectVoiceRoutes(legacy, false, false)).toEqual({ asr: "unavailable", tts: "unavailable" });
    expect(selectVoiceRoutes(legacy, true, false)).toEqual({ asr: "cloud", tts: "unavailable" });
  });
  it("keeps ASR and TTS independent and makes no health or grant requests", async () => {
    const fetch = vi.spyOn(globalThis, "fetch"); services.asr = true;
    expect(await getVoiceRouting()).toMatchObject({ asr: "cloud", tts: "unavailable" });
    services.asr = false; services.tts = true;
    expect(await getVoiceRouting(true)).toMatchObject({ asr: "unavailable", tts: "cloud" });
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it("allows a saved TTS key with a missing voice to surface synthesis validation instead of silently skipping lessons", async () => {
    services.tts = true;
    expect(await getVoiceRouting()).toMatchObject({ tts: "cloud", readiness: { tts: { ready: false } } });
  });
});
