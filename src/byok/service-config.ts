import { localizedCatalog } from "@/i18n";
import type { Capability, ServiceMetadata } from "./services";

export const SERVICE_CAPABILITIES = ["tts", "asr", "admission"] as const;
export const SERVICE_DEFINITIONS = localizedCatalog({
  tts: { title: "Text to Speech", provider: "volcano", providerName: "Volcano Engine", keyLabel: "Volcano TTS API Key", description: "Voice narration for generated lessons.", consoleUrl: "https://console.volcengine.com/speech/new/setting/apikeys?projectName=default" },
  asr: { title: "Speech Recognition", provider: "volcano", providerName: "Volcano Engine", keyLabel: "Volcano ASR API Key", description: "Turn microphone input into a learning request.", consoleUrl: "https://console.volcengine.com/speech/new/setting/apikeys?projectName=default" },
  admission: { title: "Input Understanding", provider: "typesafe", providerName: "TypeSafe Jev", keyLabel: "TypeSafe Jev API Key", description: "Optional intent filtering and clarification before a lesson.", consoleUrl: "https://console.typesafe.ai/settings/keys" },
} as const);

/** Speech suppliers a learner can bring a key for. Volcano is the default;
 * Azure AI Speech serves US English (native en-US and child voices). */
export type SpeechProvider = "volcano" | "azure";
export const SPEECH_PROVIDERS = localizedCatalog({
  volcano: { name: "Volcano Engine", consoleUrl: "https://console.volcengine.com/speech/new/setting/apikeys?projectName=default" },
  azure: { name: "Azure AI Speech (US English)", consoleUrl: "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices" },
} as const);
export const SPEECH_PROVIDER_IDS: readonly SpeechProvider[] = ["volcano", "azure"];
export function isSpeechProvider(value: unknown): value is SpeechProvider {
  return value === "volcano" || value === "azure";
}
/** The providers a capability accepts. */
export function providersFor(capability: Capability): readonly string[] {
  return capability === "admission" ? ["typesafe"] : SPEECH_PROVIDER_IDS;
}

/** Azure voice the learner hears until they choose one: a US English child voice. */
export const AZURE_DEFAULT_VOICE = "en-US-AnaNeural";
export const AZURE_DEFAULT_REGION = "eastus";

export function defaultParams(capability: Capability, provider: string): Record<string, string> {
  if (capability === "admission") return { model: "jev-latest" };
  if (provider === "azure") return { region: AZURE_DEFAULT_REGION, ...(capability === "tts" ? { voice: AZURE_DEFAULT_VOICE } : {}) };
  return { auth_mode: "api-key", resource_id: capability === "tts" ? "seed-tts-2.0" : "volc.bigasr.auc_turbo", ...(capability === "tts" ? { voice: "" } : {}) };
}

/** The provider a capability's form starts with: the saved one when supported. */
export function savedProvider(capability: Capability, saved?: ServiceMetadata): string {
  return saved && providersFor(capability).includes(saved.provider) ? saved.provider : SERVICE_DEFINITIONS[capability].provider;
}

export function supportsService(capability: Capability, saved?: ServiceMetadata): boolean {
  if (!saved) return true;
  if (!providersFor(capability).includes(saved.provider)) return false;
  return saved.provider !== "volcano" || ((!saved.params.auth_mode || saved.params.auth_mode === "api-key") && !saved.params.app_id);
}
export function serviceParams(capability: Capability, saved?: ServiceMetadata, provider = savedProvider(capability, saved)): Record<string, string> {
  const defaults = defaultParams(capability, provider);
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key,
    key === "auth_mode" ? "api-key" : saved?.provider === provider ? saved.params[key] ?? value : value,
  ]));
}
