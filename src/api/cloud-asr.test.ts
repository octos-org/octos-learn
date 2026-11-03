import { describe, expect, it, vi } from "vitest";
const direct = vi.hoisted(() => vi.fn());
vi.mock("@/byok/providers", () => ({ transcribeDirect: direct, availableService: () => false }));
const prepare = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/byok/services", () => ({ getServiceStatus: () => ({ detail: "请连接自己的识别服务" }), prepareClientServices: prepare }));
import { fetchCloudAsrStatus, transcribeCloudSpeech } from "./cloud-asr";
describe("ASR boundary", () => {
  it("reports missing user configuration without querying platform status", async () => {
    expect(await fetchCloudAsrStatus()).toEqual({ available: false, detail: "请连接自己的识别服务" });
  });
  it("loads the learner's saved services before reporting, and still reports when loading fails", async () => {
    prepare.mockClear();
    await fetchCloudAsrStatus();
    expect(prepare).toHaveBeenCalledTimes(1);
    prepare.mockRejectedValueOnce(new Error("offline"));
    expect((await fetchCloudAsrStatus()).available).toBe(false);
  });
  it("delegates WAV only to the direct BYOK adapter", async () => {
    direct.mockResolvedValue({ status: "speech", transcript: "数学" });
    const wav = new Blob(["wav"]), signal = new AbortController().signal;
    expect(await transcribeCloudSpeech(wav, signal)).toEqual({ status: "speech", transcript: "数学" });
    expect(direct).toHaveBeenCalledWith(wav, signal);
    await transcribeCloudSpeech(wav, signal, { language: "en-US" });
    expect(direct).toHaveBeenLastCalledWith(wav, signal, undefined, { language: "en-US" });
  });
});
