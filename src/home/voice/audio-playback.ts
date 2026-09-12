/**
 * Autoplay-safe audio playback for the voice assistant.
 *
 * `HTMLAudioElement.play()` invoked from a network callback — seconds after
 * the last user gesture — is blocked by the browser autoplay policy
 * (NotAllowedError), especially on Safari. The voice reply audio arrives tens
 * of seconds after the user entered voice mode, so it always hit that wall.
 *
 * Instead we route playback through a single Web Audio `AudioContext` that we
 * `resume()` during the user's ENTRY gesture (`unlockAudio`). Once unlocked,
 * the context plays decoded buffers at any later time with no per-play gesture
 * required.
 */

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
let currentMedia: HTMLAudioElement | null = null;
let currentMediaUrl: string | null = null;
let currentMediaOnEnded: (() => void) | null = null;
// Completion callback for `current`, kept alongside it so `stopAudio` can
// fire it on interrupt. `playOne` (use-voice-conversation.ts) awaits this
// callback; orphaning it wedges the reply drain loop's `playingRef` latch
// and permanently silences every later reply.
let currentOnEnded: (() => void) | null = null;

function shouldUseAndroidMediaPipeline(): boolean {
  return document.documentElement.dataset.runtimePlatform === "android";
}

function releaseCurrentMedia(invokeEnded: boolean): void {
  if (!currentMedia) return;
  const media = currentMedia;
  const url = currentMediaUrl;
  const onEnded = currentMediaOnEnded;
  currentMedia = null;
  currentMediaUrl = null;
  currentMediaOnEnded = null;
  media.onended = null;
  media.onerror = null;
  try {
    media.pause();
  } catch {
    // already stopped / detached
  }
  if (url) URL.revokeObjectURL(url);
  if (invokeEnded) onEnded?.();
}

async function playWithAndroidMediaPipeline(
  blob: Blob,
  onEnded: () => void,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;
  stopAudio();
  const url = URL.createObjectURL(blob);
  const media = new Audio();
  media.preload = "auto";
  media.src = url;
  currentMedia = media;
  currentMediaUrl = url;
  currentMediaOnEnded = onEnded;
  media.onended = () => {
    if (currentMedia !== media) return;
    releaseCurrentMedia(false);
    onEnded();
  };
  media.onerror = () => {
    if (currentMedia !== media) return;
    releaseCurrentMedia(false);
    onEnded();
  };

  try {
    // Android's native media pipeline can decode the response incrementally.
    // This avoids Blob.arrayBuffer() + decodeAudioData(), both expensive (and
    // the former absent) on Chromium-era Android 8 System WebViews.
    await Promise.resolve(media.play());
  } catch (error) {
    if (currentMedia === media) releaseCurrentMedia(false);
    throw error;
  }
  if (signal?.aborted) {
    if (currentMedia === media) releaseCurrentMedia(false);
    return false;
  }
  return true;
}

function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read audio data"));
    reader.readAsArrayBuffer(blob);
  });
}

function getCtx(): AudioContext | null {
  if (ctx?.state === "closed") ctx = null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

async function routeToCurrentDefaultOutput(c: AudioContext): Promise<void> {
  const sinkable = c as AudioContext & {
    setSinkId?: (sinkId: string) => Promise<void>;
  };
  if (typeof sinkable.setSinkId !== "function") return;
  try {
    // Re-apply the browser's current default output before playback. A long-
    // lived AudioContext can remain attached to the device that was default
    // when the whiteboard tab first opened (for example laptop speakers before
    // a headset was connected), while a newly opened video tab uses the new
    // default. Chrome accepts an empty sink id as "current system default".
    await sinkable.setSinkId("");
  } catch {
    // Not all browsers implement speaker selection. The ordinary destination
    // remains usable, so lack of this optional API must not block playback.
  }
}

/** Call from inside a user-gesture handler (the entry click / orb tap) to
 *  unlock playback for the rest of the session. */
export function unlockAudio(): void {
  // The APK explicitly allows media playback without a fresh user gesture and
  // uses Android's media decoder, so it does not need a Web Audio context.
  if (shouldUseAndroidMediaPipeline()) return;
  const c = getCtx();
  if (!c) return;
  void routeToCurrentDefaultOutput(c);
  if (c.state === "suspended") void c.resume();
}

/** Stop whatever is currently playing. Fires the interrupted clip's
 *  `onEnded` callback (exactly once) so callers awaiting playback
 *  completion resolve — nulling the handler without invoking it left
 *  `playOne`'s promise pending forever and no later reply ever played. */
export function stopAudio(): void {
  if (currentMedia) {
    releaseCurrentMedia(true);
    return;
  }
  if (!current) return;
  const src = current;
  const onEnded = currentOnEnded;
  current = null;
  currentOnEnded = null;
  // Detach the DOM handler first: stop() makes the source fire `ended`
  // asynchronously, and we invoke the completion callback ourselves below —
  // detaching keeps it to exactly one invocation.
  src.onended = null;
  try {
    src.stop();
  } catch {
    // already stopped / ended
  }
  onEnded?.();
}

/** Decode + play an audio blob through the unlocked context. Resolves true if
 *  playback started, false if Web Audio is unavailable. `onEnded` fires
 *  exactly once per started clip — when it finishes, when it is interrupted
 *  via `stopAudio`, or when a newer clip supersedes it. Throws if decode or
 *  start fails — caller handles fallback. */
export async function playAudioBlob(
  blob: Blob,
  onEnded: () => void,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;
  if (shouldUseAndroidMediaPipeline()) {
    return playWithAndroidMediaPipeline(blob, onEnded, signal);
  }
  const c = getCtx();
  if (!c) return false;
  await routeToCurrentDefaultOutput(c);
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      // continue — decode/start may still succeed (or throw to the caller)
    }
  }
  if (signal?.aborted) return false;
  const arrayBuf = await blobArrayBuffer(blob);
  if (signal?.aborted) return false;
  const audioBuf = await c.decodeAudioData(arrayBuf);
  if (signal?.aborted) return false;
  stopAudio();
  const src = c.createBufferSource();
  src.buffer = audioBuf;
  src.connect(c.destination);
  src.onended = () => {
    if (current === src) {
      current = null;
      currentOnEnded = null;
    }
    onEnded();
  };
  current = src;
  currentOnEnded = onEnded;
  src.start();
  return true;
}
