import { tr } from "@/i18n";
import { availableService } from "@/byok/providers";
import { getService, hasServiceCredential, getServiceStatus, getLessonConfigured, subscribeServices } from "@/byok/services";
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

let cached: VoiceRouting | undefined;
export function selectVoiceRoutes(_readiness: VoiceReadiness, asr: boolean, tts: boolean): Pick<VoiceRouting, "asr" | "tts"> {
  return { asr: asr ? "cloud" : "unavailable", tts: tts ? "cloud" : "unavailable" };
}
/** Local snapshots only: login/settings own configuration synchronization. */
export async function getVoiceRouting(_force = false): Promise<VoiceRouting> {
  void _force;
  const asr = availableService("asr");
  // A saved key opts into narration. Validate its parameters at synthesis so
  // an incomplete voice selection produces an actionable error, not silence.
  const savedTts = getService("tts");
  const tts = hasServiceCredential(savedTts) || !!savedTts?.has_credential;
  const lesson = getLessonConfigured();
  const asrVerified = getServiceStatus("asr").state === "ready";
  const ttsVerified = getServiceStatus("tts").state === "ready";
  cached = {
    readiness: { ready: asrVerified && ttsVerified && lesson === true, asr: { ready: asrVerified, mode: "cloud", detail: getServiceStatus("asr").detail },
      llm: { ready: lesson === true, detail: lesson ? tr("课程模型已配置。") : tr("请连接自己的课程模型，语音配置独立保存。") }, tts: { ready: ttsVerified, mode: "cloud", detail: getServiceStatus("tts").detail } },
    readinessKnown: lesson !== undefined, ...selectVoiceRoutes({} as VoiceReadiness, asr, tts),
    cloudAsrAvailable: asr, cloudTtsAvailable: tts, cloudAsrDetail: getServiceStatus("asr").detail,
  };
  return cached;
}
export function markPrivateAsrFailed(): void { cached = undefined; }
export function markPrivateTtsFailed(): void { cached = undefined; }
export function clearVoiceRouting(): void { cached = undefined; }
export function peekVoiceRouting(): VoiceRouting | undefined { return cached; }
subscribeServices(clearVoiceRouting);
