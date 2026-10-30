import { useLocale } from "@/i18n/use-locale";
import { localizedCatalog, tr, translateStatus } from "@/i18n";
import { useEffect, useState } from "react";
import {
  Save,
  Loader2,
  Check,
  RotateCcw,
  Cpu,
  Radio,
  Server,
  KeyRound,
  Volume2,
  ExternalLink,
} from "lucide-react";
import {
  formatSettingsError,
  updateMyProfileConfig,
  type Profile,
} from "./settings-api";
import { LLM_PROVIDERS } from "./llm-providers";
import { SERVICE_CAPABILITIES, SERVICE_DEFINITIONS, serviceParams, supportsService } from "@/byok/service-config";
import { saveClientService, type Capability } from "@/byok/services";
import { useServiceMetadata } from "@/byok/use-service-metadata";
const STORED_KEY = "••••••••";

interface ApiKeysTabProps {
  profile: Profile;
  onProfileUpdated: (p: Profile) => void;
}

interface KeyField {
  key: string; // env var name stored in config.env_vars
  name: string; // human label
  description: string;
}

interface KeyGroup {
  id: string;
  title: string;
  description: string;
  icon: typeof Cpu;
  fields: KeyField[];
}

// One field per provider that takes a single-line API key. JSON-credential
// providers (e.g. Vertex) stay inline in the LLM tab; keyless providers
// (Ollama, custom) have no env key at all.
const LLM_KEY_FIELDS: KeyField[] = LLM_PROVIDERS.filter(
  (p) => p.envKey && p.credentialKind !== "json",
).map((p) => ({
  key: p.envKey,
  name: p.name,
  description: tr("API key for {{v0}} models", { v0: p.name }),
}));

const GROUPS: KeyGroup[] = localizedCatalog([
  {
    id: "llm_providers",
    title: "LLM Providers",
    description:
      "API keys for model providers. The LLM tab binds the selected model to one of these keys.",
    icon: Cpu,
    fields: LLM_KEY_FIELDS,
  },
  {
    id: "channels",
    title: "Channels",
    description: "Credentials for messaging channels and the email tool.",
    icon: Radio,
    fields: [
      {
        key: "TELEGRAM_BOT_TOKEN",
        name: "Telegram Bot Token",
        description: "Bot token from @BotFather",
      },
      {
        key: "LARK_APP_ID",
        name: "Lark App ID",
        description: "Lark suite app ID",
      },
      {
        key: "LARK_APP_SECRET",
        name: "Lark App Secret",
        description: "Lark suite app secret",
      },
      {
        key: "FEISHU_APP_ID",
        name: "Feishu App ID",
        description: "Feishu channel app ID",
      },
      {
        key: "FEISHU_APP_SECRET",
        name: "Feishu App Secret",
        description: "Feishu channel app secret",
      },
      {
        key: "SMTP_PASSWORD",
        name: "SMTP Password",
        description: "Password for the email tool's SMTP account",
      },
    ],
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    description: "Tokens for local infrastructure and tunnels.",
    icon: Server,
    fields: [
      {
        key: "NGROK_AUTHTOKEN",
        name: "ngrok Authtoken",
        description: "Authtoken for ngrok tunnels",
      },
    ],
  },
]);

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields);

// Stored values arrive masked from the server (e.g. "sk-a***xyz"); echoing
// them back on save makes the backend keep the real secret.
function profileToValues(profile: Profile): Record<string, string> {
  const env = profile.config.env_vars ?? {};
  const values: Record<string, string> = {};
  for (const field of ALL_FIELDS) values[field.key] = env[field.key] ?? "";
  return values;
}

function KeyFieldRow({
  field,
  value,
  onChange,
  showIdentifier = true,
  disabled = false,
}: {
  field: KeyField;
  value: string;
  onChange: (val: string) => void;
  showIdentifier?: boolean;
  disabled?: boolean;
}) {
  useLocale();
  const configured = Boolean(value.trim());

  return (
    <div className="rounded-xl bg-surface-container/60 p-4 border border-transparent hover:border-border transition">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-text-strong">{field.name}</h4>
          <p className="text-xs text-muted">{field.description}</p>
          {showIdentifier && <p className="mt-0.5 font-mono text-[11px] text-muted/70">{field.key}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              configured ? "bg-green-400" : "bg-muted/30"
            }`}
          />
          <span className="text-[10px] font-medium text-muted">
            {configured ? tr("Configured") : tr("Not set")}
          </span>
        </div>
      </div>

      <input
        type="password"
        disabled={disabled}
        aria-label={field.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tr("Enter {{v0}}", { v0: field.name })}
        spellCheck={false}
        autoComplete="off"
        className="w-full rounded-xl bg-surface-dark/50 px-4 py-2.5 text-sm text-text placeholder-muted/50 outline-none border border-transparent focus:border-accent/30 transition font-mono"
      />
    </div>
  );
}

export function ApiKeysTab({ profile, onProfileUpdated }: ApiKeysTabProps) {
  useLocale();
  const [values, setValues] = useState<Record<string, string>>(() =>
    profileToValues(profile),
  );
  const [original, setOriginal] = useState<Record<string, string>>(() =>
    profileToValues(profile),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const services = useServiceMetadata();
  useEffect(() => {
    if (window.location.hash === "#speech-services") document.getElementById("speech-services")?.scrollIntoView({ block: "start" });
  }, []);
  const [serviceValues, setServiceValues] = useState<Partial<Record<Capability, string>>>({});
  const originalKey = (capability: Capability) => services.metadata[capability]?.has_credential ? STORED_KEY : "";
  const dirtyServices = SERVICE_CAPABILITIES.filter(capability => serviceValues[capability] !== undefined && serviceValues[capability] !== originalKey(capability));
  const envDirty = ALL_FIELDS.some(
    (f) => (values[f.key] ?? "") !== (original[f.key] ?? ""),
  );

  const isDirty = envDirty || dirtyServices.length > 0;
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // Merge over the existing env vars so unrelated keys (search engines,
    // TTS tokens, free-form vars) survive. Untouched fields still hold their
    // masked value — the backend restores the real secret for those. A
    // cleared field removes the key.
    const mergedEnv: Record<string, string> = { ...profile.config.env_vars };
    for (const field of ALL_FIELDS) {
      const val = (values[field.key] ?? "").trim();
      if (val) {
        mergedEnv[field.key] = val;
      } else {
        delete mergedEnv[field.key];
      }
    }

    try {
      if (envDirty) {
        const result = await updateMyProfileConfig(profile, { env_vars: mergedEnv });
        onProfileUpdated(result);
        const next = profileToValues(result);
        setValues(next);
        setOriginal(next);
      }
      for (const capability of dirtyServices) {
        const current = services.metadata[capability];
        const key = (serviceValues[capability] ?? "").trim();
        const next = await saveClientService(capability, {
          provider: SERVICE_DEFINITIONS[capability].provider,
          enabled: !!key,
          params: serviceParams(capability, current), key,
        }, current?.revision);
        if (!next) throw new Error(tr("Reload {{v0}} before saving again.", { v0: SERVICE_DEFINITIONS[capability].title }));
        services.setMetadata(previous => ({ ...previous, [capability]: next }));
        setServiceValues(previous => { const remaining = { ...previous }; delete remaining[capability]; return remaining; });
      }
      setSaved(true);
    } catch (err) {
      setError(formatSettingsError(err, tr("Failed to save API keys.")));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const next = profileToValues(profile);
    setValues(next);
    setOriginal(next);
    setServiceValues({});
    setError(null);
    setSaved(false);
  };

  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <div key={group.id} className="space-y-6"><div className="glass-section rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-strong">
                  {group.title}
                </h3>
                <p className="text-xs text-muted">{group.description}</p>
              </div>
            </div>

            <div className="space-y-3">
              {group.fields.map((field) => (
                <KeyFieldRow
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ""}
                  disabled={saving}
                  onChange={(val) => { setValues((v) => ({ ...v, [field.key]: val })); setSaved(false); setError(null); }}
                />
              ))}
            </div>
          </div>
          {group.id === "llm_providers" && <section id="speech-services" aria-label={tr("Speech & Learning")} className="glass-section rounded-lg p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Volume2 size={20} /></div>
              <div><h3 className="text-sm font-semibold text-text-strong">{tr("Speech & Learning")}</h3><p className="text-xs text-muted">{tr("Your provider keys for Voice. Configure resources and enable services in the Voice tab.")}</p></div>
            </div>
            {services.loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> {tr("Loading service keys…")}</p>
              : services.error ? <div role="alert" className="text-sm text-red-400">{services.error} <button onClick={services.reload} className="text-accent underline">{tr("Reload services")}</button></div>
              : <div className="space-y-3">{SERVICE_CAPABILITIES.map(capability => {
                const definition = SERVICE_DEFINITIONS[capability];
                const current = services.metadata[capability];
                return <div key={capability}>
                  <KeyFieldRow field={{ key: definition.keyLabel, name: capability === "admission" ? definition.providerName : `${definition.providerName} · ${capability === "tts" ? "TTS" : "ASR"}`, description: definition.description }}
                    value={serviceValues[capability] ?? originalKey(capability)} disabled={saving} showIdentifier={false}
                    onChange={value => { setServiceValues(previous => ({ ...previous, [capability]: value })); setSaved(false); setError(null); }} />
                  {capability !== "admission" && <p className="mt-2 px-1 text-xs leading-5 text-muted">{tr("Use an API Key from the Doubao Speech console. An Ark / LLM API Key or a legacy Access Token cannot be used here. The same Speech Key can be entered for TTS and ASR if both services are enabled in its project.")}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
                    <span>{!supportsService(capability, current) ? tr("Replace the previous credential with a new Volcano API Key.") : current?.local_storage_error ? tr("The encrypted local key could not be read. Enter it again on this TV; your account key has not been removed.") : current?.local_credential === false ? tr("Account key saved. Enter it once on this TV to enable direct calls; keys are not downloaded from the server.") : current?.account_synced === false ? tr("Saved on this TV. Account sync failed; enter and save again to retry.") : tr("Save a key to connect automatically. Leave unchanged to keep. Clear and save to disconnect.")}</span>
                    <a className="inline-flex items-center gap-1 text-accent hover:underline" href={definition.consoleUrl} target="_blank" rel="noreferrer">{tr("Get API Key") + " "}<ExternalLink size={11} /></a>
                  </div>
                </div>;
              })}</div>}
          </section>}
          </div>
        );
      })}

      <div className="flex items-start gap-2 rounded-xl bg-surface-dark/50 px-4 py-3">
        <KeyRound size={14} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-xs text-muted">
          {tr("Keys are stored per profile on the server and never shown in plain text. Saving keeps unchanged keys as-is; clearing a field and saving removes that key.")}</p>
      </div>

      {/* Save actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-30 transition"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <Check size={14} />
          ) : (
            <Save size={14} />
          )}
          {saved ? tr("Saved") : tr("Save Changes")}
        </button>
        {isDirty && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:text-text-strong hover:border-accent/30 transition"
          >
            <RotateCcw size={14} />
            {tr("Reset")}</button>
        )}
        {error && (
          <span role="alert" className="text-xs text-red-400">{translateStatus(error)}</span>
        )}
      </div>
    </div>
  );
}
