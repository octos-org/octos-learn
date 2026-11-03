import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { tr } from "@/i18n";
import { type FaceFrame } from "./face-frame";
import { loadStarFoxAsset, disposeAvatarModel } from "./star-fox-asset";
import { percentile } from "./performance-track";

export interface AvatarRenderMetrics { fps: number; submissionP95Ms: number; geometries: number; textures: number; renderer: string }

export function AvatarStage({ frame, fpsLimit, active, onMetrics, onError }: {
  frame: (time: number) => FaceFrame;
  fpsLimit: 30 | 60;
  active: boolean;
  onMetrics: (metrics: AvatarRenderMetrics) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const callbacks = useRef({ frame, onMetrics, onError, fpsLimit, active });
  const wake = useRef<(() => void) | null>(null);
  useEffect(() => {
    callbacks.current = { frame, onMetrics, onError, fpsLimit, active };
    // A paused audio/track seek still needs a fresh frame, then returns to idle.
    wake.current?.();
  }, [frame, fpsLimit, onMetrics, onError, active]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch { callbacks.current.onError(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff5e7, 0x637396, 1.3));
    const key = new THREE.DirectionalLight(0xfff4df, 2.8); key.position.set(-3, 4, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xb5d4ff, 1.8); rim.position.set(3, 2, -3); scene.add(rim);
    let fox: Awaited<ReturnType<typeof loadStarFoxAsset>> | null = null;
    const assetRequest = new AbortController();
    const assetTimeout = setTimeout(() => { if (!disposed) { assetRequest.abort(); setLoading(false); callbacks.current.onError(); } }, 15_000);
    void loadStarFoxAsset(assetRequest.signal).then((loaded) => {
      clearTimeout(assetTimeout);
      if (disposed || lost) { disposeAvatarModel(loaded.root); return; }
      fox = loaded; scene.add(fox.root); setLoading(false); wake.current?.();
    }).catch(() => { clearTimeout(assetTimeout); if (!disposed && !assetRequest.signal.aborted) { setLoading(false); callbacks.current.onError(); } });
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 30); camera.position.set(0, .25, 6.3); camera.lookAt(0, .24, 0);
    let handle = 0, disposed = false, lost = false;
    let lastRender = 0, lastReport = performance.now(), count = 0;
    let idleSince = 0;
    const samples: number[] = [];
    const resize = new ResizeObserver(() => {
      const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      wake.current?.();
    });
    resize.observe(element);
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; callbacks.current.onError(); };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const render = (now: number) => {
      if (disposed || lost) return;
      if (callbacks.current.active) idleSince = 0;
      else {
        if (!idleSince) idleSince = now;
        if (now - idleSince > 700) { handle = 0; return; }
      }
      handle = requestAnimationFrame(render);
      const interval = 1000 / callbacks.current.fpsLimit;
      const elapsed = now - lastRender;
      if (elapsed < interval) return;
      lastRender = now - (elapsed % interval);
      fox?.update(callbacks.current.frame(now));
      const start = performance.now(); renderer.render(scene, camera); samples.push(performance.now() - start); count++;
      if (now - lastReport >= 1000) {
        callbacks.current.onMetrics({ fps: count * 1000 / (now - lastReport), submissionP95Ms: percentile(samples, .95),
          geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, renderer: "WebGL 2" });
        lastReport = now; count = 0; samples.length = 0;
      }
    };
    wake.current = () => {
      if (!handle && !disposed && !lost) {
        lastReport = performance.now(); count = 0; samples.length = 0; idleSince = 0;
        handle = requestAnimationFrame(render);
      }
    };
    handle = requestAnimationFrame(render);
    return () => {
      disposed = true; clearTimeout(assetTimeout); assetRequest.abort(); wake.current = null; cancelAnimationFrame(handle); resize.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      disposeAvatarModel(scene);
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, []);
  return <div className="avatar-lab-render" ref={host} role="img" aria-label={tr("星狐三维小样")}>{loading && <span className="avatar-model-loading" role="status">{tr("正在载入星狐…")}</span>}</div>;
}
