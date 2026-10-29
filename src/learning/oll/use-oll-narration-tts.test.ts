import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOllNarrationTts } from "./use-oll-narration-tts";
import { configureNativeTts } from "@/home/voice/native-tts";
import { ServiceError } from "@/byok/providers";

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  route: "backend",
  playPrivateSpeech: vi.fn(),
  markPrivateTtsFailed: vi.fn(),
  playAudioBlob: vi.fn(),
  stopAudio: vi.fn(),
}));

vi.mock("@/api/voice", () => ({
  synthesizeSpeech: mocks.synthesizeSpeech,
  synthesizeCloudSpeech: mocks.synthesizeSpeech,
}));
vi.mock("@/api/voice-routing", () => ({
  getVoiceRouting: vi.fn(async () => ({ tts: mocks.route })),
  peekVoiceRouting: vi.fn(() => ({ tts: mocks.route })),
  markPrivateTtsFailed: mocks.markPrivateTtsFailed,
}));
vi.mock("@/home/voice/private-tts", () => ({ playPrivateSpeech: mocks.playPrivateSpeech }));
vi.mock("@/home/voice/audio-playback", () => ({
  playAudioBlob: mocks.playAudioBlob,
  stopAudio: mocks.stopAudio,
}));

describe("useOllNarrationTts", () => {
  beforeEach(() => {
    mocks.route = "backend";
    mocks.playPrivateSpeech.mockReset();
    mocks.markPrivateTtsFailed.mockReset();
    mocks.synthesizeSpeech.mockReset();
    mocks.playAudioBlob.mockReset();
    mocks.stopAudio.mockReset();
    mocks.synthesizeSpeech.mockResolvedValue(
      new Blob(["audio"], { type: "audio/wav" }),
    );
    mocks.playAudioBlob.mockResolvedValue(true);
  });

  afterEach(() => {
    delete window.OctosNativeTts;
    vi.restoreAllMocks();
  });

  it("prefers receive-only private TTS over cloud and native synthesis", async () => {
    mocks.route = "private"; mocks.playPrivateSpeech.mockResolvedValue(true);
    renderHook(() => useOllNarrationTts({ enabled: true, playing: true, text: "私有旁白", narrationId: "private-1" }));
    await waitFor(() => expect(mocks.playPrivateSpeech).toHaveBeenCalledOnce());
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("falls back to cloud when private TTS fails before playback", async () => {
    mocks.route = "private"; mocks.playPrivateSpeech.mockRejectedValue(new Error("bridge offline"));
    renderHook(() => useOllNarrationTts({ enabled: true, playing: true, text: "降级旁白", narrationId: "fallback-1" }));
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledOnce());
    expect(mocks.markPrivateTtsFailed).toHaveBeenCalledOnce();
    expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce();
  });

  it("falls back on a private TTS error after playback has started", async () => {
    mocks.route = "private"; mocks.playPrivateSpeech.mockResolvedValue(true);
    renderHook(() => useOllNarrationTts({ enabled: true, playing: true, text: "播放中断", narrationId: "fallback-2" }));
    await waitFor(() => expect(mocks.playPrivateSpeech).toHaveBeenCalledOnce());
    act(() => mocks.playPrivateSpeech.mock.calls[0][3](new Error("disconnected")));
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledOnce());
    expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce();
  });

  it("OLL-TCH-002 uses the profile-backed speech synthesis path", async () => {
    const onSpeakingChange = vi.fn();
    const onPlaybackStart = vi.fn();
    const onPlaybackComplete = vi.fn();
    renderHook(() =>
      useOllNarrationTts({
        enabled: true,
        playing: true,
        text: "先从三出发。",
        narrationId: "beat-1",
        onSpeakingChange,
        onPlaybackStart,
        onPlaybackComplete,
      }),
    );

    await waitFor(() =>
      expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
        "先从三出发。",
        expect.any(AbortSignal),
        null,
      ),
    );
    await waitFor(() =>
      expect(mocks.playAudioBlob).toHaveBeenCalledTimes(1),
    );
    expect(onSpeakingChange).toHaveBeenLastCalledWith(true);
    expect(onPlaybackStart).toHaveBeenCalledWith("beat-1");
    const onEnded = mocks.playAudioBlob.mock.calls[0]?.[1] as
      | (() => void)
      | undefined;
    act(() => onEnded?.());
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false);
    expect(onPlaybackComplete).toHaveBeenCalledOnce();
    expect(onPlaybackComplete).toHaveBeenCalledWith("beat-1");
  });

  it("continues narration through server synthesis after native credentials are disabled", async () => {
    let configured = true;
    const nativePlay = vi.fn();
    mocks.route = "cloud";
    window.OctosNativeTts = {
      configure: (raw) => {
        configured = JSON.parse(raw).enabled;
        return JSON.stringify({ ok: true });
      },
      isConfigured: () => configured,
      play: nativePlay,
      stop: vi.fn(),
    };
    expect(configureNativeTts({ version: 1, enabled: false })).toBe(true);
    mocks.route = "backend";
    const onPlaybackComplete = vi.fn();
    renderHook(() => useOllNarrationTts({
      enabled: true,
      playing: true,
      text: "Continue the narration.",
      narrationId: "platform-disabled",
      onPlaybackComplete,
    }));
    await waitFor(() => expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      "Continue the narration.", expect.any(AbortSignal), null,
    ));
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledOnce());
    expect(nativePlay).not.toHaveBeenCalled();
    act(() => mocks.playAudioBlob.mock.calls[0][1]());
    expect(onPlaybackComplete).toHaveBeenCalledWith("platform-disabled");
  });

  it("plays verified packaged narration without contacting either TTS provider", async () => {
    const audio = new Blob(["packaged-audio"], { type: "audio/mpeg" });
    const resolveAudio = vi.fn(() => audio);
    const nativePlay = vi.fn(() => JSON.stringify({ ok: true }));
    mocks.route = "cloud";
    window.OctosNativeTts = {
      isConfigured: () => true,
      prefetch: vi.fn(() => JSON.stringify({ ok: true })),
      play: nativePlay,
      cancel: vi.fn(),
      stop: vi.fn(),
    };

    renderHook(() => useOllNarrationTts({
      enabled: true,
      playing: true,
      text: "Packaged narration.",
      narrationId: "pack-beat-1",
      prefetchEnabled: true,
      upcomingText: "No provider prefetch.",
      upcomingNarrationId: "pack-beat-2",
      resolveAudio,
    }));

    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledWith(
      audio,
      expect.any(Function),
      expect.any(AbortSignal),
    ));
    expect(resolveAudio).toHaveBeenCalledWith(
      "pack-beat-1",
      "Packaged narration.",
      expect.any(AbortSignal),
    );
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
    expect(nativePlay).not.toHaveBeenCalled();
  });

  it("routes packaged narration through Android MediaPlayer when available", async () => {
    let requestId = "";
    const playAudio = vi.fn((id: string) => {
      requestId = id;
      return JSON.stringify({ ok: true });
    });
    mocks.route = "cloud";
    window.OctosNativeTts = { playAudio };

    renderHook(() => useOllNarrationTts({
      enabled: true,
      playing: true,
      text: "Packaged narration.",
      narrationId: "pack-beat-native",
      resolveAudio: () => new Blob([new Uint8Array([1, 2, 3])], {
        type: "audio/mpeg",
      }),
    }));

    await waitFor(() => expect(playAudio).toHaveBeenCalledOnce());
    expect(mocks.playAudioBlob).not.toHaveBeenCalled();
    window.__octosNativeTtsEvent?.(JSON.stringify({
      requestId,
      type: "started",
    }));
  });

  it("reports preparation until audio really starts", async () => {
    let resolveSpeech: ((audio: Blob) => void) | undefined;
    mocks.synthesizeSpeech.mockImplementation(() =>
      new Promise<Blob>((resolve) => {
        resolveSpeech = resolve;
      })
    );
    const onPlaybackStart = vi.fn();
    const { result } = renderHook(() =>
      useOllNarrationTts({
        enabled: true,
        playing: true,
        text: "请稍等一下。",
        narrationId: "beat-preparing",
        onPlaybackStart,
      }),
    );

    await waitFor(() => expect(result.current.preparing).toBe(true));
    expect(onPlaybackStart).not.toHaveBeenCalled();
    act(() => resolveSpeech?.(new Blob(["prepared-audio"])));
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.preparing).toBe(false));
    expect(onPlaybackStart).toHaveBeenCalledWith("beat-preparing");
  });

  it("prewarms the first narration before the Runtime reaches its speech boundary", async () => {
    const firstAudio = new Blob(["prewarmed-first"]);
    mocks.synthesizeSpeech.mockResolvedValue(firstAudio);
    const { rerender } = renderHook(
      ({ playing, text, narrationId }) => useOllNarrationTts({
        enabled: true,
        playing,
        text,
        narrationId,
        prefetchEnabled: true,
        prewarmText: "第一段旁白。",
        prewarmNarrationId: "beat-1",
      }),
      {
        initialProps: {
          playing: false,
          text: "",
          narrationId: undefined as string | undefined,
        },
      },
    );

    await waitFor(() => expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      "第一段旁白。",
      expect.any(AbortSignal),
      null,
    ));
    expect(mocks.playAudioBlob).not.toHaveBeenCalled();

    rerender({
      playing: true,
      text: "第一段旁白。",
      narrationId: "beat-1",
    });
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledWith(
      firstAudio,
      expect.any(Function),
      expect.any(AbortSignal),
    ));
    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("does not prewarm narration through a legacy platform credential", async () => {
    const prefetch = vi.fn();
    window.OctosNativeTts = { isConfigured: () => true, prefetch, play: vi.fn() };
    mocks.route = "cloud";
    renderHook(() => useOllNarrationTts({ enabled: true, playing: false, text: "", prefetchEnabled: true, prewarmText: "narration", prewarmNarrationId: "beat-1" }));
    await waitFor(() => expect(mocks.synthesizeSpeech).toHaveBeenCalled());
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("does not restart synthesis when callback identities change during playback", async () => {
    let finishPlayback: (() => void) | undefined;
    mocks.playAudioBlob.mockImplementation(
      (_audio: Blob, onEnded: () => void) => {
        finishPlayback = onEnded;
        return Promise.resolve(true);
      },
    );
    const starts: string[] = [];
    const completions: string[] = [];
    const { result } = renderHook(() =>
      useOllNarrationTts({
        enabled: true,
        playing: true,
        text: "只合成一次。",
        narrationId: "beat-stable",
        onSpeakingChange: () => undefined,
        onPlaybackStart: (beatId) => starts.push(beatId),
        onPlaybackComplete: (beatId) => completions.push(beatId),
      }),
    );

    await waitFor(() => expect(result.current.preparing).toBe(false));
    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(mocks.playAudioBlob).toHaveBeenCalledTimes(1);
    expect(starts).toEqual(["beat-stable"]);

    act(() => finishPlayback?.());
    expect(completions).toEqual(["beat-stable"]);
    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("prefetches the next Beat once and reuses it for playback", async () => {
    const firstAudio = new Blob(["first"]);
    const secondAudio = new Blob(["second"]);
    let resolvePlaybackStart: ((started: boolean) => void) | undefined;
    mocks.playAudioBlob.mockImplementationOnce(() =>
      new Promise<boolean>((resolve) => {
        resolvePlaybackStart = resolve;
      })
    );
    mocks.synthesizeSpeech.mockImplementation((text: string) =>
      Promise.resolve(text === "第二段。" ? secondAudio : firstAudio)
    );
    const { rerender } = renderHook(
      ({ text, narrationId, upcomingText, upcomingNarrationId }) =>
        useOllNarrationTts({
          enabled: true,
          playing: true,
          text,
          narrationId,
          prefetchEnabled: true,
          upcomingText,
          upcomingNarrationId,
        }),
      {
        initialProps: {
          text: "第一段。",
          narrationId: "beat-1",
          upcomingText: "第二段。",
          upcomingNarrationId: "beat-2" as string | undefined,
        },
      },
    );

    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledOnce());
    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1);
    act(() => resolvePlaybackStart?.(true));
    await waitFor(() => expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(2));
    rerender({
      text: "第二段。",
      narrationId: "beat-2",
      upcomingText: "",
      upcomingNarrationId: undefined,
    });
    await waitFor(() =>
      expect(mocks.playAudioBlob).toHaveBeenCalledWith(
        secondAudio,
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(
      mocks.synthesizeSpeech.mock.calls.filter(([text]) => text === "第二段。"),
    ).toHaveLength(1);
  });

  it("cancels stale synthesis and playback when the Beat changes", async () => {
    let firstSignal: AbortSignal | undefined;
    const onPlaybackComplete = vi.fn();
    mocks.synthesizeSpeech.mockImplementation(
      (_text: string, signal: AbortSignal) => {
        firstSignal ??= signal;
        return Promise.resolve(new Blob(["audio"]));
      },
    );
    const { rerender } = renderHook(
      ({ text, narrationId }) =>
        useOllNarrationTts({
          enabled: true,
          playing: true,
          text,
          narrationId,
          onPlaybackComplete,
        }),
      { initialProps: { text: "第一段。", narrationId: "beat-1" } },
    );

    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledTimes(1));
    const staleOnEnded = mocks.playAudioBlob.mock.calls[0]?.[1] as
      | (() => void)
      | undefined;
    rerender({ text: "第二段。", narrationId: "beat-2" });

    expect(firstSignal?.aborted).toBe(true);
    expect(mocks.stopAudio).toHaveBeenCalled();
    act(() => staleOnEnded?.());
    expect(onPlaybackComplete).not.toHaveBeenCalledWith("beat-1");
    await waitFor(() =>
      expect(mocks.synthesizeSpeech).toHaveBeenLastCalledWith(
        "第二段。",
        expect.any(AbortSignal),
        null,
      ),
    );
  });

  it("R-007 keeps visible narration independent when provider synthesis fails", async () => {
    mocks.synthesizeSpeech.mockRejectedValue(new Error("provider down"));
    const onPlaybackComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ playing, text, narrationId }) => useOllNarrationTts({
        enabled: true,
        playing,
        text,
        narrationId,
        onPlaybackComplete,
      }),
      {
        initialProps: {
          playing: true,
          text: "旁白仍然可见。",
          narrationId: "beat-failed" as string | undefined,
        },
      },
    );

    await waitFor(() =>
      expect(result.current.error).toBe(
        "课程语音暂时不可用，旁白仍会显示。",
      ),
    );
    expect(mocks.playAudioBlob).not.toHaveBeenCalled();
    expect(onPlaybackComplete).toHaveBeenCalledWith("beat-failed");

    rerender({ playing: false, text: "", narrationId: undefined });
    expect(result.current.error).toBe(
      "课程语音暂时不可用，旁白仍会显示。",
    );

    mocks.synthesizeSpeech.mockResolvedValue(
      new Blob(["audio"], { type: "audio/wav" }),
    );
    rerender({
      playing: true,
      text: "下一段恢复语音。",
      narrationId: "beat-recovered",
    });
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("shows sanitized configuration failures and does not retry a failed prewarm", async () => {
    mocks.route = "cloud";
    mocks.synthesizeSpeech.mockRejectedValue(new ServiceError("resource_not_enabled", "尚未保存课程音色。请在 Voice 设置中选择音色并保存，然后重新播放课程。"));
    const onPlaybackComplete = vi.fn();
    const { result, rerender } = renderHook(({ playing }) => useOllNarrationTts({
      enabled: true, playing, text: playing ? "课程旁白" : "", narrationId: playing ? "beat-missing-voice" : undefined,
      prefetchEnabled: true, prewarmText: "课程旁白", prewarmNarrationId: "beat-missing-voice", onPlaybackComplete,
    }), { initialProps: { playing: false } });
    await waitFor(() => expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce());
    rerender({ playing: true });
    await waitFor(() => expect(result.current.error).toContain("尚未保存课程音色"));
    expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce();
    expect(mocks.playAudioBlob).not.toHaveBeenCalled();
    expect(onPlaybackComplete).toHaveBeenCalledWith("beat-missing-voice");
  });

  it("releases disabled narration but keeps paused narration pending", () => {
    const onPlaybackComplete = vi.fn();
    const { rerender } = renderHook(
      ({ enabled, playing }) =>
        useOllNarrationTts({
          enabled,
          playing,
          text: "不应朗读。",
          narrationId: "beat-disabled",
          onPlaybackComplete,
        }),
      { initialProps: { enabled: false, playing: true } },
    );
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
    expect(onPlaybackComplete).toHaveBeenCalledWith("beat-disabled");

    onPlaybackComplete.mockClear();
    act(() => rerender({ enabled: true, playing: false }));
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
    expect(mocks.stopAudio).toHaveBeenCalled();
    expect(onPlaybackComplete).not.toHaveBeenCalled();
  });

  it("falls back to live TTS when packaged audio is missing for dynamic follow-up beats", async () => {
    const liveAudio = new Blob(["live-synthesized-audio"], { type: "audio/mpeg" });
    mocks.synthesizeSpeech.mockResolvedValue(liveAudio);
    const resolveAudio = vi.fn(() => null);

    const { result } = renderHook(() =>
      useOllNarrationTts({
        enabled: true,
        playing: true,
        text: "这是小模型即时生成的追问课程讲解。",
        narrationId: "dynamic-followup-beat-1",
        resolveAudio,
      }),
    );

    await waitFor(() => expect(resolveAudio).toHaveBeenCalledWith(
      "dynamic-followup-beat-1",
      "这是小模型即时生成的追问课程讲解。",
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      "这是小模型即时生成的追问课程讲解。",
      expect.any(AbortSignal), null,
    ));
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledWith(
      liveAudio,
      expect.any(Function),
      expect.any(AbortSignal),
    ));
    expect(result.current.error).toBeNull();
  });
  it("reports disabled, ended, failed and cancelled narration separately without changing Runtime completion behavior", async () => {
    const end = vi.fn(), complete = vi.fn();
    const disabled = renderHook(() => useOllNarrationTts({ enabled: false, playing: true, text: "图文旁白", narrationId: "disabled", onPlaybackEnd: end, onPlaybackComplete: complete }));
    expect(end).toHaveBeenCalledWith("disabled", "disabled"); disabled.unmount();
    const played = renderHook(() => useOllNarrationTts({ enabled: true, playing: true, text: "正常旁白", narrationId: "ended", onPlaybackEnd: end, onPlaybackComplete: complete }));
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledOnce());
    act(() => mocks.playAudioBlob.mock.calls[0][1]()); played.unmount();
    expect(end).toHaveBeenCalledWith("ended", "ended");
    mocks.synthesizeSpeech.mockRejectedValueOnce(new Error("private provider detail"));
    const failed = renderHook(() => useOllNarrationTts({ enabled: true, playing: true, text: "失败旁白", narrationId: "failed", onPlaybackEnd: end, onPlaybackComplete: complete }));
    await waitFor(() => expect(end).toHaveBeenCalledWith("failed", "failed")); failed.unmount();
    const interrupted = renderHook(() => useOllNarrationTts({ enabled: true, playing: true, text: "取消旁白", narrationId: "cancelled", onPlaybackEnd: end, onPlaybackComplete: complete }));
    await waitFor(() => expect(mocks.playAudioBlob).toHaveBeenCalledTimes(2)); interrupted.unmount();
    expect(end).toHaveBeenCalledWith("cancelled", "cancelled");
    expect(complete).not.toHaveBeenCalledWith("cancelled"); expect(end).toHaveBeenCalledTimes(4);
  });

});
