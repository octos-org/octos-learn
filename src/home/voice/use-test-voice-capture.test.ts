import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceCaptureStartOptions } from "./use-voice-capture";
const mic = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(async () => {}), utterance: undefined as undefined | ((wav: Blob) => void), options: {} as VoiceCaptureStartOptions }));
vi.mock("./use-voice-capture", () => ({ useVoiceCapture: () => ({ start: mic.start, stop: mic.stop, capturing: true, error: null, getError: () => null }) }));
import { useTestVoiceCapture } from "./use-test-voice-capture";
beforeEach(() => {
  delete window.OctosNativeAudio; mic.stop.mockClear(); mic.utterance = undefined; mic.options = {};
  mic.start.mockReset(); mic.start.mockImplementation(async (utterance, options) => { mic.utterance = utterance; mic.options = options; return true; });
});
describe("explicit test recordings", () => {
  it("records input independently of speech segmentation and submits a WAV only on explicit finish", async () => {
    const send = vi.fn(); const { result, unmount } = renderHook(useTestVoiceCapture);
    await act(async () => { await result.current.start(send); });
    act(() => mic.options.onAudioFrame?.(new Float32Array(16000).fill(0.05)));
    expect(result.current.canFinish).toBe(true); expect(result.current.inputLevel).toBeGreaterThan(0);
    expect(result.current.speechDetected).toBe(false); expect(send).not.toHaveBeenCalled();
    act(() => { result.current.finish(); result.current.finish(); });
    expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0][0]).toMatchObject({ size: 32044, type: "audio/wav" });
    expect(result.current.getInputState().samples).toBe(0); expect(result.current.canFinish).toBe(false);
    unmount();
  });
  it("discards all frames on cancel without sending them", async () => {
    const send = vi.fn(); const { result, unmount } = renderHook(useTestVoiceCapture);
    await act(async () => { await result.current.start(send); });
    act(() => mic.options.onAudioFrame?.(new Float32Array(16000)));
    await act(async () => { await result.current.stop(); });
    act(() => { result.current.finish(); mic.utterance?.(new Blob(["stale"])); });
    expect(send).not.toHaveBeenCalled(); expect(result.current.getInputState().samples).toBe(0);
    unmount();
  });
  it("limits manual recording memory to 20 seconds and avoids duplicate automatic submissions", async () => {
    const send = vi.fn(); const { result, unmount } = renderHook(useTestVoiceCapture);
    await act(async () => { await result.current.start(send); });
    act(() => mic.options.onAudioFrame?.(new Float32Array(16000 * 40)));
    expect(result.current.getInputState().samples).toBe(16000 * 20);
    const wav = new Blob(["automatic"]);
    act(() => { mic.utterance?.(wav); result.current.finish(); mic.utterance?.(wav); });
    expect(send).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledWith(wav);
    unmount();
  });
  it("drops retained audio and callbacks on unmount", async () => {
    const send = vi.fn(); const { result, unmount } = renderHook(useTestVoiceCapture);
    await act(async () => { await result.current.start(send); });
    act(() => mic.options.onAudioFrame?.(new Float32Array(16000)));
    unmount(); mic.utterance?.(new Blob(["stale"]));
    expect(send).not.toHaveBeenCalled();
  });
});
