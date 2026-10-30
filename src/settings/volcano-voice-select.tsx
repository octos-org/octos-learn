import { useLocale } from "@/i18n/use-locale";
import { tr, translateStatus } from "@/i18n";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface Voice { id: string; name: string; resourceIds: string[]; language: string }
const inputClass = "w-full rounded-xl bg-surface-container px-4 py-3 text-sm text-text placeholder-muted/50 outline-none border border-transparent focus:border-accent/30 disabled:opacity-50 transition";
export function VolcanoVoiceSelect({ hasCredential, resourceId, value, onChange }: { hasCredential: boolean; resourceId: string; value: string; onChange: (value: string) => void }) {
  useLocale();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    let active = true;
    if (!hasCredential) {
      queueMicrotask(() => { if (active) { setVoices([]); setLoading(false); setError(""); } });
      return () => { active = false; };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      if (active) { setError(tr("The voice list took too long to load. Retry or enter your voice ID.")); setLoading(false); }
    }, 8000);
    void Promise.resolve().then(() => {
      if (!active) return undefined;
      setLoading(true); setError("");
      return fetch(`${import.meta.env.BASE_URL}voice-catalog/volcano.json`, { signal: controller.signal, credentials: "omit" });
    })
      .then(async response => {
        if (!response) return;
        if (!response.ok) throw new Error(tr("Catalog unavailable"));
        const data = await response.json() as { version?: number; voices?: Voice[] };
        if (data.version !== 1 || !Array.isArray(data.voices) || data.voices.some(v => !v || typeof v.id !== "string" || typeof v.name !== "string" || !Array.isArray(v.resourceIds) || v.resourceIds.some(id => typeof id !== "string"))) throw new Error(tr("Invalid catalog"));
        if (active && !controller.signal.aborted) setVoices(data.voices);
      }).catch(() => { if (!controller.signal.aborted) setError(tr("Could not load the voice list. Retry or enter your voice ID.")); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [hasCredential, reload]);
  const options = voices.filter(voice => voice.resourceIds.includes(resourceId.trim()));
  const useCustom = custom || (!!value && !options.some(voice => voice.id === value)) || !!error;
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor="volcano-voice-id" className="text-xs font-medium text-muted">{tr("Voice ID")}</label>
      {hasCredential && <button type="button" className="inline-flex items-center gap-1.5 text-xs text-accent disabled:opacity-40" disabled={loading} onClick={() => setReload(value => value + 1)}>
        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}{tr("Reload voices")}</button>}
    </div>
    <select id="volcano-voice-id" value={useCustom ? "__custom__" : value} disabled={!hasCredential || loading}
      className={inputClass} onChange={event => { const id = event.target.value; setCustom(id === "__custom__"); if (id !== "__custom__") onChange(id); }}>
      <option value="">{!hasCredential ? tr("Add your API key first") : loading ? tr("Loading voices…") : tr("Select a voice…")}</option>
      {options.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
      <option value="__custom__">{tr("Custom / cloned voice…")}</option>
    </select>
    {useCustom && <label className="block"><span className="mb-2 block text-xs font-medium text-muted">{tr("Custom Voice ID")}</span><input className={`${inputClass} font-mono`} value={value} onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false} placeholder={tr("Enter the voice ID from your speech console")} /></label>}
    {loading && <p role="status" className="text-xs text-muted">{tr("Loading the standard voice catalog…")}</p>}
    {error && <p role="alert" className="text-xs text-red-400">{translateStatus(error)}</p>}
    {hasCredential && !loading && <p className="text-xs leading-5 text-muted">{value && !useCustom ? <><span className="font-mono">{value}</span><br /></> : null}
      {options.length ? tr("Standard voices for this resource. Account access is checked only when you test a voice.") : tr("No standard voices listed for this resource. Use a custom voice ID if your resource supports it.")}{" "}
      <a className="text-accent hover:underline" href="https://docs.volcengine.com/docs/DoubaoVoice/Tonelist-1?lang=zh" target="_blank" rel="noreferrer">{tr("Official voice catalog")}</a>
    </p>}
  </div>;
}
