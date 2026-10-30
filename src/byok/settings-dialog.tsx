import { useLocale } from "@/i18n/use-locale";
import { tr, translateStatus } from "@/i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { getMyProfile, type Profile } from "@/settings/settings-api";
import type { Capability } from "./services";
const Services = lazy(() => import("./service-settings").then(module => ({ default: module.ServiceSettings })));
const Model = lazy(() => import("@/settings/llm-tab").then(module => ({ default: module.LlmTab })));
export function CapabilitySettingsDialog() {
  useLocale();
  const [capability, setCapability] = useState<Capability | "lesson" | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (!["asr", "tts", "admission", "lesson"].includes(value)) return;
      previousFocus.current = document.activeElement as HTMLElement;
      setError(""); setCapability(value);
    };
    const reset = () => { dialog.current?.close(); setCapability(null); setProfile(null); };
    window.addEventListener("octos:configure-service", open);
    window.addEventListener("crew:token_cleared", reset);
    window.addEventListener("octos:identity-changed", reset);
    return () => { window.removeEventListener("octos:configure-service", open); window.removeEventListener("crew:token_cleared", reset); window.removeEventListener("octos:identity-changed", reset); };
  }, []);
  useEffect(() => {
    if (!capability) return;
    dialog.current?.showModal();
    let active = true;
    if (capability === "lesson") void getMyProfile().then(value => { if (active) setProfile(value); }).catch(() => { if (active) setError(tr("未能读取模型配置，请稍后重试。")); });
    return () => { active = false; };
  }, [capability]);
  function close() { dialog.current?.close(); setCapability(null); previousFocus.current?.focus(); window.dispatchEvent(new Event("octos:settings-closed")); }
  if (!capability) return null;
  return <dialog ref={dialog} aria-label={tr("连接自己的服务")} onCancel={event => { event.preventDefault(); close(); }} style={{ position: "fixed", inset: "4vh 4vw", margin: "auto", width: "min(680px, 92vw)", maxHeight: "92vh", overflow: "auto", padding: 24, borderRadius: 20, background: "var(--color-surface, white)", color: "var(--color-text, #222)", zIndex: 10000 }}>
    <button autoFocus onClick={close}>{tr("返回白板")}</button>
    <p>{tr("当前问题、选区和课程会保留。保存后返回白板，再主动继续；不会自动生成课程或开启麦克风。")}</p>
    {error && <p role="alert">{translateStatus(error)}</p>}
    <Suspense fallback={<p>{tr("正在打开配置…")}</p>}>
      {capability === "lesson" ? profile && <Model profile={profile} onProfileUpdated={setProfile} /> : <Services only={capability} />}
    </Suspense>
  </dialog>;
}
