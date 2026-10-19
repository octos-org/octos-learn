import { useEffect, useRef, useState } from "react";
import { listClientServices, prepareClientServices, getService, getServiceStatus, subscribeServices, saveClientService, deleteClientService, type Capability, type ClientService, type ServiceMetadata } from "./services";
import { directJson, serviceFailure, synthesizeDirect, transcribeDirect, validateService } from "./providers";
import { playAudioBlob, unlockAudio } from "@/home/voice/audio-playback";
import { useVoiceCapture } from "@/home/voice/use-voice-capture";

const titles: Record<Capability, string> = { tts: "听讲解", asr: "语音输入", admission: "输入预判（Jev，可选）" };
const inputClass = "w-full rounded-xl bg-surface-container px-4 py-3 text-sm text-text border border-border";
export function ServiceSettings({ only, compact = false }: { only?: Capability; compact?: boolean }) {
  const [metadata, setMetadata] = useState<Partial<Record<Capability, ServiceMetadata>>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = () => { setLoading(true); setRevision(n => n + 1); };
  useEffect(() => {
    let active = true;
    void Promise.all([listClientServices(), prepareClientServices(true)]).then(([result]) => {
      if (active) { setMetadata(result.services); setError(""); }
    }).catch(() => { if (active) setError("未能读取账号服务配置。请确认 Octos 已升级并重试；不会使用平台凭据。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  return <div className="space-y-5">
    <p>所有 AI 调用使用你自己的 Key，费用由供应商账户承担。ASR、TTS、Jev 由当前设备直连，Octos 只管理并同步配置。可跳过，继续白板和已有课程。</p>
    {loading && <p role="status">正在读取账号配置…</p>}
    {error ? <p role="alert">{error} <button onClick={reload}>重新读取</button></p> : !loading && (only ? [only] : ["tts", "asr", "admission"] as const).map(capability => <ServiceCard key={`${capability}:${metadata[capability]?.revision ?? "empty"}`} capability={capability} collapsed={compact || (!only && capability === "admission")} saved={metadata[capability]} onSaved={reload} />)}
  </div>;
}
function ServiceCard({ capability, collapsed, saved, onSaved }: { capability: Capability; collapsed: boolean; saved?: ServiceMetadata; onSaved: () => void }) {
  const [provider, setProvider] = useState(saved?.provider ?? (capability === "admission" ? "typesafe" : window.OctosNativeByok ? "volcano" : "azure"));
  const defaults = (id: string): Record<string, string> => id === "azure" ? { region: "eastasia", voice: "zh-CN-XiaoxiaoNeural", language: "zh-CN" }
    : id === "typesafe" ? { model: "jev-latest" } : { auth_mode: "api-key", app_id: "", resource_id: capability === "tts" ? "seed-tts-2.0" : "volc.bigasr.auc_turbo", voice: "" };
  const [params, setParams] = useState(saved?.params ?? defaults(provider));
  const [key, setKey] = useState("");
  const [enabled, setEnabled] = useState(saved?.enabled ?? capability !== "admission");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [status, setStatus] = useState(() => getServiceStatus(capability));
  useEffect(() => subscribeServices(() => setStatus(getServiceStatus(capability))), [capability]);
  useEffect(() => {
    const reset = (event: Event) => {
      if (event.type === "octos:client-service-changed" && (event as CustomEvent).detail !== capability) return;
      controller.current?.abort(); setAudio(null);
    };
    window.addEventListener("octos:client-services-reset", reset);
    window.addEventListener("octos:client-service-changed", reset);
    return () => { controller.current?.abort(); window.removeEventListener("octos:client-services-reset", reset); window.removeEventListener("octos:client-service-changed", reset); };
  }, [capability]);
  function draft(): ClientService {
    return { provider, enabled: true, params, revision: saved?.revision ?? "draft", execution_target: "client", key: key.trim() || (saved?.provider === provider ? getService(capability)?.key ?? "" : "") };
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      await saveClientService(capability, { provider, enabled, params, key: key.trim() || undefined }, saved?.revision);
      setKey(""); setMessage("已保存；是否可用以当前设备真实测试为准。"); onSaved();
    } catch { setMessage("保存失败，请重新读取配置后重试；输入仍保留。不能用平台 Key 代替。"); }
    finally { setBusy(false); }
  }
  async function test() {
    unlockAudio(); setBusy(true); setMessage(""); setAudio(null);
    const abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    try {
      const config = draft();
      validateService(capability, config);
      if (capability === "tts") {
        const blob = await synthesizeDirect("这是你的课堂旁白。", abort.signal, config);
        setAudio(blob);
        const played = await playAudioBlob(blob, () => {}, abort.signal);
        setMessage(played ? "当前设备已合成并播放。测试不会保存或覆盖账号配置。" : "音频已生成，点击播放即可；不会再次计费合成。");
      } else if (capability === "admission") {
        const response = await directJson("admission", config, { model: params.model || "jev-latest", state: "学习勾股定理", questions: { learning: { type: "noul", instructions: "这是一项学习请求。" } } }, abort.signal);
        const data = JSON.parse(response.body) as { answers?: { learning?: { noul?: number } } };
        if (typeof data.answers?.learning?.noul !== "number") throw new Error("Invalid response");
        setMessage("当前设备已直连 Jev。测试不会保存或覆盖账号配置。");
      }
    } catch (error) { setMessage(serviceFailure(capability, error, false).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!saved) return;
    setBusy(true); controller.current?.abort();
    try { await deleteClientService(capability, saved.revision); setKey(""); onSaved(); }
    catch { setMessage("删除失败，请重新读取后重试。"); }
    finally { setBusy(false); }
  }
  const field = (name: string, label: string) => <label className="block space-y-2" key={name}>{label}<input className={inputClass} value={params[name] ?? ""} onChange={event => { setParams(value => ({ ...value, [name]: event.target.value })); setMessage(""); setAudio(null); }} autoComplete="off" spellCheck={false} /></label>;
  const content = <div className="space-y-4">
    <p>{capability === "admission" ? "帮助过滤无关口语、判断是否需要补充问题。未配置、关闭或不可用时跳过，其他能力照常工作。" : "可选；未配置时仍可继续文字学习。"}</p>
    <label className="block space-y-2">供应商<select className={inputClass} value={provider} onChange={event => { setProvider(event.target.value); setParams(defaults(event.target.value)); setKey(""); setMessage(""); setAudio(null); }}>
      {capability === "admission" ? <option value="typesafe">TypeSafe Jev</option> : <><option value="azure">Azure Speech</option><option value="volcano">火山语音（电视原生直连；网页受鉴权兼容限制）</option></>}
    </select></label>
    {provider === "azure" && <>{field("region", "Azure 资源区域（如 eastasia）")}{capability === "tts" ? field("voice", "Azure 音色 ID") : field("language", "识别语言（如 zh-CN）")}</>}
    {provider === "volcano" && <>
      <label className="block space-y-2">鉴权方式<select className={inputClass} value={params.auth_mode} onChange={event => setParams(value => ({ ...value, auth_mode: event.target.value }))}><option value="api-key">新版 API Key</option><option value="legacy">旧版 App ID + Access Key</option></select></label>
      {params.auth_mode === "legacy" && field("app_id", "App ID")}{field("resource_id", "已开通的资源 ID")}{capability === "tts" && field("voice", "与资源匹配的音色 ID")}
    </>}
    {provider === "typesafe" && field("model", "Jev 模型")}
    <label className="block space-y-2">{provider === "volcano" && params.auth_mode === "legacy" ? "Access Key" : "API Key"}<input className={inputClass} type="password" autoComplete="new-password" spellCheck={false} value={key} onChange={event => setKey(event.target.value)} placeholder={saved?.has_credential && saved.provider === provider ? "本人凭据已保存；留空保留" : "粘贴你自己的 Key"} /></label>
    <p>凭据保存在 Octos 账号中，按用途同步到本人设备；退出会清理本机会话缓存。<a href={provider === "azure" ? "https://portal.azure.com/" : provider === "volcano" ? "https://console.volcengine.com/speech/app" : "https://console.typesafe.ai/settings/keys"} target="_blank" rel="noreferrer">打开供应商控制台</a></p>
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> 启用此能力</label>
    <p role="status">{saved && !saved.enabled ? "账号已保存，当前已停用。" : status.detail}</p>
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={() => void save()}>保存配置</button>
      {capability !== "asr" && <button disabled={busy} onClick={() => void test()}>{busy ? "测试中…" : capability === "tts" ? "测试草稿并试听" : "测试 Jev 草稿"}</button>}
      {saved && <button disabled={busy} onClick={() => void remove()}>从账号删除</button>}
      {audio && <button onClick={() => { unlockAudio(); void playAudioBlob(audio, () => {}); }}>播放已生成音频</button>}
    </div>
    {capability === "asr" && <AsrTest config={draft} onMessage={setMessage} />}
    <p>测试会调用你自己的供应商，可能产生少量用量。测试成功不自动保存草稿。</p>
    {message && <p role="status">{message}</p>}
  </div>;
  return <section className="glass-section rounded-lg p-6 space-y-4" aria-label={titles[capability]}>
    <h3>{titles[capability]}</h3>
    {collapsed ? <details><summary>展开可选配置</summary>{content}</details> : content}
  </section>;
}
function AsrTest({ config, onMessage }: { config: () => ClientService; onMessage: (text: string) => void }) {
  const capture = useVoiceCapture();
  const active = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const stop = async () => { clearTimeout(timer.current); active.current?.abort(); active.current = null; await capture.stop(); setWorking(false); };
  const stopCapture = capture.stop;
  useEffect(() => {
    const reset = (event: Event) => {
      if (event.type === "octos:client-service-changed" && (event as CustomEvent).detail !== "asr") return;
      clearTimeout(timer.current); active.current?.abort(); active.current = null; void stopCapture(); setWorking(false);
    };
    window.addEventListener("octos:client-services-reset", reset);
    window.addEventListener("octos:client-service-changed", reset);
    return () => { clearTimeout(timer.current); active.current?.abort(); void stopCapture(); window.removeEventListener("octos:client-services-reset", reset); window.removeEventListener("octos:client-service-changed", reset); };
  }, [stopCapture]);
  async function start() {
    const draft = config();
    try { validateService("asr", draft); } catch (error) { onMessage(serviceFailure("asr", error, false).message); return; }
    const controller = new AbortController(); active.current = controller; setWorking(true);
    onMessage("正在准备麦克风；请说一小句，识别后停止。录音只发往你选择的供应商。");
    let claimed = false;
    const ok = await capture.start(wav => {
      if (claimed || controller.signal.aborted) return; claimed = true;
      clearTimeout(timer.current); void capture.stop();
      void transcribeDirect(wav, controller.signal, draft).then(result => {
        if (!controller.signal.aborted) onMessage(result.transcript || "未检测到语音，请重试。");
      }).catch(error => { if (!controller.signal.aborted) onMessage(serviceFailure("asr", error, false).message); })
        .finally(() => { if (active.current === controller) { active.current = null; setWorking(false); } });
    });
    if (controller.signal.aborted) { await capture.stop(); return; }
    if (!ok) { setWorking(false); active.current = null; onMessage("麦克风不可用，请检查设备权限；配置草稿已保留。"); return; }
    timer.current = setTimeout(() => { void stop(); onMessage("测试录音已停止，可重试或继续打字。"); }, 20_000);
  }
  return <div><button onClick={() => void (working ? stop() : start())}>{working ? "停止测试" : "录一小句测试草稿"}</button>{capture.error && <p role="alert">{capture.error}</p>}</div>;
}
