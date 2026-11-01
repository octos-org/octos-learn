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
export const transcribeCloudSpeech = transcribeDirect;
