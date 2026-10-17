import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routing = vi.hoisted(() => ({ backendReady: true, cloudAvailable: true }));
vi.mock("./voice-routing", () => ({
  getVoiceRouting: vi.fn(async () => ({ tts: routing.backendReady ? "backend" : "cloud", readiness: { tts: { ready: routing.backendReady } }, cloudTtsAvailable: routing.cloudAvailable })),
  markPrivateTtsFailed: vi.fn(),
}));
vi.mock("@/api/client", () => ({
  request: vi.fn(),
  requestBlob: vi.fn(),
}));

import { request, requestBlob } from "@/api/client";
import {
  fetchHostedTtsStatus,
  fetchNativeTtsConfig,
  getVoices,
  setVoice,
  synthesizeSpeech,
} from "@/api/voice";

const mockRequest = request as unknown as ReturnType<typeof vi.fn>;
const mockRequestBlob = requestBlob as unknown as ReturnType<typeof vi.fn>;

describe("voice api", () => {
  beforeEach(() => {
    routing.backendReady = true; routing.cloudAvailable = true;
    mockRequest.mockReset();
    mockRequestBlob.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getVoices GETs /api/voices", async () => {
    mockRequest.mockResolvedValue({
      voices: [{ id: "doubao", aliases: ["vivian"] }],
      current: "doubao",
    });
    const res = await getVoices();
    expect(mockRequest).toHaveBeenCalledWith("/api/voices");
    expect(res.current).toBe("doubao");
    expect(res.voices[0].id).toBe("doubao");
  });

  it("setVoice PUTs /api/my/voice with the voice id", async () => {
    mockRequest.mockResolvedValue({ ok: true, voice: "yangmi" });
    const res = await setVoice("yangmi");
    expect(mockRequest).toHaveBeenCalledWith("/api/my/voice", {
      method: "PUT",
      body: JSON.stringify({ voice: "yangmi" }),
    });
    expect(res.voice).toBe("yangmi");
  });

  it("synthesizes text through the authenticated profile TTS route", async () => {
    const audio = new Blob(["audio"], { type: "audio/wav" });
    const controller = new AbortController();
    mockRequestBlob.mockResolvedValue(audio);

    await expect(
      synthesizeSpeech("先看这个圆。", controller.signal),
    ).resolves.toBe(audio);
    expect(mockRequestBlob).toHaveBeenCalledWith("/api/voice/synthesize", {
      method: "POST",
      body: JSON.stringify({ text: "先看这个圆。" }),
      signal: controller.signal,
    });
  });

  it("falls back to cloud synthesis after a private/local HTTP TTS failure", async () => {
    const audio = new Blob(["cloud audio"]);
    mockRequestBlob.mockRejectedValueOnce(new Error("local worker offline")).mockResolvedValueOnce(audio);
    await expect(synthesizeSpeech("降级旁白")).resolves.toBe(audio);
    expect(mockRequestBlob.mock.calls.map(call => call[0])).toEqual(["/api/voice/synthesize", "/api/learn/tts/cloud-synthesize"]);
  });

  it("does not retry synthesis after cancellation", async () => {
    const controller = new AbortController();
    mockRequestBlob.mockImplementationOnce(async () => { controller.abort(); throw new DOMException("cancelled", "AbortError"); });
    await expect(synthesizeSpeech("取消旁白", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mockRequestBlob).toHaveBeenCalledOnce();
  });

  it("reads product-hosted TTS status from the Octos Learn service", async () => {
    const status = { configured: true, available: true, uses_platform: true };
    mockRequest.mockResolvedValue(status);

    await expect(fetchHostedTtsStatus()).resolves.toBe(status);
    expect(mockRequest).toHaveBeenCalledWith("/api/learn/tts/status");
  });

  it("fetches the authenticated Android native TTS configuration", async () => {
    const config = {
      version: 1,
      enabled: true,
      app_id: "server-app",
      access_token: "server-token",
      cluster: "volcano_tts",
      voice_type: "zh_female_xiaohe_uranus_bigtts",
    } as const;
    mockRequest.mockResolvedValue(config);

    await expect(fetchNativeTtsConfig()).resolves.toBe(config);
    expect(mockRequest).toHaveBeenCalledWith("/api/learn/tts/native-config");
  });

  it("routes public synthesis through the product-hosted service", async () => {
    routing.backendReady = false;
    vi.stubEnv("VITE_HOSTED_TTS_ENABLED", "true");
    const audio = new Blob(["audio"], { type: "audio/mpeg" });
    mockRequestBlob.mockResolvedValue(audio);

    await expect(synthesizeSpeech("继续讲解。")).resolves.toBe(audio);
    expect(mockRequestBlob).toHaveBeenCalledWith(
      "/api/learn/tts/cloud-synthesize",
      {
        method: "POST",
        body: JSON.stringify({ text: "继续讲解。" }),
        signal: undefined,
      },
    );
  });

  it("routes a local Android-mode preview through the profile TTS service", async () => {
    routing.backendReady = false;
    vi.stubEnv("VITE_HOSTED_TTS_ENABLED", "true");
    vi.stubEnv("MODE", "android");
    vi.stubEnv("DEV", true);
    routing.backendReady = true;
    const audio = new Blob(["audio"], { type: "audio/wav" });
    mockRequestBlob.mockResolvedValue(audio);

    await expect(synthesizeSpeech("本机预览旁白。"))
      .resolves.toBe(audio);
    expect(mockRequestBlob).toHaveBeenCalledWith(
      "/api/voice/synthesize",
      {
        method: "POST",
        body: JSON.stringify({ text: "本机预览旁白。" }),
        signal: undefined,
      },
    );
  });

  it("keeps hosted TTS enabled in the packaged Android build", async () => {
    routing.backendReady = false;
    vi.stubEnv("VITE_HOSTED_TTS_ENABLED", "true");
    vi.stubEnv("MODE", "android");
    vi.stubEnv("DEV", false);
    const audio = new Blob(["audio"], { type: "audio/mpeg" });
    mockRequestBlob.mockResolvedValue(audio);

    await expect(synthesizeSpeech("APK 公网旁白。"))
      .resolves.toBe(audio);
    expect(mockRequestBlob).toHaveBeenCalledWith(
      "/api/learn/tts/cloud-synthesize",
      {
        method: "POST",
        body: JSON.stringify({ text: "APK 公网旁白。" }),
        signal: undefined,
      },
    );
  });
});
