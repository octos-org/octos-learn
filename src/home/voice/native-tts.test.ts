import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureNativeTts,
  nativePackagedAudioAvailable,
  nativeTtsBridgeAvailable,
  nativeTtsAvailable,
  playNativeAudioBlob,
  playNativeTts,
} from "./native-tts";

describe("Android native TTS bridge", () => {
  afterEach(() => {
    delete window.OctosNativeTts;
  });

  it("never uses persisted legacy credentials for generated narration", async () => {
    const play = vi.fn();
    window.OctosNativeTts = { isConfigured: () => true, play };
    expect(nativeTtsAvailable()).toBe(false);
    await expect(playNativeTts("narration", vi.fn())).resolves.toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("plays verified CoursePack bytes without requiring a TTS credential", async () => {
    let requestId = "";
    const playAudio = vi.fn((id: string) => {
      requestId = id;
      return JSON.stringify({ ok: true });
    });
    const ended = vi.fn();
    window.OctosNativeTts = { playAudio };

    expect(nativePackagedAudioAvailable()).toBe(true);
    const started = playNativeAudioBlob(
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
      ended,
    );
    await vi.waitFor(() => expect(playAudio).toHaveBeenCalledWith(
      requestId,
      "AQID",
      "audio/mpeg",
    ));
    window.__octosNativeTtsEvent?.(JSON.stringify({
      requestId,
      type: "started",
    }));
    await expect(started).resolves.toBe(true);
    window.__octosNativeTtsEvent?.(JSON.stringify({
      requestId,
      type: "ended",
    }));
    expect(ended).toHaveBeenCalledOnce();
  });

  it("hands the authenticated server configuration to native secure storage", () => {
    const configure = vi.fn(() => JSON.stringify({ ok: true }));
    window.OctosNativeTts = {
      configure,
      isConfigured: () => true,
      play: () => JSON.stringify({ ok: true }),
    };

    expect(nativeTtsBridgeAvailable()).toBe(true);
    expect(configureNativeTts({
      version: 1,
      enabled: true,
      app_id: "server-app",
      access_token: "server-token",
      cluster: "volcano_tts",
      voice_type: "zh_female_xiaohe_uranus_bigtts",
    })).toBe(true);
    expect(JSON.parse(configure.mock.calls[0][0])).toEqual({
      version: 1,
      enabled: true,
      app_id: "server-app",
      access_token: "server-token",
      cluster: "volcano_tts",
      voice_type: "zh_female_xiaohe_uranus_bigtts",
    });
  });
});
