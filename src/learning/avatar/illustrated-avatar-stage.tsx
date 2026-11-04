import { useEffect, useRef, useState } from "react";
import { tr } from "@/i18n";
import type { FaceFrame } from "./face-frame";
import { createPaintedFoxPainter, type PaintedFoxImages } from "./painted-fox";
import {paintedCharacter,type PaintedCharacterId} from './painted-characters';
import { percentile } from "./performance-track";
import type { AvatarRenderMetrics } from "./avatar-render-metrics";
import "./illustrated-avatar.css";
import { LOCAL_RIG_ASSETS, type LocalRigImages, type LocalRigPose } from './painted-local-rig';
import {EAR_TURN_ASSET} from './painted-ear-turn';

export function IllustratedAvatarStage({ frame, active, characterId='star-fox', idleMotion = false, localRig=false, localPose, earTurn=false,earDemo=false,className = "", fpsLimit = 30, onMetrics, onError }: {
  localRig?:boolean; localPose?:LocalRigPose;earTurn?:boolean;earDemo?:boolean;
  characterId?:PaintedCharacterId;
  frame: (now: number) => FaceFrame; active: boolean; idleMotion?: boolean; className?: string; fpsLimit?: 30 | 60; onMetrics?: (metrics: AvatarRenderMetrics) => void; onError?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), wake = useRef<(() => void) | null>(null);
  const callbacks = useRef({ frame, active, idleMotion, localPose,earDemo, fpsLimit, onMetrics, onError });
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const character=paintedCharacter(characterId);
  useEffect(() => { callbacks.current = { frame, active, idleMotion, localPose,earDemo, fpsLimit, onMetrics, onError }; wake.current?.(); }, [frame, active, idleMotion, localPose,earDemo, fpsLimit, onMetrics, onError]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const ctx = element.getContext("2d");
    if (!ctx) { callbacks.current.onError?.(); return; }
    let disposed = false, ready = false, failed = false, handle = 0, last = 0, idleAt = 0, lastReport = 0, count = 0;
    const samples: number[] = [];
    const localEnabled=localRig&&character.id==='star-fox';
    const paths:Record<string,string>={...character.assets,...(localEnabled?Object.fromEntries(Object.entries(LOCAL_RIG_ASSETS).map(([key,path])=>[`local_${key}`,path])):{})};
    if(localEnabled&&earTurn)paths.local_earTurn=EAR_TURN_ASSET;
    const images = Object.entries(paths).map(([key, path]) => ({ key, path, image: new Image() }));
    let loaded = 0, painter: ReturnType<typeof createPaintedFoxPainter> | null = null;
    const fail = () => { if (!disposed && !failed) { failed = true; ready = false; cancelAnimationFrame(handle); handle = 0; setState("failed"); callbacks.current.onError?.(); } };
    const timeout = setTimeout(fail, 15000);
    let naturalAt:number|undefined, settling = false;
    const render = (now: number) => {
      handle = 0; if (disposed || !ready || document.hidden) return;
      const animating=callbacks.current.active||callbacks.current.idleMotion||callbacks.current.earDemo;
      if (animating) idleAt = 0;
      else if (!idleAt) idleAt = now;
      const interval = 1000 / callbacks.current.fpsLimit;
      if (now - last >= interval || !animating) {
        const w = Math.max(1, element.clientWidth), h = Math.max(1, element.clientHeight), ratio = Math.min(devicePixelRatio || 1, 1.5);
        if (element.width !== Math.round(w * ratio) || element.height !== Math.round(h * ratio)) { element.width = Math.round(w * ratio); element.height = Math.round(h * ratio); }
        const input = callbacks.current.frame(now), start = performance.now();
        naturalAt=callbacks.current.idleMotion?(naturalAt??now):undefined;
        try { settling = painter!.draw(ctx, element.width, element.height, input, { timeMs: naturalAt===undefined?now:now-naturalAt, idleMotion: callbacks.current.idleMotion,localPose:callbacks.current.localPose,earDemo:callbacks.current.earDemo }).settling; }
        catch { fail(); return; }
        samples.push(performance.now() - start); count++; last = now - ((now - last) % interval);
        if (now - lastReport >= 1000) {
          callbacks.current.onMetrics?.({ fps: count * 1000 / (now - lastReport), submissionP95Ms: percentile(samples, .95), renderer: "Canvas 2D" });
          lastReport = now; count = 0; samples.length = 0;
        }
      }
      // Ears and hair may still be catching up after the head stopped.
      if (animating || settling || now - idleAt < 70) handle = requestAnimationFrame(render);
    };
    const request = () => { if (!disposed && ready && !handle && !document.hidden) { idleAt = 0; lastReport = performance.now(); count = 0; samples.length = 0; handle = requestAnimationFrame(render); } };
    wake.current = request;
    for (const asset of images) {
      asset.image.onload = () => {
        if (disposed || failed || ++loaded !== images.length) return;
        clearTimeout(timeout);
        try {
          painter = createPaintedFoxPainter(Object.fromEntries(images.map(({ key, image }) => [key, image])) as PaintedFoxImages, (width, height) => {
            const buffer = element.ownerDocument.createElement("canvas"); buffer.width = width; buffer.height = height;
            const context = buffer.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("canvas_unavailable");
            return { canvas: buffer, context };
          },character.rig,localEnabled?Object.fromEntries(images.filter(a=>a.key.startsWith('local_')).map(a=>[a.key.slice(6),a.image])) as LocalRigImages:undefined);
          ready = true; setState("ready"); request();
        } catch { fail(); }
      };
      asset.image.onerror = () => { clearTimeout(timeout); fail(); };
      asset.image.src = `${import.meta.env.BASE_URL}${asset.path}`;
    }
    const observer = new ResizeObserver(request); observer.observe(element);
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(handle); handle = 0; } else request(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; clearTimeout(timeout); wake.current = null; cancelAnimationFrame(handle); observer.disconnect(); painter = null; for (const { image } of images) { image.onload = null; image.onerror = null; image.removeAttribute("src"); } document.removeEventListener("visibilitychange", visibility); };
  }, [character,localRig,earTurn]);
  return <div className={`illustrated-avatar ${className}`}><canvas ref={canvas} role="img" aria-label={tr("{{v0}}动画",{v0:character.name()})} />
    {state !== "ready" && <span role="status">{state === "failed" ? tr("二维角色未能载入，请刷新重试。") : tr("正在载入角色…")}</span>}</div>;
}
