// Up the Page (一页登顶), game D (plan §5.5), in wax crayon on brown kraft
// paper (decision 19). A block hangs on a string above a tower; each right
// answer lets it drop, and the tower climbs the page past crayon doodles, from
// the grass to the stars. Nib clings to the side of the tower and climbs up
// after every block. In choice mode two blocks swing left and right, each with
// its number on a crayon label; the chosen one drops. A miss the child does
// not fix still drops in, as a plain cardboard box, so the tower keeps
// climbing. Streaks: the tower glows and stops swaying at 3, blocks get bigger
// at 5 and bigger still at 10, with a crayon rainbow. At the end Nib plants a
// flag on top and the view steps back to show the whole tower.
//
// Every answer gets a response at once (owner, 2026-11-26). The camera only
// rises with the tower, straight up, and steps back at the end; it never
// tilts, turns or zooms (plan §5.7). The game only renders round events
// (plan §5.3, §7.8).

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Side } from "../../core/choices";
import { expectedAnswer } from "../../core/facts";
import type { RoundEvent } from "../../core/round-engine";
import { CRAYON, CrayonKit, crayonLabelTexture, flakeTexture, glowTexture, tapeTexture, type CrayonStroke } from "../../render/crayon-kit";
import { Nib, restPose, type NibPose } from "../../render/nib";
import { smoothedForOutline, tierPixelRatio, type QualityTier } from "../../render/notebook-kit";
import { smoothCurve } from "../../render/stroke-geometry";
import type { ArcadeGame, GameContext } from "../types";
import { pageDoodles, type DoodleColor } from "./doodles";
import { BLOCK, blockColor, blockSize, CARD, cameraYFor, fallArc, fallTime, finaleView, landingTime, PLINTH, swayAt, SWAY_SPAN, type BlockColor, type Point, type Size } from "./tower";

const FOV = 36;
const DISTANCE = 18;
/** Where the top of the tower shows on screen (−1 bottom, 1 top): just above the number pad. */
const TOP_AT = { answer: -0.18, choice: -0.22 };
/** The gap between the top of the tower and the bottom of a hanging block. */
const HANG_GAP = { answer: 1.1, choice: 0.7 };
const CHOICE_X = 3.5;
/** The pendulum a hanging block swings on, and how far it swings. */
const PENDULUM = 9;
const SWING = { answer: 0.028, choice: 0.045 };
const STRING_LENGTH = 16;
const ENTER_TIME = 0.45;
const CLIMB_TIME = 0.34;
const NIB_SCALE = 1.0;
const DOODLE_Z = -5;
const FLAKES_MAX = 280;
const FINALE_TIME = 2.4;
/** The calm sway of a tower that is not on a streak, and the extra sway after a miss. */
const SWAY_CALM = 0.06;
const SWAY_MISS = 0.42;
const RING: Record<Side, THREE.Color> = { left: CRAYON.yellow, right: CRAYON.pink };
const COLORS: Record<BlockColor, THREE.Color> = {
  red: CRAYON.red, blue: CRAYON.blue, yellow: CRAYON.yellow, purple: CRAYON.purple, green: CRAYON.green,
  orange: CRAYON.orange, teal: CRAYON.teal, pink: CRAYON.pink, sky: CRAYON.sky,
};
const DOODLE_COLORS: Record<DoodleColor, THREE.Color> = {
  red: CRAYON.red, orange: CRAYON.orange, yellow: CRAYON.yellow, green: CRAYON.green, darkGreen: new THREE.Color("#3b7f3d"),
  teal: CRAYON.teal, blue: CRAYON.blue, sky: CRAYON.sky, purple: CRAYON.purple, pink: CRAYON.pink, brown: CRAYON.brown,
  white: CRAYON.white, outline: CRAYON.outline,
};
const RAINBOW = [CRAYON.red, CRAYON.orange, CRAYON.yellow, CRAYON.green, CRAYON.blue, CRAYON.purple];

interface BlockView {
  /** Placed in the world; scaled to the block's size. */
  group: THREE.Group;
  /** Squashes on landing. */
  inner: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  glow: THREE.Mesh;
  label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  size: Size;
  /** Its height before scaling (the squash keeps its bottom on the block below). */
  localHeight: number;
}

interface Hanger {
  block: BlockView;
  side: Side | null;
  real: boolean;
  string: CrayonStroke | null;
  halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Where it hangs (the block's centre). */
  slot: THREE.Vector3;
  enter: number;
  phase: number;
  shake: number;
  /** "This one": a glow and a little bounce, after a miss or Show me. */
  hint: number;
  /** A wrong pick, tumbling away down the page. */
  tumble: { velocity: THREE.Vector3; spin: number; life: number } | null;
  /** Pulled back up and away (the block not chosen). */
  lift: number | null;
}

interface Placed {
  block: BlockView;
  x: number;
  /** The bottom of the block. */
  y: number;
  size: Size;
  landed: boolean;
  squash: number;
}

interface Drop {
  placed: Placed;
  arc: (s: number) => Point;
  start: number;
  duration: number;
  spin: number;
  scaleFrom: THREE.Vector2;
}

interface LooseString { stroke: CrayonStroke; life: number }
interface Flake { position: THREE.Vector3; velocity: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color; spin: number; gravity: number }

const ease = (s: number) => s * s * (3 - 2 * s);
const easeOut = (s: number) => 1 - (1 - s) * (1 - s) * (1 - s);

export class UpThePage implements ArcadeGame {
  readonly id = "up-the-page";
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
  private readonly kit = new CrayonKit();
  private context: GameContext = { quality: "medium", reducedMotion: false, mode: "answer" };
  private distance = DISTANCE;
  private boxes = new Map<string, THREE.BufferGeometry>();
  private plane!: THREE.PlaneGeometry;
  private glowMap!: THREE.Texture;
  private tapeMap!: THREE.Texture;
  private nib!: Nib;
  private readonly nibHolder = new THREE.Group();
  private started = false;
  private readonly stack: Placed[] = [];
  private readonly drops: Drop[] = [];
  private lastLanding = 0;
  private hangers: Hanger[] = [];
  private leaving: Hanger[] = [];
  private hangingItem = -1;
  private readonly loose: LooseString[] = [];
  private readonly flakes: Flake[] = [];
  private flakeMesh!: THREE.InstancedMesh;
  private towerGlow!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private rainbow: CrayonStroke[] | null = null;
  private flag: THREE.Group | null = null;
  private flagGrow = 0;
  private nibY = 0;
  private climb: { from: number; to: number; t: number } | null = null;
  private standing = 0;
  private pose: NibPose = restPose();
  private cheer = 0;
  private wobble = 0;
  private sway = 0;
  private steady = 0;
  private streak = 0;
  private cameraY = 0;
  private cameraVelocity = 0;
  private finale: { from: THREE.Vector3; to: THREE.Vector3; t: number; start: number } | null = null;
  private finished = false;
  private time = 0;
  private frame = 0;
  private lastFrame = 0;
  private running = false;
  private paused = false;
  private lost = false;
  private sizes = { width: 1, height: 1 };
  private frameTimes: number[] = [];

  async mount(host: HTMLElement, context: GameContext): Promise<void> {
    this.context = context;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(CRAYON.paper);
    renderer.domElement.className = "arcade-game-canvas";
    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    host.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.buildWorld();
    const rect = host.getBoundingClientRect();
    this.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
    this.ensureStarted();
    this.running = true;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  onEvent(event: RoundEvent): void {
    switch (event.type) {
      case "round_start":
        this.ensureStarted();
        break;
      case "countdown":
        this.wobble = Math.max(this.wobble, 0.25);
        break;
      case "item_shown":
        this.showItem(event.index, event.choices ?? null, expectedAnswer(event.item));
        break;
      case "answer_correct":
        this.streak = event.streak;
        this.correct(event.index, event.given, event.streak);
        break;
      case "answer_wrong":
        this.streak = 0;
        this.wrong(event.side);
        break;
      case "answer_shown":
        this.streak = 0;
        this.shown(event.expected);
        break;
      case "answer_corrected":
        this.correct(event.index, event.given, 0);
        break;
      case "round_end":
        this.end();
        break;
      case "paused":
        this.pause();
        break;
      case "resumed":
        this.resume();
        break;
      default:
        break;
    }
  }

  setQuality(tier: QualityTier): void {
    this.context = { ...this.context, quality: tier };
    this.resize(this.sizes.width, this.sizes.height);
  }

  resize(width: number, height: number): void {
    this.sizes = { width: Math.max(1, width), height: Math.max(1, height) };
    if (!this.renderer) return;
    const ratio = tierPixelRatio(this.context.quality, this.sizes.width, this.sizes.height, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.sizes.width, this.sizes.height, false);
    this.camera.aspect = this.sizes.width / this.sizes.height;
    // Narrow screens: step back until both hanging blocks fit across.
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.distance = Math.max(DISTANCE, (CHOICE_X + BLOCK.width * 0.75) / (tan * this.camera.aspect));
    this.camera.updateProjectionMatrix();
    if (this.finale) this.finale.to.copy(this.finaleTarget());
    this.placeCamera(0, true);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.lastFrame = performance.now();
  }

  stats(): { geometries: number; textures: number; p50: number; p95: number } {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    const memory = this.renderer?.info.memory ?? { geometries: 0, textures: 0 };
    return { geometries: memory.geometries, textures: memory.textures, p50: at(0.5), p95: at(0.95) };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.flakeMesh?.dispose();
    for (const geometry of this.boxes.values()) {
      geometry.dispose();
      smoothedForOutline(geometry).dispose();
    }
    this.boxes.clear();
    this.kit.dispose();
    if (this.renderer) {
      this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.renderer = null;
    this.scene.clear();
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  // ---------- world ----------

  private buildWorld(): void {
    const kit = this.kit;
    const paper = kit.createKraftPaper(420, 300);
    paper.position.set(0, 40, -12);
    this.scene.add(paper);
    this.plane = kit.own(new THREE.PlaneGeometry(1, 1));
    this.glowMap = glowTexture(kit);
    this.tapeMap = tapeTexture(kit);

    // The drawings on the page, from the grass up to the stars: one mesh per
    // colour, each shape a hair in front of the one before, so they layer as drawn.
    const lines = new Map<DoodleColor, { points: THREE.Vector2[]; width: number; z: number }[]>();
    const patches = new Map<string, { color: DoodleColor; fill?: number; shapes: { points: THREE.Vector2[]; z: number }[] }>();
    pageDoodles().forEach((shape, i) => {
      const z = DOODLE_Z + i * 0.01;
      if (shape.kind === "line") {
        const points = shape.smooth ? smoothCurve(shape.points, shape.closed) : shape.points.map(([x, y]) => new THREE.Vector2(x, y));
        lines.set(shape.color, [...(lines.get(shape.color) ?? []), { points, width: shape.width, z }]);
      } else {
        const key = `${shape.color}:${shape.fill ?? ""}`;
        const entry = patches.get(key) ?? { color: shape.color, fill: shape.fill, shapes: [] };
        entry.shapes.push({ points: shape.points.map(([x, y]) => new THREE.Vector2(x, y)), z });
        patches.set(key, entry);
      }
    });
    for (const [color, list] of lines) this.scene.add(kit.strokeBatch(list, DOODLE_COLORS[color]));
    for (const entry of patches.values()) this.scene.add(kit.patchBatch(entry.shapes, DOODLE_COLORS[entry.color], entry.fill));

    // The glow behind the top of the tower on a streak.
    this.towerGlow = new THREE.Mesh(this.plane, kit.own(new THREE.MeshBasicMaterial({ map: this.glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
    this.towerGlow.renderOrder = -4;
    this.scene.add(this.towerGlow);

    // Nib, in crayon, clinging to the side of the tower.
    this.nib = new Nib(kit);
    this.nib.root.scale.setScalar(NIB_SCALE);
    this.nib.root.rotation.order = "ZYX";
    this.nibHolder.add(this.nib.root);
    this.scene.add(this.nibHolder);

    this.flakeMesh = new THREE.InstancedMesh(
      kit.own(new THREE.PlaneGeometry(1, 1)),
      kit.own(new THREE.MeshBasicMaterial({ map: flakeTexture(kit), transparent: true, depthWrite: false })),
      FLAKES_MAX,
    );
    this.flakeMesh.count = 0;
    this.flakeMesh.frustumCulled = false;
    this.flakeMesh.renderOrder = 9;
    this.scene.add(this.flakeMesh);
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    // The tower stands on a wide slab on the grass.
    const plinth = this.makeBlock({ width: PLINTH.width, height: PLINTH.height }, CRAYON.brown, null);
    plinth.label.visible = false;
    const placed: Placed = { block: plinth, x: 0, y: 0, size: { width: PLINTH.width, height: PLINTH.height }, landed: true, squash: 0 };
    this.stack.push(placed);
    this.nibY = this.nibRestY();
    this.placeCamera(0, true);
  }

  private box(width: number, height: number): THREE.BufferGeometry {
    const key = `${width.toFixed(3)}x${height.toFixed(3)}`;
    let geometry = this.boxes.get(key);
    if (!geometry) {
      geometry = new RoundedBoxGeometry(width, height, BLOCK.depth, 3, 0.16);
      this.boxes.set(key, geometry);
    }
    return geometry;
  }

  /** A crayon block with a label on its front, `size` big. */
  private makeBlock(size: Size, color: THREE.Color, label: string | null, ring: THREE.Color | null = null): BlockView {
    const kit = this.kit;
    const geometry = this.box(BLOCK.width, BLOCK.height);
    const exact = size.width === PLINTH.width ? this.box(PLINTH.width, PLINTH.height) : geometry;
    const group = new THREE.Group();
    const inner = new THREE.Group();
    const body = new THREE.Mesh(exact, kit.surface(color));
    const hull = new THREE.Mesh(smoothedForOutline(exact), kit.outline(0.045));
    hull.renderOrder = -1;
    const glow = new THREE.Mesh(smoothedForOutline(exact), kit.glowOutline(0.2));
    glow.renderOrder = -2;
    glow.visible = false;
    const labelMesh = new THREE.Mesh(this.plane, kit.own(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
    labelMesh.position.z = BLOCK.depth / 2 + 0.02;
    labelMesh.scale.set(2.25, 2.25 * (176 / 320), 1);
    labelMesh.renderOrder = 2;
    if (label !== null) this.setLabel({ label: labelMesh }, label, ring);
    else labelMesh.visible = false;
    inner.add(body, hull, glow, labelMesh);
    group.add(inner);
    if (exact === geometry) group.scale.set(size.width / BLOCK.width, size.height / BLOCK.height, 1);
    this.scene.add(group);
    return { group, inner, body, glow, label: labelMesh, size: { ...size }, localHeight: exact === geometry ? BLOCK.height : PLINTH.height };
  }

  private setLabel(block: Pick<BlockView, "label">, text: string, ring: THREE.Color | null): void {
    const material = block.label.material;
    material.map?.dispose();
    material.map = crayonLabelTexture(this.kit, text, ring, Math.floor(Math.random() * 1000));
    material.needsUpdate = true;
    block.label.visible = true;
  }

  // ---------- the tower ----------

  private topPlaced(landedOnly: boolean): Placed {
    for (let i = this.stack.length - 1; i >= 0; i--) if (!landedOnly || this.stack[i].landed) return this.stack[i];
    return this.stack[0];
  }

  private plannedTop(): number {
    const top = this.topPlaced(false);
    return top.y + top.size.height;
  }

  private landedTop(): number {
    const top = this.topPlaced(true);
    return top.y + top.size.height;
  }

  /** Where Nib holds on: just below the top of the tower, on its right side. */
  private nibRestY(): number {
    return Math.max(0.02, this.landedTop() - 1.0);
  }

  /** Lets go of a hanging block: it falls (or is tossed in) onto the top of the tower. */
  private release(hanger: Hanger, size: Size): void {
    this.letGoOfString(hanger);
    const block = hanger.block;
    const from = { x: block.group.position.x, y: block.group.position.y };
    const top = this.plannedTop();
    const placed: Placed = { block, x: (Math.random() - 0.5) * 0.24, y: top, size, landed: false, squash: 0 };
    this.stack.push(placed);
    const to = { x: placed.x, y: top + size.height / 2 };
    const landAt = landingTime(this.time, fallTime(from, to), this.lastLanding);
    this.lastLanding = landAt;
    const drop: Drop = {
      placed,
      arc: fallArc(from, to, landAt - this.time),
      start: this.time,
      duration: landAt - this.time,
      spin: block.group.rotation.z,
      scaleFrom: new THREE.Vector2(block.group.scale.x, block.group.scale.y),
    };
    block.size = { ...size };
    this.scene.remove(hanger.halo);
    hanger.halo.material.dispose();
    block.glow.visible = true;
    this.drops.push(drop);
    if (this.context.reducedMotion) this.stepDrops(true);
  }

  private stepDrops(cut = false): void {
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i];
      const block = drop.placed.block;
      const s = cut || drop.duration <= 0 ? 1 : Math.min(1, (this.time - drop.start) / drop.duration);
      const point = drop.arc(s);
      const sway = swayAt(drop.placed.y + drop.placed.size.height / 2, this.landedTop(), this.sway);
      block.group.position.set(point.x + sway * s, point.y, 0);
      block.group.rotation.z = drop.spin * (1 - ease(s));
      const grow = Math.min(1, s * 2.5);
      block.group.scale.set(
        THREE.MathUtils.lerp(drop.scaleFrom.x, drop.placed.size.width / BLOCK.width, grow),
        THREE.MathUtils.lerp(drop.scaleFrom.y, drop.placed.size.height / BLOCK.height, grow),
        1,
      );
      if (s >= 1) {
        this.drops.splice(i--, 1);
        this.land(drop.placed);
      }
    }
  }

  private land(placed: Placed): void {
    placed.landed = true;
    placed.squash = 1;
    const top = this.landedTop();
    const color = (placed.block.body.material.uniforms.uColor.value as THREE.Color).clone();
    const corners = [-1, 1].map(side => new THREE.Vector3(placed.x + side * placed.size.width * 0.45, placed.y, 1.0));
    for (const corner of corners) this.puff(corner, 6, [color, CRAYON.white]);
    if (this.streak >= 5 && placed.size.width > BLOCK.width) this.confetti(new THREE.Vector3(placed.x, top, 1), 18);
    // A small bump, unless the streak holds the tower steady.
    this.wobble = Math.max(this.wobble, this.steady > 0.5 ? 0 : 0.12);
    // Nib climbs up after it.
    const to = this.nibRestY();
    if (this.context.reducedMotion) this.nibY = to;
    else this.climb = { from: this.nibY, to, t: 0 };
    if (this.finished && !this.drops.length) this.plantFlag();
  }

  private stepTower(delta: number): void {
    const reduced = this.context.reducedMotion;
    // Steady on a streak of 3 or more; a miss shakes it.
    const steadyTarget = this.streak >= 3 ? 1 : 0;
    this.steady = reduced ? steadyTarget : THREE.MathUtils.lerp(this.steady, steadyTarget, 1 - Math.exp(-delta * 4));
    this.kit.uniforms.uGlow.value = this.steady;
    this.wobble = Math.max(0, this.wobble - delta * 0.7);
    const calm = SWAY_CALM * (1 - this.steady);
    this.sway = reduced ? 0 : calm * Math.sin(this.time * 1.3) + SWAY_MISS * this.wobble * this.wobble * Math.sin(this.time * 6.5);
    const top = this.landedTop();
    for (const placed of this.stack) {
      if (!placed.landed) continue;
      placed.squash = Math.max(0, placed.squash - delta * 5);
      const middle = placed.y + placed.size.height / 2;
      const k = Math.min(1, Math.max(0, (middle - (top - SWAY_SPAN)) / SWAY_SPAN));
      const block = placed.block;
      block.group.position.set(placed.x + swayAt(middle, top, this.sway), middle, 0);
      block.group.rotation.z = -this.sway * 2 * k / SWAY_SPAN;
      if (placed.size.width !== PLINTH.width) block.group.scale.set(placed.size.width / BLOCK.width, placed.size.height / BLOCK.height, 1);
      const squash = Math.sin(placed.squash * Math.PI) * 0.12;
      block.inner.scale.set(1 + squash, 1 - squash, 1 + squash);
      block.inner.position.y = (-squash * block.localHeight) / 2;
    }
    this.towerGlow.position.set(0, top - 1.2, -1.6);
    this.towerGlow.scale.setScalar(11);
    this.towerGlow.material.opacity = this.steady * 0.55;
    if (this.flag) {
      this.flagGrow = reduced ? 1 : Math.min(1, this.flagGrow + delta * 2.5);
      const placed = this.topPlaced(true);
      this.flag.position.set(placed.x - placed.size.width * 0.28 + swayAt(top, top, this.sway), top, 0.2);
      this.flag.scale.set(1, easeOut(this.flagGrow), 1);
    }
  }

  // ---------- events ----------

  private showItem(index: number, choices: [number, number] | null, expected: number): void {
    this.ensureStarted();
    this.settleHangers();
    this.hangingItem = index;
    const mode = this.context.mode;
    const top = this.plannedTop();
    if (mode === "choice" && choices) {
      (["left", "right"] as const).forEach((side, k) => {
        const value = choices[k];
        const color = COLORS[blockColor(index, k * 2)];
        const block = this.makeBlock({ width: BLOCK.width, height: BLOCK.height }, color, String(value), RING[side]);
        const slot = new THREE.Vector3(side === "left" ? -CHOICE_X : CHOICE_X, top + HANG_GAP.choice + BLOCK.height / 2, 0);
        this.hangers.push(this.makeHanger(block, side, value === expected, slot, k * Math.PI));
      });
    } else {
      const block = this.makeBlock({ width: BLOCK.width, height: BLOCK.height }, COLORS[blockColor(index)], "?", null);
      const slot = new THREE.Vector3(0, top + HANG_GAP.answer + BLOCK.height / 2, 0);
      this.hangers.push(this.makeHanger(block, null, true, slot, 0));
    }
  }

  private makeHanger(block: BlockView, side: Side | null, real: boolean, slot: THREE.Vector3, phase: number): Hanger {
    const kit = this.kit;
    const string = kit.stroke([new THREE.Vector2(0, 0), new THREE.Vector2(0, STRING_LENGTH * 0.5), new THREE.Vector2(0, STRING_LENGTH)], { width: 0.09, color: CRAYON.outline });
    this.scene.add(string.mesh);
    const halo = new THREE.Mesh(this.plane, kit.own(new THREE.MeshBasicMaterial({ map: this.glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
    halo.renderOrder = -3;
    this.scene.add(halo);
    const hanger: Hanger = { block, side, real, string, halo, slot, enter: this.context.reducedMotion ? 1 : 0, phase, shake: 0, hint: 0, tumble: null, lift: null };
    this.placeHanger(hanger, 0);
    return hanger;
  }

  /** The item moved on without a right answer: the block drops in as plain cardboard; any other leaves. */
  private settleHangers(): void {
    for (const hanger of this.hangers) {
      if (hanger.real && !hanger.tumble) {
        hanger.block.body.material = this.kit.surface(CRAYON.card, 0.95);
        const material = hanger.block.label.material;
        material.map?.dispose();
        material.map = this.tapeMap;
        material.needsUpdate = true;
        hanger.block.label.visible = true;
        hanger.block.label.scale.set(BLOCK.width * 1.02, BLOCK.width * 0.5, 1);
        hanger.hint = 0;
        this.release(hanger, { ...CARD });
      } else this.sendAway(hanger);
    }
    this.hangers = [];
  }

  private sendAway(hanger: Hanger): void {
    if (!hanger.tumble) {
      hanger.lift = 0;
      this.letGoOfString(hanger, true);
    }
    this.leaving.push(hanger);
  }

  private correct(index: number, given: number, streak: number): void {
    if (index !== this.hangingItem) return;
    const real = this.hangers.find(hanger => hanger.real && !hanger.tumble);
    if (!real) return;
    if (this.context.mode !== "choice") this.setLabel(real.block, String(given), null);
    const color = (real.block.body.material.uniforms.uColor.value as THREE.Color).clone();
    // Straight away: a puff of crayon from the block as it lets go.
    this.puff(real.block.group.position.clone().setZ(1), streak >= 5 ? 16 : 10, [color, CRAYON.white]);
    this.release(real, blockSize(streak));
    for (const hanger of this.hangers) if (hanger !== real) this.sendAway(hanger);
    this.hangers = [];
    this.hangingItem = -1;
    if (streak >= 10 && !this.rainbow) this.drawRainbow();
    if (streak === 3 || streak === 5 || streak === 10) this.cheer = Math.max(this.cheer, 1);
  }

  /** A miss: at once, the block shakes (or a wrong block's string snaps) and the tower wobbles. */
  private wrong(side?: Side): void {
    this.wobble = 1;
    this.cheer = 0;
    const chosen = side ? this.hangers.find(hanger => hanger.side === side) : undefined;
    if (chosen && !chosen.real) {
      this.letGoOfString(chosen);
      chosen.tumble = { velocity: new THREE.Vector3(Math.sign(chosen.slot.x || 1) * 2.4, 3, 0), spin: Math.sign(chosen.slot.x || 1) * -3.2, life: 1.6 };
      this.puff(chosen.block.group.position.clone().setZ(1), 12, [CRAYON.outline, CRAYON.card]);
      this.hangers = this.hangers.filter(hanger => hanger !== chosen);
      this.leaving.push(chosen);
    } else {
      for (const hanger of this.hangers) hanger.shake = 1;
      const shaken = this.hangers[0];
      if (shaken) this.puff(shaken.block.group.position.clone().setZ(1), 8, [CRAYON.outline]);
    }
    // The right block glows, so the child can fix it straight away.
    for (const hanger of this.hangers) if (hanger.real && this.context.mode === "choice") hanger.hint = 1;
  }

  private shown(expected: number): void {
    for (const hanger of [...this.hangers]) {
      if (!hanger.real) {
        this.sendAway(hanger);
        this.hangers = this.hangers.filter(entry => entry !== hanger);
      } else {
        hanger.hint = 1;
        if (this.context.mode !== "choice") this.setLabel(hanger.block, String(expected), null);
      }
    }
  }

  private end(): void {
    this.finished = true;
    this.settleHangers();
    this.hangingItem = -1;
    this.cheer = 3;
    if (!this.drops.length) this.plantFlag();
  }

  /** The top of the page: Nib climbs on top and plants a flag, and the view steps back. */
  private plantFlag(): void {
    if (this.flag) return;
    const kit = this.kit;
    const flag = new THREE.Group();
    const pole = kit.stroke([new THREE.Vector2(0, 0), new THREE.Vector2(0.03, 1.4), new THREE.Vector2(0, 2.6)], { width: 0.13, color: CRAYON.brown });
    const cloth = [new THREE.Vector2(0, 2.55), new THREE.Vector2(1.5, 2.2), new THREE.Vector2(0, 1.75)];
    const fill = kit.patch(cloth, CRAYON.red, 0.95);
    fill.position.z = -0.01;
    const edge = kit.stroke([...cloth, cloth[0]], { width: 0.09, color: CRAYON.outline });
    flag.add(pole.mesh, fill, edge.mesh);
    this.scene.add(flag);
    this.flag = flag;
    this.flagGrow = 0;
    this.standing = this.context.reducedMotion ? 1 : this.standing;
    this.confetti(new THREE.Vector3(0, this.landedTop() + 1, 1), 40);
    this.finale = { from: this.camera.position.clone(), to: this.finaleTarget(), t: 0, start: this.time + 0.5 };
    if (this.context.reducedMotion) this.finale.t = 1;
  }

  private finaleTarget(): THREE.Vector3 {
    const width = this.sizes.width;
    const card = Math.min(480, width * 0.88);
    const margin = (width - card) / 2 / width;
    const view = finaleView(this.landedTop() + 2.6, this.camera.aspect, FOV, margin);
    return new THREE.Vector3(view.x, view.y, view.z);
  }

  private drawRainbow(): void {
    const kit = this.kit;
    const centre = new THREE.Vector2(0, this.plannedTop() - 1);
    this.rainbow = RAINBOW.map((color, i) => {
      const radius = 7.2 - i * 0.42;
      const points = Array.from({ length: 33 }, (_, k) => {
        const a = Math.PI * (k / 32);
        return new THREE.Vector2(centre.x - Math.cos(a) * radius, centre.y + Math.sin(a) * radius * 0.8);
      });
      const stroke = kit.stroke(points, { width: 0.46, color });
      stroke.uniforms.uProgress.value = this.context.reducedMotion ? 1 : 0;
      stroke.mesh.position.z = -3 + i * 0.01;
      this.scene.add(stroke.mesh);
      return stroke;
    });
  }

  // ---------- hanging blocks ----------

  private letGoOfString(hanger: Hanger, keep = false): void {
    if (!hanger.string) return;
    // The string zips back up (or, for a block lifted away, goes up with it).
    if (!keep) {
      this.loose.push({ stroke: hanger.string, life: this.context.reducedMotion ? 0 : 0.4 });
      hanger.string = null;
    }
  }

  private placeHanger(hanger: Hanger, delta: number): void {
    const reduced = this.context.reducedMotion;
    hanger.enter = reduced ? 1 : Math.min(1, hanger.enter + delta / ENTER_TIME);
    hanger.shake = Math.max(0, hanger.shake - delta * 2.2);
    const swing = reduced ? 0 : SWING[this.context.mode] * Math.sin(this.time * 1.7 + hanger.phase);
    const block = hanger.block.group;
    const lowered = (1 - easeOut(hanger.enter)) * 9;
    const bounce = reduced ? 0 : Math.abs(Math.sin(this.time * 6)) * 0.14 * hanger.hint;
    const shake = reduced ? 0 : Math.sin(this.time * 42) * 0.22 * hanger.shake;
    block.position.set(hanger.slot.x + Math.sin(swing) * PENDULUM + shake, hanger.slot.y + lowered + bounce, 0);
    block.rotation.z = swing;
    this.placeString(hanger);
    hanger.halo.position.set(block.position.x, block.position.y, -1.2);
    hanger.halo.scale.setScalar(4.6);
    hanger.halo.material.opacity = hanger.hint * (reduced ? 0.6 : 0.45 + 0.2 * Math.sin(this.time * 5));
  }

  private placeString(hanger: Hanger): void {
    if (!hanger.string) return;
    const block = hanger.block.group;
    const up = new THREE.Vector3(-Math.sin(block.rotation.z), Math.cos(block.rotation.z), 0);
    hanger.string.mesh.position.copy(block.position).addScaledVector(up, hanger.block.size.height / 2 - 0.05).setZ(-0.05);
    hanger.string.mesh.rotation.z = block.rotation.z;
  }

  private stepHangers(delta: number): void {
    for (const hanger of this.hangers) this.placeHanger(hanger, delta);
    const reduced = this.context.reducedMotion;
    for (const hanger of this.leaving) {
      const block = hanger.block.group;
      hanger.halo.material.opacity = Math.max(0, hanger.halo.material.opacity - delta * 3);
      if (hanger.tumble) {
        const tumble = hanger.tumble;
        tumble.life -= reduced ? tumble.life : delta;
        tumble.velocity.y -= 30 * delta;
        block.position.addScaledVector(tumble.velocity, delta);
        block.rotation.z += tumble.spin * delta;
      } else if (hanger.lift !== null) {
        hanger.lift = reduced ? 1 : Math.min(1, hanger.lift + delta / 0.6);
        block.position.y += delta * 26 * hanger.lift;
        this.placeString(hanger);
      }
    }
    for (const hanger of this.leaving.filter(entry => (entry.tumble ? entry.tumble.life <= 0 : (entry.lift ?? 0) >= 1))) this.removeHanger(hanger);
    this.leaving = this.leaving.filter(entry => (entry.tumble ? entry.tumble.life > 0 : (entry.lift ?? 0) < 1));
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const loose = this.loose[i];
      loose.life -= delta;
      loose.stroke.mesh.position.y += delta * 40;
      loose.stroke.uniforms.uOpacity.value = Math.max(0, loose.life / 0.4);
      if (loose.life <= 0) {
        this.scene.remove(loose.stroke.mesh);
        loose.stroke.mesh.geometry.dispose();
        (loose.stroke.mesh.material as THREE.Material).dispose();
        this.loose.splice(i, 1);
      }
    }
  }

  private removeHanger(hanger: Hanger): void {
    this.scene.remove(hanger.block.group, hanger.halo);
    hanger.block.label.material.map?.dispose();
    hanger.block.label.material.dispose();
    hanger.halo.material.dispose();
    if (hanger.string) {
      this.scene.remove(hanger.string.mesh);
      hanger.string.mesh.geometry.dispose();
      (hanger.string.mesh.material as THREE.Material).dispose();
    }
  }

  // ---------- Nib and the camera ----------

  private stepNib(delta: number): void {
    const reduced = this.context.reducedMotion;
    const top = this.topPlaced(true);
    const landedTop = top.y + top.size.height;
    let running = 0;
    if (this.climb) {
      this.climb.t = Math.min(1, this.climb.t + delta / CLIMB_TIME);
      this.nibY = THREE.MathUtils.lerp(this.climb.from, this.climb.to, ease(this.climb.t));
      running = 1;
      if (this.climb.t >= 1) this.climb = null;
    }
    // At the end Nib climbs on top to stand by the flag.
    if (this.flag) this.standing = reduced ? 1 : Math.min(1, this.standing + delta / 0.5);
    const stand = ease(this.standing);
    const side = top.x + top.size.width / 2 + swayAt(landedTop - 0.5, landedTop, this.sway);
    const cling = new THREE.Vector3(side + 0.05, this.nibY, 0.35);
    const onTop = new THREE.Vector3(top.x + top.size.width * 0.12 + swayAt(landedTop, landedTop, this.sway), landedTop - 0.04, 0.1);
    this.nibHolder.position.lerpVectors(cling, onTop, stand);
    if (!reduced && stand > 0 && stand < 1) this.nibHolder.position.y += Math.sin(Math.PI * stand) * 1.1;
    // Clinging: leaning out from the side, tentacles on the tower, face to the child.
    this.nib.root.rotation.set(0, Math.PI, THREE.MathUtils.lerp(-0.95, 0, stand));
    this.nib.root.position.set(0, 0, 0);

    this.cheer = Math.max(0, this.cheer - delta);
    const blend = 1 - Math.exp(-delta * 10);
    this.pose = {
      run: THREE.MathUtils.lerp(this.pose.run, running, blend),
      air: 0,
      spread: THREE.MathUtils.lerp(this.pose.spread, this.cheer > 0 ? 1 : 0.35, blend),
      squash: 0,
      lookBack: 0,
      wobble: Math.min(1, this.wobble * 1.4),
    };
    this.nib.update(this.time, this.pose, delta);
  }

  private placeCamera(delta: number, snap = false): void {
    const reduced = this.context.reducedMotion;
    if (this.finale && this.time >= this.finale.start) {
      this.finale.t = reduced ? 1 : Math.min(1, this.finale.t + delta / FINALE_TIME);
      this.camera.position.lerpVectors(this.finale.from, this.finale.to, ease(this.finale.t));
      return;
    }
    if (!this.started) return;
    const target = cameraYFor(this.plannedTop(), this.distance, FOV, TOP_AT[this.context.mode]);
    if (snap || reduced) {
      this.cameraY = target;
      this.cameraVelocity = 0;
    } else {
      // A critically damped rise, straight up: no overshoot, no swing.
      const omega = 6;
      const accel = omega * omega * (target - this.cameraY) - 2 * omega * this.cameraVelocity;
      this.cameraVelocity += accel * delta;
      this.cameraY += this.cameraVelocity * delta;
    }
    this.camera.position.set(0, this.cameraY, this.distance);
    if (this.finale) this.finale.from.copy(this.camera.position);
  }

  // ---------- effects ----------

  /** Crayon shavings: a puff from a block letting go, landing or shaking. */
  private puff(at: THREE.Vector3, count: number, colors: THREE.Color[]): void {
    if (this.context.reducedMotion) return;
    for (let i = 0; i < count && this.flakes.length < FLAKES_MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.2;
      this.flakes.push({
        position: at.clone(),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed * 0.8 + 0.6, 0),
        life: 0.6 + Math.random() * 0.3,
        max: 0.9,
        size: 0.14 + Math.random() * 0.14,
        color: colors[i % colors.length],
        spin: (Math.random() - 0.5) * 9,
        gravity: 9,
      });
    }
  }

  /** Crayon confetti: a big block on a streak, and the flag on top. */
  private confetti(at: THREE.Vector3, count: number): void {
    if (this.context.reducedMotion) return;
    const colors = [CRAYON.red, CRAYON.yellow, CRAYON.blue, CRAYON.green, CRAYON.pink, CRAYON.purple, CRAYON.white];
    for (let i = 0; i < count && this.flakes.length < FLAKES_MAX; i++) {
      const angle = Math.PI * (0.15 + 0.7 * Math.random());
      const speed = 5 + Math.random() * 5;
      this.flakes.push({
        position: at.clone(),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0),
        life: 1.4 + Math.random() * 0.6,
        max: 2,
        size: 0.2 + Math.random() * 0.16,
        color: colors[i % colors.length],
        spin: (Math.random() - 0.5) * 10,
        gravity: 7,
      });
    }
  }

  private stepFlakes(delta: number): void {
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 0, 1);
    let alive = 0;
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const flake = this.flakes[i];
      flake.life -= delta;
      if (flake.life <= 0) {
        this.flakes.splice(i, 1);
        continue;
      }
      flake.velocity.y -= flake.gravity * delta;
      flake.velocity.multiplyScalar(1 - delta * 1.2);
      flake.position.addScaledVector(flake.velocity, delta);
      rotation.setFromAxisAngle(axis, flake.spin * (flake.max - flake.life));
      scale.setScalar(flake.size * Math.min(1, (flake.life / flake.max) * 2.5));
      matrix.compose(flake.position, rotation, scale);
      this.flakeMesh.setMatrixAt(alive, matrix);
      this.flakeMesh.setColorAt(alive, flake.color);
      alive++;
    }
    this.flakeMesh.count = alive;
    this.flakeMesh.instanceMatrix.needsUpdate = true;
    if (this.flakeMesh.instanceColor) this.flakeMesh.instanceColor.needsUpdate = true;
  }

  private stepRainbow(delta: number): void {
    if (!this.rainbow) return;
    for (const stroke of this.rainbow) stroke.uniforms.uProgress.value = Math.min(1, stroke.uniforms.uProgress.value + delta / 1.1);
  }

  // ---------- frame ----------

  private readonly loop = (now: number) => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    const raw = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (this.lost || !this.renderer) return;
    if (raw > 0) {
      this.frameTimes.push(raw * 1000);
      if (this.frameTimes.length > 600) this.frameTimes.shift();
    }
    const delta = this.paused ? 0 : Math.min(raw, 0.05);
    this.time += delta;
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private update(delta: number): void {
    this.kit.tick(this.time, this.context.reducedMotion);
    this.stepDrops();
    this.stepTower(delta);
    this.stepHangers(delta);
    this.stepNib(delta);
    this.placeCamera(delta);
    this.stepFlakes(delta);
    this.stepRainbow(delta);
  }
}
