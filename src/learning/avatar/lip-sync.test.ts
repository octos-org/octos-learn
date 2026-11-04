import { describe, expect, it } from "vitest";
import { calibrationWav, envelopeLipSync, lipSyncFrame, parseLipSyncTrack, LIP_SYNC_SCHEMA } from "./lip-sync";

const hash = "a".repeat(64);
const silence = () => envelopeLipSync([new Float32Array(16000)], 16000, hash);
describe("audio-bound mouth tracks", () => {
  it("keeps silent and near-silent audio neutral instead of amplifying it", () => {
    expect(silence().keys.every((key) => key.channels.jawOpen === 0)).toBe(true);
    const quiet = envelopeLipSync([new Float32Array(16000).fill(.001)], 16000, hash);
    expect(quiet.keys.every((key) => key.channels.jawOpen === 0)).toBe(true);
  });
  it("detects stereo energy even if the channels have opposite phase", () => {
    const data = new Float32Array(16000).map((_, index) => index < 8000 ? 0 : .2);
    const track = envelopeLipSync([data, data.map((v) => -v)], 16000, hash);
    expect(lipSyncFrame(track, 200, true).channels.jawOpen).toBe(0);
    expect(lipSyncFrame(track, 800, true).channels.jawOpen).toBeGreaterThan(.5);
    expect(lipSyncFrame(track, 1000, true).channels.jawOpen).toBeUndefined();
    expect(parseLipSyncTrack(JSON.parse(JSON.stringify(track)), track)).toEqual(track);
  });
  it("refuses another audio file even if duration and text could be the same", () => {
    const track = silence();
    expect(() => parseLipSyncTrack(track, { audioSha256: "b".repeat(64), durationMs: 1000 })).toThrow("lip_audio_mismatch");
    expect(() => parseLipSyncTrack(track, { audioSha256: hash, durationMs: 1200 })).toThrow("invalid_lip_track");
  });
  it.each([
    { keys: [] }, { keys: [{ timeMs: 0, channels: {} }, { timeMs: 0, channels: {} }] },
    { keys: [{ timeMs: 0, channels: { eyeBlinkLeft: 1 } }, { timeMs: 1000, channels: {} }] },
    { keys: [{ timeMs: 0, channels: { jawOpen: Infinity } }, { timeMs: 1000, channels: {} }] },
    { keys: [{ timeMs: 10, channels: {} }, { timeMs: 1000, channels: {} }] },
    { keys: [{ timeMs: 0, channels: {} }, { timeMs: 900, channels: {} }] },
    { method: "guessed-phonemes" }, { durationMs: 60_001 },
  ])("rejects malformed or non-mouth input: %j", (patch) => {
    expect(() => parseLipSyncTrack({ ...silence(), ...patch }, { audioSha256: hash, durationMs: 1000 })).toThrow("invalid_lip_track");
  });
  it("samples external visemes by the media position without forward-only clock state", () => {
    const track = parseLipSyncTrack({ schema: LIP_SYNC_SCHEMA, audioSha256: hash, method: "aligned-visemes-v1", durationMs: 1000,
      keys: [{ timeMs: 0, channels: { mouthClose: 1 } }, { timeMs: 500, channels: { mouthPucker: 1, jawOpen: .3 } }, { timeMs: 1000, channels: {} }] }, { audioSha256: hash, durationMs: 1000 });
    expect(lipSyncFrame(track, 500, true).channels.mouthPucker).toBe(1);
    expect(lipSyncFrame(track, 250, true).channels.mouthClose).toBe(.5);
    expect(lipSyncFrame(track, 250, true)).toEqual(lipSyncFrame(track, 250, true));
    expect(lipSyncFrame(track, 400, false).channels).toEqual({});
  });
  it("rejects invalid decoded audio and generates deterministic calibration WAV bytes", () => {
    expect(() => envelopeLipSync([new Float32Array(1).fill(NaN)], 16000, hash)).toThrow("invalid_audio");
    expect(() => envelopeLipSync([new Float32Array(1), new Float32Array(2)], 16000, hash)).toThrow("invalid_audio");
    expect(() => envelopeLipSync([new Float32Array(16000 * 61)], 16000, hash)).toThrow("invalid_audio");
    const wav = calibrationWav(), header = new DataView(wav);
    expect(wav).toEqual(calibrationWav());
    expect(header.getUint32(24, true)).toBe(16000);
    expect(header.getUint32(40, true)).toBe(4 * 16000 * 2);
  });
});
