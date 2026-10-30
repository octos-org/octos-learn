import { useLocale } from "@/i18n/use-locale";
import { localizedCatalog, tr, translateStatus } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { listClientServices, prepareClientServices, getService, getServiceStatus, subscribeServices, saveClientService, deleteClientService, type Capability, type ClientService, type ServiceMetadata } from "./services";
import { directJson, serviceFailure, synthesizeDirect, transcribeDirect, validateService } from "./providers";
import { playAudioBlob, unlockAudio } from "@/home/voice/audio-playback";
import { useTestVoiceCapture } from "@/home/voice/use-test-voice-capture";
import { SERVICE_DEFINITIONS } from "./service-config";

const titles: Record<Capability, string> = localizedCatalog({ tts: "听讲解", asr: "语音输入", admission: "输入预判（Jev，可选）" });
const inputClass = "w-full rounded-xl bg-surface-container px-4 py-3 text-sm text-text border border-border";
export function ServiceSettings({ only, compact = false }: { only?: Capability; compact?: boolean }) {
  useLocale();
  const [metadata, setMetadata] = useState<Partial<Record<Capability, ServiceMetadata>>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = () => { setLoading(true); setRevision(n => n + 1); };
  useEffect(() => {
    let active = true;
    void Promise.all([listClientServices(), prepareClientServices(true)]).then(([result]) => {
      if (active) { setMetadata(result.services); setError(""); }
    }).catch(() => { if (active) setError(tr("未能读取账号服务配置。请检查产品语音服务并重试；不会使用平台凭据。")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  return <div className="space-y-5">
    <p>{tr("所有 AI 调用使用你自己的 Key，费用由供应商账户承担。电视直连供应商；网页直连受限时经服务器转发，仍使用你自己的 Key。可跳过，继续白板和已有课程。")}</p>
    {loading && <p role="status">{tr("正在读取账号配置…")}</p>}
    {error ? <p role="alert">{translateStatus(error)} <button onClick={reload}>{tr("重新读取")}</button></p> : !loading && (only ? [only] : ["tts", "asr", "admission"] as const).map(capability => <ServiceCard key={`${capability}:${metadata[capability]?.revision ?? "empty"}`} capability={capability} collapsed={compact || (!only && capability === "admission")} saved={metadata[capability]} onSaved={reload} />)}
  </div>;
}
function ServiceCard({ capability, collapsed, saved, onSaved }: { capability: Capability; collapsed: boolean; saved?: ServiceMetadata; onSaved: () => void }) {
  useLocale();
  const provider = capability === "admission" ? "typesafe" : "volcano";
  const needsNewKey = !!saved && (saved.provider !== provider || (capability !== "admission" && (saved.params.auth_mode === "legacy" || !!saved.params.app_id)));
  const defaults: Record<string, string> = capability === "admission" ? { model: "jev-latest" }
    : { auth_mode: "api-key", resource_id: capability === "tts" ? "seed-tts-2.0" : "volc.bigasr.auc_turbo", ...(capability === "tts" ? { voice: "" } : {}) };
  const [params, setParams] = useState(() => Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name,
    name === "auth_mode" ? "api-key" : saved?.provider === provider ? saved.params[name] ?? value : value,
  ])));
  const [key, setKey] = useState("");
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
    return { ...(saved?.provider === provider && !needsNewKey ? getService(capability) : undefined), provider, enabled: true, params, revision: saved?.revision ?? "draft", execution_target: "client", key: key.trim() || (saved?.provider === provider && !needsNewKey ? getService(capability)?.key ?? "" : "") };
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      if (needsNewKey && !key.trim()) { setMessage(tr("请填写火山新版 API Key，旧凭据不能继续使用。")); return; }
      await saveClientService(capability, { provider, enabled: !!key.trim() || !!saved?.has_credential, params, key: key.trim() || (needsNewKey ? "" : undefined) }, saved?.revision);
      setKey(""); setMessage(tr("已保存；是否可用以当前设备真实测试为准。")); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : tr("保存失败，请重试；输入仍保留。")); }
    finally { setBusy(false); }
  }
  async function test() {
    unlockAudio(); setBusy(true); setMessage(""); setAudio(null);
    const abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    try {
      const config = draft();
      validateService(capability, config);
      if (capability === "tts") {
        const blob = await synthesizeDirect(tr("这是你的课堂旁白。"), abort.signal, config);
        setAudio(blob);
        const played = await playAudioBlob(blob, () => {}, abort.signal);
        setMessage(played ? tr("当前设备已合成并播放。测试不会保存或覆盖账号配置。") : tr("音频已生成，点击播放即可；不会再次计费合成。"));
      } else if (capability === "admission") {
        const response = await directJson("admission", config, { model: params.model || "jev-latest", state: tr("学习勾股定理"), questions: { learning: { type: "noul", instructions: tr("这是一项学习请求。") } } }, abort.signal);
        const data = JSON.parse(response.body) as { answers?: { learning?: { noul?: number } } };
        if (typeof data.answers?.learning?.noul !== "number") throw new Error("Invalid response");
        setMessage(tr("已成功调用 Jev。测试不会保存或覆盖账号配置。"));
      }
    } catch (error) { setMessage(serviceFailure(capability, error, false).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!saved) return;
    setBusy(true); controller.current?.abort();
    try { await deleteClientService(capability, saved.revision); setKey(""); onSaved(); }
    catch { setMessage(tr("删除失败，请重新读取后重试。")); }
    finally { setBusy(false); }
  }
  const field = (name: string, label: string) => <label className="block space-y-2" key={name}>{label}<input className={inputClass} value={params[name] ?? ""} onChange={event => { setParams(value => ({ ...value, [name]: event.target.value })); setMessage(""); setAudio(null); }} autoComplete="off" spellCheck={false} /></label>;
  const content = <div className="space-y-4">
    <p>{capability === "admission" ? tr("帮助过滤无关口语、判断是否需要补充问题。保存 Key 后自动使用；未配置或不可用时跳过，其他能力照常工作。") : tr("保存 Key 后自动使用；未配置时仍可继续文字学习。")}</p>
    <p>{tr("供应商：")}{capability === "admission" ? "TypeSafe Jev" : tr("火山引擎 · 新版 API Key")}</p>
    <p>{window.OctosNativeByok ? tr("本机通过原生网络直连供应商。") : tr("当前网页接口不支持所需跨域调用，将经服务器转发；语音录音和 Jev 输入会经过服务器。")}</p>
    {needsNewKey && <p role="alert">{tr("原供应商或旧版鉴权已不再支持，请填写火山新版 API Key 后保存。")}</p>}
    {provider === "volcano" && <>{field("resource_id", tr("已开通的资源 ID"))}{capability === "tts" && field("voice", tr("与资源匹配的音色 ID"))}</>}
    {provider === "typesafe" && field("model", tr("Jev 模型"))}
    <label className="block space-y-2">API Key<input className={inputClass} type="password" autoComplete="new-password" spellCheck={false} value={key} onChange={event => setKey(event.target.value)} placeholder={saved?.has_credential && saved.provider === provider && !needsNewKey ? tr("本人凭据已保存；留空保留") : tr("粘贴你自己的 Key")} /></label>
    {provider === "volcano" && <p>{tr("请使用豆包语音控制台的新版 API Key；火山方舟 Ark / 大模型 Key 和旧版 Access Token 不能用于语音服务。")}</p>}
    <p>{tr("凭据保存在本人 Octos 账号。电视需在本机录入一次并加密保存，退出登录会清除；网页通过服务器使用已保存的 Key。")}<a href={SERVICE_DEFINITIONS[capability].consoleUrl} target="_blank" rel="noreferrer">{tr("打开供应商控制台")}</a></p>
    <p role="status">{saved?.local_credential === false ? tr("账号已保存 Key，请在这台电视录入一次以直接调用。") : saved?.account_synced === false ? tr("Key 已保存在本机，但账号尚未同步成功，请重试保存。") : saved?.has_credential && !needsNewKey ? tr("本人 Key 已保存，服务已连接；无需额外启用。") : status.detail}</p>
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={() => void save()}>{tr("保存配置")}</button>
      {capability !== "asr" && <button disabled={busy} onClick={() => void test()}>{busy ? tr("测试中…") : capability === "tts" ? tr("测试草稿并试听") : tr("测试 Jev 草稿")}</button>}
      {saved && <button disabled={busy} onClick={() => void remove()}>{tr("从账号删除")}</button>}
      {audio && <button onClick={() => { unlockAudio(); void playAudioBlob(audio, () => {}); }}>{tr("播放已生成音频")}</button>}
    </div>
    {capability === "asr" && <AsrTest config={draft} onMessage={setMessage} />}
    <p>{tr("测试会调用你自己的供应商，可能产生少量用量。测试成功不自动保存草稿。")}</p>
    {message && <p role="status">{translateStatus(message)}</p>}
  </div>;
  return <section className="glass-section rounded-lg p-6 space-y-4" aria-label={titles[capability]}>
    <h3>{titles[capability]}</h3>
    {collapsed ? <details><summary>{tr("展开可选配置")}</summary>{content}</details> : content}
  </section>;
}
function AsrTest({ config, onMessage }: { config: () => ClientService; onMessage: (text: string) => void }) {
  useLocale();
  const capture = useTestVoiceCapture();
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
    onMessage(tr("正在准备麦克风；请说一小句，识别后停止。录音将发往火山引擎；网页直连受限时会经过服务器转发。"));
    let claimed = false;
    const ok = await capture.start(wav => {
      if (claimed || controller.signal.aborted) return; claimed = true;
      clearTimeout(timer.current); void capture.stop();
      onMessage(tr("正在识别…"));
      void transcribeDirect(wav, controller.signal, draft).then(result => {
        if (!controller.signal.aborted) onMessage(result.transcript || tr("未检测到语音，请重试。"));
      }).catch(error => { if (!controller.signal.aborted) onMessage(serviceFailure("asr", error, false).message); })
        .finally(() => { if (active.current === controller) { active.current = null; setWorking(false); } });
    });
    if (controller.signal.aborted) { await capture.stop(); return; }
    if (!ok) { setWorking(false); active.current = null; onMessage(capture.getError?.() || tr("麦克风初始化失败，请检查录音组件和设备权限；配置草稿已保留。")); return; }
    if (claimed) return;
    onMessage(capture.manualAvailable ? tr("麦克风已开启，请说话；停顿后自动识别，也可以点击结束录音并识别。") : tr("麦克风已开启，请说一小句，停顿后自动识别。"));
    timer.current = setTimeout(() => {
      const input = capture.getInputState(); void stop();
      onMessage(!capture.manualAvailable ? tr("未收到完整语音片段，请检查设备输入后重试。") : input.samples === 0 ? tr("录音组件没有收到麦克风音频，请检查浏览器选中的输入设备。") : input.peak < 0.001 ? tr("麦克风输入无声或音量过低，请检查选中的输入设备并靠近麦克风。") : tr("尚未检测到一句话结束；未发送识别请求。请重试，说话后点击结束录音并识别。"));
    }, 20_000);
  }
  return <div>
    <button onClick={() => void (working ? stop() : start())}>{working ? tr("取消测试") : tr("录一小句测试草稿")}</button>
    {working && capture.capturing && capture.manualAvailable && <div>
      <label>{tr("麦克风输入电平") + " "}<meter min={0} max={1} value={capture.inputLevel} /></label>
      <button disabled={!capture.canFinish} onClick={capture.finish}>{tr("结束录音并识别")}</button>
    </div>}
    {capture.error && <p role="alert">{capture.error}</p>}
  </div>;
}
