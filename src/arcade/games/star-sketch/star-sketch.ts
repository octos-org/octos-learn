// Star Sketch (星星连线), game C (plan §5.5), in white gel pen and chalk on
// black paper (decision 19). Nib holds a gel pen; each answer draws one line
// of a constellation. Finishing one brings its chalk creature to life, and it
// drifts off to live in the sky behind. In choice mode two candidate stars,
// each with a chalk number, sit left and right. A streak makes the lines glow,
// then sparkle, then sends shooting stars across the sky.
//
// Every answer gets a response at once (owner, 2026-11-26). The camera never
// moves (plan §5.7). The game only renders round events (plan §5.3, §7.8).

import * as THREE from "three";
import type { Side } from "../../core/choices";
import { expectedAnswer } from "../../core/facts";
import type { RoundEvent } from "../../core/round-engine";
import { CHALK, ChalkKit, chalkNumberTexture, haloTexture, starTexture, type Stroke } from "../../render/chalk-kit";
import { circlePoints, smoothCurve } from "../../render/stroke-geometry";
import { Nib, restPose, type NibPose } from "../../render/nib";
import { tierPixelRatio, type QualityTier } from "../../render/notebook-kit";
import type { ArcadeGame, GameContext } from "../types";
import { CONSTELLATIONS, decoyFor, linesOf, planSky, type Constellation, type PartDef, type Point, type SkyPlan } from "./constellations";

const FOV = 40;
const CAMERA_Z = 24;
/**
 * Where the constellation being drawn sits, and its size: in the band between
 * the fact strip and the number pad; lower and a little bigger in choice
 * mode, which has no number pad.
 */
const LAYOUT = { answer: { centre: new THREE.Vector3(0, 0, 0), scale: 1 }, choice: { centre: new THREE.Vector3(0, -0.7, 0), scale: 1.12 } };
const LINE_WIDTH = 0.2;
const CREATURE_WIDTH = 0.22;
const DRAW_TIME = 0.42;
const FLY_TIME = 1.0;
const RECEDE_TIME = 1.7;
const REVEAL_TIME = 0.9;
/** How long a finished constellation stays in the middle, alive, before drifting off. */
const LINGER = 1.5;
const NIB_SCALE = 1.25;
/** Finished constellations go to live in the sky behind, at these places (as seen on screen). */
const SLOTS: Point[] = [[-10.6, 5.0], [10.6, 5.0], [-11.6, 1.2], [11.6, 1.2]];
const SLOT_Z = -8;
const SLOT_SCALE = 0.36;
const SPARKS_MAX = 240;
const GLOW_COLORS = [CHALK.yellow, CHALK.mint, CHALK.pink, CHALK.blue, CHALK.lilac];
const CREATURE_COLORS: Record<Constellation["color"], THREE.Color> = {
  blue: CHALK.blue, coral: CHALK.coral, yellow: CHALK.yellow, mint: CHALK.mint, pink: CHALK.pink, lilac: CHALK.lilac,
};
const TAG_RINGS: Record<Side, THREE.Color> = { left: CHALK.yellow, right: CHALK.pink };

type LineStyle = "solid" | "fixed" | "dotted" | "bonus";
type StarState = "hidden" | "dim" | "candidate" | "lit";

interface StarView {
  group: THREE.Group;
  glyph: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  ring: Stroke;
  state: StarState;
  /** The next star to reach (answer mode): it pulses inside a chalk ring. */
  targeted: boolean;
  appear: number;
  delay: number;
  shake: number;
  /** Fading away (a decoy after the answer), 0–1. */
  fading: number | null;
  seed: number;
}

interface Sky {
  def: Constellation;
  group: THREE.Group;
  stars: StarView[];
  /** Decoy stars in choice mode. */
  extras: StarView[];
  lines: Stroke[];
  /** Lines queued so far, and lines finished. */
  queued: number;
  drawn: number;
  creature: THREE.Group | null;
  parts: { group: THREE.Group; def: PartDef; base: THREE.Vector3 }[];
  creatureStrokes: Stroke[];
  reveal: number;
  age: number;
  /** When it came to life (game time). */
  aliveAt: number;
  /** When it starts drifting off to the sky behind, then how far it has gone (0–1). */
  leaveAt: number | null;
  recede: number | null;
  slot: number;
}

interface Candidate { star: StarView; tag: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; side: Side; real: boolean; fading: number | null }

interface Action {
  duration: number;
  elapsed: number;
  started: boolean;
  begin(): void;
  step(s: number): void;
  end(): void;
}

interface Spark { position: THREE.Vector3; velocity: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color; spin: number }
interface Comet { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; velocity: THREE.Vector3; life: number }

const ease = (s: number) => s * s * (3 - 2 * s);

export class StarSketch implements ArcadeGame {
  readonly id = "star-sketch";
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 200);
  private readonly kit = new ChalkKit();
  private context: GameContext = { quality: "medium", reducedMotion: false, mode: "answer" };
  private paper!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private starMap!: THREE.Texture;
  private plane!: THREE.PlaneGeometry;
  private haloMap!: THREE.Texture;
  private readonly rider = new THREE.Group();
  private readonly holder = new THREE.Group();
  private readonly pen = new THREE.Group();
  private nib!: Nib;
  private plan: SkyPlan | null = null;
  private readonly skies: Sky[] = [];
  /** The sky on screen, and the sky Nib will be at once everything queued is done. */
  private active = -1;
  private queuedSky = -1;
  private receded = 0;
  private readonly drawn = new Map<number, LineStyle>();
  private readonly actions: Action[] = [];
  private candidates: Candidate[] = [];
  /** Candidates on their way out: their numbers fade. */
  private leaving: Candidate[] = [];
  private readonly sparks: Spark[] = [];
  private sparkMesh!: THREE.InstancedMesh;
  private readonly comets: Comet[] = [];
  private cometMap!: THREE.Texture;
  private cometShape!: THREE.PlaneGeometry;
  private nextComet = 0;
  private readonly here = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3(1, 0, 0);
  private side = 1;
  private lunge: { direction: THREE.Vector3; t: number } | null = null;
  private pose: NibPose = restPose();
  private readonly target: NibPose = { ...restPose(), air: 0.6 };
  private cheer = 0;
  private wobble = 0;
  private streak = 0;
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
    renderer.setClearColor(CHALK.paper);
    renderer.domElement.className = "arcade-game-canvas";
    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    host.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.buildWorld();
    const rect = host.getBoundingClientRect();
    this.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
    this.running = true;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  onEvent(event: RoundEvent): void {
    switch (event.type) {
      case "round_start":
        this.startRound(event.total);
        break;
      case "countdown":
        this.wobble = Math.max(this.wobble, 0.3);
        break;
      case "item_shown":
        this.showItem(event.index, event.choices ?? null, expectedAnswer(event.item));
        break;
      case "answer_correct":
        this.streak = event.streak;
        this.correct(event.index, event.streak);
        break;
      case "answer_wrong":
        this.streak = 0;
        this.wrong(event.index, event.side);
        break;
      case "answer_shown":
        this.streak = 0;
        this.shown();
        break;
      case "answer_corrected":
        this.correct(event.index, 0, true);
        break;
      case "round_end":
        this.finale();
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
    this.kit.setPixelRatio(ratio);
    this.camera.aspect = this.sizes.width / this.sizes.height;
    // Narrow screens: step back until the constellation fits across.
    const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.camera.position.set(0, 0, Math.max(CAMERA_Z, 8.4 / (half * this.camera.aspect)));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
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
    this.sparkMesh?.dispose();
    this.kit.dispose();
    if (this.renderer) {
      this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.renderer = null;
    this.skies.length = 0;
    this.scene.clear();
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  // ---------- world ----------

  private buildWorld(): void {
    const kit = this.kit;
    this.paper = kit.createNightPaper(220, 130) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    this.paper.position.z = -30;
    this.scene.add(this.paper);
    this.starMap = starTexture(kit);
    this.plane = kit.own(new THREE.PlaneGeometry(1, 1));
    this.haloMap = haloTexture(kit);

    // Nib, in chalk with a gel-pen outline, holding a gel pen.
    this.nib = new Nib(kit);
    this.nib.root.scale.setScalar(NIB_SCALE);
    this.holder.add(this.nib.root);
    const barrel = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.075, 0.075, 0.9, 10)), kit.surface(CHALK.blue, 0.95));
    barrel.position.y = 0.62;
    const grip = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.085, 0.085, 0.26, 10)), kit.surface(CHALK.white, 0.9));
    grip.position.y = 0.2;
    const tip = new THREE.Mesh(kit.own(new THREE.ConeGeometry(0.075, 0.16, 10)), kit.surface(CHALK.white, 1));
    tip.rotation.x = Math.PI;
    tip.position.y = 0.0;
    this.pen.add(barrel, grip, tip);
    this.pen.children.forEach(child => { child.position.y += 0.08; });
    this.holder.add(this.pen);
    this.rider.add(this.holder);
    this.scene.add(this.rider);

    // Sparkles.
    this.sparkMesh = new THREE.InstancedMesh(
      kit.own(new THREE.PlaneGeometry(1, 1)),
      kit.own(new THREE.MeshBasicMaterial({ map: this.starMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
      SPARKS_MAX,
    );
    this.sparkMesh.count = 0;
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.renderOrder = 8;
    this.scene.add(this.sparkMesh);

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 8;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.85, "rgba(255,255,255,0.8)");
    gradient.addColorStop(1, "rgba(255,255,255,1)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 8);
    this.cometMap = kit.own(new THREE.CanvasTexture(canvas));
    this.cometShape = kit.own(new THREE.PlaneGeometry(4.5, 0.09));
    this.cometMap.colorSpace = THREE.SRGBColorSpace;
  }

  private startRound(total: number): void {
    this.plan = planSky(total, Math.floor(Math.random() * CONSTELLATIONS.length));
    this.enterSky(0, true);
    this.queuedSky = 0;
    this.placeRiderAt(this.starWorld(this.skies[0], this.skies[0].def.path[0]));
  }

  private planFor(total = 20): SkyPlan {
    if (!this.plan) this.startRound(total);
    return this.plan!;
  }

  private skyAt(index: number): Sky {
    if (!this.skies[index]) this.skies[index] = this.buildSky(index);
    return this.skies[index];
  }

  private buildSky(index: number): Sky {
    const def = CONSTELLATIONS[this.planFor().constellations[index]];
    const group = new THREE.Group();
    const layout = LAYOUT[this.context.mode];
    group.position.copy(layout.centre);
    group.scale.setScalar(layout.scale);
    group.visible = false;
    this.scene.add(group);
    const choice = this.context.mode === "choice";
    const stars = def.stars.map((point, k) => {
      const star = this.makeStar(group, point);
      star.delay = k * 0.06;
      // In choice mode the stars still to come stay hidden, so the pattern never gives the answer away.
      star.state = k === def.path[0] ? "lit" : choice ? "hidden" : "dim";
      return star;
    });
    return { def, group, stars, extras: [], lines: [], queued: 0, drawn: 0, creature: null, parts: [], creatureStrokes: [], reveal: 0, age: 0, aliveAt: -Infinity, leaveAt: null, recede: null, slot: -1 };
  }

  private makeStar(parent: THREE.Group, point: Point): StarView {
    const kit = this.kit;
    const group = new THREE.Group();
    group.position.set(point[0], point[1], 0.05);
    const plane = this.plane;
    const halo = new THREE.Mesh(plane, kit.own(new THREE.MeshBasicMaterial({ map: this.haloMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
    halo.renderOrder = 3;
    const glyph = new THREE.Mesh(plane, kit.own(new THREE.MeshBasicMaterial({ map: this.starMap, transparent: true, depthWrite: false, color: CHALK.dim.clone() })));
    glyph.renderOrder = 5;
    const ring = kit.stroke(circlePoints(0, 0, 0.95, 28), { width: 0.1, color: CHALK.white, kind: "chalk", opacity: 0 });
    ring.mesh.renderOrder = 4;
    group.add(halo, glyph, ring.mesh);
    parent.add(group);
    return { group, glyph, halo, ring, state: "dim", targeted: false, appear: 0, delay: 0, shake: 0, fading: null, seed: Math.random() * 10 };
  }

  private starWorld(sky: Sky, index: number): THREE.Vector3 {
    sky.group.updateMatrixWorld();
    const [x, y] = sky.def.stars[index];
    return sky.group.localToWorld(new THREE.Vector3(x, y, 0.3));
  }

  /**
   * Shows sky `index`. The one before stays a moment longer, alive, then goes
   * to live in the sky behind; the new stars come out as it leaves. Nib does
   * not wait for any of this.
   */
  private enterSky(index: number, instant = false): void {
    const reduced = this.context.reducedMotion;
    const previous = this.skies[this.active];
    let wait = 0;
    if (previous && previous !== this.skies[index]) {
      previous.leaveAt = reduced ? this.time : Math.max(this.time, previous.aliveAt + LINGER);
      previous.slot = this.receded++ % SLOTS.length;
      for (const star of previous.stars) star.targeted = false;
      wait = previous.leaveAt - this.time;
    }
    const sky = this.skyAt(index);
    sky.group.visible = true;
    // `appear` grows 3 a second: start it below zero to wait.
    // The first star comes out at once: Nib is on its way there.
    sky.stars.forEach((star, k) => {
      star.appear = instant || reduced ? 1 : -(star.delay + (k === sky.def.path[0] ? 0 : wait * 0.6)) * 3;
    });
    this.active = index;
  }

  // ---------- events ----------

  private showItem(index: number, choices: [number, number] | null, expected: number): void {
    const plan = this.planFor();
    this.clearCandidates();
    // A line the child did not get is still drawn, dotted, so the picture carries on.
    for (let k = 0; k < index; k++) if (!this.drawn.has(k)) this.queueDraw(k, "dotted");
    const segment = plan.segments[index];
    if (!segment) return;
    this.ensureSky(segment.constellation);
    const sky = this.skyAt(segment.constellation);
    for (const star of sky.stars) star.targeted = false;
    const next = sky.stars[segment.to];
    if (this.context.mode === "choice" && choices) {
      const realSide: Side = choices[0] === expected ? "left" : "right";
      const decoyPoint = decoyFor(sky.def.stars[segment.from], sky.def.stars[segment.to], realSide, sky.def.stars);
      const decoy = this.makeStar(sky.group, decoyPoint);
      sky.extras.push(decoy);
      decoy.state = "candidate";
      decoy.appear = this.context.reducedMotion ? 1 : 0;
      if (next.state === "hidden") {
        next.state = "candidate";
        next.appear = this.context.reducedMotion ? 1 : 0;
      }
      const decoySide: Side = realSide === "left" ? "right" : "left";
      this.candidates = [
        { star: next, tag: this.makeTag(sky, sky.def.stars[segment.to], choices[realSide === "left" ? 0 : 1], realSide), side: realSide, real: true, fading: null },
        { star: decoy, tag: this.makeTag(sky, decoyPoint, choices[decoySide === "left" ? 0 : 1], decoySide), side: decoySide, real: false, fading: null },
      ];
    } else {
      next.targeted = true;
    }
    this.lookAt.copy(this.starWorld(sky, segment.to));
  }

  private makeTag(sky: Sky, point: Point, value: number, side: Side): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const kit = this.kit;
    const tag = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(2.3, 2.3)), kit.own(new THREE.MeshBasicMaterial({ map: chalkNumberTexture(kit, String(value), TAG_RINGS[side]), transparent: true, depthWrite: false, opacity: 0 })));
    const above = point[1] < 2.2;
    tag.position.set(point[0], point[1] + (above ? 1.9 : -1.9), 0.1);
    tag.renderOrder = 6;
    sky.group.add(tag);
    return tag;
  }

  private clearCandidates(): void {
    for (const candidate of this.candidates) this.fadeCandidate(candidate, !candidate.real);
  }

  /** Fades a candidate's number (and a decoy's star) and takes it off the list. */
  private fadeCandidate(candidate: Candidate, starToo: boolean): void {
    candidate.fading = 0;
    if (starToo) candidate.star.fading = 0;
    this.candidates = this.candidates.filter(entry => entry !== candidate);
    this.leaving.push(candidate);
  }

  private correct(index: number, streak: number, fixed = false): void {
    const plan = this.planFor();
    const segment = plan.segments[index];
    if (!segment) return;
    // Straight away: the star it is heading for bursts, whatever Nib is doing.
    const sky = this.skyAt(segment.constellation);
    if (sky.group.visible) this.burst(this.starWorld(sky, segment.to), streak >= 5 ? 26 : 14, GLOW_COLORS[index % GLOW_COLORS.length]);
    for (const candidate of [...this.candidates]) this.fadeCandidate(candidate, !candidate.real);
    this.queueDraw(index, fixed ? "fixed" : "solid", streak);
  }

  /** A miss: the pen sputters at once. Nib lunges for the star, a puff of chalk dust, and back. */
  private wrong(index: number, side?: Side): void {
    const segment = this.planFor().segments[index];
    if (!segment) return;
    const sky = this.skyAt(segment.constellation);
    this.wobble = 1;
    const chosen = this.candidates.find(candidate => candidate.side === side) ?? null;
    let toward = this.starWorld(sky, segment.to);
    if (chosen && !chosen.real) {
      chosen.star.group.updateMatrixWorld();
      toward = chosen.star.group.getWorldPosition(new THREE.Vector3());
      this.fadeCandidate(chosen, true);
      this.dust(toward, 18);
    } else {
      sky.stars[segment.to].shake = 1;
    }
    // The right star glows, so the child can fix it straight away.
    for (const candidate of this.candidates) if (candidate.real) candidate.star.targeted = true;
    if (!this.context.reducedMotion) this.lunge = { direction: toward.sub(this.rider.position).setZ(0).normalize(), t: 0 };
    this.dust(this.rider.position.clone(), 10);
  }

  private shown(): void {
    for (const candidate of this.candidates.filter(entry => !entry.real)) this.fadeCandidate(candidate, true);
    for (const candidate of this.candidates) candidate.star.targeted = true;
  }

  private finale(): void {
    const plan = this.planFor();
    this.finished = true;
    this.clearCandidates();
    for (let k = 0; k < plan.segments.length; k++) if (!this.drawn.has(k)) this.queueDraw(k, "dotted");
    // Finish the last constellation in a flourish, so it comes to life too.
    const sky = this.skies[this.queuedSky];
    if (sky) {
      const lines = linesOf(sky.def);
      for (let line = sky.queued; line < lines.length; line++) this.queueLine(this.queuedSky, line, "bonus", 0);
    }
    this.cheer = 2.5;
    this.nextComet = 0;
  }

  // ---------- drawing ----------

  /** Makes sure Nib is at sky `index` once the queue gets there: a flight across if not. */
  private ensureSky(index: number): void {
    if (this.queuedSky === index) return;
    this.queuedSky = index;
    const action: Action = {
      duration: FLY_TIME,
      elapsed: 0,
      started: false,
      begin: () => {
        this.enterSky(index);
        const sky = this.skyAt(index);
        const from = this.rider.position.clone();
        const to = this.starWorld(sky, sky.def.path[0]);
        this.side = to.x >= from.x ? 1 : -1;
        action.step = s => {
          const e = ease(s);
          this.here.lerpVectors(from, to, e);
          this.here.y += Math.sin(Math.PI * e) * 1.8;
        };
      },
      step: () => {},
      end: () => {},
    };
    this.actions.push(action);
  }

  private queueDraw(index: number, style: LineStyle, streak = 0): void {
    if (this.drawn.has(index)) return;
    const segment = this.planFor().segments[index];
    if (!segment) return;
    this.drawn.set(index, style);
    this.queueLine(segment.constellation, segment.line, style, streak, index);
  }

  private queueLine(skyIndex: number, line: number, style: LineStyle, streak: number, item = line): void {
    this.ensureSky(skyIndex);
    const sky = this.skyAt(skyIndex);
    sky.queued = Math.max(sky.queued, line + 1);
    const [from, to] = linesOf(sky.def)[line];
    const strokes: Stroke[] = [];
    const action: Action = {
      duration: style === "bonus" ? 0.28 : style === "dotted" ? 0.38 : DRAW_TIME,
      elapsed: 0,
      started: false,
      begin: () => {
        const a = new THREE.Vector2(...sky.def.stars[from]);
        const b = new THREE.Vector2(...sky.def.stars[to]);
        const points = [a, a.clone().lerp(b, 0.5), b];
        const kit = this.kit;
        if (style === "dotted") strokes.push(kit.stroke(points, { width: 0.15, color: CHALK.dim, kind: "chalk", dash: 0.42 }));
        else {
          if (style === "bonus" || (style === "solid" && streak >= 3)) strokes.push(kit.stroke(points, { width: 1.0, color: GLOW_COLORS[item % GLOW_COLORS.length], kind: "glow", opacity: style === "bonus" ? 0.8 : Math.min(1, 0.55 + streak * 0.05) }));
          strokes.push(kit.stroke(points, { width: LINE_WIDTH, color: CHALK.white, kind: "gel" }));
        }
        for (const stroke of strokes) {
          stroke.uniforms.uProgress.value = 0;
          stroke.mesh.renderOrder = 1;
          sky.group.add(stroke.mesh);
          sky.lines.push(stroke);
        }
        const start = this.starWorld(sky, from);
        const end = this.starWorld(sky, to);
        this.side = end.x >= start.x ? 1 : -1;
        this.lookAt.copy(end);
        action.step = s => {
          const e = this.context.reducedMotion ? 1 : ease(s);
          for (const stroke of strokes) stroke.uniforms.uProgress.value = e;
          this.here.lerpVectors(start, end, e);
          if (!this.context.reducedMotion && (style === "bonus" || streak >= 5) && Math.random() < 0.7) this.sparkle(this.here, GLOW_COLORS[(item + Math.floor(s * 5)) % GLOW_COLORS.length]);
        };
      },
      step: () => {},
      end: () => {
        const star = sky.stars[to];
        star.state = "lit";
        star.targeted = false;
        star.appear = Math.max(star.appear, 0.6);
        sky.drawn++;
        if (style !== "dotted") this.burst(this.starWorld(sky, to), style === "bonus" ? 10 : 8, CHALK.white);
        if (sky.drawn === linesOf(sky.def).length) this.comeAlive(sky);
      },
    };
    this.actions.push(action);
  }

  private stepActions(delta: number): void {
    if (delta <= 0) return;
    const reduced = this.context.reducedMotion;
    let budget = delta;
    while (this.actions.length && (reduced || budget > 0)) {
      const action = this.actions[0];
      if (!action.started) {
        action.started = true;
        action.begin();
      }
      if (reduced) {
        // Reduced motion: every move is a cut.
        action.elapsed = action.duration;
        action.step(1);
        this.actions.shift();
        action.end();
        continue;
      }
      // Hurry when more is waiting, so a quick answer is never kept long.
      const rate = this.actions.length > 1 ? 1.9 : 1;
      const need = (action.duration - action.elapsed) / rate;
      const used = Math.min(budget, need);
      action.elapsed = Math.min(action.duration, action.elapsed + used * rate);
      action.step(action.elapsed / action.duration);
      budget -= used;
      if (action.elapsed >= action.duration) {
        this.actions.shift();
        action.end();
      } else break;
    }
  }

  // ---------- creatures ----------

  private comeAlive(sky: Sky): void {
    if (sky.creature) return;
    const kit = this.kit;
    const creature = new THREE.Group();
    const color = CREATURE_COLORS[sky.def.color];
    for (const def of sky.def.parts) {
      const group = new THREE.Group();
      const [px, py] = def.pivot ?? [0, 0];
      group.position.set(px, py, 0.02);
      for (const stroke of def.strokes) {
        const raw = stroke.circle ? circlePoints(stroke.points[0][0], stroke.points[0][1], stroke.circle) : stroke.sharp || stroke.points.length < 3 ? stroke.points.map(([x, y]) => new THREE.Vector2(x, y)) : smoothCurve(stroke.points, stroke.closed);
        const points = raw.map(point => point.clone().sub(new THREE.Vector2(px, py)));
        const drawn = kit.stroke(points, stroke.white ? { width: 0.13, color: CHALK.white, kind: "gel" } : { width: CREATURE_WIDTH, color, kind: "chalk" });
        drawn.uniforms.uProgress.value = this.context.reducedMotion ? 1 : 0;
        drawn.mesh.renderOrder = 2;
        group.add(drawn.mesh);
        sky.creatureStrokes.push(drawn);
      }
      creature.add(group);
      sky.parts.push({ group, def, base: group.position.clone() });
    }
    sky.group.add(creature);
    sky.creature = creature;
    sky.reveal = this.context.reducedMotion ? 1 : 0;
    sky.age = 0;
    sky.aliveAt = this.time;
    this.cheer = Math.max(this.cheer, 1.4);
    sky.stars.forEach((_, k) => this.burst(this.starWorld(sky, k), 4, color));
  }

  private animateCreature(sky: Sky, delta: number): void {
    if (!sky.creature) return;
    const reduced = this.context.reducedMotion;
    sky.reveal = Math.min(1, sky.reveal + delta / REVEAL_TIME);
    for (const stroke of sky.creatureStrokes) stroke.uniforms.uProgress.value = ease(sky.reveal);
    if (reduced) return;
    sky.age += delta;
    const t = sky.age;
    const life = Math.min(1, t / 0.6);
    const body = sky.creature;
    body.position.set(0, 0, 0);
    body.rotation.z = 0;
    body.scale.set(1, 1, 1);
    switch (sky.def.body) {
      case "swim":
        body.position.set(Math.sin(t * 0.9) * 0.35 * life, Math.sin(t * 1.6) * 0.25 * life, 0);
        body.rotation.z = Math.sin(t * 1.6 + 0.5) * 0.04 * life;
        break;
      case "fly":
        body.position.y = (Math.sin(t * 7) * 0.14 + Math.sin(t * 0.8) * 0.2) * life;
        break;
      case "hop": {
        const hop = Math.max(0, Math.sin(t * 3.4));
        body.position.y = hop * 0.7 * life;
        body.scale.y = 1 - (hop < 0.15 ? (0.15 - hop) * 0.5 : 0) * life;
        break;
      }
      case "sit":
        body.scale.y = 1 + Math.sin(t * 2) * 0.015 * life;
        break;
      case "slide":
        body.position.x = Math.sin(t * 0.7) * 0.3 * life;
        break;
    }
    for (const part of sky.parts) {
      const amount = (part.def.amount ?? 0.2) * life;
      const speed = part.def.speed ?? 3;
      part.group.position.copy(part.base);
      switch (part.def.motion) {
        case "wag":
        case "turn":
          part.group.rotation.z = Math.sin(t * speed) * amount;
          break;
        case "flap":
          part.group.scale.y = THREE.MathUtils.lerp(1, Math.cos(t * speed), life);
          break;
        case "spout":
          part.group.scale.y = 0.55 + 0.45 * Math.abs(Math.sin(t * speed));
          break;
        case "blink":
          part.group.scale.y = t % 3.2 > 3.05 ? 0.15 : 1;
          break;
        case "rise":
          part.group.position.y = part.base.y + ((t * speed * 0.25) % 1) * (part.def.amount ?? 0.6);
          break;
        default:
          break;
      }
    }
  }

  private stepSky(sky: Sky, delta: number): void {
    const reduced = this.context.reducedMotion;
    if (sky.recede === null && sky.leaveAt !== null && this.time >= sky.leaveAt) sky.recede = reduced ? 1 : 0;
    if (sky.recede !== null) {
      sky.recede = Math.min(1, sky.recede + delta / RECEDE_TIME);
      const e = ease(sky.recede);
      const [sx, sy] = SLOTS[sky.slot];
      const depth = (this.camera.position.z - SLOT_Z) / this.camera.position.z;
      const layout = LAYOUT[this.context.mode];
      sky.group.position.set(
        THREE.MathUtils.lerp(layout.centre.x, sx * depth, e),
        THREE.MathUtils.lerp(layout.centre.y, sy * depth, e) + Math.sin(Math.PI * e) * 1.2,
        THREE.MathUtils.lerp(layout.centre.z, SLOT_Z, e),
      );
      sky.group.scale.setScalar(THREE.MathUtils.lerp(layout.scale, SLOT_SCALE, e));
    }
    this.animateCreature(sky, delta);
    const choice = this.context.mode === "choice";
    for (const star of sky.stars) this.stepStar(star, delta, reduced, choice);
    for (const star of sky.extras) this.stepStar(star, delta, reduced, choice);
    for (const star of sky.extras.filter(entry => entry.fading !== null && entry.fading >= 1)) sky.group.remove(star.group);
    sky.extras = sky.extras.filter(entry => entry.fading === null || entry.fading < 1);
  }

  private stepStar(star: StarView, delta: number, reduced: boolean, choice: boolean): void {
    star.appear = Math.min(1, star.appear + delta * 3);
    star.shake = Math.max(0, star.shake - delta * 2);
    const t = this.time + star.seed;
    const grow = star.appear <= 0 ? 0 : reduced ? 1 : Math.min(1.12, 1 - Math.cos(star.appear * Math.PI) * 0.56 + 0.12 * Math.sin(star.appear * Math.PI));
    let size = 0;
    let halo = 0;
    let color = CHALK.dim;
    if (star.state === "dim") {
      size = 0.78;
      halo = 0.12;
    } else if (star.state === "candidate") {
      size = 1.15 + (reduced ? 0 : Math.sin(t * 3) * 0.06);
      halo = 0.5;
      color = CHALK.white;
    } else if (star.state === "lit") {
      size = 1.0 + (reduced ? 0 : Math.sin(t * 1.7) * 0.05);
      halo = 0.55;
      color = CHALK.white;
    }
    if (star.targeted) {
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 4);
      size = Math.max(size, 1.05) + pulse * 0.2;
      halo = 0.4 + pulse * 0.35;
      color = CHALK.white;
    }
    const fade = star.fading === null ? 1 : 1 - star.fading;
    if (star.fading !== null) star.fading = Math.min(1, star.fading + delta * 3);
    star.group.visible = star.state !== "hidden" && fade > 0.01;
    star.group.scale.setScalar(Math.max(0.001, grow * (star.fading === null ? 1 : 1 + star.fading * 0.6)));
    star.glyph.scale.setScalar(size);
    star.glyph.material.color.copy(color);
    star.glyph.material.opacity = fade * (star.state === "dim" ? 0.8 : 1);
    star.glyph.rotation.z = star.shake * Math.sin(this.time * 30) * 0.5;
    star.halo.scale.setScalar(2.2 + halo * 1.6);
    star.halo.material.opacity = halo * fade;
    star.ring.uniforms.uOpacity.value = star.targeted && !choice ? 0.85 : 0;
    star.ring.mesh.rotation.z = this.time * 0.6;
  }

  // ---------- Nib ----------

  private placeRiderAt(point: THREE.Vector3): void {
    this.here.copy(point);
    this.rider.position.copy(point);
  }

  private stepNib(delta: number): void {
    const reduced = this.context.reducedMotion;
    const busy = this.actions.length > 0 && this.actions[0].started;
    const position = this.here.clone();
    if (!reduced) position.y += Math.sin(this.time * 2.2) * 0.07 * (busy ? 0.3 : 1);
    if (this.lunge) {
      this.lunge.t += delta / 0.45;
      if (this.lunge.t >= 1) this.lunge = null;
      else position.addScaledVector(this.lunge.direction, Math.sin(Math.PI * this.lunge.t) * 0.9);
    }
    this.rider.position.copy(position);

    // Nib sits on the far side of the pen from where the line is going, facing the child.
    if (!busy) this.side = this.lookAt.x >= this.here.x - 0.05 ? 1 : -1;
    const k = reduced ? 1 : 1 - Math.exp(-delta * 6);
    this.holder.userData.side = THREE.MathUtils.lerp(this.holder.userData.side ?? this.side, this.side, k);
    const side = this.holder.userData.side as number;
    // Near the top of the sky Nib hangs below the pen, so the fact strip never covers it.
    const below = this.here.y > 1.5 ? 1 : 0;
    this.holder.userData.below = THREE.MathUtils.lerp(this.holder.userData.below ?? below, below, k);
    const under = this.holder.userData.below as number;
    this.nib.root.position.set(-side * 1.35, THREE.MathUtils.lerp(-0.12, -2.35, under), 0.7);
    this.nib.root.rotation.y = Math.PI + side * 0.35;
    this.pen.position.set(0, 0, 0.1);
    this.pen.scale.setScalar(1.4);
    this.pen.rotation.set(0, 0, side * THREE.MathUtils.lerp(0.75, Math.PI - 0.75, under));

    this.cheer = Math.max(0, this.cheer - delta);
    this.wobble = Math.max(0, this.wobble - delta * 1.2);
    this.target.spread = this.cheer > 0 ? 1 : busy ? 0.3 : 0;
    this.target.air = busy ? 1 : 0.6;
    const blend = 1 - Math.exp(-delta * 8);
    this.pose = {
      run: 0,
      air: THREE.MathUtils.lerp(this.pose.air, this.target.air, blend),
      spread: THREE.MathUtils.lerp(this.pose.spread, this.target.spread, blend),
      squash: 0,
      lookBack: 0,
      wobble: this.wobble,
    };
    this.nib.update(this.time, this.pose, delta);
  }

  // ---------- effects ----------

  private sparkle(at: THREE.Vector3, color: THREE.Color): void {
    if (this.sparks.length >= SPARKS_MAX) return;
    const angle = Math.random() * Math.PI * 2;
    this.sparks.push({ position: at.clone().setZ(0.6), velocity: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(0.6 + Math.random()), life: 0.6, max: 0.6, size: 0.25 + Math.random() * 0.2, color, spin: (Math.random() - 0.5) * 6 });
  }

  private burst(at: THREE.Vector3, count: number, color: THREE.Color): void {
    if (this.context.reducedMotion) return;
    for (let i = 0; i < count && this.sparks.length < SPARKS_MAX; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.6 + Math.random() * 2.2;
      this.sparks.push({ position: at.clone().setZ(0.6), velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0), life: 0.7 + Math.random() * 0.3, max: 1, size: 0.22 + Math.random() * 0.25, color: i % 3 === 0 ? CHALK.white : color, spin: (Math.random() - 0.5) * 8 });
    }
  }

  /** Grey chalk dust: a sputter, or a star that was not the one. */
  private dust(at: THREE.Vector3, count: number): void {
    if (this.context.reducedMotion) return;
    for (let i = 0; i < count && this.sparks.length < SPARKS_MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.4;
      this.sparks.push({ position: at.clone().setZ(0.6), velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed - 0.3, 0), life: 0.7, max: 0.7, size: 0.18 + Math.random() * 0.16, color: CHALK.dim, spin: 0 });
    }
  }

  private stepSparks(delta: number): void {
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 0, 1);
    let alive = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.life -= delta;
      if (spark.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      spark.velocity.multiplyScalar(1 - delta * 2.2);
      spark.position.addScaledVector(spark.velocity, delta);
      rotation.setFromAxisAngle(axis, spark.spin * (spark.max - spark.life));
      scale.setScalar(spark.size * Math.min(1, spark.life / spark.max * 1.6));
      matrix.compose(spark.position, rotation, scale);
      this.sparkMesh.setMatrixAt(alive, matrix);
      this.sparkMesh.setColorAt(alive, spark.color);
      alive++;
    }
    this.sparkMesh.count = alive;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  /** A streak of 10: shooting stars across the sky behind. */
  private stepComets(delta: number): void {
    const reduced = this.context.reducedMotion;
    if (!reduced && (this.streak >= 10 || (this.finished && this.cheer > 0))) {
      this.nextComet -= delta;
      if (this.nextComet <= 0) {
        this.nextComet = this.finished ? 0.35 : 1.3 + Math.random() * 1.2;
        const mesh = new THREE.Mesh(this.cometShape, this.kit.own(new THREE.MeshBasicMaterial({ map: this.cometMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
        const fromLeft = Math.random() < 0.5;
        mesh.position.set(fromLeft ? -22 - Math.random() * 6 : 22 + Math.random() * 6, 7 + Math.random() * 5, -14);
        const velocity = new THREE.Vector3(fromLeft ? 26 : -26, -9 - Math.random() * 5, 0);
        mesh.rotation.z = Math.atan2(velocity.y, velocity.x);
        mesh.renderOrder = -5;
        this.scene.add(mesh);
        this.comets.push({ mesh, velocity, life: 1.4 });
      }
    }
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const comet = this.comets[i];
      comet.life -= delta;
      comet.mesh.position.addScaledVector(comet.velocity, delta);
      comet.mesh.material.opacity = Math.min(1, comet.life * 2);
      if (comet.life <= 0) {
        this.scene.remove(comet.mesh);
        comet.mesh.material.dispose();
        this.comets.splice(i, 1);
      }
    }
  }

  private stepCandidates(delta: number): void {
    const reduced = this.context.reducedMotion;
    const fadeTags = (list: Candidate[]) => {
      for (const candidate of list) {
        if (candidate.fading !== null) candidate.fading = reduced ? 1 : Math.min(1, candidate.fading + delta * 3.5);
        const shown = candidate.fading === null ? (reduced ? 1 : Math.min(1, candidate.tag.material.opacity + delta * 4)) : 1 - candidate.fading;
        candidate.tag.material.opacity = shown;
        candidate.tag.visible = shown > 0.01;
      }
    };
    fadeTags(this.candidates);
    fadeTags(this.leaving);
    for (const candidate of this.leaving.filter(entry => (entry.fading ?? 0) >= 1)) candidate.tag.removeFromParent();
    this.leaving = this.leaving.filter(candidate => (candidate.fading ?? 0) < 1);
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
    const reduced = this.context.reducedMotion;
    this.kit.tick(this.time, reduced);
    if (!reduced) this.paper.material.uniforms.uTime.value = this.time;
    this.stepActions(delta);
    for (const sky of this.skies) if (sky) this.stepSky(sky, delta);
    this.stepCandidates(delta);
    this.stepNib(delta);
    this.stepSparks(delta);
    this.stepComets(delta);
  }
}
