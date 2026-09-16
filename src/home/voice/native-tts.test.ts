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

  it("resolves at native playback start and completes on the native ended event", async () => {
    let requestId = "";
    const ended = vi.fn();
    window.OctosNativeTts = {
      isConfigured: () => true,
      play: (id) => {
        requestId = id;
        return JSON.stringify({ ok: true });
      },
    };

    expect(nativeTtsAvailable()).toBe(true);
    const started = playNativeTts("第一节旁白", ended);
    window.__octosNativeTtsEvent?.(JSON.stringify({
      requestId,
      type: "started",
    }));
    await expect(started).resolves.toBe(true);
    window.__octosNativeTtsEvent?.(JSON.stringify({
      requestId,
      type: "ended",
    }));
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("cancels native playback when narration is superseded", async () => {
    let requestId = "";
    const cancel = vi.fn();
    window.OctosNativeTts = {
      isConfigured: () => true,
      play: (id) => {
        requestId = id;
        return JSON.stringify({ ok: true });
      },
      cancel,
    };
    const controller = new AbortController();
    const started = playNativeTts("即将被切换的旁白", vi.fn(), controller.signal);
    controller.abort();
    await expect(started).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledWith(requestId);
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
