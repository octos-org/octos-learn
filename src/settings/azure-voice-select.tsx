import { useLocale } from "@/i18n/use-locale";
import { tr } from "@/i18n";
import { useState } from "react";
import { AZURE_VOICES } from "@/byok/azure-voices";
import { AZURE_DEFAULT_VOICE } from "@/byok/service-config";

const inputClass = "w-full rounded-xl bg-surface-container px-4 py-3 text-sm text-text placeholder-muted/50 outline-none border border-transparent focus:border-accent/30 disabled:opacity-50 transition";
/** Narration voice for Azure AI Speech: the US English voices offered to learners, or any other voice name. */
export function AzureVoiceSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  useLocale();
  const [custom, setCustom] = useState(false);
  const useCustom = custom || (!!value && !AZURE_VOICES.some(voice => voice.id === value));
  return <div className="space-y-2">
    <label htmlFor="azure-voice-id" className="text-xs font-medium text-muted">{tr("Voice ID")}</label>
    <select id="azure-voice-id" value={useCustom ? "__custom__" : value} className={inputClass}
      onChange={event => { const id = event.target.value; setCustom(id === "__custom__"); if (id !== "__custom__") onChange(id); }}>
      <option value="">{tr("Select a voice…")}</option>
      {AZURE_VOICES.map(voice => <option key={voice.id} value={voice.id}>{voice.name()}</option>)}
      <option value="__custom__">{tr("Other Azure voice…")}</option>
    </select>
    {useCustom && <label className="block"><span className="mb-2 block text-xs font-medium text-muted">{tr("Custom Voice ID")}</span><input className={`${inputClass} font-mono`} value={value} onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false} placeholder={AZURE_DEFAULT_VOICE} /></label>}
    <p className="text-xs leading-5 text-muted">{value && !useCustom ? <><span className="font-mono">{value}</span><br /></> : null}
      {tr("Native US English voices. Ana is a child's voice.")}{" "}
      <a className="text-accent hover:underline" href="https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts" target="_blank" rel="noreferrer">{tr("Official voice catalog")}</a>
    </p>
  </div>;
}
