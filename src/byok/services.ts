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
}
export interface ClientService extends Omit<ServiceMetadata, "has_credential"> { key: string }
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
  return states[capability] ?? { state: "unconfigured", detail: `${names[capability]}尚未启用，可在设置中连接本人服务或启用已保存配置。` };
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
  const task = request<Envelope<ClientService>>("/api/my/client-services/sync", { method: "POST", signal: controller.signal })
    .then(result => {
      if (owner !== identity() || version !== generation) return;
      const previous = snapshots;
      snapshots = result.services;
      loaded = true;
      for (const capability of ["asr", "tts", "admission"] as const) {
        const value = snapshots[capability];
        const old = states[capability];
        if (!value?.key || !value.enabled) { delete snapshots[capability]; delete states[capability]; }
        else if (!old || previous[capability]?.revision !== value.revision) states[capability] = { state: "configured_unverified", detail: "账号已配置，此设备尚未验证。" };
      }
      emit();
    }).finally(() => { clearTimeout(timeout); if (pending === task) pending = undefined; });
  pending = task;
  return task;
}
export function listClientServices(): Promise<Envelope<ServiceMetadata>> {
  return request("/api/my/client-services");
}
export async function saveClientService(capability: Capability, draft: ServiceDraft, revision?: string): Promise<void> {
  const owner = identity();
  await request(`/api/my/client-services/${capability}`, {
    method: "PUT", body: JSON.stringify({ ...draft, expected_revision: revision ?? null }),
  });
  if (owner !== identity()) return;
  invalidateCapability(capability);
  await prepareClientServices();
  announceChange(capability);
}
export async function deleteClientService(capability: Capability, revision: string): Promise<void> {
  const owner = identity();
  await request(`/api/my/client-services/${capability}`, { method: "DELETE", body: JSON.stringify({ expected_revision: revision }) });
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
  window.addEventListener("crew:token_cleared", resetClientServices);
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
