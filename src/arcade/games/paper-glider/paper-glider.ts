// Paper Glider (纸飞机), game B (plan §5.5), painted in watercolor (decision 19).
// Nib rides a folded-paper glider through the next painted hoop. In choice
// mode two hoops hang left and right, each with a number tag. A streak adds a
// contrail, then a barrel roll, then a full loop.
//
// The game only renders round events (plan §5.3, §7.8).

import * as THREE from "three";
import type { Side } from "../../core/choices";
import type { RoundEvent } from "../../core/round-engine";
import { Nib, restPose, type NibPose } from "../../render/nib";
import { inkMesh, stickyNoteTexture, tierPixelRatio, type QualityTier } from "../../render/notebook-kit";
import { WATERCOLOR, WatercolorKit, WatercolorPass } from "../../render/watercolor-kit";
import type { ArcadeGame, GameContext } from "../types";

const SPACING = 20;
const WAIT_GAP = 7;
const PASS_GAP = 5;
const LANE = 3.3;
const AHEAD = 3;
const HOOP_COLORS = [WATERCOLOR.coral, WATERCOLOR.mint, WATERCOLOR.lilac, WATERCOLOR.yellow, WATERCOLOR.blue];
const DROPS_MAX = 160;
const TRAIL_POINTS = 16;
const TRAIL_LENGTH = 3.2;
const WINGTIPS = [new THREE.Vector3(-1.25, 0.16, 0.95), new THREE.Vector3(1.25, 0.16, 0.95)];
const TRAIL_STEP = 0.3;

type Trick = "none" | "roll" | "loop";
interface Move {
  to: THREE.Vector3;
  duration: number;
  trick?: Trick;
  /** Dip below the line, for a miss. */
  dip?: number;
  onDone?: () => void;
  from?: THREE.Vector3;
  elapsed?: number;
}

interface Hoop {
  group: THREE.Group;
  ring: THREE.Group;
  side: Side | null;
  passed: number | null;
  fading: number | null;
}

interface Gate {
  index: number;
  z: number;
  hoops: Hoop[];
}

interface Drop { position: THREE.Vector3; velocity: THREE.Vector3; life: number; color: THREE.Color; size: number }
interface Drift { group: THREE.Group; span: number }

export class PaperGlider implements ArcadeGame {
  readonly id = "paper-glider";
  private renderer: THREE.WebGLRenderer | null = null;
  private pass: WatercolorPass | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 400);
  private readonly kit = new WatercolorKit();
  private context: GameContext = { quality: "medium", reducedMotion: false, mode: "answer" };
  private readonly rider = new THREE.Group();
  private readonly craft = new THREE.Group();
  private nib!: Nib;
  private sky!: THREE.Mesh;
  private sun!: THREE.Mesh;
  private readonly gates = new Map<number, Gate>();
  private readonly moves: Move[] = [];
  private readonly drifts: Drift[] = [];
  private readonly drops: Drop[] = [];
  private dropMesh!: THREE.InstancedMesh;
  private trail!: THREE.Mesh;
  private trailMaterial!: THREE.MeshBasicMaterial;
  private readonly trailPoints: THREE.Vector3[][] = [[], []];
  private pose: NibPose = restPose();
  private readonly target: NibPose = restPose();
  private readonly last = new THREE.Vector3();
  private bank = 0;
  private pitch = 0;
  private roll = 0;
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
    this.placeCamera(1);
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
        this.through(event.index, event.streak, event.side);
        break;
      case "answer_wrong":
        this.streak = 0;
        this.miss(event.index, event.side);
        break;
      case "answer_shown":
        this.streak = 0;
        this.reveal(event.index);
        break;
      case "answer_corrected":
        this.splash(this.rider.position.clone().add(new THREE.Vector3(0, 0.8, -0.6)), WATERCOLOR.mint, 14);
        break;
      case "round_end":
        this.cheering = true;
        this.target.lookBack = 1;
        this.queue({ to: this.queueEnd().clone().add(new THREE.Vector3(0, 0, -8)), duration: 1.6, trick: this.context.reducedMotion ? "none" : "loop" });
        this.splash(this.rider.position.clone().add(new THREE.Vector3(0, 1, -2)), WATERCOLOR.yellow, 70);
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

    // Paint droplets.
    const drop = kit.own(new THREE.SphereGeometry(1, 8, 6));
    this.dropMesh = new THREE.InstancedMesh(drop, kit.own(new THREE.MeshBasicMaterial()), DROPS_MAX);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.scene.add(this.dropMesh);

    // The contrail ribbon.
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

    for (let i = 0; i < 26; i++) this.addCloud(i);
    for (let i = 0; i < 14; i++) this.addHill(i);
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
    const high = i % 5 === 0;
    group.position.set(side * (6 + Math.random() * 16), high ? 6 + Math.random() * 5 : -4 - Math.random() * 6, 12 - i * 9);
    group.scale.setScalar(0.8 + Math.random() * 0.9);
    this.scene.add(group);
    this.drifts.push({ group, span: 26 * 9 });
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
    this.drifts.push({ group: hill, span: 14 * 22 });
  }

  private gateAt(index: number): Gate {
    const known = this.gates.get(index);
    if (known) return known;
    const z = -(index + 1) * SPACING;
    const gate: Gate = { index, z, hoops: [] };
    if (this.context.mode !== "choice") gate.hoops.push(this.makeHoop(index, 0, z, null));
    this.gates.set(index, gate);
    return gate;
  }

  private makeHoop(index: number, x: number, z: number, side: Side | null): Hoop {
    const kit = this.kit;
    const torus = kit.own(new THREE.TorusGeometry(1.75, 0.17, 10, 44));
    const color = HOOP_COLORS[(index * 2 + (side === "right" ? 1 : 0)) % HOOP_COLORS.length];
    const ring = inkMesh(kit, torus, color, 0.02);
    const group = new THREE.Group();
    group.add(ring);
    group.position.set(x, 0, z);
    group.scale.setScalar(0.01);
    this.scene.add(group);
    return { group, ring, side, passed: null, fading: null };
  }

  private addChoices(gate: Gate, choices: [number, number]): void {
    if (gate.hoops.length) return;
    const kit = this.kit;
    const tagGeometry = kit.own(new THREE.PlaneGeometry(1.8, 1.8));
    (["left", "right"] as const).forEach((side, i) => {
      const hoop = this.makeHoop(gate.index, side === "left" ? -LANE : LANE, gate.z, side);
      // A paper tag hanging under the hoop, with the number.
      const tag = new THREE.Mesh(tagGeometry, kit.own(new THREE.MeshBasicMaterial({ map: stickyNoteTexture(kit, String(choices[i]), "#fffaf0"), transparent: true })));
      tag.position.set(0, -2.85, 0.05);
      tag.name = "tag";
      const string = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4)), kit.surface(WATERCOLOR.pencil, 1));
      string.position.set(0, -2.05, 0);
      hoop.group.add(tag, string);
      gate.hoops.push(hoop);
    });
  }

  // ---------- events ----------

  private showItem(index: number, choices: [number, number] | null): void {
    for (let k = index; k <= index + AHEAD; k++) this.gateAt(k);
    const gate = this.gateAt(index);
    if (choices && this.context.mode === "choice") this.addChoices(gate, choices);
    this.target.lookBack = 0;
    const hover = new THREE.Vector3(0, 0, gate.z + WAIT_GAP);
    const distance = Math.abs(this.queueEnd().z - hover.z);
    this.queue({ to: hover, duration: Math.min(1.3, Math.max(0.45, distance / 16)), onDone: () => { this.target.lookBack = 0.3; } });
  }

  private through(index: number, streak: number, side?: Side): void {
    const gate = this.gateAt(index);
    const x = side ? (side === "left" ? -LANE : LANE) : 0;
    const hoop = gate.hoops.find(entry => entry.side === (side ?? null)) ?? gate.hoops[0];
    const trick: Trick = this.context.reducedMotion ? "none" : streak >= 10 ? "loop" : streak >= 5 ? "roll" : "none";
    this.target.lookBack = 0;
    this.queue({
      to: new THREE.Vector3(x, 0, gate.z - PASS_GAP),
      duration: trick === "loop" ? 1.25 : trick === "roll" ? 0.85 : 0.7,
      trick,
      onDone: undefined,
    });
    if (hoop) {
      hoop.passed = 0;
      this.splash(new THREE.Vector3(x, 0, gate.z), WATERCOLOR.yellow, 18 + Math.min(streak, 10) * 3, hoop);
    }
    for (const other of gate.hoops) if (other !== hoop) other.fading = 0;
  }

  private miss(index: number, side?: Side): void {
    const gate = this.gateAt(index);
    const x = side ? (side === "left" ? -LANE : LANE) : 0;
    this.target.lookBack = 0;
    const chosen = gate.hoops.find(entry => entry.side === (side ?? null)) ?? gate.hoops[0];
    // Bump the rim softly, drop under the hoop, and glide on.
    this.queue({
      to: new THREE.Vector3(x * 0.9, -0.4, gate.z + 1.6),
      duration: 0.45,
      onDone: () => {
        this.wobble = 1;
        if (chosen) {
          chosen.fading = 0;
          this.splash(chosen.group.position.clone(), WATERCOLOR.blue, 16, chosen);
        }
      },
    });
    this.queue({ to: new THREE.Vector3(0, 0, gate.z - PASS_GAP), duration: 0.9, dip: 1.4 });
  }

  private reveal(index: number): void {
    const gate = this.gateAt(index);
    for (const hoop of gate.hoops) hoop.fading = 0;
    this.target.lookBack = 0;
    this.queue({ to: new THREE.Vector3(0, 0, gate.z - PASS_GAP), duration: 1.2 });
  }

  // ---------- motion ----------

  private queueEnd(): THREE.Vector3 {
    return this.moves.length ? this.moves[this.moves.length - 1].to : this.rider.position;
  }

  private queue(move: Move): void {
    this.moves.push(move);
  }

  private stepMoves(delta: number): void {
    const move = this.moves[0];
    const reduced = this.context.reducedMotion;
    if (!move) {
      // Hover: a gentle bob and drift.
      this.rider.position.y += (Math.sin(this.time * 1.6) * 0.18 - this.rider.position.y) * Math.min(1, delta * 2);
      this.roll += (0 - this.roll) * Math.min(1, delta * 4);
      this.target.air = 0.35;
      this.target.spread = this.cheering ? 1 : 0;
      return;
    }
    if (reduced) {
      this.rider.position.copy(move.to);
      this.moves.shift();
      move.onDone?.();
      return;
    }
    move.from ??= this.rider.position.clone();
    move.elapsed = (move.elapsed ?? 0) + delta * (this.moves.length > 1 ? 1.6 : 1);
    const s = Math.min(1, move.elapsed / move.duration);
    const eased = s * s * (3 - 2 * s);
    this.rider.position.lerpVectors(move.from, move.to, eased);
    if (move.dip) this.rider.position.y -= Math.sin(Math.PI * s) * move.dip;
    this.target.air = 1;
    this.target.spread = move.trick === "loop" ? 1 : 0;
    if (move.trick === "roll") this.roll = Math.PI * 2 * eased;
    else if (move.trick === "loop") {
      const angle = Math.PI * 2 * eased;
      const radius = 2.6;
      this.rider.position.y += radius * (1 - Math.cos(angle));
      this.rider.position.z += radius * Math.sin(angle) * 0.9;
    }
    if (s >= 1) {
      this.moves.shift();
      this.roll = 0;
      move.onDone?.();
    }
  }

  private orient(delta: number): void {
    const velocity = this.rider.position.clone().sub(this.last).divideScalar(Math.max(delta, 1e-3));
    this.last.copy(this.rider.position);
    const looping = this.moves[0]?.trick === "loop";
    const bankTarget = THREE.MathUtils.clamp(-velocity.x * 0.09, -0.7, 0.7);
    const forward = Math.max(2, -velocity.z);
    const pitchTarget = looping ? Math.atan2(velocity.y, -velocity.z) : THREE.MathUtils.clamp(Math.atan2(velocity.y, forward), -0.6, 0.6);
    const k = 1 - Math.exp(-delta * (looping ? 30 : 6));
    this.bank += (bankTarget - this.bank) * k;
    this.pitch = looping ? pitchTarget : this.pitch + (pitchTarget - this.pitch) * k;
    const sway = Math.sin(this.time * 9) * 0.2 * this.wobble;
    this.craft.rotation.set(this.pitch, 0, this.bank + this.roll + sway, "YXZ");
  }

  private placeCamera(delta: number): void {
    const p = this.rider.position;
    const choice = this.context.mode === "choice";
    const desired = new THREE.Vector3(p.x * 0.45, p.y * 0.65 + (choice ? 2.2 : 1.7), p.z + (choice ? 9 : 7));
    const look = new THREE.Vector3(p.x * 0.25, p.y * 0.55 - 0.1, p.z - 10);
    const k = 1 - Math.exp(-delta * 4.5);
    this.camera.position.lerp(desired, k);
    this.camera.lookAt(look);
  }

  // ---------- effects ----------

  private splash(origin: THREE.Vector3, color: THREE.Color, count: number, hoop?: Hoop): void {
    if (this.context.reducedMotion) return;
    const ringColor = hoop ? ((hoop.ring.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color : color;
    for (let i = 0; i < count && this.drops.length < DROPS_MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      const start = hoop ? origin.clone().add(new THREE.Vector3(Math.cos(angle) * 1.75, Math.sin(angle) * 1.75, 0)) : origin.clone();
      this.drops.push({
        position: start,
        velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed + 1.5, (Math.random() - 0.5) * 3),
        life: 1 + Math.random() * 0.6,
        color: i % 3 === 0 ? color : ringColor,
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
    this.stepMoves(delta);
    if (delta > 0) this.orient(delta);
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
    this.placeCamera(delta);
    this.rider.updateMatrixWorld();

    const z = this.rider.position.z;
    this.sky.position.copy(this.camera.position);
    this.sun.position.set(this.camera.position.x - 38, this.camera.position.y + 30, this.camera.position.z - 120);
    this.sun.lookAt(this.camera.position);

    for (const drift of this.drifts) {
      if (drift.group.position.z > z + 25) drift.group.position.z -= drift.span;
    }

    for (const gate of this.gates.values()) {
      if (gate.z > z + 14) {
        for (const hoop of gate.hoops) this.scene.remove(hoop.group);
        this.gates.delete(gate.index);
        continue;
      }
      for (const hoop of gate.hoops) {
        const tag = hoop.group.getObjectByName("tag");
        if (tag) tag.lookAt(this.camera.position.x, tag.getWorldPosition(new THREE.Vector3()).y, this.camera.position.z);
        if (hoop.fading !== null) {
          hoop.fading = Math.min(1, hoop.fading + delta * 1.8);
          hoop.group.scale.setScalar(Math.max(0.01, 1 - hoop.fading));
          hoop.group.position.y -= delta * 1.5;
          continue;
        }
        if (hoop.passed !== null) {
          hoop.passed = Math.min(1, hoop.passed + delta * 1.6);
          const pulse = 1 + Math.sin(Math.min(1, hoop.passed * 2) * Math.PI) * 0.25;
          hoop.group.scale.setScalar(pulse);
          continue;
        }
        const grow = reduced ? 1 : Math.min(1, hoop.group.scale.x + delta * 2.2);
        hoop.group.scale.setScalar(grow);
        hoop.ring.rotation.z = reduced ? 0 : Math.sin(this.time * 0.8 + gate.index) * 0.12;
      }
    }

    this.stepDrops(delta);
    this.stepTrail(delta);
  }
}
