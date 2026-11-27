// The notebook look (plan §6): cream lined paper, ballpoint-blue ink outlines
// with a slight wobble, and coloured-pencil fills with diagonal hatching for
// shade. One treatment over very simple geometry.
//
// M1 has the basic kit: paper ground, hatch material, inverted-hull outlines
// and line boil. Tiers, the screen-space edge pass and the watchdog are M4.

import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const PALETTE = {
  paper: new THREE.Color("#fbf6e9"),
  rule: new THREE.Color("#a9c8e8"),
  margin: new THREE.Color("#e79a96"),
  ink: new THREE.Color("#28408f"),
  yellow: new THREE.Color("#f5c84b"),
  coral: new THREE.Color("#f2907f"),
  mint: new THREE.Color("#93d8b8"),
  lilac: new THREE.Color("#bba9e3"),
  sky: new THREE.Color("#a9d4f2"),
  white: new THREE.Color("#fffdf7"),
  wood: new THREE.Color("#e2b77d"),
  graphite: new THREE.Color("#5a5e6b"),
};

export type QualityTier = "high" | "medium" | "low";

/** Render size caps in device pixels (plan §7.10). */
export const TIER_CAPS: Record<QualityTier, [number, number]> = { high: [2560, 1440], medium: [1920, 1080], low: [1280, 720] };

export function tierPixelRatio(tier: QualityTier, cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const [capWidth, capHeight] = TIER_CAPS[tier];
  return Math.max(0.5, Math.min(devicePixelRatio, capWidth / Math.max(1, cssWidth), capHeight / Math.max(1, cssHeight)));
}

/** Uniforms every notebook material shares. */
export interface NotebookUniforms {
  uBoil: { value: number };
  uPixel: { value: number };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uPaper: { value: THREE.Color };
  uInk: { value: THREE.Color };
}

export function createNotebookUniforms(): NotebookUniforms {
  return {
    uBoil: { value: 0 },
    uPixel: { value: 1 },
    uFogNear: { value: 40 },
    uFogFar: { value: 95 },
    uPaper: { value: PALETTE.paper.clone() },
    uInk: { value: PALETTE.ink.clone() },
  };
}

const FOG = /* glsl */ `
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uPaper;
  vec3 paperFog(vec3 color) {
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    return mix(color, uPaper, smoothstep(uFogNear, uFogFar, depth));
  }
`;

const NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;

/**
 * Coloured pencil over paper, with hatching that darkens away from the light.
 * Hatch spacing is in CSS pixels, so lines read the same on a 4K TV.
 */
export function createHatchMaterial(uniforms: NotebookUniforms, color: THREE.Color, options: { fill?: number; side?: THREE.Side } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: options.side ?? THREE.FrontSide,
    uniforms: {
      ...uniforms,
      uColor: { value: color.clone() },
      uFill: { value: options.fill ?? 0.82 },
      uLight: { value: new THREE.Vector3(-0.45, 0.85, 0.35).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uInk;
      uniform vec3 uLight;
      uniform float uFill;
      uniform float uBoil;
      uniform float uPixel;
      varying vec3 vNormal;
      ${FOG}
      ${NOISE}
      float hatchLine(vec2 p, float angle, float spacing) {
        float c = cos(angle);
        float s = sin(angle);
        float u = c * p.x + s * p.y;
        float d = abs(fract(u / spacing) - 0.5) * spacing;
        return 1.0 - smoothstep(0.45, 1.25, d);
      }
      void main() {
        float light = max(dot(normalize(vNormal), uLight), 0.0);
        float tone = 0.3 + 0.7 * light;
        vec2 p = gl_FragCoord.xy / uPixel + vec2(uBoil * 3.7, uBoil * 2.3);
        // Pencil fill: a little paper shows through, with grain.
        float grain = hash12(floor(p * 0.9));
        vec3 color = mix(uPaper, uColor, uFill * (0.9 + 0.1 * grain));
        float ink = 0.0;
        ink = max(ink, hatchLine(p, 0.785, 6.0) * (1.0 - smoothstep(0.55, 0.78, tone)));
        ink = max(ink, hatchLine(p, -0.785, 6.0) * (1.0 - smoothstep(0.35, 0.5, tone)));
        color = mix(color, uInk, ink * 0.5);
        color *= 0.93 + 0.07 * tone;
        gl_FragColor = vec4(paperFog(color), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Ink outline: the back faces of a slightly inflated copy (inverted hull). */
export function createOutlineMaterial(uniforms: NotebookUniforms, thickness: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...uniforms, uThickness: { value: thickness } },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      uniform float uBoil;
      void main() {
        vec3 n = normalize(normal);
        float wobble = 1.0 + 0.35 * sin(dot(position, vec3(12.9, 78.2, 37.7)) * 3.0 + uBoil * 6.2831);
        vec3 inflated = position + n * uThickness * wobble;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(inflated, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk;
      ${FOG}
      void main() {
        gl_FragColor = vec4(paperFog(uInk), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

const smoothCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** Hard-edged shapes need shared normals, or the hull splits at corners. */
function smoothedForOutline(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const cached = smoothCache.get(geometry);
  if (cached) return cached;
  const copy = new THREE.BufferGeometry();
  copy.setAttribute("position", geometry.getAttribute("position").clone());
  if (geometry.index) copy.setIndex(geometry.index.clone());
  const merged = mergeVertices(copy, 1e-4);
  merged.computeVertexNormals();
  copy.dispose();
  smoothCache.set(geometry, merged);
  return merged;
}

/**
 * What a game's art medium provides (decision 19): a surface material per
 * colour, an outline (or none), and disposal. Nib and shared props are built
 * against this, so they can be drawn in any medium.
 */
export interface StyleKit {
  surface(color: THREE.Color, fill?: number): THREE.Material;
  /** `null` when the medium has no outlines. */
  outline(thickness: number): THREE.Material | null;
  own<T extends { dispose(): void }>(resource: T): T;
}

/** A mesh in the kit's medium, with its outline when the medium has one, as one group. */
export function inkMesh(kit: StyleKit, geometry: THREE.BufferGeometry, color: THREE.Color, outline = 0.045): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(geometry, kit.surface(color));
  group.add(body);
  const outlineMaterial = outline > 0 ? kit.outline(outline) : null;
  if (outlineMaterial) {
    const hull = new THREE.Mesh(smoothedForOutline(geometry), outlineMaterial);
    hull.renderOrder = -1;
    group.add(hull);
  }
  return group;
}

/** Ballpoint and coloured pencil (Margin Run). Materials are cached by colour and thickness. */
export class NotebookKit implements StyleKit {
  readonly uniforms = createNotebookUniforms();
  private readonly hatchCache = new Map<string, THREE.ShaderMaterial>();
  private readonly outlineCache = new Map<number, THREE.ShaderMaterial>();
  private readonly owned = new Set<{ dispose(): void }>();
  private boilClock = 0;

  surface(color: THREE.Color, fill?: number): THREE.ShaderMaterial {
    return this.hatch(color, fill);
  }

  hatch(color: THREE.Color, fill?: number): THREE.ShaderMaterial {
    const key = `${color.getHexString()}:${fill ?? ""}`;
    let material = this.hatchCache.get(key);
    if (!material) {
      material = createHatchMaterial(this.uniforms, color, { fill });
      this.hatchCache.set(key, material);
    }
    return material;
  }

  outline(thickness: number): THREE.ShaderMaterial {
    let material = this.outlineCache.get(thickness);
    if (!material) {
      material = createOutlineMaterial(this.uniforms, thickness);
      this.outlineCache.set(thickness, material);
    }
    return material;
  }

  /** Registers a resource for disposal with the kit. */
  own<T extends { dispose(): void }>(resource: T): T {
    this.owned.add(resource);
    return resource;
  }

  /** Line boil: re-seeded about 10 times a second; still under reduced motion. */
  tick(delta: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      this.uniforms.uBoil.value = 0;
      return;
    }
    this.boilClock += delta;
    if (this.boilClock >= 0.1) {
      this.boilClock = 0;
      this.uniforms.uBoil.value = Math.random();
    }
  }

  dispose(): void {
    for (const material of this.hatchCache.values()) material.dispose();
    for (const material of this.outlineCache.values()) material.dispose();
    for (const resource of this.owned) resource.dispose();
    this.hatchCache.clear();
    this.outlineCache.clear();
    this.owned.clear();
  }
}

/** The page itself: cream paper with blue rules across the path and a red margin line. */
export function createPaperGround(kit: NotebookKit, width: number, length: number): THREE.Mesh {
  const geometry = kit.own(new THREE.PlaneGeometry(width, length, 1, 1));
  geometry.rotateX(-Math.PI / 2);
  const material = kit.own(new THREE.ShaderMaterial({
    uniforms: { ...kit.uniforms, uRule: { value: PALETTE.rule.clone() }, uMargin: { value: PALETTE.margin.clone() } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uRule;
      uniform vec3 uMargin;
      uniform float uBoil;
      varying vec3 vWorld;
      ${FOG}
      ${NOISE}
      float rule(float coordinate, float spacing, float width) {
        float d = abs(fract(coordinate / spacing) - 0.5) * spacing;
        float aa = fwidth(coordinate) * 1.2;
        return 1.0 - smoothstep(width, width + aa, d);
      }
      void main() {
        float grain = hash12(floor(gl_FragCoord.xy * 0.7));
        vec3 color = uPaper * (0.975 + 0.025 * grain);
        float wobble = sin(vWorld.x * 0.7 + floor(vWorld.z / 1.6)) * 0.02;
        color = mix(color, uRule, rule(vWorld.z + wobble, 1.6, 0.035) * 0.85);
        float margin = max(rule(vWorld.x + 7.0, 1000.0, 0.05), rule(vWorld.x + 7.25, 1000.0, 0.03));
        color = mix(color, uMargin, margin * 0.9);
        gl_FragColor = vec4(paperFog(color), 1.0);
        #include <colorspace_fragment>
      }
    `,
  }));
  return new THREE.Mesh(geometry, material);
}

/** A sticky note with a number, as a texture. */
export function stickyNoteTexture(kit: Pick<StyleKit, "own">, text: string, color = "#fde48a"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(40, 64, 143, 0.18)";
  context.fillRect(18, 22, 228, 228);
  context.fillStyle = color;
  context.fillRect(10, 10, 228, 228);
  context.fillStyle = "rgba(255, 255, 255, 0.35)";
  context.fillRect(10, 10, 228, 30);
  context.fillStyle = "#28408f";
  context.font = `800 ${text.length > 2 ? 104 : 132}px "Hanken Grotesk Variable", "Inter Variable", system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 124, 132);
  const texture = kit.own(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
