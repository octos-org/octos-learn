import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { encodeWav } from "./wav-encode";
import { getEchoCancelledMicStream } from "./microphone";

export interface VoiceCapture {
  capturing: boolean;
  start: (
    onUtterance: (wav: Blob) => void,
    options?: VoiceCaptureStartOptions,
  ) => Promise<boolean>;
  /** Resolves once the VAD is fully torn down. Await before starting reply
   *  playback so the Silero ONNX/WASM + mic AudioContext shutdown doesn't
   *  contend with the playback render thread. */
  stop: () => Promise<void>;
  error: string | null;
}

export interface VoiceCaptureStartOptions {
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  minSpeechMs?: number;
  redemptionMs?: number;
  onSpeechStart?: () => void;
  onSpeechConfirmed?: () => void;
  onSpeechRealStart?: () => void;
  onVADMisfire?: () => void;
  /** Supply a cloned stream when another transport owns the physical mic. */
  getStream?: () => Promise<MediaStream>;
}

const VAD_SAMPLE_RATE = 16000;
type VadModel = "legacy" | "v5";

let vadRuntimePreloadPromise: Promise<void> | null = null;
// Prefer Silero v5 for actual speech admission. Replay of the same production
// `/learn` WAVs showed that legacy admitted keyboard/friction noise that v5
// rejected, while v5 kept every matched Chinese utterance in the corpus. Keep
// legacy only as an availability fallback for clients that cannot load v5.
const VAD_MODEL_PREFERENCE: VadModel[] = ["v5", "legacy"];

// Self-hosted VAD assets (scripts/copy-vad-assets.mjs copies them into
// public/vad/). The library defaults baseAssetPath/onnxWASMBasePath to "./",
// which 404s, so we point them at /vad/.
//
// Two distinct loaders, two path forms:
//   - baseAssetPath: the worklet (audioWorklet.addModule) + Silero .onnx
//     (fetch). Root-relative "/vad/" is fine — these are not module imports.
//   - onnxWASMBasePath: onnxruntime-web loads its wasm GLUE via a dynamic
//     import() of "<base>ort-wasm-simd-threaded.mjs". Vite refuses to import()
//     a /public file via a root-relative specifier, so this MUST be an
//     absolute URL (origin-prefixed) — Vite leaves absolute http(s) imports
//     external and the browser fetches it from our own dev/prod server. Still
//     fully local (no CDN); origin adapts across dev port / prod host.
const VAD_BASE_ASSET_PATH = "/vad/";
const VAD_ONNX_WASM_BASE_PATH =
  typeof window !== "undefined"
    ? `${window.location.origin}/vad/`
    : "/vad/";
const VAD_RUNTIME_ASSETS = [
  `${VAD_BASE_ASSET_PATH}vad.worklet.bundle.min.js`,
  `${VAD_BASE_ASSET_PATH}silero_vad_v5.onnx`,
  `${VAD_BASE_ASSET_PATH}ort-wasm-simd-threaded.wasm`,
  `${VAD_BASE_ASSET_PATH}ort-wasm-simd-threaded.mjs`,
] as const;
const noop = () => {};

type CaptureCallbacks = {
  onUtterance: (wav: Blob) => void;
  options: VoiceCaptureStartOptions;
};

function frameProcessorOptions(options: VoiceCaptureStartOptions) {
  return {
    positiveSpeechThreshold: options.positiveSpeechThreshold ?? 0.6,
    negativeSpeechThreshold: options.negativeSpeechThreshold ?? 0.4,
    minSpeechMs: options.minSpeechMs ?? 300,
    redemptionMs: options.redemptionMs ?? 700,
  };
}

async function fetchVadRuntimeAsset(url: string): Promise<void> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`VAD asset unavailable: ${url} (${response.status})`);
  }
  // Consume the body so the browser's HTTP cache contains the complete model
  // or WASM file before MicVAD starts its own loader.
  await response.arrayBuffer();
}

/** Download the production VAD runtime in parallel. This is safe to call from
 * pointer intent, permission acquisition, and conversation startup: every
 * caller shares one promise and MicVAD subsequently reuses the HTTP cache. */
export function preloadVoiceCaptureRuntime(): Promise<void> {
  if (!vadRuntimePreloadPromise) {
    vadRuntimePreloadPromise = Promise.all(
      VAD_RUNTIME_ASSETS.map(fetchVadRuntimeAsset),
    ).then(() => undefined).catch((err) => {
      vadRuntimePreloadPromise = null;
      throw err;
    });
  }
  return vadRuntimePreloadPromise;
}

function runCallbackSafely(
  label: string,
  cb: () => void | Promise<void>,
  setError: (error: string | null) => void,
) {
  try {
    Promise.resolve(cb()).catch((err) => {
      console.error(`[voice] ${label} failed`, err);
      setError(err instanceof Error ? err.message : String(err));
    });
  } catch (err) {
    console.error(`[voice] ${label} failed`, err);
    setError(err instanceof Error ? err.message : String(err));
  }
}

async function createVadWithModel(
  model: VadModel,
  options: Parameters<typeof MicVAD.new>[0],
): Promise<MicVAD> {
  return MicVAD.new({
    ...options,
    model,
    startOnLoad: false,
  });
}

export function useVoiceCapture(): VoiceCapture {
  const vadRef = useRef<MicVAD | null>(null);
  // The callbacks/configuration are mutable while one MicVAD remains alive.
  // Voice replies can contain dozens of sentence clips; rebuilding ONNX,
  // AudioContext, and getUserMedia for every clip creates repeated deaf
  // windows. MicVAD supports live frame-processor option updates, and these
  // refs let its stable callbacks always dispatch to the latest voice mode.
  const callbacksRef = useRef<CaptureCallbacks | null>(null);
  const initializationRef = useRef<Promise<boolean> | null>(null);
  const teardownRef = useRef<Promise<void> | null>(null);
  // Monotonic cancellation token. Only stop() invalidates an in-flight
  // initialization. Repeated start() calls share that initialization and
  // update callbacks/options instead of racing two microphone/VAD instances.
  const startGenRef = useRef(0);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback((): Promise<void> => {
    startGenRef.current++;
    callbacksRef.current = null;
    const vad = vadRef.current;
    vadRef.current = null;
    setCapturing(false);
    const pendingInitialization = initializationRef.current;
    if (!vad && !pendingInitialization) {
      return teardownRef.current ?? Promise.resolve();
    }
    // Return a promise that resolves once teardown finishes so callers can
    // await it BEFORE starting reply playback — otherwise the ONNX/WASM + mic
    // AudioContext shutdown spikes CPU exactly as the reply's Web Audio render
    // thread starts, glitching the first sentence.
    const teardown = (async () => {
      if (vad) {
        try {
          await vad.pause();
        } catch {
          // already paused / destroyed
        }
        try {
          await vad.destroy();
        } catch {
          // already destroyed
        }
      }
      // An initializer invalidated above destroys its own candidate before it
      // resolves. Await it so a following start() never opens a second mic
      // while the stale candidate is still winding down.
      if (pendingInitialization) {
        await pendingInitialization.catch(() => undefined);
      }
    })();
    teardownRef.current = teardown;
    void teardown.finally(() => {
      if (teardownRef.current === teardown) teardownRef.current = null;
    });
    return teardown;
  }, []);

  const start = useCallback(async (
    onUtterance: (wav: Blob) => void,
    options: VoiceCaptureStartOptions = {},
  ) => {
    setError(null);
    callbacksRef.current = { onUtterance, options };

    const pendingTeardown = teardownRef.current;
    if (pendingTeardown) await pendingTeardown;

    // stop() may have won while this start() was waiting for the previous VAD
    // to finish tearing down. Do not reacquire the microphone after that.
    const latestAfterTeardown = callbacksRef.current;
    if (!latestAfterTeardown) return false;

    const active = vadRef.current;
    if (active) {
      active.setOptions(frameProcessorOptions(latestAfterTeardown.options));
      setCapturing(true);
      return true;
    }

    // thinking→speaking can happen while the first MicVAD.new() is still
    // loading. Join that work; the initializer reads callbacksRef at dispatch
    // time and applies the latest thresholds before publishing the instance.
    const pendingInitialization = initializationRef.current;
    if (pendingInitialization) {
      try {
        await pendingInitialization;
      } catch {
        // The initializer owner surfaces the capture error. Joining callers
        // must not leak a second rejection from the same failed MicVAD.new().
        return false;
      }
      if (initializationRef.current === pendingInitialization) {
        initializationRef.current = null;
      }
      const initialized = vadRef.current;
      if (initialized && callbacksRef.current) {
        initialized.setOptions(
          frameProcessorOptions(callbacksRef.current.options),
        );
        setCapturing(true);
        return true;
      }
      return false;
    }

    const gen = startGenRef.current;
    const initialize = (async () => {
      // Conversation startup already begins a best-effort preload. Do not
      // serialize MicVAD initialization behind a second full download wait:
      // MicVAD can consume the browser cache/coalesced requests directly.
      void preloadVoiceCaptureRuntime().catch((error) => {
        console.warn("[voice] VAD runtime preload failed", error);
      });
      let vad: MicVAD | null = null;
      let initError: unknown = null;
      for (const model of VAD_MODEL_PREFERENCE) {
        try {
          vad = await createVadWithModel(model, {
            baseAssetPath: VAD_BASE_ASSET_PATH,
            onnxWASMBasePath: VAD_ONNX_WASM_BASE_PATH,
            getStream: options.getStream ?? getEchoCancelledMicStream,
            resumeStream: options.getStream ?? getEchoCancelledMicStream,
            // Less trigger-happy than the defaults so transient noise (keyboard
            // clicks, taps) doesn't register as speech and kick off a turn:
            //  - require a higher speech probability to START,
            //  - require ≥300ms of real speech before it counts as an utterance
            //    (short clicks fall under this and fire onVADMisfire instead),
            //  - wait ~700ms of silence before ending so natural pauses don't cut.
            ...frameProcessorOptions(options),
            onSpeechStart: () => {
              if (gen !== startGenRef.current) return;
              const current = callbacksRef.current;
              if (!current) return;
              runCallbackSafely("onSpeechStart", () => {
                (current.options.onSpeechStart ?? noop)();
              }, setError);
            },
            onSpeechRealStart: () => {
              if (gen !== startGenRef.current) return;
              const current = callbacksRef.current;
              if (!current) return;
              runCallbackSafely("onSpeechRealStart", () => {
                (current.options.onSpeechConfirmed ?? noop)();
                (current.options.onSpeechRealStart ?? noop)();
              }, setError);
            },
            onVADMisfire: () => {
              if (gen !== startGenRef.current) return;
              const current = callbacksRef.current;
              if (!current) return;
              runCallbackSafely("onVADMisfire", () => {
                (current.options.onVADMisfire ?? noop)();
              }, setError);
            },
            onSpeechEnd: (audio: Float32Array) => {
              if (gen !== startGenRef.current) return;
              if (audio.length === 0) return;
              const current = callbacksRef.current;
              if (!current) return;
              runCallbackSafely(
                "onSpeechEnd",
                () => current.onUtterance(encodeWav(audio, VAD_SAMPLE_RATE)),
                setError,
              );
            },
          });
          await vad.start();
          if (gen !== startGenRef.current) {
            await vad.destroy().catch(() => undefined);
            return false;
          }
          break;
        } catch (err) {
          initError = err;
          console.error(`[voice] failed to initialize/start VAD with model ${model}`, err);
          if (vad) {
            await vad.pause().catch(() => undefined);
            await vad.destroy().catch(() => undefined);
            vad = null;
          }
        }
      }
      if (!vad) {
        throw initError instanceof Error
          ? initError
          : new Error("microphone VAD unavailable");
      }
      const latest = callbacksRef.current;
      if (!latest || gen !== startGenRef.current) {
        await vad.destroy().catch(() => undefined);
        return false;
      }
      vad.setOptions(frameProcessorOptions(latest.options));
      vadRef.current = vad;
      setCapturing(true);
      return true;
    })();
    initializationRef.current = initialize;
    try {
      return await initialize;
    } catch (e) {
      console.error("[voice] capture init failed", e);
      setError(e instanceof Error ? e.message : "microphone unavailable");
      setCapturing(false);
      return false;
    } finally {
      if (initializationRef.current === initialize) {
        initializationRef.current = null;
      }
    }
  }, []);

  useEffect(() => () => void stop(), [stop]);

  return { capturing, start, stop, error };
}
