import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeNativeWav,
  getEchoCancelledMicStream,
  nativeAudioCaptureAvailable,
  nativePrivateAsrAvailable,
  setNativePrivateAsrListening,
  startNativePrivateAsr,
  startNativeAudioCapture,
} from "./microphone";

function fakeStream(): MediaStream {
  return {
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe("getEchoCancelledMicStream", () => {
  afterEach(() => {
    delete window.OctosNativeAudio;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps all-system echo cancellation in ordinary modern browsers", async () => {
    const stream = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await expect(getEchoCancelledMicStream()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: "all",
        autoGainControl: true,
        noiseSuppression: true,
      },
    });
  });

  it("uses the most compatible request first inside the Android app", async () => {
    const stream = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    window.OctosNativeAudio = { prepareForVoiceCapture: vi.fn() };

    await expect(getEchoCancelledMicStream()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(window.OctosNativeAudio.prepareForVoiceCapture).not.toHaveBeenCalled();
  });

  it("selects an enumerated USB input after the default Android source fails", async () => {
    vi.useFakeTimers();
    const stream = fakeStream();
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException("Could not start audio source", "NotReadableError"))
      .mockResolvedValueOnce(stream);
    const enumerateDevices = vi.fn(async () => [
      { kind: "audioinput", deviceId: "built-in", label: "Built in mic" },
      { kind: "audioinput", deviceId: "usb-camera", label: "USB Camera Microphone" },
    ] as MediaDeviceInfo[]);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, enumerateDevices } });
    window.OctosNativeAudio = {
      prepareForVoiceCapture: vi.fn(() => '{"recordAudioPermission":true}'),
    };

    const pending = getEchoCancelledMicStream();
    await vi.advanceTimersByTimeAsync(120);
    await expect(pending).resolves.toBe(stream);
    expect(getUserMedia.mock.calls[1][0]).toEqual({
      audio: { deviceId: { exact: "usb-camera" } },
    });
  });

  it("surfaces both WebView and Android device diagnostics after every retry fails", async () => {
    vi.useFakeTimers();
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("Could not start audio source", "NotReadableError");
    });
    const enumerateDevices = vi.fn(async () => [
      { kind: "audioinput", deviceId: "usb-1", label: "USB Camera Microphone" },
    ] as MediaDeviceInfo[]);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, enumerateDevices } });
    window.OctosNativeAudio = {
      prepareForVoiceCapture: vi.fn(() => '{"recordAudioPermission":true,"inputs":[{"type":"usb-device"}]}'),
    };

    const pending = getEchoCancelledMicStream();
    const rejection = expect(pending).rejects.toThrow(/USB Camera Microphone/);
    await vi.advanceTimersByTimeAsync(120);
    await rejection;
    await expect(pending).rejects.toThrow(/usb-device/);
  });

  it("detects and starts the Android AudioRecord bridge without getUserMedia", () => {
    window.OctosNativeAudio = {
      startVoiceCapture: vi.fn(() => JSON.stringify({
        ok: true,
        device: "USB-Audio - UGREEN Camera 2K",
        sampleRate: 16000,
      })),
      stopVoiceCapture: vi.fn(),
    };

    expect(nativeAudioCaptureAvailable()).toBe(true);
    expect(startNativeAudioCapture()).toEqual({
      ok: true,
      device: "USB-Audio - UGREEN Camera 2K",
      sampleRate: 16000,
    });
  });

  it("decodes a native base64 WAV payload", () => {
    const blob = decodeNativeWav(btoa("RIFFtest"));
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(8);
  });

  it("joins and gates the Android native Agora custom track", () => {
    const startPrivateAsr = vi.fn(() => JSON.stringify({
      ok: true,
      joined: true,
      state: "joined",
    }));
    const setPrivateAsrListening = vi.fn(() => JSON.stringify({
      ok: true,
      joined: true,
      listening: true,
    }));
    window.OctosNativeAudio = {
      startPrivateAsr,
      setPrivateAsrListening,
      stopPrivateAsr: vi.fn(),
    };

    expect(nativePrivateAsrAvailable()).toBe(true);
    expect(startNativePrivateAsr({
      appId: "app-id",
      channel: "asr-channel",
      token: "rtc-token",
      uid: 42,
    })).toMatchObject({ ok: true, joined: true });
    expect(startPrivateAsr).toHaveBeenCalledWith(
      "app-id",
      "asr-channel",
      "rtc-token",
      42,
    );
    expect(setNativePrivateAsrListening(true)).toMatchObject({
      ok: true,
      listening: true,
    });
  });
});
