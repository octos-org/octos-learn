import { afterEach, describe, expect, it, vi } from "vitest";
import {
  nativeTtsAvailable,
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
});
