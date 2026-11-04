import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { preparePreviewAudio } from "./prepare-preview-audio";
import { calibrationWav } from "./lip-sync";

afterEach(() => vi.unstubAllGlobals());
const buffer = { duration: 1, sampleRate: 16000, numberOfChannels: 1, getChannelData: () => new Float32Array(16000) } as AudioBuffer;
const setup = (decode: () => Promise<AudioBuffer>) => {
  const close = vi.fn(async () => undefined);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("AudioContext", class { state = "running"; close = close; decodeAudioData = decode; });
  return close;
};
it("closes the analysis context after decoding and exposes no decoded audio in the mouth track", async () => {
  const close = setup(async () => buffer);
  const track = await preparePreviewAudio(calibrationWav(), new AbortController().signal);
  expect(close).toHaveBeenCalledOnce();
  expect(track.method).toBe("envelope-v1");
  expect(track.audioSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(track).not.toHaveProperty("audio");
});
it("rejects a late decode after cancellation and closes its context", async () => {
  let resolve!: (value: AudioBuffer) => void;
  const decode = vi.fn(() => new Promise<AudioBuffer>((done) => { resolve = done; }));
  const close = setup(decode), controller = new AbortController();
  const result = preparePreviewAudio(calibrationWav(), controller.signal);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  resolve(buffer);
  expect(close).toHaveBeenCalled();
});
it("releases the context on decoder failure and rejects overlong audio", async () => {
  const close = setup(async () => { throw new Error("bad format"); });
  await expect(preparePreviewAudio(calibrationWav(), new AbortController().signal)).rejects.toThrow("bad format");
  expect(close).toHaveBeenCalledOnce();
  setup(async () => ({ ...buffer, duration: 61 }));
  await expect(preparePreviewAudio(calibrationWav(), new AbortController().signal)).rejects.toThrow("invalid_audio");
});
