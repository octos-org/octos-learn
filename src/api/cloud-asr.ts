import { availableService, transcribeDirect } from "@/byok/providers";
import { getServiceStatus, prepareClientServices } from "@/byok/services";
export interface CloudAsrStatus { available: boolean; detail: string }
export interface CloudAsrResult { status: "speech" | "no_speech"; transcript: string }
export function isCloudAsrEnabled(): boolean { return true; }
/** Loads the learner's saved services first, so a page that has not loaded them yet still sees their key. */
export async function fetchCloudAsrStatus(): Promise<CloudAsrStatus> {
  await prepareClientServices().catch(() => undefined);
  return { available: availableService("asr"), detail: getServiceStatus("asr").detail };
}
/** Transcribes one utterance with the learner's key; `language` is what is being spoken, when known. */
export function transcribeCloudSpeech(wav: Blob, signal: AbortSignal, options?: { language?: string }): Promise<CloudAsrResult> {
  return options ? transcribeDirect(wav, signal, undefined, options) : transcribeDirect(wav, signal);
}
