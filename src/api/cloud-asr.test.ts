import { describe, expect, it, vi } from "vitest";
const direct = vi.hoisted(() => vi.fn());
vi.mock("@/byok/providers", () => ({ transcribeDirect: direct, availableService: () => false }));
vi.mock("@/byok/services", () => ({ getServiceStatus: () => ({ detail: "请连接自己的识别服务" }) }));
import { fetchCloudAsrStatus, transcribeCloudSpeech } from "./cloud-asr";
describe("ASR boundary", () => {
  it("reports missing user configuration without querying platform status", async () => {
    expect(await fetchCloudAsrStatus()).toEqual({ available: false, detail: "请连接自己的识别服务" });
  });
  it("delegates WAV only to the direct BYOK adapter", async () => {
    direct.mockResolvedValue({ status: "speech", transcript: "数学" });
    const wav = new Blob(["wav"]), signal = new AbortController().signal;
    expect(await transcribeCloudSpeech(wav, signal)).toEqual({ status: "speech", transcript: "数学" });
    expect(direct).toHaveBeenCalledWith(wav, signal);
  });
});
