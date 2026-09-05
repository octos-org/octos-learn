/**
 * Reply-voice (TTS timbre) selection API.
 *
 * `GET /api/voices` lists the voices the engine can synthesize plus the
 * caller's current choice; `PUT /api/my/voice` sets the user's sticky default.
 * Both are per-tenant on the backend (see octos `api/voices.rs`).
 */
import { request, requestBlob } from "./client";

export interface VoiceInfo {
  id: string;
  aliases: string[];
}

export interface VoicesResponse {
  voices: VoiceInfo[];
  current: string;
}

export interface SetVoiceResponse {
  ok: boolean;
  voice: string;
}

export interface HostedTtsLimits {
  enabled: boolean;
  platform_monthly_chars: number;
  user_monthly_chars: number;
}

export interface HostedTtsStatus {
  configured: boolean;
  available: boolean;
  uses_platform: boolean;
  month: string;
  limits: HostedTtsLimits;
  user_used_chars: number;
  platform_used_chars?: number;
  can_manage: boolean;
}

export function isHostedTtsEnabled(): boolean {
  return import.meta.env.VITE_HOSTED_TTS_ENABLED === "true";
}

export function fetchHostedTtsStatus(): Promise<HostedTtsStatus> {
  return request<HostedTtsStatus>("/api/learn/tts/status");
}

/** List synthesizable voices and the caller's current reply voice. */
export async function getVoices(): Promise<VoicesResponse> {
  return request<VoicesResponse>("/api/voices");
}

/** Set the caller's sticky reply voice. Resolves to the canonical id. */
export async function setVoice(voice: string): Promise<SetVoiceResponse> {
  return request<SetVoiceResponse>("/api/my/voice", {
    method: "PUT",
    body: JSON.stringify({ voice }),
  });
}

/** Synthesize text with the current profile's configured TTS route and voice. */
export async function synthesizeSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const endpoint = isHostedTtsEnabled()
    ? "/api/learn/tts/synthesize"
    : "/api/voice/synthesize";
  return requestBlob(endpoint, {
    method: "POST",
    body: JSON.stringify({ text }),
    signal,
  });
}
