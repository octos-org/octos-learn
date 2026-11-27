// Wax crayon on brown kraft paper (Up the Page's medium, decision 19). Shapes
// are coloured in with waxy diagonal strokes that skip over the paper's tooth,
// pressed harder in the shade; outlines are a dark crayon that breaks up a
// little. The wax sticks to each shape (it is laid in the shape's own space,
// not the screen's), so it never swims while the camera climbs. No full-screen
// pass: everything is in the materials.

import * as THREE from "three";
import type { StyleKit } from "./notebook-kit";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createNoiseTexture } from "./noise";
import { canvasTexture, strokeGeometry } from "./stroke-geometry";

export const CRAYON = {
  paper: new THREE.Color("#c39468"),
  paperLight: new THREE.Color("#d6ad83"),
  fibre: new THREE.Color("#a8794f"),
  fleck: new THREE.Color("#6e4a2e"),
  /** Cardboard for a block the child did not get: a little lighter than the page. */
  card: new THREE.Color("#dcb98f"),
  outline: new THREE.Color("#2f2219"),
  white: new THREE.Color("#fbf6ea"),
  red: new THREE.Color("#e2493f"),
  orange: new THREE.Color("#f2903a"),
  yellow: new THREE.Color("#f8d046"),
  green: new THREE.Color("#5db558"),
  teal: new THREE.Color("#2fb0a6"),
  blue: new THREE.Color("#3f86d6"),
  sky: new THREE.Color("#8fcdf2"),
  purple: new THREE.Color("#8d5cc4"),
  pink: new THREE.Color("#f283ad"),
  brown: new THREE.Color("#7a5232"),
  wood: new THREE.Color("#d39a5c"),
};

/** A crayon line: reveal it from its start with `uProgress` (0–1). */
export interface CrayonStroke {
  mesh: THREE.Mesh;
  uniforms: { uProgress: { value: number }; uOpacity: { value: number }; uColor: { value: THREE.Color } };
}

/** Where every crayon material lays its wax: object-anchored, world-scaled. */
const WAX_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWax;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWax = world.xyz - modelMatrix[3].xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export class CrayonKit implements StyleKit {
  readonly noise: THREE.DataTexture;
  readonly uniforms = {
    uPaper: { value: CRAYON.paper.clone() },
    uLight: { value: new THREE.Vector3(-0.45, 0.7, 0.55).normalize() },
    tNoise: { value: null as THREE.Texture | null },
    uBoil: { value: new THREE.Vector2() },
    /** The glow round the tower on a streak, 0–1 (shared by every glow outline). */
    uGlow: { value: 0 },
  };
  private readonly fills = new Map<string, THREE.ShaderMaterial>();
  private readonly lines = new Map<string, THREE.ShaderMaterial>();
  private readonly owned = new Set<{ dispose(): void }>();
  private boilStep = -1;

  constructor() {
    this.noise = this.own(createNoiseTexture());
    this.uniforms.tNoise.value = this.noise;
  }

  /** Wax crayon: diagonal strokes that skip over the paper's tooth, pressed harder in the shade. */
  surface(color: THREE.Color, fill = 0.92): THREE.ShaderMaterial {
    const key = `${color.getHexString()}:${fill}`;
    let material = this.fills.get(key);
    if (!material) {
      // Each colour is laid at its own slant, as a child colours one shape at a time.
      const hash = (color.r * 7.13 + color.g * 3.71 + color.b * 5.29) % 1;
      const angle = (hash < 0.5 ? 0.55 : 2.35) + hash * 0.5;
      material = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uColor: { value: color.clone() }, uFill: { value: fill }, uAngle: { value: angle } },
        vertexShader: WAX_VERTEX,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform vec3 uPaper;
          uniform vec3 uLight;
          uniform float uFill;
          uniform float uAngle;
          uniform sampler2D tNoise;
          uniform vec2 uBoil;
          varying vec3 vNormal;
          varying vec3 vWax;
          void main() {
            vec3 n = normalize(vNormal);
            float light = clamp(dot(n, uLight) * 0.5 + 0.5, 0.0, 1.0);
            vec2 dir = vec2(cos(uAngle), sin(uAngle));
            // Strokes run along dir in the face's own plane (z folds in for the tops and sides).
            vec2 p = vWax.xy + vec2(vWax.z * 0.7, vWax.z * 0.45);
            vec2 q = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
            // Side-by-side strokes, a little wobbly, each pressed a little differently;
            // lighter at a stroke's edges, so the paper shows between them.
            float wobble = texture2D(tNoise, vec2(q.x * 0.05, q.y * 0.02)).g - 0.5;
            float v = q.y / 0.11 + wobble * 1.8;
            float id = floor(v);
            float band = fract(v);
            float pressure = mix(0.78, 1.0, fract(sin(id * 91.7 + uAngle * 13.0) * 43758.5453));
            float edge = smoothstep(0.0, 0.3, band) * smoothstep(1.0, 0.7, band);
            // The paper's tooth: the wax skips the hollows.
            float tooth = texture2D(tNoise, p * 0.3 + uBoil).r * 0.6 + texture2D(tNoise, p * 0.6 + uBoil * 1.7).r * 0.4;
            float grain = clamp((tooth - 0.5) * 2.6 + 0.5, 0.0, 1.0);
            float density = uFill * pressure * mix(0.5, 1.0, edge) * mix(0.68, 1.04, light);
            float cover = smoothstep(1.0 - density - 0.1, 1.0 - density + 0.1, grain);
            // Pressed harder in the shade.
            vec3 wax = uColor * mix(0.74, 1.05, light) * mix(0.94, 1.02, edge);
            gl_FragColor = vec4(mix(uPaper * mix(0.82, 1.0, light), wax, cover), 1.0);
            #include <colorspace_fragment>
          }
        `,
      });
      this.fills.set(key, material);
    }
    return material;
  }

  /** A dark crayon line round each shape, broken here and there where the wax skipped. */
  outline(thickness: number): THREE.ShaderMaterial {
    // A crayon line is bolder than a pen's.
    return this.hull(`ink:${thickness}`, thickness * 1.6, CRAYON.outline, false);
  }

  /** A warm white crayon glow round a shape, shown by `uniforms.uGlow`. */
  glowOutline(thickness: number): THREE.ShaderMaterial {
    return this.hull(`glow:${thickness}`, thickness, new THREE.Color("#fff3c4"), true);
  }

  private hull(key: string, thickness: number, color: THREE.Color, glow: boolean): THREE.ShaderMaterial {
    const width = Math.round(thickness * 1000) / 1000;
    let material = this.lines.get(key);
    if (!material) {
      material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: glow,
        depthWrite: !glow,
        uniforms: { ...this.uniforms, uThickness: { value: width }, uInk: { value: color.clone() }, uIsGlow: { value: glow ? 1 : 0 } },
        vertexShader: /* glsl */ `
          uniform float uThickness;
          uniform vec2 uBoil;
          varying vec3 vWax;
          void main() {
            vec3 n = normalize(normal);
            float wobble = 1.0 + 0.3 * sin(dot(position, vec3(12.9, 78.2, 37.7)) * 3.0 + uBoil.x * 30.0);
            vec4 world = modelMatrix * vec4(position + n * uThickness * wobble, 1.0);
            vWax = world.xyz - modelMatrix[3].xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uInk;
          uniform sampler2D tNoise;
          uniform vec2 uBoil;
          uniform float uGlow;
          uniform float uIsGlow;
          varying vec3 vWax;
          void main() {
            vec2 p = vWax.xy + vWax.z * 0.6;
            float grain = texture2D(tNoise, p * 0.55 + uBoil).r;
            if (uIsGlow > 0.5) {
              gl_FragColor = vec4(uInk, uGlow * smoothstep(0.25, 0.6, grain) * 0.9);
            } else {
              if (grain < 0.3) discard;
              gl_FragColor = vec4(uInk * (0.85 + grain * 0.3), 1.0);
            }
            #include <colorspace_fragment>
          }
        `,
      });
      this.lines.set(key, material);
    }
    return material;
  }

  own<T extends { dispose(): void }>(resource: T): T {
    this.owned.add(resource);
    return resource;
  }

  /** Re-lays the wax about 6 times a second (off under reduced motion). */
  tick(time: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    const step = Math.floor(time * 6);
    if (step === this.boilStep) return;
    this.boilStep = step;
    this.uniforms.uBoil.value.set(((step * 0.618) % 1) * 0.29, ((step * 0.382) % 1) * 0.33);
  }

  /** A crayon line along `points` (in the plane z = 0 of its parent), revealed from its start. */
  stroke(points: THREE.Vector2[], options: { width: number; color: THREE.Color; opacity?: number }): CrayonStroke {
    const geometry = this.own(strokeGeometry(points, options.width));
    const { material, uniforms } = this.strokeMaterial(options.color, geometry.userData.length as number, options.opacity ?? 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }

  /**
   * Many crayon lines of one colour as one mesh (a page of doodles in a few
   * draw calls). Each line sits at its own depth, so they layer as drawn.
   */
  strokeBatch(lines: { points: THREE.Vector2[]; width: number; z: number }[], color: THREE.Color): THREE.Mesh {
    const parts = lines.map(line => strokeGeometry(line.points, line.width).translate(0, 0, line.z));
    const geometry = this.own(mergeGeometries(parts));
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, this.strokeMaterial(color, Infinity, 1).material);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Many crayon-filled flat shapes of one colour as one mesh, each at its own depth. */
  patchBatch(shapes: { points: THREE.Vector2[]; z: number }[], color: THREE.Color, fill = 0.85): THREE.Mesh {
    const parts = shapes.map(shape => new THREE.ShapeGeometry(new THREE.Shape(shape.points), 2).translate(0, 0, shape.z));
    const geometry = this.own(mergeGeometries(parts));
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, this.surface(color, fill));
    mesh.frustumCulled = false;
    return mesh;
  }

  private strokeMaterial(color: THREE.Color, length: number, opacity: number): { material: THREE.ShaderMaterial; uniforms: CrayonStroke["uniforms"] } {
    const uniforms = {
      uColor: { value: color.clone() },
      uProgress: { value: 1 },
      uLength: { value: Number.isFinite(length) ? length : 1e9 },
      uOpacity: { value: opacity },
      uSeed: { value: Math.random() },
      tNoise: this.uniforms.tNoise,
      uBoil: this.uniforms.uBoil,
    };
    const material = this.own(new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aU;
        attribute float aV;
        varying float vU;
        varying float vV;
        varying vec2 vWax;
        void main() {
          vU = aU;
          vV = aV;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWax = world.xy - modelMatrix[3].xy;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uProgress;
        uniform float uLength;
        uniform float uOpacity;
        uniform float uSeed;
        uniform sampler2D tNoise;
        uniform vec2 uBoil;
        varying float vU;
        varying float vV;
        varying vec2 vWax;
        void main() {
          if (vU > uProgress * uLength) discard;
          float across = 1.0 - abs(vV);
          // Wax streaks run along the line; the paper's tooth breaks it up.
          float wax = texture2D(tNoise, vec2(vU * 0.035 + uSeed, vV * 0.03 + uSeed * 0.7) + uBoil).r;
          float tooth = texture2D(tNoise, vWax * 0.3 + uBoil * 0.7 + uSeed).r;
          float grain = clamp((wax * 0.55 + tooth * 0.5 - 0.53) * 2.6 + 0.5, 0.0, 1.0);
          float alpha = smoothstep(0.0, 0.3, across + (grain - 0.5) * 0.7) * smoothstep(0.16, 0.4, grain);
          gl_FragColor = vec4(uColor * (0.9 + 0.18 * wax), alpha * uOpacity);
          #include <colorspace_fragment>
        }
      `,
    }));
    return { material, uniforms };
  }

  /** A flat shape coloured in with crayon (a cloud, the sun), facing the camera. */
  patch(points: THREE.Vector2[], color: THREE.Color, fill = 0.85): THREE.Mesh {
    const geometry = this.own(new THREE.ShapeGeometry(new THREE.Shape(points), 2));
    return new THREE.Mesh(geometry, this.surface(color, fill));
  }

  /** The brown kraft paper of the page: fibres, darker flecks, a few lighter blotches. */
  createKraftPaper(width: number, height: number): THREE.Mesh {
    const material = this.own(new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: {
        uPaper: this.uniforms.uPaper,
        tNoise: this.uniforms.tNoise,
        uLight: { value: CRAYON.paperLight.clone() },
        uFibre: { value: CRAYON.fibre.clone() },
        uFleck: { value: CRAYON.fleck.clone() },
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
        uniform vec3 uLight;
        uniform vec3 uFibre;
        uniform vec3 uFleck;
        uniform sampler2D tNoise;
        varying vec2 vPoint;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 p = vPoint;
          float blotch = texture2D(tNoise, p * 0.012).a;
          vec3 color = mix(uPaper * 0.95, uLight, smoothstep(0.45, 0.8, blotch) * 0.45);
          // Short fibres, mostly along the sheet, a few across it.
          float along = texture2D(tNoise, vec2(p.x * 0.02, p.y * 0.3)).r;
          float across = texture2D(tNoise, vec2(p.x * 0.3 + 0.3, p.y * 0.02 + 0.6)).r;
          color = mix(color, uFibre, smoothstep(0.6, 0.78, along) * 0.45);
          color = mix(color, uLight, smoothstep(0.64, 0.8, across) * 0.3);
          // Dark flecks of bark in the pulp.
          vec2 cell = floor(p * 1.2);
          vec2 f = fract(p * 1.2);
          float h = hash(cell);
          vec2 centre = vec2(hash(cell + 1.3), hash(cell + 2.7)) * 0.8 + 0.1;
          vec2 d = f - centre;
          float fleck = step(0.8, h) * smoothstep(0.09, 0.03, length(d * vec2(1.0, 2.2 + h * 3.0)));
          color = mix(color, uFleck, fleck * 0.55);
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
    for (const material of this.fills.values()) material.dispose();
    for (const material of this.lines.values()) material.dispose();
    for (const resource of this.owned) resource.dispose();
    this.fills.clear();
    this.lines.clear();
    this.owned.clear();
  }
}

/** A seeded random stream, so each texture is scribbled the same way every time. */
export function scribbler(seed: number): () => number {
  let state = (seed * 16807 + 11) % 2147483647 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** Rubs wax texture into what is drawn so far: tiny gaps where the crayon skipped. */
export function skip(context: CanvasRenderingContext2D, width: number, height: number, random: () => number, amount: number): void {
  context.save();
  context.globalCompositeOperation = "destination-out";
  for (let i = 0; i < amount; i++) {
    context.fillStyle = `rgba(0,0,0,${0.3 + random() * 0.5})`;
    context.fillRect(random() * width, random() * height, 1 + random() * 3, 1 + random() * 1.4);
  }
  context.restore();
}

/** Back-and-forth crayon scribbles filling an ellipse. */
export function scribbleEllipse(context: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, random: () => number): void {
  context.save();
  context.beginPath();
  context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  context.clip();
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineWidth = 7;
  context.beginPath();
  const slant = 0.5;
  for (let x = cx - rx - ry; x < cx + rx + ry; x += 5 + random() * 2) {
    context.moveTo(x + random() * 3, cy - ry - 4);
    context.lineTo(x - ry * 2 * slant + random() * 3, cy + ry + 4);
  }
  context.stroke();
  context.restore();
}

/**
 * The label on a block's front: a white crayon patch with the number in dark
 * crayon (or "?" while it hangs). In choice mode a ring in the button's colour.
 */
export function crayonLabelTexture(kit: Pick<StyleKit, "own">, text: string, ring: THREE.Color | null, seed = 1): THREE.CanvasTexture {
  const width = 320;
  const height = 176;
  return canvasTexture(kit, width, context => {
    const random = scribbler(seed + text.length * 31);
    const rx = 92 + text.length * 14;
    const ry = 66;
    scribbleEllipse(context, width / 2, height / 2, rx, ry, "#fbf6ea", random);
    if (ring) {
      context.strokeStyle = `#${ring.getHexString()}`;
      context.lineWidth = 12;
      context.lineCap = "round";
      for (const [dx, dy, grow] of [[0, 0, 0], [3, -2, 4]]) {
        context.beginPath();
        context.ellipse(width / 2 + dx, height / 2 + dy, rx + 2 + grow, ry + 2 + grow, -0.04, 0.2, Math.PI * 2 + 0.1);
        context.stroke();
      }
    }
    context.fillStyle = "#2f2219";
    context.font = `900 ${text.length > 2 ? 104 : 124}px "Hanken Grotesk Variable", "Inter Variable", system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, height / 2 + 8);
    skip(context, width, height, random, 1400);
  }, height);
}

/** Packing tape across a cardboard box (a block the child did not get). */
export function tapeTexture(kit: Pick<StyleKit, "own">): THREE.CanvasTexture {
  return canvasTexture(kit, 256, context => {
    const random = scribbler(7);
    context.fillStyle = "rgba(251,246,234,0.85)";
    context.fillRect(0, 50, 256, 28);
    context.strokeStyle = "rgba(122,82,50,0.7)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(30, 110);
    context.lineTo(90, 112);
    context.moveTo(166, 104);
    context.lineTo(226, 108);
    context.stroke();
    skip(context, 256, 128, random, 500);
  }, 128);
}

/** A small irregular blob of wax: crayon shavings and confetti. */
export function flakeTexture(kit: Pick<StyleKit, "own">): THREE.CanvasTexture {
  return canvasTexture(kit, 64, context => {
    const random = scribbler(3);
    context.fillStyle = "#ffffff";
    context.beginPath();
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const radius = 18 + random() * 12;
      const x = 32 + Math.cos(angle) * radius;
      const y = 32 + Math.sin(angle) * radius * 0.8;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    skip(context, 64, 64, random, 60);
  });
}

/** A soft warm glow behind the top of the tower on a streak. */
export function glowTexture(kit: Pick<StyleKit, "own">): THREE.CanvasTexture {
  return canvasTexture(kit, 128, context => {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,246,206,0.85)");
    gradient.addColorStop(0.45, "rgba(255,236,170,0.35)");
    gradient.addColorStop(1, "rgba(255,236,170,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
}
