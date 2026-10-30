import { localizedCatalog } from "@/i18n";
import type { Capability, ServiceMetadata } from "./services";

export const SERVICE_CAPABILITIES = ["tts", "asr", "admission"] as const;
export const SERVICE_DEFINITIONS = localizedCatalog({
  tts: { title: "Text to Speech", provider: "volcano", providerName: "Volcano Engine", keyLabel: "Volcano TTS API Key", description: "Voice narration for generated lessons.", consoleUrl: "https://console.volcengine.com/speech/new/setting/apikeys?projectName=default" },
  asr: { title: "Speech Recognition", provider: "volcano", providerName: "Volcano Engine", keyLabel: "Volcano ASR API Key", description: "Turn microphone input into a learning request.", consoleUrl: "https://console.volcengine.com/speech/new/setting/apikeys?projectName=default" },
  admission: { title: "Input Understanding", provider: "typesafe", providerName: "TypeSafe Jev", keyLabel: "TypeSafe Jev API Key", description: "Optional intent filtering and clarification before a lesson.", consoleUrl: "https://console.typesafe.ai/settings/keys" },
} as const);

export function supportsService(capability: Capability, saved?: ServiceMetadata): boolean {
  return !saved || (saved.provider === SERVICE_DEFINITIONS[capability].provider &&
    (capability === "admission" || ((!saved.params.auth_mode || saved.params.auth_mode === "api-key") && !saved.params.app_id)));
}
export function serviceParams(capability: Capability, saved?: ServiceMetadata): Record<string, string> {
  const defaults: Record<string, string> = capability === "admission" ? { model: "jev-latest" }
    : { auth_mode: "api-key", resource_id: capability === "tts" ? "seed-tts-2.0" : "volc.bigasr.auc_turbo", ...(capability === "tts" ? { voice: "" } : {}) };
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key,
    key === "auth_mode" ? "api-key" : saved?.provider === SERVICE_DEFINITIONS[capability].provider ? saved.params[key] ?? value : value,
  ]));
}
