import { request } from "./client";
vi.mock("./client", () => ({ request: vi.fn(async () => ({ available: false, detail: "unconfigured" })) }));
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCloudAsrStatus, isCloudAsrEnabled, transcribeCloudSpeech } from "./cloud-asr";

afterEach(() => {
  delete window.OctosNativeAsr;
  vi.unstubAllEnvs();
});

function bridge() {
  const native = {
    isConfigured: vi.fn(() => true),
    transcribe: vi.fn<[string, string], string>(() => '{"ok":true}'),
    cancel: vi.fn(),
  };
  window.OctosNativeAsr = native;
  return native;
}

describe("direct cloud ASR", () => {
  it("enables fallback in local, public and APK modes unless explicitly disabled", () => {
    expect(isCloudAsrEnabled()).toBe(true);
    vi.stubEnv("MODE", "android"); vi.stubEnv("DEV", true);
    expect(isCloudAsrEnabled()).toBe(true);
    vi.stubEnv("VITE_CLOUD_ASR_ENABLED", "false");
    expect(isCloudAsrEnabled()).toBe(false);
  });
  it("uses the authenticated server endpoint when the native bridge is absent", async () => {
    const result = { status: "speech", transcript: "网页识别" };
    vi.mocked(request).mockResolvedValueOnce(result);
    const wav = new Blob(["wav"], { type: "audio/wav" });
    const signal = new AbortController().signal;
    await expect(transcribeCloudSpeech(wav, signal)).resolves.toEqual(result);
    expect(request).toHaveBeenLastCalledWith("/api/learn/asr/batch/transcribe", {
      method: "POST", body: wav, signal, headers: { "Content-Type": "audio/wav" },
    });
  });
  it("checks the native credential configuration without consulting the offline bridge", async () => {
    expect((await fetchCloudAsrStatus()).available).toBe(false);
    const native = bridge();
    expect((await fetchCloudAsrStatus()).available).toBe(true);
    native.isConfigured.mockReturnValue(false);
    expect((await fetchCloudAsrStatus()).available).toBe(false);
  });

  it("sends only audio to native ASR and correlates the transcript with its request", async () => {
    const native = bridge();
    const promise = transcribeCloudSpeech(new Blob(["wav"]), new AbortController().signal);
    await vi.waitFor(() => expect(native.transcribe).toHaveBeenCalledOnce());
    const [requestId, base64] = native.transcribe.mock.calls[0] as unknown as [string, string];
    expect(atob(base64)).toBe("wav");
    window.__octosNativeAsrEvent?.(JSON.stringify({ requestId: "unrelated", status: "speech", transcript: "错误的结果" }));
    window.__octosNativeAsrEvent?.(JSON.stringify({ requestId, status: "speech", transcript: "请解释这个公式" }));
    await expect(promise).resolves.toEqual({ status: "speech", transcript: "请解释这个公式" });
    expect(native.cancel).not.toHaveBeenCalled();
  });

  it("preserves silence as no speech", async () => {
    const native = bridge();
    const promise = transcribeCloudSpeech(new Blob(["wav"]), new AbortController().signal);
    await vi.waitFor(() => expect(native.transcribe).toHaveBeenCalledOnce());
    const requestId = native.transcribe.mock.calls[0]?.[0];
    window.__octosNativeAsrEvent?.(JSON.stringify({ requestId, status: "no_speech", transcript: "" }));
    await expect(promise).resolves.toEqual({ status: "no_speech", transcript: "" });
  });

  it("surfaces provider errors and cancels native work", async () => {
    const native = bridge();
    const promise = transcribeCloudSpeech(new Blob(["wav"]), new AbortController().signal);
    const assertion = expect(promise).rejects.toThrow("ASR 认证失败");
    await vi.waitFor(() => expect(native.transcribe).toHaveBeenCalledOnce());
    const requestId = native.transcribe.mock.calls[0]?.[0];
    window.__octosNativeAsrEvent?.(JSON.stringify({ requestId, error: "ASR 认证失败" }));
    await assertion;
    expect(native.cancel).toHaveBeenCalledWith(requestId);
  });

  it("aborts native requests and ignores late recognition results", async () => {
    const native = bridge();
    const controller = new AbortController();
    const promise = transcribeCloudSpeech(new Blob(["wav"]), controller.signal);
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(native.transcribe).toHaveBeenCalledOnce());
    const requestId = native.transcribe.mock.calls[0]?.[0];
    controller.abort();
    window.__octosNativeAsrEvent?.(JSON.stringify({ requestId, status: "speech", transcript: "迟到的结果" }));
    await assertion;
    expect(native.cancel).toHaveBeenCalledWith(requestId);
  });

  it("does not start an already-cancelled request", async () => {
    const native = bridge();
    const controller = new AbortController();
    controller.abort();
    await expect(transcribeCloudSpeech(new Blob(["wav"]), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(native.transcribe).not.toHaveBeenCalled();
  });
});
