// Paper Glider (纸飞机), game B (plan §5.5), painted in watercolor (decision 19).
// Nib rides a folded-paper glider through the next painted hoop. In choice
// mode two hoops hang left and right, each with a number tag. A streak adds a
// contrail, then a barrel roll, then a full loop.
//
// The glider flies along one smooth flight line through the hoop centres, and
// the camera rides that same line a few lengths behind it, so the camera flies
// through the middle of every hoop the glider does. The horizon stays level and
// the view never zooms: the owner's playtest found the tilting, swinging camera
// made them dizzy.
//
// The game only renders round events (plan §5.3, §7.8).

import * as THREE from "three";
import type { Side } from "../../core/choices";
import type { RoundEvent } from "../../core/round-engine";
import { Nib, restPose, type NibPose } from "../../render/nib";
import { inkMesh, stickyNoteTexture, tierPixelRatio, type QualityTier } from "../../render/notebook-kit";
import { WATERCOLOR, WatercolorKit, WatercolorPass } from "../../render/watercolor-kit";
import type { ArcadeGame, GameContext } from "../types";

const SPACING = 28;
/** The glider waits this far in front of the next gate. */
const WAIT_GAP = 8;
/** The glider rides this far below the flight line; the camera flies on the line itself. */
const RIDE = 1.2;
/** How far behind the glider the camera rides, measured along the flight line. */
const CHASE = 6;
/** The camera looks at the flight line this far ahead of itself... */
const LOOK = 10;
/** ...and this far below it, so the glider sits clear of the number pad. */
const TILT = 0.45;
const RADIUS = 2.4;
const TUBE = 0.2;
/** Flight speeds, in world units per second (the glider is about 3 units long). */
const CRUISE = 16;
const ACCEL = 22;
const BRAKE = 10;
/** Seconds to reach full acceleration from a hover, so take-offs never jolt. */
const LAUNCH = 0.2;
const SAMPLE = 0.2;
const LOOP_RADIUS = 1.4;
const FILM = 0.78;
const WIND = 4;
const STREAKS = 22;
const LANE = 3.3;
const AHEAD = 3;
const HOOP_COLORS = [WATERCOLOR.coral, WATERCOLOR.mint, WATERCOLOR.lilac, WATERCOLOR.yellow, WATERCOLOR.blue];
const DROPS_MAX = 180;
const TRAIL_POINTS = 16;
const TRAIL_LENGTH = 3.2;
const WINGTIPS = [new THREE.Vector3(-1.25, 0.16, 0.95), new THREE.Vector3(1.25, 0.16, 0.95)];
const TRAIL_STEP = 0.3;
const FORWARD = new THREE.Vector3(0, 0, -1);

/** Where gate `index` hangs: the course weaves gently left and right, up and down (deterministic). */
export function gateCentre(index: number): THREE.Vector3 {
  const x = Math.sin(index * 1.27 + 0.4) * 2.6 + Math.sin(index * 0.53) * 1.0;
  const y = Math.sin(index * 0.83 + 1.1) * 1.8;
  return new THREE.Vector3(x, y, -(index + 1) * SPACING);
}

/** Where the glider waits for the answer to gate `index`: straight in front of it. */
export function hoverPoint(index: number): THREE.Vector3 {
  return index < 0 ? new THREE.Vector3(0, 0, 0) : gateCentre(index).add(new THREE.Vector3(0, 0, WAIT_GAP));
}

/** A cubic Hermite curve: leaves along `m0`, arrives along `m1`. */
function hermite(p0: THREE.Vector3, m0: THREE.Vector3, p1: THREE.Vector3, m1: THREE.Vector3, s: number, out: THREE.Vector3): THREE.Vector3 {
  const s2 = s * s;
  const s3 = s2 * s;
  return out.set(0, 0, 0)
    .addScaledVector(p0, 2 * s3 - 3 * s2 + 1)
    .addScaledVector(m0, s3 - 2 * s2 + s)
    .addScaledVector(p1, -2 * s3 + 3 * s2)
    .addScaledVector(m1, s3 - s2);
}

/**
 * The flight line, sampled by distance. Every waypoint is crossed heading
 * straight down the course, so the line goes square through each hoop and
 * curves smoothly between them. Before its start and past its end it runs
 * straight on.
 */
export class FlightPath {
  private readonly points: THREE.Vector3[];
  private readonly lengths: number[] = [0];

  constructor(start: THREE.Vector3) {
    this.points = [start.clone()];
  }

  get length(): number {
    return this.lengths[this.lengths.length - 1];
  }

  get end(): THREE.Vector3 {
    return this.points[this.points.length - 1];
  }

  /** Adds a curve to `to` and returns the distance along the line at which it arrives. */
  extendTo(to: THREE.Vector3): number {
    const from = this.end.clone();
    const chord = from.distanceTo(to);
    if (chord < 1e-6) return this.length;
    const tangent = FORWARD.clone().multiplyScalar(chord);
    const steps = Math.max(2, Math.ceil(chord / SAMPLE));
    for (let i = 1; i <= steps; i++) {
      const point = hermite(from, tangent, to, tangent, i / steps, new THREE.Vector3());
      this.lengths.push(this.length + this.end.distanceTo(point));
      this.points.push(point);
    }
    return this.length;
  }

  at(s: number, out: THREE.Vector3): THREE.Vector3 {
    if (s <= 0) return out.copy(this.points[0]).addScaledVector(FORWARD, s);
    const total = this.length;
    if (s >= total) return out.copy(this.end).addScaledVector(FORWARD, s - total);
    let lo = 0;
    let hi = this.lengths.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.lengths[mid] <= s) lo = mid;
      else hi = mid;
    }
    const span = this.lengths[hi] - this.lengths[lo];
    return out.copy(this.points[lo]).lerp(this.points[hi], span > 0 ? (s - this.lengths[lo]) / span : 0);
  }
}

export interface Flight {
  /** Distance along the flight line. */
  s: number;
  speed: number;
  /** The speed of the take-off alone, before easing into the glide in. */
  climb: number;
  /** 0 to 1: how far into a soft take-off. */
  launch: number;
  /** The stop the current glide in is heading for. */
  target: number;
}

/**
 * Moves the glider along the line towards `hold`: a soft take-off from a
 * hover, cruising, and an even glide in to stop exactly at `hold`. Moving
 * `hold` on mid-flight (a quick answer) carries on from the current speed,
 * without a stop or a jump.
 */
export function advanceFlight(flight: Flight, hold: number, delta: number): void {
  if (hold !== flight.target) {
    flight.climb = flight.speed;
    flight.target = hold;
  }
  const remaining = hold - flight.s;
  if (remaining <= 1e-3) {
    flight.s = Math.max(flight.s, hold);
    flight.speed = 0;
    flight.climb = 0;
    flight.launch = 0;
    return;
  }
  flight.launch = Math.min(1, flight.launch + delta / LAUNCH);
  flight.climb = Math.min(CRUISE, flight.climb + ACCEL * flight.launch * delta);
  const braking = Math.sqrt(2 * BRAKE * remaining);
  // A smooth minimum of the two, so cruising eases into braking instead of switching.
  const climb = flight.climb;
  flight.speed = climb > 0 ? (climb * braking) / Math.cbrt(climb ** 3 + braking ** 3) : 0;
  flight.s = Math.min(hold, flight.s + flight.speed * delta);
}

type Trick = "none" | "roll" | "loop";

interface Hoop {
  group: THREE.Group;
  ring: THREE.Group;
  home: THREE.Vector3;
  color: THREE.Color;
  side: Side | null;
  passed: number | null;
  fading: number | null;
  /** A paint film closes the hoop after a miss, and pops when the child fixes it. */
  film: THREE.Mesh | null;
  closing: number | null;
  popping: number | null;
  shake: number;
}

interface Gate {
  index: number;
  z: number;
  centre: THREE.Vector3;
  hoops: Hoop[];
}

/** A hoop on the flight line: what happens as the glider, then the camera, flies through it. */
interface Pass { s: number; hoop: Hoop | null; trick: Trick; streak: number; glider: boolean; camera: boolean }

interface Drop { position: THREE.Vector3; velocity: THREE.Vector3; life: number; color: THREE.Color; size: number }
interface Drift { group: THREE.Group; span: number; wind: boolean }

/** A soft painted border, transparent in the middle, flashed as the camera passes through a hoop. */
function rimTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 30, 128, 128, 182);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0)");
  gradient.addColorStop(0.8, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class PaperGlider implements ArcadeGame {
  readonly id = "paper-glider";
  private renderer: THREE.WebGLRenderer | null = null;
  private pass: WatercolorPass | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 400);
  private readonly kit = new WatercolorKit();
  private context: GameContext = { quality: "medium", reducedMotion: false, mode: "answer" };
  private readonly rider = new THREE.Group();
  private readonly craft = new THREE.Group();
  private nib!: Nib;
  private sky!: THREE.Mesh;
  private sun!: THREE.Mesh;
  private rim!: THREE.Mesh;
  private rimMaterial!: THREE.MeshBasicMaterial;
  private readonly gates = new Map<number, Gate>();
  private readonly path = new FlightPath(hoverPoint(-1));
  private passes: Pass[] = [];
  private readonly drifts: Drift[] = [];
  private readonly drops: Drop[] = [];
  private dropMesh!: THREE.InstancedMesh;
  private trail!: THREE.Mesh;
  private trailMaterial!: THREE.MeshBasicMaterial;
  private readonly trailPoints: THREE.Vector3[][] = [[], []];
  private pose: NibPose = restPose();
  private readonly target: NibPose = restPose();
  private readonly base = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3(0, 0, -10);
  private readonly streaks: THREE.Mesh[] = [];
  private streakMaterial!: THREE.MeshBasicMaterial;
  private readonly flight: Flight = { s: 0, speed: 0, climb: 0, launch: 0, target: 0 };
  /** Where on the flight line the glider stops to wait. */
  private hold = 0;
  /** The line is laid as far as the hover point for this item. */
  private routed = -1;
  private weave = 0;
  private heading = 0;
  private headingRate = 0;
  private pitch = 0;
  private bank = 0;
  private trick: { kind: Trick; start: number; duration: number } | null = null;
  private loopLift = 0;
  private flash = 0;
  private surge = 0;
  private wobble = 0;
  private streak = 0;
  private cheering = false;
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
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setClearColor(WATERCOLOR.paper);
    renderer.domElement.className = "arcade-game-canvas";
    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    host.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.pass = new WatercolorPass(WATERCOLOR.paper);
    this.buildWorld();
    const rect = host.getBoundingClientRect();
    this.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
    this.placeGlider(0);
    this.placeCamera(0, true);
    this.running = true;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  onEvent(event: RoundEvent): void {
    switch (event.type) {
      case "round_start":
        this.target.lookBack = 0.3;
        break;
      case "countdown":
        this.wobble = Math.max(this.wobble, 0.35);
        break;
      case "item_shown":
        this.showItem(event.index, event.choices ?? null);
        break;
      case "answer_correct":
        this.streak = event.streak;
        this.flyThrough(event.index, event.streak, event.side);
        break;
      case "answer_wrong":
        this.streak = 0;
        this.close(event.index, event.side);
        break;
      case "answer_shown":
        this.streak = 0;
        break;
      case "answer_corrected":
        this.fixed(event.index, event.side);
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
    this.pass?.setSize(this.renderer);
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();
    if (this.rim) {
      const height = 2 * 0.3 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.04;
      this.rim.scale.set(height * this.camera.aspect, height, 1);
    }
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
    this.dropMesh?.dispose();
    this.kit.dispose();
    this.pass?.dispose();
    if (this.renderer) {
      this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.renderer = null;
    this.pass = null;
    this.gates.clear();
    this.scene.clear();
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  // ---------- world ----------

  private buildWorld(): void {
    const kit = this.kit;
    this.sky = kit.createSky();
    this.scene.add(this.sky);

    const sunGeometry = kit.own(new THREE.CircleGeometry(9, 40));
    this.sun = new THREE.Mesh(sunGeometry, kit.own(new THREE.MeshBasicMaterial({ color: WATERCOLOR.sun, depthWrite: false, fog: false })));
    this.sun.renderOrder = -9;
    this.scene.add(this.sun);

    // The glider: a folded paper dart, with pencil lines on its folds.
    const nose = [0, 0, -1.75];
    const tail = [0, 0, 0.85];
    const keel = [0, -0.42, 0.85];
    const left = [-1.3, 0.16, 0.95];
    const right = [1.3, 0.16, 0.95];
    const vertices = new Float32Array([...nose, ...tail, ...left, ...nose, ...right, ...tail, ...nose, ...keel, ...tail, ...nose, ...tail, ...keel]);
    const paper = kit.own(new THREE.BufferGeometry());
    paper.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    paper.computeVertexNormals();
    const wash = kit.surface(WATERCOLOR.glider, 0.5).clone();
    wash.side = THREE.DoubleSide;
    kit.own(wash);
    this.craft.add(new THREE.Mesh(paper, wash));
    const folds = kit.own(new THREE.BufferGeometry());
    folds.setAttribute("position", new THREE.BufferAttribute(new Float32Array([...nose, ...left, ...nose, ...right, ...left, ...tail, ...right, ...tail, ...nose, ...tail, ...nose, ...keel, ...keel, ...tail]), 3));
    this.craft.add(new THREE.LineSegments(folds, kit.own(new THREE.LineBasicMaterial({ color: WATERCOLOR.pencil }))));

    this.nib = new Nib(kit);
    this.nib.root.scale.setScalar(0.42);
    this.nib.root.position.set(0, 0.02, -0.15);
    this.craft.add(this.nib.root);
    this.rider.add(this.craft);
    this.scene.add(this.rider);

    // A painted border that washes in as the camera flies through a hoop.
    this.rimMaterial = kit.own(new THREE.MeshBasicMaterial({ map: kit.own(rimTexture()), color: WATERCOLOR.yellow, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    this.rim = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(1, 1)), this.rimMaterial);
    this.rim.position.set(0, 0, -0.3);
    this.rim.renderOrder = 20;
    this.rim.frustumCulled = false;
    this.rim.visible = false;
    this.camera.add(this.rim);
    this.scene.add(this.camera);

    // Paint droplets.
    const drop = kit.own(new THREE.SphereGeometry(1, 8, 6));
    this.dropMesh = new THREE.InstancedMesh(drop, kit.own(new THREE.MeshBasicMaterial()), DROPS_MAX);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);

    // The contrail ribbons.
    const trailGeometry = kit.own(new THREE.BufferGeometry());
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * TRAIL_POINTS * 2 * 3), 3));
    const indices: number[] = [];
    for (let wing = 0; wing < 2; wing++) {
      const o = wing * TRAIL_POINTS * 2;
      for (let i = 0; i < TRAIL_POINTS - 1; i++) indices.push(o + i * 2, o + i * 2 + 1, o + i * 2 + 2, o + i * 2 + 1, o + i * 2 + 3, o + i * 2 + 2);
    }
    trailGeometry.setIndex(indices);
    this.trailMaterial = kit.own(new THREE.MeshBasicMaterial({ color: WATERCOLOR.yellow, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.trail = new THREE.Mesh(trailGeometry, this.trailMaterial);
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    // Wind: thin pale brush strokes rushing past, stronger with speed.
    const stroke = kit.own(new THREE.BoxGeometry(0.035, 0.035, 2.2));
    this.streakMaterial = kit.own(new THREE.MeshBasicMaterial({ color: new THREE.Color("#a9c3e2"), transparent: true, opacity: 0, depthWrite: false }));
    for (let i = 0; i < STREAKS; i++) {
      const line = new THREE.Mesh(stroke, this.streakMaterial);
      this.placeStreak(line, -Math.random() * 34);
      this.scene.add(line);
      this.streaks.push(line);
    }

    for (let i = 0; i < 26; i++) this.addCloud(i);
    for (let i = 0; i < 14; i++) this.addHill(i);
  }

  private placeStreak(line: THREE.Mesh, ahead: number): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.6 + Math.random() * 5;
    const base = this.rider.position;
    line.position.set(base.x + Math.cos(angle) * radius, base.y + RIDE + Math.sin(angle) * radius * 0.7, base.z + ahead);
  }

  private addCloud(i: number): void {
    const kit = this.kit;
    const ball = kit.own(new THREE.SphereGeometry(1, 14, 10));
    const group = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let k = 0; k < puffs; k++) {
      const puff = inkMesh(kit, ball, WATERCOLOR.cloud, 0.03);
      puff.scale.set(1.3 + Math.random() * 0.9, 0.9 + Math.random() * 0.5, 1.1 + Math.random() * 0.6);
      puff.position.set(k * 1.5 - puffs * 0.7, Math.random() * 0.5, Math.random() * 0.8);
      group.add(puff);
    }
    const side = i % 2 === 0 ? -1 : 1;
    const band = i % 4;
    // Near clouds pass beside, above and below the course, never across a hoop, a tag or the camera.
    const overhead = band === 1 || band === 2;
    const x = overhead ? side * Math.random() * 14 : side * (15 + Math.random() * (band === 0 ? 4 : 14));
    const y = band === 1 ? 9.5 + Math.random() * 5 : band === 2 ? -10.5 - Math.random() * 4 : -3 + Math.random() * 7;
    group.position.set(x, y, 12 - i * 9);
    group.scale.setScalar(0.8 + Math.random() * 0.9);
    this.scene.add(group);
    this.drifts.push({ group, span: 26 * 9, wind: true });
  }

  private addHill(i: number): void {
    const kit = this.kit;
    const ball = kit.own(new THREE.SphereGeometry(1, 20, 12));
    const color = i % 3 === 2 ? WATERCOLOR.hillFar : WATERCOLOR.hill;
    const hill = inkMesh(kit, ball, color, 0.012);
    const side = i % 2 === 0 ? -1 : 1;
    hill.scale.set(14 + Math.random() * 10, 6 + Math.random() * 5, 12 + Math.random() * 8);
    hill.position.set(side * (10 + Math.random() * 30), -20, 20 - i * 22);
    this.scene.add(hill);
    this.drifts.push({ group: hill, span: 14 * 22, wind: false });
  }

  private gateAt(index: number): Gate {
    const known = this.gates.get(index);
    if (known) return known;
    const centre = gateCentre(index);
    const gate: Gate = { index, z: centre.z, centre, hoops: [] };
    if (this.context.mode !== "choice") gate.hoops.push(this.makeHoop(index, centre.clone(), null));
    this.gates.set(index, gate);
    return gate;
  }

  private makeHoop(index: number, at: THREE.Vector3, side: Side | null): Hoop {
    const kit = this.kit;
    const torus = kit.own(new THREE.TorusGeometry(RADIUS, TUBE, 12, 56));
    const color = HOOP_COLORS[(index * 2 + (side === "right" ? 1 : 0)) % HOOP_COLORS.length];
    const ring = inkMesh(kit, torus, color, 0.02);
    const group = new THREE.Group();
    group.add(ring);
    group.position.copy(at);
    group.scale.setScalar(0.01);
    this.scene.add(group);
    return { group, ring, home: at.clone(), color, side, passed: null, fading: null, film: null, closing: null, popping: null, shake: 0 };
  }

  private addChoices(gate: Gate, choices: [number, number]): void {
    if (gate.hoops.length) return;
    const kit = this.kit;
    const tagGeometry = kit.own(new THREE.PlaneGeometry(1.8, 1.8));
    (["left", "right"] as const).forEach((side, i) => {
      const hoop = this.makeHoop(gate.index, gate.centre.clone().add(new THREE.Vector3(side === "left" ? -LANE : LANE, 0, 0)), side);
      // A paper tag hanging under the hoop, with the number.
      const tag = new THREE.Mesh(tagGeometry, kit.own(new THREE.MeshBasicMaterial({ map: stickyNoteTexture(kit, String(choices[i]), "#fffaf0"), transparent: true })));
      tag.position.set(0, -(RADIUS + TUBE + 1.45), 0.05);
      tag.name = "tag";
      const string = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4)), kit.surface(WATERCOLOR.pencil, 1));
      string.position.set(0, -(RADIUS + TUBE + 0.3), 0);
      hoop.group.add(tag, string);
      gate.hoops.push(hoop);
    });
  }

  // ---------- events ----------

  private hoopFor(gate: Gate, side?: Side): Hoop | undefined {
    return gate.hoops.find(entry => entry.side === (side ?? null)) ?? gate.hoops[0];
  }

  private showItem(index: number, choices: [number, number] | null): void {
    for (let k = index; k <= index + AHEAD; k++) this.gateAt(k);
    const gate = this.gateAt(index);
    if (choices && this.context.mode === "choice") this.addChoices(gate, choices);
    this.routeTo(index);
  }

  /** Lays the line on to the hover point for `index`, gliding past any gate the child did not get through. */
  private routeTo(index: number): void {
    while (this.routed < index) {
      const from = this.routed;
      if (from >= 0) {
        const gate = this.gateAt(from);
        for (const hoop of gate.hoops) if (hoop.passed === null) hoop.fading ??= 0;
        this.path.extendTo(gate.centre);
      }
      this.layTo(from + 1);
      this.routed = from + 1;
    }
    this.hold = this.path.length;
  }

  /**
   * On to the hover point for `index`, the last stretch straight down the
   * gate's axis, so the waiting camera looks square through the hoop.
   */
  private layTo(index: number): void {
    this.path.extendTo(hoverPoint(index).add(new THREE.Vector3(0, 0, CHASE)));
    this.path.extendTo(hoverPoint(index));
  }

  /** The line goes through the middle of the hoop and on to the next hover point. */
  private flyThrough(index: number, streak: number, side?: Side): void {
    this.routeTo(index);
    const gate = this.gateAt(index);
    const hoop = this.hoopFor(gate, side) ?? null;
    const trick: Trick = this.context.reducedMotion ? "none" : streak >= 10 ? "loop" : streak >= 5 ? "roll" : "none";
    const at = this.path.extendTo(hoop ? hoop.home : gate.centre);
    this.passes.push({ s: at, hoop, trick, streak, glider: false, camera: false });
    this.layTo(index + 1);
    this.routed = index + 1;
    this.hold = this.path.length;
    for (const other of gate.hoops) if (other !== hoop) other.fading ??= 0;
  }

  /** A miss: a paint film closes the hoop, it shakes, and the glider wobbles. */
  private close(index: number, side?: Side): void {
    const gate = this.gateAt(index);
    const hoop = this.hoopFor(gate, side);
    this.wobble = 1;
    if (!hoop) return;
    if (!hoop.film) {
      const film = new THREE.Mesh(
        this.kit.own(new THREE.CircleGeometry(RADIUS - TUBE * 0.4, 48)),
        this.kit.own(new THREE.MeshBasicMaterial({ color: hoop.color.clone().lerp(WATERCOLOR.paper, 0.2), transparent: true, opacity: FILM, side: THREE.DoubleSide, depthWrite: false })),
      );
      film.scale.setScalar(0.001);
      hoop.ring.add(film);
      hoop.film = film;
    }
    hoop.closing = this.context.reducedMotion ? 1 : 0;
    hoop.popping = null;
    hoop.film.visible = true;
    hoop.shake = this.context.reducedMotion ? 0 : 1;
  }

  /** The child fixed it: the film pops and the glider flies through the right hoop after all. */
  private fixed(index: number, side?: Side): void {
    const gate = this.gateAt(index);
    const hoop = this.hoopFor(gate, side);
    if (hoop?.film && hoop.popping === null && hoop.closing !== null) {
      hoop.popping = 0;
      this.splash(hoop.home, hoop.color, 22, "film");
    }
    this.flyThrough(index, 0, side);
  }

  private finale(): void {
    this.cheering = true;
    this.target.lookBack = 1;
    // Climb away into the sky with a loop and a burst of paint, past any hoop left hanging.
    for (const gate of this.gates.values()) for (const hoop of gate.hoops) if (hoop.passed === null) hoop.fading ??= 0;
    this.path.extendTo(this.path.end.clone().add(new THREE.Vector3(0, 5, -34)));
    this.hold = this.path.length;
    if (!this.context.reducedMotion) this.trick = { kind: "loop", start: this.time, duration: 1.4 };
    this.splash(this.rider.position.clone().add(new THREE.Vector3(0, 1, -2)), WATERCOLOR.yellow, 70, "burst");
  }

  // ---------- flight ----------

  private stepFlight(delta: number): void {
    if (this.context.reducedMotion) {
      this.flight.s = this.hold;
      this.flight.speed = 0;
      return;
    }
    advanceFlight(this.flight, this.hold, delta);
  }

  private placeGlider(delta: number): void {
    const reduced = this.context.reducedMotion;
    const hovering = this.flight.speed < 0.3;
    if (delta > 0) this.weave += ((hovering && !reduced ? 1 : 0) - this.weave) * (1 - Math.exp(-delta * 1.2));
    this.path.at(this.flight.s, this.base);
    const t = this.time;
    // Riding the air while the child thinks: a small, slow weave (the camera does not follow it).
    const local = new THREE.Vector3(
      Math.sin(t * 0.7) * 0.55 * this.weave + Math.sin(t * 15) * 0.1 * this.wobble,
      -RIDE + Math.sin(t * 1.1 + 0.6) * 0.22 * this.weave,
      0,
    );
    let roll = 0;
    let flip = 0;
    this.loopLift = 0;
    if (this.trick) {
      const p = (t - this.trick.start) / this.trick.duration;
      const eased = p * p * (3 - 2 * p);
      if (p >= 1) this.trick = null;
      else if (this.trick.kind === "roll") roll = Math.PI * 2 * eased;
      else if (this.trick.kind === "loop") {
        flip = Math.PI * 2 * eased;
        this.loopLift = LOOP_RADIUS * (1 - Math.cos(flip));
        local.y += this.loopLift;
        local.z -= LOOP_RADIUS * Math.sin(flip);
      }
    }
    this.rider.position.copy(this.base).add(local);

    // Face along the line; bank into its turns.
    const ahead = this.path.at(this.flight.s + 0.8, new THREE.Vector3());
    const behind = this.path.at(this.flight.s - 0.8, new THREE.Vector3());
    const direction = ahead.sub(behind).normalize();
    const heading = Math.atan2(-direction.x, -direction.z);
    if (delta > 0) {
      const rate = (heading - this.heading) / delta;
      this.headingRate += (rate - this.headingRate) * Math.min(1, delta * 6);
    }
    this.heading = heading;
    this.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    const drift = -Math.cos(t * 0.7) * 0.7 * 0.55 * this.weave;
    const bankTarget = THREE.MathUtils.clamp(this.headingRate * 0.9 - drift * 0.35, -0.7, 0.7);
    this.bank += (bankTarget - this.bank) * Math.min(1, delta * 5);
    const sway = Math.sin(t * 9) * 0.2 * this.wobble;
    this.craft.rotation.set(this.pitch + flip, this.heading, this.bank + roll + sway, "YXZ");

    this.target.air = hovering ? 0.4 : 1;
    this.target.spread = this.cheering || this.trick?.kind === "loop" ? 1 : 0;
    if (!this.cheering) this.target.lookBack = hovering ? 0.3 : 0;
  }

  /** The camera rides the flight line behind the glider: through every hoop centre, horizon level. */
  private placeCamera(delta: number, snap = false): void {
    const at = this.flight.s - CHASE;
    this.path.at(at, this.camera.position);
    const look = this.path.at(at + LOOK, new THREE.Vector3());
    look.y += -TILT + this.loopLift * 0.3;
    this.lookTarget.lerp(look, snap ? 1 : 1 - Math.exp(-delta * 6));
    this.camera.lookAt(this.lookTarget);
  }

  private checkPasses(): void {
    for (const pass of this.passes) {
      if (!pass.glider && this.flight.s >= pass.s - 1.2) {
        pass.glider = true;
        if (pass.hoop) {
          pass.hoop.passed = 0;
          this.splash(pass.hoop.home, pass.hoop.color, 26 + Math.min(pass.streak, 10) * 3, "rim");
        }
        if (pass.trick !== "none") this.trick = { kind: pass.trick, start: this.time, duration: pass.trick === "loop" ? 1.2 : 0.8 };
      }
      if (!pass.camera && this.flight.s - CHASE >= pass.s - 0.2) {
        pass.camera = true;
        if (!this.context.reducedMotion) {
          this.flash = 1;
          this.surge = 1;
          if (pass.hoop) this.rimMaterial.color.copy(pass.hoop.color);
        }
      }
    }
    this.passes = this.passes.filter(pass => !pass.camera);
  }

  // ---------- effects ----------

  /**
   * Paint drops. "rim": flung out from the rim and back towards the camera, so
   * the camera flies through them; "film": a popped film; "burst": a cheer.
   */
  private splash(origin: THREE.Vector3, color: THREE.Color, count: number, kind: "rim" | "film" | "burst"): void {
    if (this.context.reducedMotion) return;
    for (let i = 0; i < count && this.drops.length < DROPS_MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const reach = kind === "film" ? Math.sqrt(Math.random()) * RADIUS : RADIUS;
      const start = kind === "burst" ? origin.clone() : origin.clone().addScaledVector(out, reach);
      const speed = kind === "rim" ? 1.4 + Math.random() * 2.4 : 3 + Math.random() * 4;
      const velocity = out.clone().multiplyScalar(speed);
      if (kind === "rim") velocity.z = 2 + Math.random() * 5;
      else velocity.add(new THREE.Vector3(0, 1.5, (Math.random() - 0.5) * 3));
      this.drops.push({
        position: start,
        velocity,
        life: 1 + Math.random() * 0.6,
        color: i % 3 === 0 ? WATERCOLOR.yellow : color,
        size: 0.08 + Math.random() * 0.12,
      });
    }
  }

  private stepDrops(delta: number): void {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let alive = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.life -= delta;
      if (drop.life <= 0) {
        this.drops.splice(i, 1);
        continue;
      }
      drop.velocity.y -= 7 * delta;
      drop.velocity.multiplyScalar(1 - delta * 0.8);
      drop.position.addScaledVector(drop.velocity, delta);
      scale.setScalar(drop.size * Math.min(1, drop.life * 1.5));
      matrix.compose(drop.position, quaternion, scale);
      this.dropMesh.setMatrixAt(alive, matrix);
      this.dropMesh.setColorAt(alive, drop.color);
      alive++;
    }
    this.dropMesh.count = alive;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;
  }

  private stepTrail(delta: number): void {
    const reduced = this.context.reducedMotion;
    const level = reduced ? 0 : this.streak >= 10 ? 3 : this.streak >= 5 ? 2 : this.streak >= 3 ? 1 : 0;
    const color = level >= 3 ? WATERCOLOR.lilac : level >= 2 ? WATERCOLOR.coral : WATERCOLOR.yellow;
    this.trailMaterial.color.lerp(color, Math.min(1, delta * 4));
    this.trailMaterial.opacity += ((level ? 0.8 : 0) - this.trailMaterial.opacity) * Math.min(1, delta * 3);
    // Two thin airshow trails from the wingtips, sampled by distance so they
    // stay short and never reach the camera.
    const positions = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    WINGTIPS.forEach((tip, wing) => {
      const points = this.trailPoints[wing];
      const at = tip.clone().applyMatrix4(this.craft.matrixWorld);
      if (!points.length || points[0].distanceTo(at) > TRAIL_STEP) points.unshift(at);
      else points[0].copy(at);
      if (points.length > TRAIL_POINTS) points.length = TRAIL_POINTS;
      // At most TRAIL_LENGTH long along the path, whatever the speed.
      let travelled = 0;
      let last = at;
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const next = points[Math.min(i, points.length - 1)] ?? at;
        const step = next.distanceTo(last);
        const keep = travelled + step <= TRAIL_LENGTH ? 1 : Math.max(0, (TRAIL_LENGTH - travelled) / Math.max(step, 1e-6));
        const point = last.clone().lerp(next, keep);
        travelled += step * keep;
        last = point;
        const width = 0.06 * (1 - Math.min(1, travelled / TRAIL_LENGTH)) * (1 + level * 0.3);
        const base = (wing * TRAIL_POINTS + i) * 2;
        positions.setXYZ(base, point.x - width, point.y, point.z);
        positions.setXYZ(base + 1, point.x + width, point.y, point.z);
      }
    });
    positions.needsUpdate = true;
  }

  private stepHoops(delta: number): void {
    const reduced = this.context.reducedMotion;
    const z = this.rider.position.z;
    for (const gate of this.gates.values()) {
      if (gate.z > z + 14) {
        for (const hoop of gate.hoops) this.scene.remove(hoop.group);
        this.gates.delete(gate.index);
        continue;
      }
      for (const hoop of gate.hoops) {
        const tag = hoop.group.getObjectByName("tag");
        if (tag) tag.lookAt(this.camera.position.x, tag.getWorldPosition(new THREE.Vector3()).y, this.camera.position.z);
        hoop.shake = Math.max(0, hoop.shake - delta * 1.4);
        hoop.group.position.copy(hoop.home);
        hoop.group.position.x += Math.sin(this.time * 22) * 0.14 * hoop.shake;
        this.stepFilm(hoop, delta);
        if (hoop.fading !== null) {
          hoop.fading = reduced ? 1 : Math.min(1, hoop.fading + delta * 2.2);
          hoop.group.scale.setScalar(Math.max(0.01, 1 - hoop.fading));
          hoop.group.position.y -= hoop.fading * 2.5;
          continue;
        }
        if (hoop.passed !== null) {
          hoop.passed = Math.min(1, hoop.passed + delta * 1.6);
          hoop.group.scale.setScalar(1 + Math.sin(Math.min(1, hoop.passed * 2) * Math.PI) * 0.18);
          continue;
        }
        hoop.group.scale.setScalar(reduced ? 1 : Math.min(1, hoop.group.scale.x + delta * 2.2));
        hoop.ring.rotation.z = reduced ? 0 : Math.sin(this.time * 0.8 + gate.index) * 0.12;
      }
    }
  }

  private stepFilm(hoop: Hoop, delta: number): void {
    const film = hoop.film;
    if (!film || !film.visible) return;
    const material = film.material as THREE.MeshBasicMaterial;
    if (hoop.popping !== null) {
      hoop.popping = this.context.reducedMotion ? 1 : Math.min(1, hoop.popping + delta * 4.5);
      film.scale.setScalar(1 + hoop.popping * 0.25);
      material.opacity = FILM * (1 - hoop.popping);
      if (hoop.popping >= 1) film.visible = false;
      return;
    }
    if (hoop.closing !== null) {
      hoop.closing = Math.min(1, hoop.closing + delta * 3.2);
      const eased = 1 - (1 - hoop.closing) ** 3;
      film.scale.setScalar(Math.max(0.001, eased));
      material.opacity = FILM;
    }
  }

  // ---------- frame ----------

  private readonly loop = (now: number) => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    const raw = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (this.lost || !this.renderer || !this.pass) return;
    if (raw > 0) {
      this.frameTimes.push(raw * 1000);
      if (this.frameTimes.length > 600) this.frameTimes.shift();
    }
    const delta = this.paused ? 0 : Math.min(raw, 0.05);
    this.time += delta;
    this.update(delta);
    this.pass.render(this.renderer, this.scene, this.camera);
  };

  private update(delta: number): void {
    const reduced = this.context.reducedMotion;
    this.stepFlight(delta);
    this.placeGlider(delta);
    this.checkPasses();
    this.wobble = Math.max(0, this.wobble - delta * 1.1);
    const blend = 1 - Math.exp(-delta * 8);
    this.pose = {
      run: 0,
      air: THREE.MathUtils.lerp(this.pose.air, this.target.air, blend),
      spread: THREE.MathUtils.lerp(this.pose.spread, this.target.spread, blend),
      squash: 0,
      lookBack: THREE.MathUtils.lerp(this.pose.lookBack, this.target.lookBack, 1 - Math.exp(-delta * 4)),
      wobble: this.wobble,
    };
    this.nib.update(this.time, this.pose, delta);
    // Reduced motion cuts from hover to hover; the aim cuts with it.
    this.placeCamera(delta, reduced);
    this.rider.updateMatrixWorld();

    // Through a hoop: a wash of its colour round the edges of the view, quickly gone.
    this.flash = Math.max(0, this.flash - delta * 2.4);
    this.rim.visible = this.flash > 0.01;
    this.rimMaterial.opacity = Math.sin(Math.min(1, this.flash) * Math.PI * 0.5) ** 2 * 0.5;
    this.surge = Math.max(0, this.surge - delta * 1.8);

    const z = this.rider.position.z;
    this.sky.position.copy(this.camera.position);
    this.sun.position.set(this.camera.position.x - 38, this.camera.position.y + 30, this.camera.position.z - 120);
    this.sun.lookAt(this.camera.position);

    for (const drift of this.drifts) {
      if (drift.wind && !reduced) drift.group.position.z += WIND * delta;
      if (drift.group.position.z > z + 25) drift.group.position.z -= drift.span;
    }

    // Wind streaks rush past: always a little, more at speed, a gust through each hoop.
    const rush = reduced ? 0 : WIND * 2.5 + this.flight.speed * 1.6 + this.surge * 20;
    this.streakMaterial.opacity += ((reduced ? 0 : 0.18 + Math.min(0.5, this.flight.speed / 40) + this.surge * 0.25) - this.streakMaterial.opacity) * Math.min(1, delta * 4);
    for (const line of this.streaks) {
      line.position.z += rush * delta;
      line.rotation.y = this.heading;
      if (line.position.z > z + 6) this.placeStreak(line, -26 - Math.random() * 10);
    }

    this.stepHoops(delta);
    this.stepDrops(delta);
    this.stepTrail(delta);
  }
}
