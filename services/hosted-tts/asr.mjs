import { randomUUID } from "node:crypto";
import { HttpError } from "./http-error.mjs";

export const MAX_ASR_BYTES = 5_760_044; // 60s mono 48kHz PCM16 + WAV header
const ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";

export function loadAsrConfig(env) {
  return {
    enabled: env.HOSTED_ASR_ENABLED === "1",
    apiKey: env.VOLC_ASR_API_KEY?.trim() || "",
    appid: env.VOLC_ASR_APPID?.trim() || env.VOLC_TTS_APPID?.trim() || "",
    token: env.VOLC_ASR_TOKEN?.trim() || env.VOLC_TTS_TOKEN?.trim() || "",
    dailySeconds: positiveInt(env.HOSTED_ASR_DAILY_SECONDS, 3600),
    userDailySeconds: positiveInt(env.HOSTED_ASR_USER_DAILY_SECONDS, 600),
  };
}

function positiveInt(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 86400) throw new Error("invalid ASR daily limit");
  return number;
}

export function asrConfigured(config) {
  return Boolean(config?.enabled && (config.apiKey || (config.appid && config.token)));
}

export async function readAsrAudio(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_ASR_BYTES) throw new HttpError(413, "每段语音请控制在 60 秒以内。");
    chunks.push(chunk);
  }
  return validateAsrAudio(Buffer.concat(chunks));
}

/** Both browser VAD and NativeAudioBridge emit this canonical PCM WAV. */
export function validateAsrAudio(bytes) {
  const invalid = () => new HttpError(400, "需要有效的单声道 PCM16 WAV 音频。");
  if (bytes.length < 46 || bytes.length > MAX_ASR_BYTES
    || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.readUInt32LE(4) !== bytes.length - 8
    || bytes.toString("ascii", 8, 16) !== "WAVEfmt " || bytes.readUInt32LE(16) !== 16
    || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1
    || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16
    || bytes.toString("ascii", 36, 40) !== "data" || bytes.readUInt32LE(40) !== bytes.length - 44
    || (bytes.length - 44) % 2 !== 0) throw invalid();
  const sampleRate = bytes.readUInt32LE(24);
  if (![16000, 44100, 48000].includes(sampleRate) || bytes.readUInt32LE(28) !== sampleRate * 2) throw invalid();
  const seconds = (bytes.length - 44) / (sampleRate * 2);
  if (seconds > 60) throw new HttpError(413, "每段语音请控制在 60 秒以内。");
  return { bytes, seconds };
}

export async function transcribeAsr(audio, config, fetchImpl = fetch, signal) {
  let response;
  const requestId = randomUUID();
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST", redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {
          "X-Api-App-Key": config.appid, "X-Api-Access-Key": config.token,
        }),
        "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
        "X-Api-Request-Id": requestId, "X-Api-Sequence": "-1",
      },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
      body: JSON.stringify({
        user: { uid: `octos-learn-${requestId}` }, audio: { data: audio.bytes.toString("base64") },
        request: { model_name: "bigmodel", enable_itn: true, enable_punc: true },
      }),
    });
  } catch { throw new HttpError(502, "云端识别连接失败或超时，请再试一次。"); }
  const code = response.headers.get("X-Api-Status-Code");
  if (response.ok && code === "20000003") return { status: "no_speech", transcript: "" };
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(503, "火山 ASR 认证失败，请检查凭据和识别资源权限。");
  }
  if (!response.ok || code !== "20000000") {
    const safeCode = /^\d{7,8}$/.test(code || "") ? code : `HTTP ${response.status}`;
    throw new HttpError(502, `火山 ASR 识别失败（${safeCode}）。`);
  }
  let payload;
  try { payload = await response.json(); } catch { throw new HttpError(502, "云端识别返回无效结果。"); }
  if (typeof payload?.result?.text !== "string") throw new HttpError(502, "云端识别返回无效结果。");
  const transcript = payload.result.text.trim();
  return { status: transcript ? "speech" : "no_speech", transcript };
}
