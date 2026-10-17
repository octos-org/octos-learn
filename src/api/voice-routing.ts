import { getSelectedProfileId, getToken, request } from "./client";
import { fetchCloudAsrStatus, isCloudAsrEnabled } from "./cloud-asr";
import type { VoiceReadiness } from "@/settings/settings-api";

export type AsrRoute = "private" | "backend" | "cloud" | "unavailable";
export type TtsRoute = "private" | "backend" | "cloud" | "unavailable";
export interface VoiceRouting {
  readiness: VoiceReadiness;
  readinessKnown: boolean;
  asr: AsrRoute;
  tts: TtsRoute;
  cloudAsrAvailable: boolean;
  cloudTtsAvailable: boolean;
  cloudAsrDetail: string;
}

const TTL_MS = 10_000;
let cached: { key: string; at: number; value: VoiceRouting } | undefined;
let inFlight: { key: string; promise: Promise<VoiceRouting> } | undefined;
let asrFailedUntil = 0;
let ttsFailedUntil = 0;
let revision = 0;
let lastIdentity: string | undefined;

function identity() { return `${getToken() || ""}\0${getSelectedProfileId() || ""}`; }

async function probe<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try { return await request<T>(path, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export function selectVoiceRoutes(
  readiness: VoiceReadiness,
  cloudAsrAvailable: boolean,
  cloudTtsAvailable: boolean,
): Pick<VoiceRouting, "asr" | "tts"> {
  const privateOnline = import.meta.env.VITE_PRIVATE_ASR_ENABLED !== "false"
    && readiness.asr.mode === "private" && readiness.asr.ready;
  return {
    asr: privateOnline && Date.now() >= asrFailedUntil ? "private"
      : readiness.asr.mode !== "private" && readiness.asr.ready && Date.now() >= asrFailedUntil ? "backend"
        : cloudAsrAvailable ? "cloud" : "unavailable",
    tts: privateOnline && Date.now() >= ttsFailedUntil ? "private"
      : readiness.tts.ready && readiness.tts.mode !== "cloud" && Date.now() >= ttsFailedUntil ? "backend"
        : cloudTtsAvailable ? "cloud" : readiness.tts.ready ? "backend" : "unavailable",
  };
}

/** One bounded, identity-scoped health check shared by UI, capture and narration. */
export function getVoiceRouting(force = false): Promise<VoiceRouting> {
  const key = identity();
  if (key !== lastIdentity) { clearVoiceRouting(); lastIdentity = key; }
  const generation = revision;
  if (!force && cached?.key === key && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value);
  if (inFlight?.key === key) return inFlight.promise;
  const promise = (async () => {
    const [readiness, cloudAsr, tts] = await Promise.all([
      probe<VoiceReadiness>("/api/voice/readiness").then(
        value => ({ value, known: true }),
        (error: unknown) => {
          const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
          if (status === 401 || status === 403) throw error;
          // An offline health endpoint is not proof of missing LLM credentials.
          // Keep cloud ASR/TTS usable, while reporting model health as unknown.
          return { known: false, value: {
            ready: false,
            asr: { ready: false, mode: "private", detail: "私有语音服务检查失败。" },
            llm: { ready: false, detail: "模型状态暂时无法确认。" },
            tts: { ready: false, mode: "local", detail: "私有旁白服务检查失败。" },
          } };
        },
      ),
      isCloudAsrEnabled() ? fetchCloudAsrStatus() : Promise.resolve({ available: false, detail: "云端 ASR 已停用。" }),
      probe<{ available: boolean }>("/api/learn/tts/status").catch(() => ({ available: false })),
    ]);
    const nativeTts = window.OctosNativeTts?.isConfigured?.() === true;
    const cloudTtsAvailable = tts.available || nativeTts;
    const value: VoiceRouting = {
      readiness: readiness.value, readinessKnown: readiness.known,
      ...selectVoiceRoutes(readiness.value, cloudAsr.available, cloudTtsAvailable),
      cloudAsrAvailable: cloudAsr.available, cloudTtsAvailable, cloudAsrDetail: cloudAsr.detail,
    };
    if (identity() !== key) throw new Error("Voice routing identity changed");
    if (revision === generation) cached = { key, at: Date.now(), value };
    return value;
  })().finally(() => { if (inFlight?.promise === promise) inFlight = undefined; });
  inFlight = { key, promise };
  return promise;
}

export function markPrivateAsrFailed(): void {
  asrFailedUntil = Date.now() + TTL_MS;
  cached = undefined;
  revision++;
}

export function markPrivateTtsFailed(): void {
  ttsFailedUntil = Date.now() + TTL_MS;
  cached = undefined;
  revision++;
}

export function clearVoiceRouting(): void {
  cached = undefined;
  inFlight = undefined;
  asrFailedUntil = 0;
  ttsFailedUntil = 0;
  revision++;
}

export function peekVoiceRouting(): VoiceRouting | undefined {
  return cached?.key === identity() && Date.now() - cached.at < TTL_MS ? cached.value : undefined;
}

if (typeof window !== "undefined") {
  window.addEventListener("crew:token_cleared", clearVoiceRouting);
  window.addEventListener("octos:native-speech-configured", clearVoiceRouting);
}
