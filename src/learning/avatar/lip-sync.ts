import { FACE_CHANNELS, normalizeFaceFrame, type FaceChannel, type FaceFrame } from "./face-frame";

export const LIP_SYNC_SCHEMA = "octos.avatar-lip-sync.v1";
export const MOUTH_CHANNELS = FACE_CHANNELS.filter((key) => /^(mouth|jaw|tongue)/.test(key));
export interface LipKey { timeMs: number; channels: Partial<Record<FaceChannel, number>> }
export interface LipSyncTrack {
  schema: typeof LIP_SYNC_SCHEMA;
  audioSha256: string;
  durationMs: number;
  method: "envelope-v1" | "aligned-visemes-v1";
  keys: LipKey[];
}
export const MAX_AUDIO_SECONDS = 60;

export async function audioDigest(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseLipSyncTrack(raw: unknown, expected: { audioSha256: string; durationMs: number }): LipSyncTrack {
  if (!raw || typeof raw !== "object") throw new Error("invalid_lip_track");
  const value = raw as Record<string, unknown>;
  if (value.schema !== LIP_SYNC_SCHEMA || typeof value.audioSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.audioSha256)) throw new Error("invalid_lip_track");
  if (value.audioSha256 !== expected.audioSha256) throw new Error("lip_audio_mismatch");
  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs <= 0
    || value.durationMs > MAX_AUDIO_SECONDS * 1000 || Math.abs(value.durationMs - expected.durationMs) > 50
    || !["envelope-v1", "aligned-visemes-v1"].includes(String(value.method))
    || !Array.isArray(value.keys) || value.keys.length < 2 || value.keys.length > 6001) throw new Error("invalid_lip_track");
  let previous = -1;
  const durationMs = value.durationMs;
  const keys: LipKey[] = value.keys.map((rawKey) => {
    if (!rawKey || typeof rawKey !== "object") throw new Error("invalid_lip_track");
    const key = rawKey as Record<string, unknown>;
    if (typeof key.timeMs !== "number" || !Number.isFinite(key.timeMs) || key.timeMs <= previous || key.timeMs < 0 || key.timeMs > durationMs
      || !key.channels || typeof key.channels !== "object" || Array.isArray(key.channels)) throw new Error("invalid_lip_track");
    const channels = key.channels as Record<string, unknown>;
    if (Object.keys(channels).some((channel) => !MOUTH_CHANNELS.includes(channel as FaceChannel))
      || Object.values(channels).some((weight) => typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1)) throw new Error("invalid_lip_track");
    previous = key.timeMs;
    return { timeMs: key.timeMs, channels: { ...channels } as LipKey["channels"] };
  });
  if (keys[0]!.timeMs !== 0 || keys.at(-1)!.timeMs !== value.durationMs) throw new Error("invalid_lip_track");
  return { schema: LIP_SYNC_SCHEMA, audioSha256: value.audioSha256 as string, durationMs: value.durationMs,
    method: value.method as LipSyncTrack["method"], keys };
}

/** Offline amplitude fallback, not phoneme recognition. Analyze once, never once per render. */
export function envelopeLipSync(channels: readonly Float32Array[], sampleRate: number, audioSha256: string): LipSyncTrack {
  const length = channels[0]?.length ?? 0;
  if (!channels.length || channels.length > 2 || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000
    || !length || channels.some((channel) => channel.length !== length) || length / sampleRate > MAX_AUDIO_SECONDS) throw new Error("invalid_audio");
  const durationMs = length * 1000 / sampleRate;
  const window = Math.max(1, Math.round(sampleRate * .02));
  const energy: number[] = [];
  for (let start = 0; start < length; start += window) {
    const end = Math.min(start + window, length);
    let square = 0;
    for (const channel of channels) for (let index = start; index < end; index++) {
      const sample = channel[index]!;
      if (!Number.isFinite(sample)) throw new Error("invalid_audio");
      square += sample * sample;
    }
    energy.push(Math.sqrt(square / ((end - start) * channels.length)));
  }
  const sorted = [...energy].sort((a, b) => a - b);
  const reference = sorted[Math.floor((sorted.length - 1) * .95)]!;
  // Absolute floor prevents near-silent recordings from becoming full-mouth movement.
  const scale = Math.max(.02, reference);
  let previous = 0;
  const keys = energy.map((rms, index): LipKey => {
    const target = Math.max(0, Math.min(.85, (rms - .003) / scale * .75));
    previous += (target > previous ? .8 : .6) * (target - previous);
    return { timeMs: index * window * 1000 / sampleRate, channels: { jawOpen: Number(previous.toFixed(4)) } };
  });
  keys.push({ timeMs: durationMs, channels: { jawOpen: 0 } });
  return parseLipSyncTrack({ schema: LIP_SYNC_SCHEMA, audioSha256, durationMs, method: "envelope-v1", keys }, { audioSha256, durationMs });
}

/** Always sample the media position. Pause/seek/rate changes need no wall-clock correction. */
export function lipSyncFrame(track: LipSyncTrack | null, timeMs: number, available: boolean): FaceFrame {
  if (!track || !available || !Number.isFinite(timeMs) || timeMs < 0 || timeMs >= track.durationMs) {
    return normalizeFaceFrame({ timeMs: Math.max(0, timeMs || 0), source: "demo", tracked: true, channels: {} });
  }
  let low = 0, high = track.keys.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (track.keys[mid]!.timeMs <= timeMs) low = mid; else high = mid - 1; }
  const before = track.keys[low]!, after = track.keys[low + 1] ?? before;
  const mix = after.timeMs === before.timeMs ? 0 : (timeMs - before.timeMs) / (after.timeMs - before.timeMs);
  const channels = Object.fromEntries(MOUTH_CHANNELS.flatMap((key) => before.channels[key] === undefined && after.channels[key] === undefined ? []
    : [[key, (before.channels[key] ?? 0) * (1 - mix) + (after.channels[key] ?? 0) * mix]]));
  return normalizeFaceFrame({ timeMs, source: "demo", tracked: true, channels });
}

/** Original quiet calibration tones: no recorded or synthesized human voice. */
export function calibrationWav(): ArrayBuffer {
  const sampleRate = 16000, length = sampleRate * 4;
  const buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer);
  const tag = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  tag(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); tag(8, "WAVE"); tag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, length * 2, true);
  for (let index = 0; index < length; index++) {
    const time = index / sampleRate, local = time % 1;
    const gain = local > .2 && local < .8 ? .12 * Math.sin(Math.PI * (local - .2) / .6) ** 2 : 0;
    view.setInt16(44 + index * 2, Math.round(32767 * gain * Math.sin(2 * Math.PI * (220 + Math.floor(time) * 110) * time)), true);
  }
  return buffer;
}
