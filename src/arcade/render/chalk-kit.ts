// White gel pen and chalk on black paper (Star Sketch's medium, decision 19).
// Shapes are filled with chalk that catches the paper's tooth: dense where the
// light falls, broken in the shade. Outlines and constellation lines are
// smooth white gel pen. The chalk grain shifts a few times a second, like a
// hand-drawn animation. No full-screen pass: everything is in the materials.

import * as THREE from "three";
import type { StyleKit } from "./notebook-kit";
import { createNoiseTexture } from "./noise";
import { canvasTexture, strokeGeometry } from "./stroke-geometry";

export const CHALK = {
  paper: new THREE.Color("#17181f"),
  white: new THREE.Color("#f6f3ea"),
  dim: new THREE.Color("#a3a8c4"),
  dust: new THREE.Color("#3a4166"),
  dustLilac: new THREE.Color("#4a3c63"),
  yellow: new THREE.Color("#f7d774"),
  coral: new THREE.Color("#f4a08c"),
  mint: new THREE.Color("#96e2c3"),
  blue: new THREE.Color("#92c6f2"),
  lilac: new THREE.Color("#c9b6f2"),
  pink: new THREE.Color("#f5b5cb"),
};

export type StrokeKind = "gel" | "chalk" | "glow";
const KIND: Record<StrokeKind, number> = { gel: 0, chalk: 1, glow: 2 };

export interface StrokeOptions {
  width: number;
  color: THREE.Color;
  kind: StrokeKind;
  /** Dash period in world units (0 for a solid line). */
  dash?: number;
  opacity?: number;
}

/** A drawn line: reveal it from its start with `progress` (0–1). */
export interface Stroke {
  mesh: THREE.Mesh;
  uniforms: { uProgress: { value: number }; uOpacity: { value: number }; uGlow: { value: number }; uColor: { value: THREE.Color } };
}

export class ChalkKit implements StyleKit {
  readonly noise: THREE.DataTexture;
  readonly uniforms = {
    uPaper: { value: CHALK.paper.clone() },
    uLight: { value: new THREE.Vector3(-0.35, 0.75, 0.55).normalize() },
    tNoise: { value: null as THREE.Texture | null },
    uBoil: { value: new THREE.Vector2() },
    uPixel: { value: 1 },
  };
  private readonly chalks = new Map<string, THREE.ShaderMaterial>();
  private readonly gels = new Map<number, THREE.ShaderMaterial>();
  private readonly owned = new Set<{ dispose(): void }>();
  private boilStep = -1;

  constructor() {
    this.noise = this.own(createNoiseTexture());
    this.uniforms.tNoise.value = this.noise;
  }

  /** Chalk on black paper: the colour sits on the paper's tooth, thinner in the shade. */
  surface(color: THREE.Color, fill = 0.9): THREE.ShaderMaterial {
    const key = `${color.getHexString()}:${fill}`;
    let material = this.chalks.get(key);
    if (!material) {
      material = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uColor: { value: color.clone() }, uFill: { value: fill } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform vec3 uPaper;
          uniform vec3 uLight;
          uniform float uFill;
          uniform sampler2D tNoise;
          uniform vec2 uBoil;
          uniform float uPixel;
          varying vec3 vNormal;
          void main() {
            float light = clamp(dot(normalize(vNormal), uLight) * 0.5 + 0.5, 0.0, 1.0);
            vec2 css = gl_FragCoord.xy / uPixel;
            float grain = texture2D(tNoise, css / 190.0 + uBoil).r;
            float tooth = texture2D(tNoise, css / 70.0 + uBoil * 1.7).r;
            float n = clamp((mix(grain, tooth, 0.5) - 0.5) * 1.9 + 0.5, 0.0, 1.0);
            float density = uFill * mix(0.42, 1.04, light);
            float cover = smoothstep(1.0 - density - 0.12, 1.0 - density + 0.12, n);
            gl_FragColor = vec4(mix(uPaper, uColor, cover), 1.0);
            #include <colorspace_fragment>
          }
        `,
      });
      this.chalks.set(key, material);
    }
    return material;
  }

  /** A smooth white gel-pen line round each shape. */
  outline(thickness: number): THREE.ShaderMaterial {
    const width = Math.round(thickness * 700) / 1000;
    let material = this.gels.get(width);
    if (!material) {
      material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { ...this.uniforms, uThickness: { value: width }, uInk: { value: CHALK.white.clone() } },
        vertexShader: /* glsl */ `
          uniform float uThickness;
          uniform vec2 uBoil;
          void main() {
            vec3 n = normalize(normal);
            float wobble = 1.0 + 0.35 * sin(dot(position, vec3(12.9, 78.2, 37.7)) * 4.0 + uBoil.x * 40.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position + n * uThickness * wobble, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uInk;
          void main() {
            gl_FragColor = vec4(uInk, 1.0);
            #include <colorspace_fragment>
          }
        `,
      });
      this.gels.set(width, material);
    }
    return material;
  }

  own<T extends { dispose(): void }>(resource: T): T {
    this.owned.add(resource);
    return resource;
  }

  setPixelRatio(ratio: number): void {
    this.uniforms.uPixel.value = ratio;
  }

  /** Re-seeds the chalk grain about 8 times a second (off under reduced motion). */
  tick(time: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    const step = Math.floor(time * 8);
    if (step === this.boilStep) return;
    this.boilStep = step;
    this.uniforms.uBoil.value.set(((step * 0.618) % 1) * 0.37, ((step * 0.382) % 1) * 0.41);
  }

  /** A line along `points` (in the plane z = 0 of its parent), revealed from its start. */
  stroke(points: THREE.Vector2[], options: StrokeOptions): Stroke {
    const geometry = this.own(strokeGeometry(points, options.width));
    const length = geometry.userData.length as number;
    const uniforms = {
      uColor: { value: options.color.clone() },
      uProgress: { value: 1 },
      uLength: { value: length },
      uDash: { value: options.dash ?? 0 },
      uOpacity: { value: options.opacity ?? 1 },
      uKind: { value: KIND[options.kind] },
      uGlow: { value: 0 },
      uSeed: { value: Math.random() },
      tNoise: this.uniforms.tNoise,
      uBoil: this.uniforms.uBoil,
    };
    const material = this.own(new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: options.kind === "glow" ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute float aU;
        attribute float aV;
        varying float vU;
        varying float vV;
        varying vec2 vWorld;
        void main() {
          vU = aU;
          vV = aV;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xy;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uProgress;
        uniform float uLength;
        uniform float uDash;
        uniform float uOpacity;
        uniform float uKind;
        uniform float uGlow;
        uniform float uSeed;
        uniform sampler2D tNoise;
        uniform vec2 uBoil;
        varying float vU;
        varying float vV;
        varying vec2 vWorld;
        void main() {
          float head = uProgress * uLength;
          if (vU > head) discard;
          float across = 1.0 - abs(vV);
          vec3 color = uColor;
          float alpha;
          if (uKind < 0.5) {
            // Gel pen: smooth and even, with a glossy core.
            alpha = smoothstep(0.0, 0.4, across);
            color = mix(uColor, vec3(1.0), smoothstep(0.6, 1.0, across) * 0.45);
          } else if (uKind < 1.5) {
            // Chalk: grainy, with broken edges.
            float grain = texture2D(tNoise, vWorld * 0.22 + uBoil + uSeed).r;
            float fine = texture2D(tNoise, vWorld * 0.47 + uBoil * 1.3 + uSeed).r;
            float n = clamp((mix(grain, fine, 0.6) - 0.5) * 2.6 + 0.5, 0.0, 1.0);
            alpha = smoothstep(0.05, 0.45, across + (n - 0.5) * 0.8) * smoothstep(0.2, 0.45, n);
          } else {
            alpha = across * across * 0.55;
          }
          if (uDash > 0.0) alpha *= step(fract(vU / uDash), 0.55);
          // The end still being drawn is a touch brighter.
          float fresh = smoothstep(0.7, 0.0, head - vU) * step(uProgress, 0.999);
          gl_FragColor = vec4(color * (1.0 + uGlow) + fresh * 0.3, alpha * uOpacity);
          #include <colorspace_fragment>
        }
      `,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }

  /**
   * The black paper behind the sky: fibres, pastel chalk dust smudged across
   * it, and tiny gel-pen dots that twinkle and drift very slowly.
   */
  createNightPaper(width: number, height: number): THREE.Mesh {
    const material = this.own(new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: {
        uPaper: this.uniforms.uPaper,
        tNoise: this.uniforms.tNoise,
        uTime: { value: 0 },
        uDust: { value: CHALK.dust.clone() },
        uDustLilac: { value: CHALK.dustLilac.clone() },
        uDot: { value: CHALK.white.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vPoint;
        void main() {
          vPoint = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uPaper;
        uniform vec3 uDust;
        uniform vec3 uDustLilac;
        uniform vec3 uDot;
        uniform sampler2D tNoise;
        uniform float uTime;
        varying vec2 vPoint;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float dots(vec2 p, float density, float seed) {
          vec2 cell = floor(p * density);
          vec2 f = fract(p * density);
          float h = hash(cell + seed);
          vec2 centre = vec2(hash(cell + seed + 1.7), hash(cell + seed + 3.1)) * 0.7 + 0.15;
          float radius = 0.035 + 0.06 * step(0.93, h);
          float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + h * 1.6) + h * 40.0);
          return step(0.62, h) * smoothstep(radius, radius * 0.35, length(f - centre)) * twinkle;
        }
        void main() {
          vec2 p = vPoint;
          float fibre = texture2D(tNoise, p * 0.11).r;
          vec3 color = uPaper * (0.86 + 0.3 * fibre);
          float smudge = smoothstep(0.5, 0.78, texture2D(tNoise, p * 0.006 + vec2(0.3, 0.1)).a);
          float smudge2 = smoothstep(0.52, 0.8, texture2D(tNoise, p * 0.005 + vec2(0.7, 0.45)).a);
          color = mix(color, uDust, smudge * 0.45);
          color = mix(color, uDustLilac, smudge2 * 0.4);
          vec2 drift = vec2(uTime * 0.05, uTime * 0.012);
          float stars = max(dots(p + drift, 0.55, 0.0), dots(p + drift * 0.6, 1.1, 9.0) * 0.6);
          color = mix(color, uDot, stars * 0.85);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }));
    const mesh = new THREE.Mesh(this.own(new THREE.PlaneGeometry(width, height)), material);
    mesh.renderOrder = -10;
    mesh.frustumCulled = false;
    return mesh;
  }

  dispose(): void {
    for (const material of this.chalks.values()) material.dispose();
    for (const material of this.gels.values()) material.dispose();
    for (const resource of this.owned) resource.dispose();
    this.chalks.clear();
    this.gels.clear();
    this.owned.clear();
  }
}

/** A four-point gel-pen star with a dot in the middle. */
export function starTexture(kit: Pick<StyleKit, "own">): THREE.CanvasTexture {
  return canvasTexture(kit, 128, context => {
    context.translate(64, 64);
    context.fillStyle = "#ffffff";
    context.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const tip = [Math.cos(angle) * 58, Math.sin(angle) * 58];
      const next = (i + 0.5) / 4 * Math.PI * 2 - Math.PI / 2;
      const waist = [Math.cos(next) * 13, Math.sin(next) * 13];
      if (i === 0) context.moveTo(tip[0], tip[1]);
      else context.lineTo(tip[0], tip[1]);
      context.quadraticCurveTo(Math.cos(next) * 6, Math.sin(next) * 6, waist[0], waist[1]);
    }
    context.closePath();
    context.fill();
  });
}

/** A soft round glow. */
export function haloTexture(kit: Pick<StyleKit, "own">): THREE.CanvasTexture {
  return canvasTexture(kit, 128, context => {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
}

/** A number written in chalk, circled in a pastel colour (choice mode). */
export function chalkNumberTexture(kit: Pick<StyleKit, "own">, text: string, ring: THREE.Color): THREE.CanvasTexture {
  return canvasTexture(kit, 256, context => {
    context.lineCap = "round";
    context.strokeStyle = `#${ring.getHexString()}`;
    context.lineWidth = 11;
    for (const [dx, dy, r] of [[0, 0, 104], [5, -3, 100]]) {
      context.beginPath();
      context.ellipse(128 + dx, 128 + dy, r, r * 0.92, 0.2, 0.15, Math.PI * 2 + 0.05);
      context.stroke();
    }
    context.fillStyle = "#f6f3ea";
    context.font = `800 ${text.length > 2 ? 104 : 136}px "Hanken Grotesk Variable", "Inter Variable", system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 136);
    // Chalk: the paper's tooth shows through.
    context.globalCompositeOperation = "destination-out";
    let seed = text.length * 97 + 13;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 900; i++) {
      context.fillStyle = `rgba(0,0,0,${0.35 + random() * 0.5})`;
      context.fillRect(random() * 256, random() * 256, 1 + random() * 2.5, 1 + random() * 1.5);
    }
  });
}
