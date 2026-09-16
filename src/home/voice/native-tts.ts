import type { NativeTtsConfig } from "@/api/voice";

type AndroidTtsBridge = {
  configure?: (config: string) => string;
  isConfigured?: () => boolean;
  prefetch?: (requestId: string, text: string) => string;
  play?: (requestId: string, text: string) => string;
  playAudio?: (requestId: string, encodedAudio: string, mediaType: string) => string;
  cancel?: (requestId: string) => void;
  stop?: () => void;
};

interface NativeTtsEvent {
  requestId: string;
  type: "ready" | "started" | "ended" | "stopped" | "error";
  message?: string;
}

interface PendingPlayback {
  started: boolean;
  resolve: (started: boolean) => void;
  reject: (error: Error) => void;
  onEnded: () => void;
  detachAbort: () => void;
}

declare global {
  interface Window {
    OctosNativeTts?: AndroidTtsBridge;
    __octosNativeTtsEvent?: (event: string) => void;
  }
}

const pending = new Map<string, PendingPlayback>();
let nextRequestId = 1;

function bridge(): AndroidTtsBridge | undefined {
  return typeof window === "undefined" ? undefined : window.OctosNativeTts;
}

function requestId(prefix: string): string {
  const sequence = nextRequestId++;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function parseBridgeResult(raw: string): { ok: boolean; error?: string } {
  try {
    return JSON.parse(raw) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "Android TTS 接口返回了无效结果" };
  }
}

function handleNativeTtsEvent(raw: string): void {
  let event: NativeTtsEvent;
  try {
    event = JSON.parse(raw) as NativeTtsEvent;
  } catch {
    return;
  }
  const playback = pending.get(event.requestId);
  if (!playback) return;
  if (event.type === "started") {
    playback.started = true;
    playback.resolve(true);
    return;
  }
  if (event.type === "ended" || event.type === "stopped") {
    pending.delete(event.requestId);
    playback.detachAbort();
    if (!playback.started) playback.resolve(false);
    playback.onEnded();
    return;
  }
  if (event.type === "error") {
    pending.delete(event.requestId);
    playback.detachAbort();
    const error = new Error(event.message || "Android TTS 播放失败");
    if (playback.started) playback.onEnded();
    else playback.reject(error);
  }
}

if (typeof window !== "undefined") {
  window.__octosNativeTtsEvent = handleNativeTtsEvent;
}

export function nativeTtsAvailable(): boolean {
  const candidate = bridge();
  if (
    typeof candidate?.isConfigured !== "function"
    || typeof candidate.play !== "function"
  ) return false;
  try {
    return candidate.isConfigured();
  } catch {
    return false;
  }
}

export function nativeTtsBridgeAvailable(): boolean {
  return typeof bridge()?.configure === "function";
}

/** Persist a server-delivered configuration inside the native app sandbox. */
export function configureNativeTts(config: NativeTtsConfig): boolean {
  const candidate = bridge();
  if (typeof candidate?.configure !== "function") return false;
  try {
    return parseBridgeResult(candidate.configure(JSON.stringify(config))).ok;
  } catch {
    return false;
  }
}

export function playNativeTts(
  text: string,
  onEnded: () => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const candidate = bridge();
  if (!nativeTtsAvailable() || !candidate?.play) return Promise.resolve(false);
  if (signal?.aborted) return Promise.resolve(false);
  const id = requestId("play");
  return new Promise<boolean>((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      try {
        candidate.cancel?.(id);
      } catch {
        // Activity shutdown is equivalent to cancellation.
      }
      resolve(false);
    };
    signal?.addEventListener("abort", abort, { once: true });
    pending.set(id, {
      started: false,
      resolve,
      reject,
      onEnded,
      detachAbort: () => signal?.removeEventListener("abort", abort),
    });
    try {
      const result = parseBridgeResult(candidate.play!(id, text));
      if (!result.ok) {
        pending.delete(id);
        signal?.removeEventListener("abort", abort);
        reject(new Error(result.error || "Android TTS 无法启动"));
      }
    } catch (error) {
      pending.delete(id);
      signal?.removeEventListener("abort", abort);
      reject(error instanceof Error ? error : new Error("Android TTS 无法启动"));
    }
  });
}

function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("无法读取课程旁白"));
    reader.readAsArrayBuffer(blob);
  });
}

async function base64Audio(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blobArrayBuffer(blob));
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(""));
}

export function nativePackagedAudioAvailable(): boolean {
  return typeof bridge()?.playAudio === "function";
}

/** Play verified CoursePack bytes through Android MediaPlayer. */
export async function playNativeAudioBlob(
  audio: Blob,
  onEnded: () => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const candidate = bridge();
  if (typeof candidate?.playAudio !== "function" || signal?.aborted) return false;
  const encoded = await base64Audio(audio);
  if (signal?.aborted) return false;
  const id = requestId("packaged");
  return new Promise<boolean>((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      try {
        candidate.cancel?.(id);
      } catch {
        // Activity shutdown is equivalent to cancellation.
      }
      resolve(false);
    };
    signal?.addEventListener("abort", abort, { once: true });
    pending.set(id, {
      started: false,
      resolve,
      reject,
      onEnded,
      detachAbort: () => signal?.removeEventListener("abort", abort),
    });
    try {
      const result = parseBridgeResult(candidate.playAudio!(
        id,
        encoded,
        audio.type || "audio/mpeg",
      ));
      if (!result.ok) {
        pending.delete(id);
        signal?.removeEventListener("abort", abort);
        reject(new Error(result.error || "Android 无法播放课程旁白"));
      }
    } catch (error) {
      pending.delete(id);
      signal?.removeEventListener("abort", abort);
      reject(error instanceof Error
        ? error
        : new Error("Android 无法播放课程旁白"));
    }
  });
}

export function prefetchNativeTts(
  text: string,
  signal?: AbortSignal,
): (() => void) | null {
  const candidate = bridge();
  if (
    !nativeTtsAvailable()
    || typeof candidate?.prefetch !== "function"
    || signal?.aborted
  ) return null;
  const id = requestId("prefetch");
  const cancel = () => {
    try {
      candidate.cancel?.(id);
    } catch {
      // Activity shutdown is equivalent to cancellation.
    }
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const result = parseBridgeResult(candidate.prefetch(id, text));
    if (!result.ok) return null;
  } catch {
    return null;
  }
  return () => {
    signal?.removeEventListener("abort", cancel);
    cancel();
  };
}

export function stopNativeTts(): void {
  try {
    bridge()?.stop?.();
  } catch {
    // The Activity may already be closing.
  }
}
