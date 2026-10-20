import { getSelectedProfileId, getToken, request } from "@/api/client";

export type Capability = "asr" | "tts" | "admission";
export type ServiceState = "unconfigured" | "configured_unverified" | "checking" | "ready"
  | "invalid_credentials" | "resource_not_enabled" | "quota_exhausted" | "rate_limited"
  | "network_error" | "environment_unsupported";
export interface ServiceMetadata {
  provider: string;
  enabled: boolean;
  params: Record<string, string>;
  revision: string;
  has_credential: boolean;
  execution_target: "client";
  credential_revision?: string;
  local_credential?: boolean;
  local_storage_error?: boolean;
  account_synced?: boolean;
  account_revision?: string | null;
}
export interface ClientService extends Omit<ServiceMetadata, "has_credential"> { key: string; has_credential?: boolean }
export interface ServiceDraft { provider: string; enabled: boolean; params: Record<string, string>; key?: string }
interface Envelope<T> { profile_id: string; services: Partial<Record<Capability, T>> }
export interface CapabilityStatus { state: ServiceState; detail: string }
let scope = "";
let generation = 0;
let loaded = false;
let lessonConfigured: boolean | undefined;
let snapshots: Partial<Record<Capability, ClientService>> = {};
let states: Partial<Record<Capability, CapabilityStatus>> = {};
let pending: Promise<void> | undefined;
let envelope: Envelope<ServiceMetadata> = { profile_id: "", services: {} };
const PREFIX = "/api/learn/byok";

export function hasServiceCredential(value: ClientService | undefined): boolean {
  return !!value && (!!value.key?.trim() || (!!value.has_credential && (!window.OctosNativeByok || value.local_credential === true)));
}
function nativeResult(raw: string | undefined): void {
  if (!raw || !JSON.parse(raw).ok) throw new Error("无法安全保存本机 Key。请更新 APK 或检查设备存储；不会回退到明文存储。");
}
function reconcile(result: Envelope<ServiceMetadata>): Envelope<ServiceMetadata> {
  const bridge = window.OctosNativeByok;
  if (!bridge) return result;
  nativeResult(bridge.bindScope?.(location.origin, result.profile_id));
  const local = JSON.parse(bridge.reconcile?.(JSON.stringify(result)) ?? "null") as Envelope<ServiceMetadata> | null;
  if (!local?.services || local.profile_id !== result.profile_id) throw new Error("无法读取本机加密 Key，请在这台设备重新录入。");
  return local;
}
const listeners = new Set<() => void>();
const requests = new Map<AbortController, Capability | undefined>();
const identity = () => `${getToken() ?? ""}\0${getSelectedProfileId() ?? ""}`;
const names: Record<Capability, string> = { asr: "语音输入", tts: "旁白", admission: "Jev 输入预判" };
function emit() { listeners.forEach(fn => fn()); }
export function resetClientServices(): void {
  generation++;
  scope = identity();
  loaded = false;
  lessonConfigured = undefined;
  snapshots = {};
  envelope = { profile_id: "", services: {} };
  states = {};
  pending = undefined;
  requests.forEach((_capability, controller) => controller.abort());
  requests.clear();
  window.dispatchEvent(new Event("octos:client-services-reset"));
  // Clear legacy shared credentials, including encrypted Android preferences.
  try { window.OctosNativeTts?.configure?.(JSON.stringify({ version: 1, enabled: false })); } catch { /* old bridge */ }
  try { window.OctosNativeTts?.stop?.(); } catch { /* old bridge */ }
  emit();
}
function invalidateCapability(capability: Capability): void {
  generation++;
  pending = undefined;
  loaded = false;
  delete snapshots[capability];
  delete states[capability];
  requests.forEach((owner, controller) => { if (owner === capability) controller.abort(); });
  window.dispatchEvent(new CustomEvent("octos:client-service-changed", { detail: capability }));
  emit();
}
function ensureIdentity() { if (scope !== identity()) resetClientServices(); }
export function subscribeServices(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function setServiceStatus(capability: Capability, state: ServiceState, detail: string): void {
  ensureIdentity(); states = { ...states, [capability]: { state, detail } }; emit();
}
export function getService(capability: Capability): ClientService | undefined {
  ensureIdentity(); return snapshots[capability];
}
export function getServiceStatus(capability: Capability): CapabilityStatus {
  ensureIdentity();
  return states[capability] ?? { state: "unconfigured", detail: `${names[capability]}尚未配置，请在设置中保存本人服务 Key。` };
}
export function setLessonConfigured(value: boolean): void { ensureIdentity(); lessonConfigured = value; emit(); }
export function getLessonConfigured(): boolean | undefined { ensureIdentity(); return lessonConfigured; }
export function clientServicesLoaded(): boolean { ensureIdentity(); return loaded; }
/** Login / settings lifecycle only. Never call from a per-utterance provider adapter. */
export function prepareClientServices(force = false): Promise<void> {
  ensureIdentity();
  if (!force && loaded) return Promise.resolve();
  if (pending) return pending;
  const owner = scope;
  const version = generation;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const task = request<Envelope<ServiceMetadata>>(`${PREFIX}/prepare`, { method: "POST", signal: controller.signal })
    .then(result => {
      if (owner !== identity() || version !== generation) return;
      const previous = snapshots;
      envelope = reconcile(result);
      snapshots = Object.fromEntries(Object.entries(envelope.services).map(([capability, value]) => [capability, { ...value, key: "" }]));
      loaded = true;
      for (const capability of ["asr", "tts", "admission"] as const) {
        const value = snapshots[capability];
        const old = states[capability];
        if (!value || !hasServiceCredential(value)) {
          states[capability] = { state: "unconfigured", detail: value?.local_storage_error ? "本机加密 Key 无法读取；请在 API Keys 重新录入，账号保存的 Key 不受影响。" : value?.has_credential && window.OctosNativeByok ? "账号已保存 Key；请在这台电视的 API Keys 中录入一次，之后在本机直接调用。" : `${names[capability]}尚未配置，请在设置中保存本人服务 Key。` };
        }
        else {
          // Key presence is the activation intent, including previously saved/off records.
          snapshots[capability] = { ...value, enabled: true };
          if (!old || previous[capability]?.revision !== value.revision) states[capability] = { state: "configured_unverified", detail: "账号已配置，此设备尚未验证。" };
        }
      }
      emit();
    }).finally(() => { clearTimeout(timeout); if (pending === task) pending = undefined; });
  pending = task;
  return task;
}
/** Explicit settings tests can use saved credentials without persisting test parameters. */
export async function getServiceForTest(capability: Capability, signal: AbortSignal, expectedRevision?: string): Promise<ClientService | undefined> {
  const owner = identity();
  const cached = getService(capability);
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  if (cached && (!expectedRevision || cached.revision === expectedRevision)) return cached;
  await prepareClientServices(true);
  if (signal.aborted || owner !== identity()) throw new DOMException("Canceled", "AbortError");
  return getService(capability);
}
export async function listClientServices(): Promise<Envelope<ServiceMetadata>> {
  await prepareClientServices(true);
  return envelope;
}
export async function saveClientService(capability: Capability, draft: ServiceDraft, revision?: string): Promise<ServiceMetadata | undefined> {
  const owner = identity();
  const bridge = window.OctosNativeByok;
  if (bridge) {
    await prepareClientServices();
    if (owner !== identity()) throw new DOMException("Canceled", "AbortError");
    if (draft.key !== undefined) nativeResult(bridge.saveCredential?.(capability, JSON.stringify(draft)));
  }
  const saved = getService(capability);
  const expected = saved?.account_synced === false ? saved.account_revision ?? null : revision ?? null;
  let result: Envelope<ServiceMetadata>;
  try {
    result = await request<Envelope<ServiceMetadata>>(`${PREFIX}/${capability}`, {
      method: "PUT", body: JSON.stringify({ ...draft, expected_revision: expected }),
    });
  } catch (error) {
    if (bridge && draft.key !== undefined && owner === identity()) {
      invalidateCapability(capability);
      await prepareClientServices().catch(() => undefined);
      throw new Error(draft.key.trim() ? "Key 已保存在本机，但账号保存失败。请重试保存以同步到账号。" : "本机 Key 已移除，但账号保存失败。请重试清除账号 Key。", { cause: error });
    }
    throw error;
  }
  if (owner !== identity()) return;
  invalidateCapability(capability);
  await prepareClientServices();
  announceChange(capability);
  return envelope.services[capability] ?? result.services[capability];
}
export async function deleteClientService(capability: Capability, revision: string): Promise<void> {
  const owner = identity();
  if (window.OctosNativeByok) nativeResult(window.OctosNativeByok.removeCredential?.(capability));
  const saved = getService(capability);
  const expected = saved?.account_synced === false ? saved.account_revision ?? null : revision;
  try {
    await request(`${PREFIX}/${capability}`, { method: "DELETE", body: JSON.stringify({ expected_revision: expected }) });
  } catch (error) {
    if (window.OctosNativeByok && owner === identity()) {
      invalidateCapability(capability); await prepareClientServices().catch(() => undefined);
      throw new Error("本机 Key 已移除，但账号删除失败。请重试删除账号 Key。", { cause: error });
    }
    throw error;
  }
  if (owner !== identity()) return;
  invalidateCapability(capability);
  await prepareClientServices();
  announceChange(capability);
}
function announceChange(capability: Capability) {
  try { localStorage.setItem("octos:client-services-revision", JSON.stringify({ capability, profile_id: getSelectedProfileId(), revision: Date.now() })); } catch { /* no secrets */ }
}
/** Abort all provider work when identity/configuration changes. */
export function serviceRequest(signal?: AbortSignal, capability?: Capability): { signal: AbortSignal; dispose: () => void } {
  ensureIdentity();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  requests.set(controller, capability);
  return { signal: controller.signal, dispose: () => { requests.delete(controller); signal?.removeEventListener("abort", abort); } };
}
if (typeof window !== "undefined") {
  window.addEventListener("crew:token_cleared", () => {
    resetClientServices();
    try { nativeResult(window.OctosNativeByok?.clearCredentials?.()); } catch { /* surface on next preparation; never use a previous identity */ }
  });
  window.addEventListener("octos:identity-changed", resetClientServices);
  window.addEventListener("storage", event => {
    if (event.key === "octos:client-services-revision") {
      try {
        const value = JSON.parse(event.newValue ?? "null") as { capability?: Capability; profile_id?: string } | null;
        if (value?.profile_id !== getSelectedProfileId() || !value?.capability || !["asr", "tts", "admission"].includes(value.capability)) return;
        invalidateCapability(value.capability);
        if (getToken()) void prepareClientServices().catch(() => undefined);
      } catch { /* malformed non-secret notification */ }
    } else if (["octos_session_token", "octos_auth_token", "selected_profile"].includes(event.key ?? "")) {
      resetClientServices();
      if (getToken()) void prepareClientServices().catch(() => undefined);
    }
  });
}
