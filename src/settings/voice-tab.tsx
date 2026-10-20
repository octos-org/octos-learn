import { useEffect, useState } from "react";
import { AlertCircle, Brain, Check, CheckCircle2, Info, KeyRound, Loader2, Mic, RotateCcw, Save, Volume2 } from "lucide-react";
import { SERVICE_CAPABILITIES, SERVICE_DEFINITIONS, serviceParams, supportsService } from "@/byok/service-config";
import { saveClientService, type Capability, type ServiceMetadata } from "@/byok/services";
import { useServiceMetadata, type ServiceMetadataMap } from "@/byok/use-service-metadata";
import { formatSettingsError, type Profile } from "./settings-api";
import { VolcanoVoiceSelect } from "./volcano-voice-select";
import { VoiceServiceTest } from "./voice-service-test";

interface ServiceForm { params: Record<string, string> }
type VoiceForm = Record<Capability, ServiceForm>;
const icons = { tts: Volume2, asr: Mic, admission: Brain };
const inputClass = "w-full rounded-xl bg-surface-container px-4 py-3 text-sm text-text placeholder-muted/50 outline-none border border-transparent focus:border-accent/30 disabled:opacity-50 transition";
const labelClass = "mb-2 block text-xs font-medium text-muted";
function serviceForm(capability: Capability, saved?: ServiceMetadata): ServiceForm {
  return { params: serviceParams(capability, saved) };
}
function initialForm(metadata: ServiceMetadataMap): VoiceForm {
  return Object.fromEntries(SERVICE_CAPABILITIES.map(capability => [capability, serviceForm(capability, metadata[capability])])) as VoiceForm;
}
export function VoiceTab({ profile }: { profile: Profile; onProfileUpdated: (profile: Profile) => void }) {
  const services = useServiceMetadata();
  if (services.loading) return <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted"><Loader2 size={16} className="animate-spin" />Loading voice configuration…</p>;
  if (services.error) return <div role="alert" className="glass-section rounded-lg p-6 text-sm text-red-400">{services.error}<button className="ml-2 text-accent underline" onClick={services.reload}>Reload configuration</button></div>;
  return <VoiceEditor key={profile.id} initialMetadata={services.metadata} />;
}
function VoiceEditor({ initialMetadata }: { initialMetadata: ServiceMetadataMap }) {
  const [metadata, setMetadata] = useState(initialMetadata);
  const [form, setForm] = useState(() => initialForm(initialMetadata));
  const [original, setOriginal] = useState(() => initialForm(initialMetadata));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = SERVICE_CAPABILITIES.filter(capability => JSON.stringify(form[capability]) !== JSON.stringify(original[capability]));
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);
  function update(capability: Capability, patch: Partial<ServiceForm>) {
    setForm(previous => ({ ...previous, [capability]: { ...previous[capability], ...patch } }));
    setSaved(false); setError("");
  }
  async function save(capabilities: readonly Capability[] = dirty) {
    setSaving(true); setSaved(false); setError("");
    try {
      // Validate all pending edits before persisting any of them.
      for (const capability of capabilities) {
        const current = metadata[capability];
        const draft = form[capability];
        if (!supportsService(capability, current)) throw new Error(`Replace the ${SERVICE_DEFINITIONS[capability].title} credential in API Keys first.`);
        if (current?.has_credential && capability !== "admission" && !draft.params.resource_id.trim()) throw new Error("Enter a resource ID for your speech service.");
        if (current?.has_credential && capability === "tts" && !draft.params.voice.trim()) throw new Error("Choose a voice for narration.");
      }
      for (const capability of capabilities) {
        const params = Object.fromEntries(Object.entries(form[capability].params).map(([name, value]) => [name, value.trim()]));
        const next = await saveClientService(capability, { provider: SERVICE_DEFINITIONS[capability].provider, enabled: !!metadata[capability]?.has_credential, params }, metadata[capability]?.revision);
        if (!next) throw new Error("Configuration changed. Reload the page before saving again.");
        const nextForm = serviceForm(capability, next);
        setMetadata(previous => ({ ...previous, [capability]: next }));
        setOriginal(previous => ({ ...previous, [capability]: nextForm }));
        setForm(previous => ({ ...previous, [capability]: nextForm }));
      }
      setSaved(true);
    } catch (error) { setError(formatSettingsError(error, "Failed to save voice configuration. Your remaining edits are kept.")); }
    finally { setSaving(false); }
  }
  const reset = () => { setForm(original); setSaved(false); setError(""); };
  return <div className="space-y-6">
    {SERVICE_CAPABILITIES.map(capability => {
      const definition = SERVICE_DEFINITIONS[capability];
      const Icon = icons[capability];
      const current = metadata[capability];
      const draft = form[capability];
      const compatible = supportsService(capability, current);
      const hasKey = !!current?.has_credential && compatible;
      const missingSavedVoice = capability === "tts" && hasKey && !current?.params.voice?.trim();
      const edited = dirty.includes(capability);
      const field = (name: string, label: string, placeholder?: string) => <label className="block min-w-0">
        <span className={labelClass}>{label}</span>
        <input className={`${inputClass} font-mono`} value={draft.params[name] ?? ""} placeholder={placeholder} spellCheck={false} autoComplete="off"
          onChange={event => update(capability, { params: { ...draft.params, [name]: event.target.value } })} />
      </label>;
      return <section key={capability} aria-label={definition.title} className="glass-section rounded-lg p-6">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={20} /></div>
          <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-text-strong">{definition.title}{capability === "admission" && <span className="ml-2 text-xs font-normal text-muted"> Optional</span>}</h3><p className="mt-0.5 text-xs leading-5 text-muted">{definition.description}</p></div>
          <span className="flex shrink-0 items-center gap-1.5 pt-1 text-[10px] font-medium text-muted"><span className={`h-2 w-2 rounded-full ${missingSavedVoice ? "bg-amber-400" : hasKey ? "bg-green-400" : "bg-muted/30"}`} />{missingSavedVoice ? "Voice required" : hasKey ? "Configured" : "Key required"}</span>
        </div>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block min-w-0"><span className={labelClass}>Provider</span><select className={inputClass} value={definition.provider} onChange={() => {}}><option value={definition.provider}>{definition.providerName}</option></select></label>
            {capability === "admission" ? field("model", "Model", "jev-latest") : field("resource_id", "Resource ID")}
          </div>
          {capability === "tts" && <>
            <VolcanoVoiceSelect hasCredential={hasKey} resourceId={draft.params.resource_id} value={draft.params.voice} onChange={value => update(capability, { params: { ...draft.params, voice: value } })} />
            {missingSavedVoice && <p className="text-xs leading-5 text-amber-500">Your API key is saved, but lessons have no saved voice. Choose a Voice ID and save it to enable narration.</p>}
          </>}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-dark/50 px-4 py-3">
            <span className="flex items-center gap-2 text-xs text-muted">{hasKey ? <CheckCircle2 size={14} className="shrink-0 text-green-400" /> : <KeyRound size={14} className="shrink-0 text-amber-400" />}{hasKey ? "API key configured" : !compatible ? "Update the previous credential in API Keys" : "Add your own API key to connect"}</span>
            <a href="/settings?tab=api-keys#speech-services" className="text-xs font-medium text-accent hover:underline">{hasKey ? "Manage API key" : "Set up API key"}</a>
          </div>
          <p className="text-xs leading-5 text-muted">{hasKey ? "Connected automatically with your saved API key. Remove the key in API Keys to disconnect." : "Optional. Save your API key to connect; text learning remains available without it."}</p>
        </fieldset>
        <div className="mt-5"><VoiceServiceTest key={JSON.stringify([current?.revision, draft])} capability={capability}
          draft={{ provider: definition.provider, enabled: hasKey, params: draft.params, revision: current?.revision ?? "draft", execution_target: "client" }} disabled={!hasKey || saving || (capability === "tts" && !draft.params.voice.trim())} /></div>
        {edited && <div className="mt-4 space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
          <p role="status" className="text-xs leading-5 text-amber-500">Unsaved changes. Tests preview these edits; lessons still use your saved settings.</p>
          <button type="button" className="inline-flex items-center gap-2 text-xs font-medium text-accent disabled:opacity-30" disabled={saving} onClick={() => void save([capability])}>
            <Save size={14} />{capability === "tts" ? "Save voice for lessons" : "Save these settings"}
          </button>
        </div>}
      </section>;
    })}
    <div className="flex items-start gap-2 rounded-xl bg-surface-dark/50 px-4 py-3 text-xs leading-5 text-muted">
      <Info size={14} className="mt-0.5 shrink-0" /><p>API Keys stores your credentials; Voice controls how they are used. Tests use your own provider account and may incur charges. Tests do not save changes. Browser requests may pass through the server; TV uses direct requests.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void save()} disabled={saving || !dirty.length} aria-live="polite" className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-30 transition">
        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}{saved ? "Saved" : "Save Changes"}
      </button>
      {dirty.length > 0 && <button type="button" onClick={reset} disabled={saving} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:text-text-strong hover:border-accent/30 transition"><RotateCcw size={14} />Reset</button>}
      {error && <p role="alert" className="flex items-center gap-2 text-xs text-red-400"><AlertCircle size={14} className="shrink-0" />{error}</p>}
    </div>
  </div>;
}
