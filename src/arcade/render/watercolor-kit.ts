// Watercolor (Paper Glider's medium, decision 19). Shapes are rendered in flat
// washes with a faint pencil sketch line; then a full-screen pass paints the
// frame: wobbly edges, colour bleeding, pigment pooling at the edges,
// granulation from the paper grain and blotchy wash density.

import * as THREE from "three";
import type { StyleKit } from "./notebook-kit";
import { createNoiseTexture } from "./noise";

export const WATERCOLOR = {
  paper: new THREE.Color("#fbf8ef"),
  haze: new THREE.Color("#eef1ea"),
  pencil: new THREE.Color("#9097a8"),
  skyTop: new THREE.Color("#7fb2de"),
  skyHorizon: new THREE.Color("#f6e6c6"),
  skyBelow: new THREE.Color("#cfe4d6"),
  sun: new THREE.Color("#ffd98a"),
  cloud: new THREE.Color("#fdfdfb"),
  hill: new THREE.Color("#9ccf9a"),
  hillFar: new THREE.Color("#b5a8d8"),
  coral: new THREE.Color("#ef8f7d"),
  yellow: new THREE.Color("#f4c64e"),
  mint: new THREE.Color("#7fcfae"),
  lilac: new THREE.Color("#a996dd"),
  blue: new THREE.Color("#6fa6dc"),
  glider: new THREE.Color("#fffdf6"),
};

export class WatercolorKit implements StyleKit {
  readonly uniforms = {
    uPaper: { value: WATERCOLOR.paper.clone() },
    uHaze: { value: WATERCOLOR.haze.clone() },
    uPencil: { value: WATERCOLOR.pencil.clone() },
    uLight: { value: new THREE.Vector3(-0.4, 0.8, 0.45).normalize() },
    uFogNear: { value: 30 },
    uFogFar: { value: 110 },
  };
  private readonly washes = new Map<string, THREE.ShaderMaterial>();
  private readonly pencils = new Map<number, THREE.ShaderMaterial>();
  private readonly owned = new Set<{ dispose(): void }>();

  surface(color: THREE.Color, fill = 0.9): THREE.ShaderMaterial {
    const key = `${color.getHexString()}:${fill}`;
    let material = this.washes.get(key);
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
          uniform vec3 uHaze;
          uniform vec3 uLight;
          uniform float uFill;
          uniform float uFogNear;
          uniform float uFogFar;
          varying vec3 vNormal;
          void main() {
            // A light first wash, and a second glaze where the form turns from the light.
            float light = smoothstep(-0.25, 0.65, dot(normalize(vNormal), uLight));
            vec3 wash = mix(uPaper, uColor, uFill * 0.8);
            vec3 glaze = uColor * 0.7;
            vec3 color = mix(glaze, wash, 0.3 + 0.7 * light);
            float depth = gl_FragCoord.z / gl_FragCoord.w;
            color = mix(color, uHaze, smoothstep(uFogNear, uFogFar, depth) * 0.85);
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }
        `,
      });
      this.washes.set(key, material);
    }
    return material;
  }

  /** A faint pencil sketch line under the paint. */
  outline(thickness: number): THREE.ShaderMaterial {
    const width = Math.round(thickness * 600) / 1000;
    let material = this.pencils.get(width);
    if (!material) {
      material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { ...this.uniforms, uThickness: { value: width } },
        vertexShader: /* glsl */ `
          uniform float uThickness;
          void main() {
            vec3 n = normalize(normal);
            float wobble = 1.0 + 0.45 * sin(dot(position, vec3(12.9, 78.2, 37.7)) * 4.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position + n * uThickness * wobble, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uPencil;
          uniform vec3 uHaze;
          uniform float uFogNear;
          uniform float uFogFar;
          void main() {
            float depth = gl_FragCoord.z / gl_FragCoord.w;
            gl_FragColor = vec4(mix(uPencil, uHaze, smoothstep(uFogNear, uFogFar, depth)), 1.0);
            #include <colorspace_fragment>
          }
        `,
      });
      this.pencils.set(width, material);
    }
    return material;
  }

  own<T extends { dispose(): void }>(resource: T): T {
    this.owned.add(resource);
    return resource;
  }

  /** The sky: a large dome that follows the camera, washed from blue to a warm horizon. */
  createSky(): THREE.Mesh {
    const geometry = this.own(new THREE.SphereGeometry(160, 24, 16));
    const material = this.own(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTop: { value: WATERCOLOR.skyTop.clone() }, uHorizon: { value: WATERCOLOR.skyHorizon.clone() }, uBelow: { value: WATERCOLOR.skyBelow.clone() } },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBelow;
        varying vec3 vDirection;
        void main() {
          float y = vDirection.y;
          vec3 color = y > 0.0 ? mix(uHorizon, uTop, smoothstep(0.0, 0.55, y)) : mix(uHorizon, uBelow, smoothstep(0.0, 0.25, -y));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }));
    const sky = new THREE.Mesh(geometry, material);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    return sky;
  }

  dispose(): void {
    for (const material of this.washes.values()) material.dispose();
    for (const material of this.pencils.values()) material.dispose();
    for (const resource of this.owned) resource.dispose();
    this.washes.clear();
    this.pencils.clear();
    this.owned.clear();
  }
}

/** Renders the scene into a texture, then paints it onto the screen as watercolor. */
export class WatercolorPass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly noise = createNoiseTexture();
  private readonly quad: THREE.Mesh;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();

  constructor(paper: THREE.Color) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        tNoise: { value: this.noise },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uPixel: { value: 1 },
        uPaper: { value: paper.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform sampler2D tNoise;
        uniform vec2 uTexel;
        uniform float uPixel;
        uniform vec3 uPaper;
        varying vec2 vUv;
        vec4 noiseAt(vec2 css, float period) { return texture2D(tNoise, css / period); }
        void main() {
          vec2 css = gl_FragCoord.xy / uPixel;
          // Wobbly, hand-painted edges.
          vec2 wobble = (noiseAt(css, 420.0).gb - 0.5) * 2.0;
          vec2 uv = vUv + wobble * 3.2 * uPixel * uTexel;
          vec3 color = texture2D(tScene, uv).rgb;
          // Colour bleeding into a small neighbourhood.
          vec3 blur = vec3(0.0);
          float radius = 2.6 * uPixel;
          for (int i = 0; i < 8; i++) {
            float angle = float(i) * 0.7853982 + 0.39;
            blur += texture2D(tScene, uv + vec2(cos(angle), sin(angle)) * radius * uTexel).rgb;
          }
          blur /= 8.0;
          vec3 base = mix(color, blur, 0.45);
          // Pigment pools where colours meet.
          float edge = smoothstep(0.012, 0.16, length(color - blur));
          vec3 pigment = clamp(1.0 - base / max(uPaper, vec3(0.01)), 0.0, 1.0);
          float grain = noiseAt(css, 64.0).r;
          float blotch = noiseAt(css, 900.0).a;
          pigment *= mix(0.74, 1.22, grain);
          pigment *= mix(0.78, 1.16, blotch);
          pigment *= 1.0 + edge * 0.8;
          vec3 painted = uPaper * (1.0 - clamp(pigment, 0.0, 1.0));
          painted *= 0.962 + 0.038 * noiseAt(css, 23.0).r;
          gl_FragColor = vec4(painted, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    this.target.setSize(Math.max(1, this.size.x), Math.max(1, this.size.y));
    this.material.uniforms.uTexel.value.set(1 / Math.max(1, this.size.x), 1 / Math.max(1, this.size.y));
    this.material.uniforms.uPixel.value = renderer.getPixelRatio();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.noise.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
