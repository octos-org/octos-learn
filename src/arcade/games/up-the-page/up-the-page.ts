// Up the Page (一页登顶), game D (plan §5.5), in wax crayon on brown kraft
// paper (decision 19). Nib stands on top of a tower. A block hangs on a string
// beside it; each right answer swings the block in, Nib hops, and the block
// lands under Nib's feet. The tower climbs the page past crayon doodles, from
// the grass to the stars. Blocks come in many styles (dots, stars, a gift,
// bricks, a crate, cheese, cake…) and four shapes. In choice mode two blocks
// hang left and right, each with its number on a crayon label; the chosen one
// swings in. A miss the child does not fix still goes in, as a plain cardboard
// box, so the tower keeps climbing.
//
// The challenge: the taller the tower, the more it sways, and Nib has to
// balance. A streak of 3 steadies it (it glows and new blocks land dead on);
// blocks get bigger at 5 and again at 10, with a crayon rainbow. At the end
// Nib plants a flag on top and the view steps back to show the whole tower.
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
import { CRAYON, CrayonKit, flakeTexture, glowTexture, tapeTexture, type CrayonStroke } from "../../render/crayon-kit";
import { Nib, restPose, type NibPose } from "../../render/nib";
import { smoothedForOutline, tierPixelRatio, type QualityTier } from "../../render/notebook-kit";
import { smoothCurve } from "../../render/stroke-geometry";
import type { ArcadeGame, GameContext } from "../types";
import { pageDoodles, type DoodleColor } from "./doodles";
import { blockFaceTexture } from "./faces";
import {
  CARD, cameraYFor, DEPTH, finaleView, HANG, hopLift, hopPath, hopTime, landingOffset, landingTime, NIB_ASIDE, PLINTH, planLooks,
  streakScale, swayAmount, swayAt, swingPath, swingTime, type BlockColor, type BlockLook, type Point, type Size,
} from "./tower";

const FOV = 36;
const DISTANCE = 18;
/** Where the top of the tower shows on screen (−1 bottom, 1 top): Nib and the hanging blocks above the number pad. */
const TOP_AT = { answer: -0.2, choice: -0.28 };
/** The pendulum a hanging block swings on, and how far it swings. */
const PENDULUM = 9;
const SWING = { answer: 0.03, choice: 0.045 };
const STRING_LENGTH = 16;
const ENTER_TIME = 0.45;
const NIB_SCALE = 0.88;
const WALK_SPEED = 3.2;
const DOODLE_Z = -5;
const FLAKES_MAX = 300;
const FINALE_TIME = 2.4;
/** The extra sway after a miss. */
const SWAY_MISS = 0.5;
const RING: Record<Side, THREE.Color> = { left: CRAYON.yellow, right: CRAYON.pink };
const COLORS: Record<BlockColor, THREE.Color> = {
  red: CRAYON.red, blue: CRAYON.blue, yellow: CRAYON.yellow, purple: CRAYON.purple, green: CRAYON.green,
  orange: CRAYON.orange, teal: CRAYON.teal, pink: CRAYON.pink, sky: CRAYON.sky, wood: CRAYON.wood,
};
const DOODLE_COLORS: Record<DoodleColor, THREE.Color> = {
  red: CRAYON.red, orange: CRAYON.orange, yellow: CRAYON.yellow, green: CRAYON.green, darkGreen: new THREE.Color("#3b7f3d"),
  teal: CRAYON.teal, blue: CRAYON.blue, sky: CRAYON.sky, purple: CRAYON.purple, pink: CRAYON.pink, brown: CRAYON.brown,
  white: CRAYON.white, outline: CRAYON.outline,
};
const RAINBOW = [CRAYON.red, CRAYON.orange, CRAYON.yellow, CRAYON.green, CRAYON.blue, CRAYON.purple];

interface BlockView {
  /** Placed in the world; scaled by a streak's growth. */
  group: THREE.Group;
  /** Squashes on landing. */
  inner: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  glow: THREE.Mesh;
  face: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  look: BlockLook | null;
  /** Its size before any streak growth, and now. */
  base: Size;
  size: Size;
}

interface Hanger {
  block: BlockView;
  /** Which side it hangs on, and (in choice mode) the answer button it stands for. */
  side: Side;
  choice: boolean;
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
  landed: boolean;
  squash: number;
}

interface Drop {
  placed: Placed;
  string: CrayonStroke | null;
  from: Point;
  to: Point;
  start: number;
  duration: number;
  spin: number;
  scaleFrom: THREE.Vector2;
  scaleTo: THREE.Vector2;
}

interface Hop { from: Point; to: Point; start: number; duration: number; lift: number }
interface LooseString { stroke: CrayonStroke; life: number }
interface Flake { position: THREE.Vector3; velocity: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color; spin: number; gravity: number }
interface Flyer { group: THREE.Group; wings: THREE.Object3D[]; velocity: number; life: number }

const ease = (s: number) => s * s * (3 - 2 * s);
const easeOut = (s: number) => 1 - (1 - s) * (1 - s) * (1 - s);
const sideSign = (side: Side) => (side === "left" ? -1 : 1);

export class UpThePage implements ArcadeGame {
  readonly id = "up-the-page";
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
  private readonly kit = new CrayonKit();
  private context: GameContext = { quality: "medium", reducedMotion: false, mode: "answer" };
  private distance = DISTANCE;
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private plane!: THREE.PlaneGeometry;
  private glowMap!: THREE.Texture;
  private tapeMap!: THREE.Texture;
  private nib!: Nib;
  private readonly nibHolder = new THREE.Group();
  private started = false;
  private looks: BlockLook[][] = [];
  private readonly stack: Placed[] = [];
  private readonly drops: Drop[] = [];
  private lastLanding = 0;
  private hangers: Hanger[] = [];
  private leaving: Hanger[] = [];
  private hangingItem = -1;
  private readonly loose: LooseString[] = [];
  private readonly flakes: Flake[] = [];
  private flakeMesh!: THREE.InstancedMesh;
  private readonly flyers: Flyer[] = [];
  private nextFlyer = 6;
  private towerGlow!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private rainbow: CrayonStroke[] | null = null;
  private flag: THREE.Group | null = null;
  private flagGrow = 0;
  /** Nib's feet, relative to the middle of the top of the tower when standing. */
  private nibX = 0;
  private nibAside = 0;
  private nibLean = 0;
  private nibSquash = 0;
  private hop: Hop | null = null;
  private pose: NibPose = restPose();
  private cheer = 0;
  private wobble = 0;
  private sway = 0;
  private swayOffset = 0;
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
    this.ensureStarted(20);
    this.running = true;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  onEvent(event: RoundEvent): void {
    switch (event.type) {
      case "round_start":
        this.ensureStarted(event.total);
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
    this.distance = Math.max(DISTANCE, (HANG.x + 2.2) / (tan * this.camera.aspect));
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
    for (const geometry of this.geometries.values()) {
      geometry.dispose();
      smoothedForOutline(geometry).dispose();
    }
    this.geometries.clear();
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

    // Nib, in crayon, standing on top of the tower.
    this.nib = new Nib(kit);
    this.nib.root.scale.setScalar(NIB_SCALE);
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

  private ensureStarted(total: number): void {
    if (this.started) return;
    this.started = true;
    this.looks = planLooks(total + 2, this.context.mode === "choice" ? 2 : 1, Math.floor(Math.random() * 11));
    // The tower stands on a wide slab on the grass.
    const plinth = this.makeBlock("plinth");
    this.stack.push({ block: plinth, x: 0, y: 0, landed: true, squash: 0 });
    this.placeCamera(0, true);
  }

  // ---------- blocks ----------

  private geometry(kind: string, size: Size, drum: boolean): THREE.BufferGeometry {
    const key = `${kind}:${size.width}x${size.height}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = drum
        ? new THREE.CylinderGeometry(size.width / 2, size.width / 2, size.height, 32, 1)
        : new RoundedBoxGeometry(size.width, size.height, DEPTH, 3, kind === "card" ? 0.08 : 0.16);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  /** A crayon block (or the plinth, or a cardboard box), with its face drawn on the front. */
  private makeBlock(kind: BlockLook | "plinth" | "card", text: string | null = null, ring: THREE.Color | null = null): BlockView {
    const kit = this.kit;
    const look = typeof kind === "string" ? null : kind;
    const base = kind === "plinth" ? { ...PLINTH } : kind === "card" ? { ...CARD } : { ...kind.size };
    const drum = look?.style.shape === "drum";
    const color = kind === "plinth" ? CRAYON.brown : kind === "card" ? CRAYON.card : COLORS[kind.color];
    const geometry = this.geometry(typeof kind === "string" ? kind : kind.style.shape, base, drum);
    const group = new THREE.Group();
    const inner = new THREE.Group();
    const body = new THREE.Mesh(geometry, kit.surface(color, kind === "card" ? 0.95 : undefined));
    const hull = new THREE.Mesh(smoothedForOutline(geometry), kit.outline(0.045));
    hull.renderOrder = -1;
    const glow = new THREE.Mesh(smoothedForOutline(geometry), kit.glowOutline(0.2));
    glow.renderOrder = -2;
    glow.visible = false;
    const face = new THREE.Mesh(this.plane, kit.own(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
    const faceSize = { width: drum ? base.width * 0.84 : base.width - 0.12, height: base.height - 0.12 };
    face.scale.set(faceSize.width, faceSize.height, 1);
    face.position.z = (drum ? base.width / 2 : DEPTH / 2) + 0.02;
    face.renderOrder = 2;
    face.userData.size = faceSize;
    inner.add(body, hull, glow, face);
    group.add(inner);
    this.scene.add(group);
    const block: BlockView = { group, inner, body, glow, face, look, base, size: { ...base } };
    if (kind === "card") {
      face.material.map = this.tapeMap;
      face.scale.set(faceSize.width, faceSize.width * 0.5, 1);
    } else if (kind === "plinth") face.visible = false;
    else this.drawFace(block, text, ring);
    return block;
  }

  private drawFace(block: BlockView, text: string | null, ring: THREE.Color | null): void {
    if (!block.look) return;
    const material = block.face.material;
    material.map?.dispose();
    material.map = blockFaceTexture(this.kit, block.look.style.deco, COLORS[block.look.color], block.face.userData.size as Size, text, ring, Math.floor(Math.random() * 10000));
    material.needsUpdate = true;
  }

  // ---------- the tower ----------

  private topPlaced(landedOnly: boolean): Placed {
    for (let i = this.stack.length - 1; i >= 0; i--) if (!landedOnly || this.stack[i].landed) return this.stack[i];
    return this.stack[0];
  }

  private plannedTop(): number {
    const top = this.topPlaced(false);
    return top.y + top.block.size.height;
  }

  private landedTop(): number {
    const top = this.topPlaced(true);
    return top.y + top.block.size.height;
  }

  /** Swings a block in from where it is onto the top of the tower; Nib hops so it lands under Nib's feet. */
  private release(block: BlockView, string: CrayonStroke | null, scale: { x: number; y: number }): void {
    const reduced = this.context.reducedMotion;
    const below = this.topPlaced(false);
    const top = this.plannedTop();
    const size = { width: block.base.width * scale.x, height: block.base.height * scale.y };
    const placed: Placed = { block, x: landingOffset(below.x, Math.min(1, this.sway / 0.6), Math.random() * 2 - 1), y: top, landed: false, squash: 0 };
    this.stack.push(placed);
    const from = { x: block.group.position.x, y: block.group.position.y };
    const to = { x: placed.x, y: top + size.height / 2 };
    const landAt = landingTime(this.time, swingTime(from, to), this.lastLanding);
    this.lastLanding = landAt;
    block.size = size;
    block.glow.visible = true;
    this.drops.push({
      placed, string, from, to,
      start: this.time,
      duration: landAt - this.time,
      spin: block.group.rotation.z,
      scaleFrom: new THREE.Vector2(block.group.scale.x, block.group.scale.y),
      scaleTo: new THREE.Vector2(scale.x, scale.y),
    });
    // Nib hops at once, and comes down on the new block just after it lands, on the far side from where it came.
    const into = Math.sign(to.x - from.x) || 1;
    const nibFrom = { x: this.nibHolder.position.x, y: this.nibHolder.position.y };
    const nibTo = { x: to.x + into * 0.3, y: top + size.height };
    this.hop = { from: nibFrom, to: nibTo, start: this.time, duration: hopTime(landAt - this.time), lift: hopLift(nibTo.y - nibFrom.y) };
    this.nibAside = into * 0.3;
    if (reduced) this.stepDrops(true);
  }

  private stepDrops(cut = false): void {
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i];
      const block = drop.placed.block;
      const s = cut || drop.duration <= 0 ? 1 : Math.min(1, (this.time - drop.start) / drop.duration);
      const point = swingPath(drop.from, drop.to, s);
      const sway = swayAt(drop.to.y, this.landedTop(), this.swayOffset);
      block.group.position.set(point.x + sway * s, point.y, 0);
      block.group.rotation.z = drop.spin * (1 - ease(s));
      const grow = ease(Math.min(1, s * 2.2));
      block.group.scale.set(THREE.MathUtils.lerp(drop.scaleFrom.x, drop.scaleTo.x, grow), THREE.MathUtils.lerp(drop.scaleFrom.y, drop.scaleTo.y, grow), 1);
      if (drop.string) this.placeString(drop.string, block);
      if (s >= 1) {
        this.drops.splice(i--, 1);
        if (drop.string) this.loose.push({ stroke: drop.string, life: this.context.reducedMotion ? 0 : 0.4 });
        this.land(drop.placed);
      }
    }
    if (cut && this.hop) this.hop.start = -Infinity;
  }

  private land(placed: Placed): void {
    placed.landed = true;
    placed.squash = 1;
    const block = placed.block;
    const color = (block.body.material.uniforms.uColor.value as THREE.Color).clone();
    for (const side of [-1, 1]) this.puff(new THREE.Vector3(placed.x + side * block.size.width * 0.45, placed.y, 1.2), 6, [color, CRAYON.white]);
    if (this.streak >= 5 && block.group.scale.y > 1.01) this.confetti(new THREE.Vector3(placed.x, placed.y + block.size.height, 1.2), 18);
    // A small bump, unless a streak holds the tower steady.
    this.wobble = Math.max(this.wobble, this.steady > 0.5 ? 0 : 0.14);
    if (this.finished && !this.drops.length) this.plantFlag();
  }

  private stepTower(delta: number): void {
    const reduced = this.context.reducedMotion;
    // The taller the tower, the more it sways; a streak of 3 holds it steady; a miss shakes it.
    const steadyTarget = this.streak >= 3 ? 1 : 0;
    this.steady = reduced ? steadyTarget : THREE.MathUtils.lerp(this.steady, steadyTarget, 1 - Math.exp(-delta * 4));
    this.kit.uniforms.uGlow.value = this.steady;
    this.wobble = Math.max(0, this.wobble - delta * 0.7);
    const top = this.landedTop();
    const calm = swayAmount(top, this.steady);
    this.sway = calm + SWAY_MISS * this.wobble;
    this.swayOffset = reduced ? 0 : calm * Math.sin(this.time * (1.55 - Math.min(0.5, top * 0.012))) + SWAY_MISS * this.wobble * this.wobble * Math.sin(this.time * 6.5);
    for (const placed of this.stack) {
      if (!placed.landed) continue;
      placed.squash = Math.max(0, placed.squash - delta * 5);
      const block = placed.block;
      const middle = placed.y + block.size.height / 2;
      block.group.position.set(placed.x + swayAt(middle, top, this.swayOffset), middle, 0);
      block.group.rotation.z = top > 0 ? (-this.swayOffset * 1.5 * Math.sqrt(Math.max(0, middle / top))) / top : 0;
      const squash = Math.sin(placed.squash * Math.PI) * 0.12;
      block.inner.scale.set(1 + squash, 1 - squash, 1 + squash);
      block.inner.position.y = (-squash * block.base.height) / 2;
    }
    this.towerGlow.position.set(0, top - 1.2, -1.6);
    this.towerGlow.scale.setScalar(11);
    this.towerGlow.material.opacity = this.steady * 0.55;
    if (this.flag) {
      this.flagGrow = reduced ? 1 : Math.min(1, this.flagGrow + delta * 2.5);
      const placed = this.topPlaced(true);
      this.flag.position.set(placed.x - placed.block.size.width * 0.3 + swayAt(top, top, this.swayOffset), top, 0.2);
      this.flag.scale.set(1, easeOut(this.flagGrow), 1);
    }
  }

  // ---------- events ----------

  private showItem(index: number, choices: [number, number] | null, expected: number): void {
    this.ensureStarted(20);
    this.settleHangers();
    this.hangingItem = index;
    const looks = this.looks[index] ?? planLooks(1, 2, index)[0];
    const top = this.plannedTop();
    if (this.context.mode === "choice" && choices) {
      (["left", "right"] as const).forEach((side, k) => {
        const look = looks[k] ?? looks[0];
        const block = this.makeBlock(look, String(choices[k]), RING[side]);
        const slot = new THREE.Vector3(sideSign(side) * HANG.x, top + HANG.above + look.size.height / 2, 0);
        this.hangers.push(this.makeHanger(block, side, true, choices[k] === expected, slot, k * Math.PI));
      });
      this.nibAside = 0;
    } else {
      // One block, on alternate sides; Nib steps over to the other side of the top.
      const side: Side = index % 2 === 0 ? "right" : "left";
      const look = looks[0];
      const block = this.makeBlock(look, "?", null);
      const slot = new THREE.Vector3(sideSign(side) * HANG.x, top + HANG.above + look.size.height / 2, 0);
      this.hangers.push(this.makeHanger(block, side, false, true, slot, 0));
      this.nibAside = -sideSign(side) * NIB_ASIDE;
    }
  }

  private makeHanger(block: BlockView, side: Side, choice: boolean, real: boolean, slot: THREE.Vector3, phase: number): Hanger {
    const kit = this.kit;
    const string = kit.stroke([new THREE.Vector2(0, 0), new THREE.Vector2(0, STRING_LENGTH * 0.5), new THREE.Vector2(0, STRING_LENGTH)], { width: 0.09, color: CRAYON.outline });
    this.scene.add(string.mesh);
    const halo = new THREE.Mesh(this.plane, kit.own(new THREE.MeshBasicMaterial({ map: this.glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
    halo.renderOrder = -3;
    this.scene.add(halo);
    const hanger: Hanger = { block, side, choice, real, string, halo, slot, enter: this.context.reducedMotion ? 1 : 0, phase, shake: 0, hint: 0, tumble: null, lift: null };
    this.placeHanger(hanger, 0);
    return hanger;
  }

  /** The item moved on without a right answer: a cardboard box swings in instead; any other block leaves. */
  private settleHangers(): void {
    for (const hanger of this.hangers) {
      if (hanger.real && !hanger.tumble) {
        const card = this.makeBlock("card");
        card.group.position.copy(hanger.block.group.position);
        card.group.rotation.z = hanger.block.group.rotation.z;
        const string = hanger.string;
        hanger.string = null;
        this.removeHanger(hanger);
        this.release(card, string, { x: 1, y: 1 });
      } else this.sendAway(hanger);
    }
    this.hangers = [];
  }

  private sendAway(hanger: Hanger): void {
    if (!hanger.tumble) hanger.lift = 0;
    this.leaving.push(hanger);
  }

  private correct(index: number, given: number, streak: number): void {
    if (index !== this.hangingItem) return;
    const real = this.hangers.find(hanger => hanger.real && !hanger.tumble);
    if (!real) return;
    if (!real.choice) this.drawFace(real.block, String(given), null);
    const color = (real.block.body.material.uniforms.uColor.value as THREE.Color).clone();
    // Straight away: a puff of crayon from the block as it lets go.
    this.puff(real.block.group.position.clone().setZ(1.2), streak >= 5 ? 16 : 10, [color, CRAYON.white]);
    this.scene.remove(real.halo);
    real.halo.material.dispose();
    const string = real.string;
    real.string = null;
    this.release(real.block, string, streakScale(streak));
    for (const hanger of this.hangers) if (hanger !== real) this.sendAway(hanger);
    this.hangers = [];
    this.hangingItem = -1;
    if (streak >= 10 && !this.rainbow) this.drawRainbow();
    if (streak === 3 || streak === 5 || streak === 10) this.cheer = Math.max(this.cheer, 1);
  }

  /** A miss: at once, the block shakes (or a wrong block's string snaps), the tower wobbles and Nib teeters. */
  private wrong(side?: Side): void {
    this.wobble = 1;
    this.cheer = 0;
    const chosen = side ? this.hangers.find(hanger => hanger.choice && hanger.side === side) : undefined;
    if (chosen && !chosen.real) {
      this.letGo(chosen);
      chosen.tumble = { velocity: new THREE.Vector3(sideSign(chosen.side) * 2.4, 3, 0), spin: sideSign(chosen.side) * -3.2, life: 1.6 };
      this.puff(chosen.block.group.position.clone().setZ(1.2), 12, [CRAYON.outline, CRAYON.card]);
      this.hangers = this.hangers.filter(hanger => hanger !== chosen);
      this.leaving.push(chosen);
    } else {
      for (const hanger of this.hangers) hanger.shake = 1;
      const shaken = this.hangers[0];
      if (shaken) this.puff(shaken.block.group.position.clone().setZ(1.2), 8, [CRAYON.outline]);
    }
    // The right block glows, so the child can fix it straight away.
    for (const hanger of this.hangers) if (hanger.real && hanger.choice) hanger.hint = 1;
  }

  private shown(expected: number): void {
    for (const hanger of [...this.hangers]) {
      if (!hanger.real) {
        this.sendAway(hanger);
        this.hangers = this.hangers.filter(entry => entry !== hanger);
      } else {
        hanger.hint = 1;
        if (!hanger.choice) this.drawFace(hanger.block, String(expected), null);
      }
    }
  }

  private end(): void {
    this.finished = true;
    this.settleHangers();
    this.hangingItem = -1;
    this.nibAside = 0.45;
    this.cheer = 3;
    if (!this.drops.length) this.plantFlag();
  }

  /** The top of the page: Nib plants a flag on top, and the view steps back. */
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
    this.cheer = 3;
    this.confetti(new THREE.Vector3(0, this.landedTop() + 1, 1.2), 40);
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

  /** The string zips back up. */
  private letGo(hanger: Hanger): void {
    if (!hanger.string) return;
    this.loose.push({ stroke: hanger.string, life: this.context.reducedMotion ? 0 : 0.4 });
    hanger.string = null;
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
    if (hanger.string) this.placeString(hanger.string, hanger.block);
    hanger.halo.position.set(block.position.x, block.position.y, -1.2);
    hanger.halo.scale.setScalar(4.6);
    hanger.halo.material.opacity = hanger.hint * (reduced ? 0.6 : 0.45 + 0.2 * Math.sin(this.time * 5));
  }

  private placeString(string: CrayonStroke, block: BlockView): void {
    const group = block.group;
    const up = new THREE.Vector3(-Math.sin(group.rotation.z), Math.cos(group.rotation.z), 0);
    string.mesh.position.copy(group.position).addScaledVector(up, (block.base.height * group.scale.y) / 2 - 0.05).setZ(-0.05);
    string.mesh.rotation.z = group.rotation.z;
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
        if (hanger.string) this.placeString(hanger.string, hanger.block);
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
        this.disposeStroke(loose.stroke);
        this.loose.splice(i, 1);
      }
    }
  }

  private disposeStroke(stroke: CrayonStroke): void {
    this.scene.remove(stroke.mesh);
    stroke.mesh.geometry.dispose();
    (stroke.mesh.material as THREE.Material).dispose();
  }

  private removeHanger(hanger: Hanger): void {
    this.scene.remove(hanger.block.group, hanger.halo);
    hanger.block.face.material.map?.dispose();
    hanger.block.face.material.dispose();
    hanger.halo.material.dispose();
    if (hanger.string) this.disposeStroke(hanger.string);
    hanger.string = null;
  }

  // ---------- Nib and the camera ----------

  private stepNib(delta: number): void {
    const reduced = this.context.reducedMotion;
    const top = this.topPlaced(true);
    const landedTop = top.y + top.block.size.height;
    const topSway = swayAt(landedTop, landedTop, this.swayOffset);
    let airborne = false;
    let walking = 0;
    if (this.hop) {
      const s = Math.min(1, (this.time - this.hop.start) / this.hop.duration);
      const point = hopPath(this.hop.from, this.hop.to, s, this.hop.lift);
      this.nibHolder.position.set(point.x + topSway * s, point.y, 0.25);
      airborne = s < 1;
      if (s >= 1) {
        this.hop = null;
        this.nibX = this.nibHolder.position.x - top.x - topSway;
        this.nibSquash = 1;
      }
    }
    if (!this.hop) {
      // Standing on top: step over, away from the block about to come in, and balance.
      const halfTop = top.block.size.width / 2 - 0.45;
      const target = Math.max(-halfTop, Math.min(halfTop, this.nibAside));
      const step = reduced ? Infinity : WALK_SPEED * delta;
      const before = this.nibX;
      this.nibX += Math.max(-step, Math.min(step, target - this.nibX));
      walking = Math.abs(this.nibX - before) > 1e-4 ? 1 : 0;
      this.nibHolder.position.set(top.x + this.nibX + topSway, landedTop - 0.02, 0.25);
    }
    // Lean against the sway; teeter after a miss.
    const lean = reduced ? 0 : -this.swayOffset * 0.9 + Math.sin(this.time * 9) * 0.25 * this.wobble * this.wobble;
    this.nibLean = THREE.MathUtils.lerp(this.nibLean, lean, 1 - Math.exp(-delta * 10));
    const facing = this.hangers.find(hanger => hanger.real) ?? this.hangers[0];
    const turn = facing && !this.finished ? sideSign(facing.side) * 0.3 : 0;
    this.nib.root.rotation.set(0, Math.PI - turn, airborne ? 0 : this.nibLean);

    this.cheer = Math.max(0, this.cheer - delta);
    this.nibSquash = Math.max(0, this.nibSquash - delta * 4);
    const balance = Math.min(1, this.sway / 0.6);
    const blend = 1 - Math.exp(-delta * 10);
    this.pose = {
      run: THREE.MathUtils.lerp(this.pose.run, walking, blend),
      air: THREE.MathUtils.lerp(this.pose.air, airborne ? 1 : 0, blend),
      spread: THREE.MathUtils.lerp(this.pose.spread, this.cheer > 0 ? 1 : airborne ? 0.7 : 0.15 + 0.6 * balance, blend),
      squash: Math.sin(this.nibSquash * Math.PI) * 0.8,
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

  /** Now and then a crayon bird flaps past behind the tower, near the top. */
  private stepFlyers(delta: number): void {
    if (this.context.reducedMotion || this.finished) return;
    this.nextFlyer -= delta;
    if (this.nextFlyer <= 0 && this.flyers.length < 2) {
      this.nextFlyer = 7 + Math.random() * 6;
      const kit = this.kit;
      const group = new THREE.Group();
      const wings = [-1, 1].map(side => {
        const pivot = new THREE.Group();
        const stroke = kit.stroke([new THREE.Vector2(0, 0), new THREE.Vector2(side * 0.35, 0.22), new THREE.Vector2(side * 0.7, 0.08)], { width: 0.1, color: CRAYON.outline });
        pivot.add(stroke.mesh);
        group.add(pivot);
        return pivot;
      });
      const fromLeft = Math.random() < 0.5;
      group.position.set(fromLeft ? -16 : 16, this.plannedTop() + 3.2 + Math.random() * 1.6, -2.5);
      this.scene.add(group);
      this.flyers.push({ group, wings, velocity: fromLeft ? 3.4 : -3.4, life: 10 });
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const flyer = this.flyers[i];
      flyer.life -= delta;
      flyer.group.position.x += flyer.velocity * delta;
      flyer.group.position.y += Math.sin(this.time * 2 + i) * 0.4 * delta;
      const flap = Math.sin(this.time * 11 + i) * 0.55;
      flyer.wings[0].rotation.z = -flap;
      flyer.wings[1].rotation.z = flap;
      if (flyer.life <= 0) {
        this.scene.remove(flyer.group);
        flyer.group.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
          }
        });
        this.flyers.splice(i, 1);
      }
    }
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
    this.stepTower(delta);
    this.stepDrops();
    this.stepHangers(delta);
    this.stepNib(delta);
    this.placeCamera(delta);
    this.stepFlakes(delta);
    this.stepFlyers(delta);
    this.stepRainbow(delta);
  }
}
