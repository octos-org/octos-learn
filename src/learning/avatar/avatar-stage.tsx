import { useEffect, useRef } from "react";
import * as THREE from "three";
import { tr } from "@/i18n";
import { faceChannel, type FaceFrame } from "./face-frame";
import { percentile } from "./performance-track";

export interface AvatarRenderMetrics { fps: number; submissionP95Ms: number; geometries: number; textures: number; renderer: string }

/** Original procedural test rig. A production GLB can replace it without changing capture. */
function makeTestFox() {
  const root = new THREE.Group();
  const head = new THREE.Group();
  root.add(head); head.position.y = .38;
  const orange = new THREE.MeshToonMaterial({ color: "#e98738" });
  const cream = new THREE.MeshToonMaterial({ color: "#fff1d6" });
  const dark = new THREE.MeshToonMaterial({ color: "#392d3b" });
  const navy = new THREE.MeshToonMaterial({ color: "#273e75" });
  const gold = new THREE.MeshToonMaterial({ color: "#e8b760" });
  const pink = new THREE.MeshToonMaterial({ color: "#cb746d" });
  const white = new THREE.MeshBasicMaterial({ color: "#fffaf0" });
  const amber = new THREE.MeshToonMaterial({ color: "#b96d26" });
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const orb = (parent: THREE.Group, material: THREE.Material, position: [number, number, number], scale: [number, number, number]) => {
    const mesh = new THREE.Mesh(sphere, material); mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
  };
  orb(root, navy, [0, -.78, -.08], [.85, .68, .4]);
  orb(root, cream, [0, -.7, .29], [.33, .55, .13]);
  orb(root, navy, [-.72, -.75, .03], [.28, .56, .3]);
  orb(root, navy, [.72, -.75, .03], [.28, .56, .3]);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(.11, 5), gold);
  badge.position.set(.46, -.56, .39); root.add(badge);
  orb(head, orange, [0, .25, 0], [.77, .72, .57]);
  for (const sign of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(sign * .52, .93, -.03); ear.rotation.z = -sign * .27;
    const outline = new THREE.Mesh(new THREE.ConeGeometry(.35, .84, 3), orange); outline.scale.z = .45; ear.add(outline);
    const inside = new THREE.Mesh(new THREE.ConeGeometry(.245, .59, 3), pink); inside.position.set(0, .01, .07); inside.scale.z = .34; ear.add(inside); head.add(ear);
    orb(head, cream, [sign * .26, .01, .43], [.43, .3, .19]);
  }
  const eyes = [-1, 1].map((sign) => {
    const group = new THREE.Group(); group.position.set(sign * .3, .38, .49); head.add(group);
    orb(group, white, [0, 0, 0], [.23, .265, .13]);
    const gaze = new THREE.Group(); group.add(gaze);
    orb(gaze, amber, [0, -.005, .105], [.132, .181, .065]);
    orb(gaze, dark, [0, -.005, .157], [.073, .13, .035]);
    orb(gaze, white, [-.034, .07, .185], [.035, .045, .018]);
    const brow = orb(head, dark, [sign * .3, .72, .4], [.24, .044, .045]);
    brow.rotation.z = -sign * .08;
    return { group, gaze, brow, sign };
  });
  orb(head, dark, [0, .025, .67], [.104, .075, .075]);
  const jaw = orb(head, cream, [0, -.19, .44], [.3, .12, .17]);
  const mouth = orb(head, dark, [0, -.14, .605], [.16, .025, .035]);
  const tongue = orb(head, pink, [0, -.16, .637], [.075, .015, .012]);
  const update = (frame: FaceFrame) => {
    const c = (key: Parameters<typeof faceChannel>[1]) => faceChannel(frame, key);
    head.rotation.set(-frame.rotation[0], -frame.rotation[1], -frame.rotation[2], "YXZ");
    for (const { group, gaze, brow, sign } of eyes) {
      const left = sign === -1;
      const blink = c(left ? "eyeBlinkLeft" : "eyeBlinkRight");
      const squint = c(left ? "eyeSquintLeft" : "eyeSquintRight");
      const wide = c(left ? "eyeWideLeft" : "eyeWideRight");
      group.scale.y = Math.max(.045, 1 - blink * .96 - squint * .2 + wide * .12);
      gaze.position.x = (c(left ? "eyeLookInLeft" : "eyeLookInRight") - c(left ? "eyeLookOutLeft" : "eyeLookOutRight")) * -sign * .07;
      gaze.position.y = (c(left ? "eyeLookUpLeft" : "eyeLookUpRight") - c(left ? "eyeLookDownLeft" : "eyeLookDownRight")) * .06;
      brow.position.y = .72 + c("browInnerUp") * .08 + c(left ? "browOuterUpLeft" : "browOuterUpRight") * .1 - c(left ? "browDownLeft" : "browDownRight") * .08;
      brow.rotation.z = -sign * (.08 + c("browInnerUp") * .2);
    }
    const open = Math.max(0, c("jawOpen") * (1 - c("mouthClose")));
    const pucker = Math.max(c("mouthPucker"), c("mouthFunnel"));
    const smile = (c("mouthSmileLeft") + c("mouthSmileRight")) / 2;
    mouth.scale.set(.16 * (1 - pucker * .45 + smile * .35), .025 + open * .145 + pucker * .035, .035);
    mouth.position.y = -.14 - open * .08;
    mouth.position.x = (c("mouthRight") - c("mouthLeft")) * .055;
    jaw.position.y = -.19 - open * .22;
    tongue.position.y = mouth.position.y - .04;
    tongue.visible = open > .2;
    tongue.scale.y = .015 + open * .015;
  };
  return { root, update };
}

export function AvatarStage({ frame, fpsLimit, active, onMetrics, onError }: {
  frame: (time: number) => FaceFrame;
  fpsLimit: 30 | 60;
  active: boolean;
  onMetrics: (metrics: AvatarRenderMetrics) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
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
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff5e7, 0x526080, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(-3, 4, 6); scene.add(key);
    const fox = makeTestFox(); scene.add(fox.root);
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 30); camera.position.set(0, .25, 5.5); camera.lookAt(0, .12, 0);
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
      fox.update(callbacks.current.frame(now));
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
      disposed = true; wake.current = null; cancelAnimationFrame(handle); resize.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((node) => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); } });
      materials.forEach((material) => material.dispose()); geometries.forEach((geometry) => geometry.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, []);
  return <div className="avatar-lab-render" ref={host} role="img" aria-label={tr("三维头像工程测试")} />;
}
