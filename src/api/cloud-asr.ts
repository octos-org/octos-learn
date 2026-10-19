import { availableService, transcribeDirect } from "@/byok/providers";
import { getServiceStatus } from "@/byok/services";
export interface CloudAsrStatus { available: boolean; detail: string }
export interface CloudAsrResult { status: "speech" | "no_speech"; transcript: string }
export function isCloudAsrEnabled(): boolean { return true; }
export async function fetchCloudAsrStatus(): Promise<CloudAsrStatus> {
  return { available: availableService("asr"), detail: getServiceStatus("asr").detail };
}
export const transcribeCloudSpeech = transcribeDirect;
