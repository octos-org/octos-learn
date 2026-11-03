import { useEffect, useRef, useState } from "react";
import { tr } from "@/i18n";
import type { FaceFrame } from "./face-frame";
import { drawIllustratedFox, ILLUSTRATED_FOX_ASSET } from "./illustrated-fox";
import "./illustrated-avatar.css";

export function IllustratedAvatarStage({ frame, active, idleMotion = false, className = "", onError }: {
  frame: (now: number) => FaceFrame; active: boolean; idleMotion?: boolean; className?: string; onError?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), wake = useRef<(() => void) | null>(null);
  const callbacks = useRef({ frame, active, idleMotion, onError });
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => { callbacks.current = { frame, active, idleMotion, onError }; wake.current?.(); }, [frame, active, idleMotion, onError]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const ctx = element.getContext("2d");
    if (!ctx) { callbacks.current.onError?.(); return; }
    let disposed = false, ready = false, failed = false, handle = 0, last = 0, idleAt = 0;
    const image = new Image();
    const fail = () => { if (!disposed && !failed) { failed = true; setState("failed"); callbacks.current.onError?.(); } };
    const timeout = setTimeout(fail, 15000);
    const render = (now: number) => {
      handle = 0; if (disposed || !ready || document.hidden) return;
      if (callbacks.current.active) idleAt = 0;
      else if (!idleAt) idleAt = now;
      if (now - last >= 1000 / 30 || !callbacks.current.active) {
        const w = Math.max(1, element.clientWidth), h = Math.max(1, element.clientHeight), ratio = Math.min(devicePixelRatio || 1, 1.5);
        if (element.width !== Math.round(w * ratio) || element.height !== Math.round(h * ratio)) { element.width = Math.round(w * ratio); element.height = Math.round(h * ratio); }
        drawIllustratedFox(ctx, image, element.width, element.height, callbacks.current.frame(now), { timeMs: now, idleMotion: callbacks.current.active && callbacks.current.idleMotion }); last = now;
      }
      if (callbacks.current.active || now - idleAt < 70) handle = requestAnimationFrame(render);
    };
    const request = () => { if (!disposed && ready && !handle && !document.hidden) { idleAt = 0; handle = requestAnimationFrame(render); } };
    wake.current = request;
    image.onload = () => { clearTimeout(timeout); if (disposed || failed) return; ready = true; setState("ready"); request(); };
    image.onerror = () => { clearTimeout(timeout); fail(); };
    image.src = `${import.meta.env.BASE_URL}${ILLUSTRATED_FOX_ASSET}`;
    const observer = new ResizeObserver(request); observer.observe(element);
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(handle); handle = 0; } else request(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; clearTimeout(timeout); wake.current = null; cancelAnimationFrame(handle); observer.disconnect(); image.onload = null; image.onerror = null; image.removeAttribute("src"); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return <div className={`illustrated-avatar ${className}`}><canvas ref={canvas} role="img" aria-label={tr("二维星狐动画")} />
    {state !== "ready" && <span role="status">{state === "failed" ? tr("二维角色未能载入，请刷新重试。") : tr("正在载入二维星狐…")}</span>}</div>;
}
