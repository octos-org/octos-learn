import { audioDigest, envelopeLipSync, MAX_AUDIO_SECONDS, type LipSyncTrack } from "./lip-sync";

/** Decode only user-selected/local calibration audio, then release the analysis context. */
export async function preparePreviewAudio(bytes: ArrayBuffer, signal: AbortSignal): Promise<LipSyncTrack> {
  const abort = () => { if (signal.aborted) throw new DOMException("Aborted", "AbortError"); };
  abort();
  if (!bytes.byteLength || bytes.byteLength > 10_000_000) throw new Error("invalid_audio");
  const audioSha256 = await audioDigest(bytes);
  abort();
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("audio_unavailable");
  const context = new Context();
  let closing = false;
  const close = () => { if (!closing && context.state !== "closed") { closing = true; void context.close().catch(() => undefined); } };
  let cancel: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
      cancel = () => { close(); reject(new DOMException("Aborted", "AbortError")); };
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) { cancel(); return; }
      timer = setTimeout(() => { close(); reject(new Error("audio_decode_timeout")); }, 20_000);
      void context.decodeAudioData(bytes.slice(0)).then(resolve, reject);
    });
    abort();
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_AUDIO_SECONDS || buffer.numberOfChannels > 2) throw new Error("invalid_audio");
    return envelopeLipSync(Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)), buffer.sampleRate, audioSha256);
  } finally { if (cancel) signal.removeEventListener("abort", cancel); if (timer) clearTimeout(timer); close(); }
}
