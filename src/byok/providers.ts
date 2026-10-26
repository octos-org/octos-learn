import { createRequestId } from "@/lib/request-id";
import { request as apiRequest } from "@/api/client";
import { getService, hasServiceCredential, getServiceStatus, serviceRequest, setServiceStatus, type Capability, type ClientService, type ServiceState } from "./services";

export const ENDPOINTS: Record<Capability, string> = {
  asr: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
  tts: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  admission: "https://api.typesafe.ai/v1/systemone",
};
interface NativeHttp {
  request: (id: string, capability: string, config: string, body: string) => string;
  cancel: (id: string) => void;
  bindScope?: (origin: string, profile: string) => string;
  reconcile?: (metadata: string) => string;
  saveCredential?: (capability: string, config: string) => string;
  removeCredential?: (capability: string) => string;
  clearCredentials?: () => string;
}
declare global { interface Window { OctosNativeByok?: NativeHttp; __octosNativeByokEvent?: (value: string) => void } }
interface NativeResult { id: string; status: number; body: string; code?: string; error?: boolean }
const pending = new Map<string, (value: NativeResult) => void>();
if (typeof window !== "undefined") window.__octosNativeByokEvent = raw => {
  try { const value = JSON.parse(raw) as NativeResult; pending.get(value.id)?.(value); } catch { /* malformed/stale */ }
};
export class ServiceError extends Error {
  readonly state: ServiceState;
  constructor(state: ServiceState, message: string) { super(message); this.state = state; this.name = "ServiceError"; }
}
export function validateService(capability: Capability, config: ClientService): void {
  if (!config.enabled || !hasServiceCredential(config)) throw new ServiceError("unconfigured", config.local_credential === false ? "账号已保存 Key；请在这台电视的 API Keys 中录入一次，以在本机直接调用。" : "请先连接你自己的服务，可继续文字学习。");
  if ((capability === "admission" ? "typesafe" : "volcano") !== config.provider) throw new ServiceError("environment_unsupported", "当前仅支持火山语音和 Jev 供应商，请重新配置。");
  if (capability !== "admission" && ((config.params.auth_mode && config.params.auth_mode !== "api-key") || config.params.app_id)) throw new ServiceError("invalid_credentials", "请改用火山新版 API Key，旧版 App ID / Access Token 不再支持。");
  if (capability !== "admission" && !config.params.resource_id?.trim()) throw new ServiceError("resource_not_enabled", "请填写已开通的资源 ID。");
  if (capability === "tts" && !config.params.voice?.trim()) throw new ServiceError("resource_not_enabled", "尚未保存课程音色。请在 Voice 设置中选择音色并保存，然后重新播放课程。");
}
export function availableService(capability: Capability): boolean {
  const config = getService(capability);
  if (!config) return false;
  try { validateService(capability, config); return true; } catch { return false; }
}
function statusError(status: number, code?: string, capability?: Capability): ServiceError {
  const state = status === 401 ? "invalid_credentials" : status === 403 ? "resource_not_enabled" : status === 429 ? "rate_limited" : "network_error";
  if (status === 401 && capability !== "admission") return new ServiceError(state, "火山语音鉴权未通过（HTTP 401）。请使用豆包语音控制台的 API Key；火山方舟 Ark / 大模型 Key 或旧版 Access Token 不能用于此处。也请确认 Key 未被停用且所属项目已开通所选语音服务。");
  return new ServiceError(state, status === 401 ? "凭据无效，请检查自己的 Key。" : status === 403 ? "资源或音色无权限，请检查供应商账户。" : status === 429 ? "供应商暂时限流，请稍后重试。" : `供应商请求失败（${code && /^\d{7,8}$/.test(code) ? code : status}），请检查网络、资源权限或账户额度。`);
}
export function serviceFailure(capability: Capability, error: unknown, updateState = true): Error {
  if (error instanceof DOMException && error.name === "AbortError") return error;
  const safe = error instanceof ServiceError ? error : new ServiceError("network_error", "连接服务失败，请检查网络和服务器转发是否可用。你的 Key 未被修改。");
  if (updateState) setServiceStatus(capability, safe.state, safe.message);
  return safe;
}
export async function directJson(capability: Capability, config: ClientService, body: unknown, signal?: AbortSignal): Promise<{ body: string; code: string | null }> {
  const request = serviceRequest(signal, capability);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 35_000);
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  try {
    validateService(capability, config);
    if (controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
    const bridge = window.OctosNativeByok;
    if (bridge) {
      const id = createRequestId();
      const value = await new Promise<NativeResult>((resolve, reject) => {
        const cleanup = () => { pending.delete(id); controller.signal.removeEventListener("abort", cancel); };
        const cancel = () => { cleanup(); bridge.cancel(id); reject(new DOMException("请求已取消", "AbortError")); };
        pending.set(id, result => { cleanup(); resolve(result); });
        controller.signal.addEventListener("abort", cancel, { once: true });
        try {
          const result = JSON.parse(bridge.request(id, capability, JSON.stringify({ provider: config.provider, params: config.params, credential_revision: config.credential_revision, ...(config.key ? { key: config.key } : {}) }), JSON.stringify(body))) as { ok: boolean };
          if (!result.ok) { cleanup(); reject(new ServiceError("network_error", "原生服务请求无法启动。")); }
        } catch { cleanup(); reject(new ServiceError("network_error", "原生服务请求无法启动。")); }
      });
      if (value.error) throw new ServiceError("network_error", "供应商连接失败或超时。");
      if (value.status < 200 || value.status >= 300) throw statusError(value.status, value.code, capability);
      return { body: value.body, code: value.code ?? null };
    }
    // Credential-free preflights (2026-10-19) reject the required headers/origin
    // for all three current browser endpoints. Select the authenticated relay
    // immediately instead of failing/retrying a potentially billable POST.
    const response = await apiRequest<{ status: number; body: string; code: string | null }>(`/api/learn/byok/${capability}/relay`, {
      method: "POST", signal: controller.signal,
      body: JSON.stringify({ provider: config.provider, params: config.params, ...(config.key ? { key: config.key } : { expected_revision: config.revision }), payload: body }),
    });
    if (controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
    if (response.status < 200 || response.status >= 300) throw statusError(response.status, response.code ?? undefined, capability);
    return { body: response.body, code: response.code };
  } catch (error) {
    if (timedOut) throw new ServiceError("network_error", "供应商连接超时，请重试或检查网络。");
    throw error;
  } finally { clearTimeout(timeout); request.signal.removeEventListener("abort", abort); request.dispose(); }
}
export function requiredService(capability: Capability): ClientService {
  const value = getService(capability);
  if (!value) throw new ServiceError("unconfigured", getServiceStatus(capability).detail);
  return value;
}
export function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), c => c.charCodeAt(0));
}
export function markVerified(capability: Capability, config: ClientService): void {
  const current = getService(capability);
  if (!current || current.revision !== config.revision || current.key !== config.key || current.provider !== config.provider) return;
  const fields = new Set([...Object.keys(current.params), ...Object.keys(config.params)]);
  if ([...fields].some(field => current.params[field] !== config.params[field])) return;
  setServiceStatus(capability, "ready", "已成功调用本人服务。");
}
// Narration voices of the teacher who started the current lesson, keyed by
// speech resource. Voice tests (drafts) always use the voice being tested.
let lessonVoices: Readonly<Record<string, { id: string }>> | null = null;
const refusedLessonVoices = new Set<string>();
export function setLessonVoices(voices: Readonly<Record<string, { id: string }>> | null): void { lessonVoices = voices; }
class SpeakerRefused extends ServiceError {}
async function synthesizeWith(text: string, config: ClientService, speaker: string, signal?: AbortSignal): Promise<Blob> {
  const response = await directJson("tts", config, { user: { uid: "byok-client" }, req_params: { text, speaker, audio_params: { format: "mp3", sample_rate: 24000 } } }, signal);
  const audio: Uint8Array<ArrayBuffer>[] = [];
  for (const line of response.body.split(/\r?\n/).filter(s => s.trim())) {
    const chunk = JSON.parse(line) as { code: number; data?: string };
    if (chunk.code !== 0 && chunk.code !== 20000000) throw new SpeakerRefused("network_error", statusError(502, String(chunk.code)).message);
    if (chunk.data) audio.push(base64Bytes(chunk.data));
  }
  if (!audio.length) throw new ServiceError("network_error", "供应商未返回可播放音频。");
  return new Blob(audio, { type: "audio/mpeg" });
}
export async function synthesizeDirect(text: string, signal?: AbortSignal, draft?: ClientService): Promise<Blob> {
  try {
    const config = draft ?? requiredService("tts");
    const listed = draft ? undefined : lessonVoices?.[config.params.resource_id?.trim() ?? ""]?.id;
    const teacherVoice = listed && listed !== config.params.voice && !refusedLessonVoices.has(listed) ? listed : undefined;
    let audio: Blob;
    if (teacherVoice) {
      try { audio = await synthesizeWith(text, config, teacherVoice, signal); }
      catch (error) {
        // An account without access to the teacher's standard voice keeps
        // narrating with the learner's saved voice for the rest of the page.
        if (!(error instanceof SpeakerRefused || (error instanceof ServiceError && error.state === "resource_not_enabled"))) throw error;
        refusedLessonVoices.add(teacherVoice);
        audio = await synthesizeWith(text, config, config.params.voice, signal);
      }
    } else audio = await synthesizeWith(text, config, config.params.voice, signal);
    markVerified("tts", config);
    return audio;
  } catch (error) { throw serviceFailure("tts", error, !draft); }
}
/** One line in a teacher's own narration voice, for the teachers page. Uses
 * the learner's saved speech service; an account without access to that
 * voice hears the line in its own saved voice instead. */
export async function synthesizeTeacherSample(text: string, voices: Readonly<Record<string, { id: string }>>, signal?: AbortSignal): Promise<Blob> {
  try {
    const config = requiredService("tts");
    const listed = voices[config.params.resource_id?.trim() ?? ""]?.id;
    if (listed && listed !== config.params.voice && !refusedLessonVoices.has(listed)) {
      try { return await synthesizeWith(text, config, listed, signal); }
      catch (error) {
        if (!(error instanceof SpeakerRefused || (error instanceof ServiceError && error.state === "resource_not_enabled"))) throw error;
        refusedLessonVoices.add(listed);
      }
    }
    return await synthesizeWith(text, config, config.params.voice, signal);
  } catch (error) { throw serviceFailure("tts", error, false); }
}
export async function transcribeDirect(wav: Blob, signal: AbortSignal, draft?: ClientService): Promise<{ status: "speech" | "no_speech"; transcript: string }> {
  const owned = serviceRequest(signal, "asr");
  signal = owned.signal;
  try {
    if (signal.aborted) throw new DOMException("请求已取消", "AbortError");
    if (wav.size > 5_760_044) throw new ServiceError("network_error", "语音过长，请分成短句。");
    const config = draft ?? requiredService("asr");
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("读取失败")); reader.readAsDataURL(wav); });
    const response = await directJson("asr", config, { user: { uid: "byok-client" }, audio: { data }, request: { model_name: "bigmodel", enable_itn: true, enable_punc: true } }, signal);
    if (response.code === "20000003") return { status: "no_speech", transcript: "" };
    if (response.code !== "20000000") throw statusError(502, response.code ?? undefined);
    const result = JSON.parse(response.body) as { result?: { text?: unknown } };
    if (typeof result.result?.text !== "string") throw new ServiceError("network_error", "供应商返回无效识别结果。");
    markVerified("asr", config);
    return { status: result.result.text.trim() ? "speech" : "no_speech", transcript: result.result.text.trim() };
  } catch (error) { throw serviceFailure("asr", error, !draft); }
  finally { owned.dispose(); }
}
