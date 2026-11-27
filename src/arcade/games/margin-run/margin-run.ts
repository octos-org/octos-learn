// Margin Run (页边快跑), game A (plan §5.5): Nib runs along a notebook page
// whose doodles rise into a landscape. Each correct answer is a leap over the
// next doodle obstacle. In choice mode the path forks around the obstacle and
// each fork carries a number.
//
// The game only renders round events (plan §5.3, §7.8).

import * as THREE from "three";
import type { RoundEvent } from "../../core/round-engine";
import type { Side } from "../../core/choices";
import { Nib, restPose, type NibPose } from "../../render/nib";
import { createPaperGround, inkMesh, NotebookKit, PALETTE, stickyNoteTexture, tierPixelRatio, type QualityTier } from "../../render/notebook-kit";
import type { ArcadeGame, GameContext } from "../types";

const SPACING = 16;
const WAIT_GAP = 3.4;
const LAND_GAP = 2.8;
const LANE = 2.7;
const AHEAD = 4;

type MoveKind = "run" | "walk" | "leap" | "bump" | "cheer" | "hop";
interface Move {
  kind: MoveKind;
  to: THREE.Vector3;
  duration: number;
  height?: number;
  spin?: boolean;
  glide?: boolean;
  onDone?: () => void;
  from?: THREE.Vector3;
  elapsed?: number;
}

interface Obstacle {
  index: number;
  z: number;
  group: THREE.Group;
  signs: THREE.Group | null;
  choiceSigns: Partial<Record<Side, THREE.Group>>;
  sinking: number | null;
  scribble: THREE.Group | null;
}

interface Particle { position: THREE.Vector3; velocity: THREE.Vector3; spin: THREE.Vector3; rotation: THREE.Euler; life: number; color: THREE.Color }
interface Splash { mesh: THREE.Mesh; age: number }
interface Scenery { group: THREE.Group; risen: number; baseZ: number }

const CONFETTI_MAX = 180;
const confettiColors = [PALETTE.yellow, PALETTE.coral, PALETTE.mint, PALETTE.lilac, PALETTE.sky];

export class MarginRun implements ArcadeGame {
  readonly id = "margin-run";
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  private readonly kit = new NotebookKit();
  private nib!: Nib;
  private readonly pivot = new THREE.Group();
  private readonly nibRoot = new THREE.Group();
  private ground!: THREE.Mesh;
  private context: GameContext = { quality: "medium", reducedMotion: false, mode: "answer" };
  private readonly obstacles = new Map<number, Obstacle>();
  private readonly moves: Move[] = [];
  private pose: NibPose = restPose();
  private target: NibPose = restPose();
  private wobble = 0;
  private squashPulse = 0;
  private streak = 0;
  private time = 0;
  private frame = 0;
  private last = 0;
  private running = false;
  private paused = false;
  private lost = false;
  private cheering = false;
  private currentIndex = -1;
  private confetti!: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly splashes: Splash[] = [];
  private readonly scenery: Scenery[] = [];
  private speedLines!: THREE.Group;
  private sizes = { width: 1, height: 1 };
  private frameTimes: number[] = [];

  async mount(host: HTMLElement, context: GameContext): Promise<void> {
    this.context = context;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(PALETTE.paper);
    renderer.domElement.className = "arcade-game-canvas";
    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene.background = PALETTE.paper.clone();
    this.buildWorld();
    const rect = host.getBoundingClientRect();
    this.resize(rect.width || window.innerWidth, rect.height || window.innerHeight);
    this.placeCamera(1);
    this.running = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  onEvent(event: RoundEvent): void {
    switch (event.type) {
      case "round_start":
        this.target.lookBack = 0.35;
        break;
      case "countdown":
        this.squashPulse = 1;
        break;
      case "item_shown":
        this.showItem(event.index, event.choices ?? null);
        break;
      case "input_started":
        this.squashPulse = Math.max(this.squashPulse, 0.4);
        break;
      case "answer_correct":
        this.streak = event.streak;
        this.correct(event.index, event.streak, event.side);
        break;
      case "answer_wrong":
        this.streak = 0;
        this.wrong(event.index, event.side);
        break;
      case "answer_shown":
        this.streak = 0;
        this.shown(event.index);
        break;
      case "answer_corrected":
        // The child fixed it: a small cheer, and Nib hurries on.
        this.squashPulse = 0.6;
        this.burst(this.nibRoot.position.clone().add(new THREE.Vector3(0, 1.8, -0.5)), 14);
        break;
      case "round_end":
        this.cheer();
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
    this.kit.uniforms.uPixel.value = ratio;
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.last = performance.now();
  }

  /** Frame statistics for the device checks (plan §7.10). */
  stats(): { geometries: number; textures: number; p50: number; p95: number } {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    const memory = this.renderer?.info.memory ?? { geometries: 0, textures: 0 };
    return { geometries: memory.geometries, textures: memory.textures, p50: at(0.5), p95: at(0.95) };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.scene.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.kit.dispose();
    if (this.renderer) {
      this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.renderer = null;
    this.obstacles.clear();
    this.scene.clear();
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  // ---------- world ----------

  private buildWorld(): void {
    const kit = this.kit;
    this.ground = createPaperGround(kit, 80, 220);
    this.scene.add(this.ground);

    this.nib = new Nib(kit);
    this.nibRoot.add(this.pivot);
    this.pivot.position.y = 1;
    this.nib.root.position.y = -1;
    this.pivot.add(this.nib.root);
    this.scene.add(this.nibRoot);

    // Paper-bit confetti.
    const bit = kit.own(new THREE.PlaneGeometry(0.2, 0.13));
    const material = kit.own(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    this.confetti = new THREE.InstancedMesh(bit, material, CONFETTI_MAX);
    this.confetti.count = 0;
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);

    // Pencil speed lines, shown on a streak.
    this.speedLines = new THREE.Group();
    const lineGeometry = kit.own(new THREE.BoxGeometry(0.035, 0.035, 2.6));
    const lineMaterial = kit.own(new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0 }));
    for (let i = 0; i < 26; i++) {
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      line.position.set((Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 3.2), 0.4 + Math.random() * 3.6, -Math.random() * 20);
      this.speedLines.add(line);
    }
    this.scene.add(this.speedLines);

    for (let i = 0; i < 34; i++) this.addScenery(i);
  }

  private addScenery(i: number): void {
    const kit = this.kit;
    const side = i % 2 === 0 ? -1 : 1;
    const kind = i % 7;
    const group = new THREE.Group();
    const box = kit.own(new THREE.BoxGeometry(1, 1, 1));
    const cone = kit.own(new THREE.ConeGeometry(1, 1, kind === 3 ? 4 : 9));
    const ball = kit.own(new THREE.SphereGeometry(1, 12, 9));
    const cylinder = kit.own(new THREE.CylinderGeometry(1, 1, 1, 8));
    let x = side * (6 + Math.random() * 7);
    if (kind === 0 || kind === 4) {
      const trunk = inkMesh(kit, cylinder, PALETTE.wood, 0.05);
      trunk.scale.set(0.22, 1.4, 0.22);
      trunk.position.y = 0.7;
      const crown = inkMesh(kit, kind === 0 ? cone : ball, PALETTE.mint, 0.05);
      if (kind === 0) { crown.scale.set(1.2, 2.4, 1.2); crown.position.y = 2.4; } else { crown.scale.setScalar(1.15); crown.position.y = 2.3; }
      group.add(trunk, crown);
    } else if (kind === 1 || kind === 3) {
      const house = inkMesh(kit, box, kind === 1 ? PALETTE.coral : PALETTE.sky, 0.04);
      house.scale.set(2, 1.6, 1.8);
      house.position.y = 0.8;
      const roof = inkMesh(kit, cone, PALETTE.lilac, 0.04);
      roof.scale.set(1.75, 1.1, 1.6);
      roof.position.y = 2.15;
      if (kind === 3) roof.rotation.y = Math.PI / 4;
      group.add(house, roof);
    } else if (kind === 2) {
      for (let k = 0; k < 3; k++) {
        const puff = inkMesh(kit, ball, PALETTE.white, 0.06);
        puff.scale.setScalar(0.8 + k * 0.15);
        puff.position.set(k * 0.9 - 0.9, 0, 0);
        group.add(puff);
      }
      group.position.y = 7 + Math.random() * 2;
      x = side * (4 + Math.random() * 10);
    } else if (kind === 5) {
      const mountain = inkMesh(kit, cone, PALETTE.lilac, 0.03);
      mountain.scale.set(7, 8, 7);
      mountain.position.y = 4;
      group.add(mountain);
      x = side * (22 + Math.random() * 10);
    } else {
      const flower = inkMesh(kit, ball, PALETTE.coral, 0.08);
      flower.scale.setScalar(0.35);
      flower.position.y = 0.9;
      const stem = inkMesh(kit, cylinder, PALETTE.mint, 0.1);
      stem.scale.set(0.05, 0.9, 0.05);
      stem.position.y = 0.45;
      group.add(stem, flower);
      x = side * (3.6 + Math.random() * 2);
    }
    const baseZ = -i * 6.5 + 10;
    group.position.x = x;
    group.position.z = baseZ;
    group.rotation.y = Math.random() * Math.PI;
    const scenery = { group, risen: 0, baseZ };
    group.scale.set(1, 0.01, 1);
    this.scene.add(group);
    this.scenery.push(scenery);
  }

  private obstacleAt(index: number): Obstacle {
    const known = this.obstacles.get(index);
    if (known) return known;
    const kit = this.kit;
    const group = new THREE.Group();
    const box = kit.own(new THREE.BoxGeometry(1, 1, 1));
    const cylinder = kit.own(new THREE.CylinderGeometry(1, 1, 1, 10));
    const cone = kit.own(new THREE.ConeGeometry(1, 1, 10));
    const kind = index % 4;
    if (kind === 0) {
      // An eraser with a paper sleeve.
      const eraser = inkMesh(kit, box, PALETTE.coral, 0.03);
      eraser.scale.set(2.2, 0.9, 1.1);
      eraser.position.y = 0.45;
      const sleeve = inkMesh(kit, box, PALETTE.sky, 0.03);
      sleeve.scale.set(1.1, 0.96, 1.16);
      sleeve.position.set(0.45, 0.45, 0);
      group.add(eraser, sleeve);
    } else if (kind === 1) {
      // A pencil lying across the path.
      const pencil = inkMesh(kit, cylinder, PALETTE.yellow, 0.05);
      pencil.scale.set(0.32, 2.6, 0.32);
      pencil.rotation.z = Math.PI / 2;
      pencil.position.y = 0.34;
      const tip = inkMesh(kit, cone, PALETTE.wood, 0.05);
      tip.scale.set(0.32, 0.7, 0.32);
      tip.rotation.z = -Math.PI / 2;
      tip.position.set(1.65, 0.34, 0);
      group.add(pencil, tip);
    } else if (kind === 2) {
      // Two books.
      const lower = inkMesh(kit, box, PALETTE.lilac, 0.03);
      lower.scale.set(2.3, 0.5, 1.5);
      lower.position.y = 0.25;
      const upper = inkMesh(kit, box, PALETTE.mint, 0.03);
      upper.scale.set(1.9, 0.45, 1.3);
      upper.position.y = 0.72;
      upper.rotation.y = 0.18;
      group.add(lower, upper);
    } else {
      // An ink bottle.
      const bottle = inkMesh(kit, cylinder, PALETTE.ink, 0.06);
      bottle.scale.set(0.7, 1.1, 0.7);
      bottle.position.y = 0.55;
      const cap = inkMesh(kit, cylinder, PALETTE.graphite, 0.08);
      cap.scale.set(0.38, 0.35, 0.38);
      cap.position.y = 1.27;
      group.add(bottle, cap);
    }
    const z = -(index + 1) * SPACING;
    group.position.z = z;
    group.scale.set(1, 0.01, 1);
    this.scene.add(group);
    const obstacle: Obstacle = { index, z, group, signs: null, choiceSigns: {}, sinking: null, scribble: null };
    this.obstacles.set(index, obstacle);
    return obstacle;
  }

  private addSigns(obstacle: Obstacle, choices: [number, number]): void {
    if (obstacle.signs) return;
    const kit = this.kit;
    const signs = new THREE.Group();
    const post = kit.own(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6));
    const plane = kit.own(new THREE.PlaneGeometry(1.5, 1.5));
    (["left", "right"] as const).forEach((side, i) => {
      const sign = new THREE.Group();
      const stick = inkMesh(kit, post, PALETTE.wood, 0.04);
      stick.position.y = 0.8;
      const note = new THREE.Mesh(plane, kit.own(new THREE.MeshBasicMaterial({ map: stickyNoteTexture(kit, String(choices[i])), transparent: true })));
      note.position.y = 2.15;
      note.name = "note";
      sign.add(stick, note);
      sign.position.set(side === "left" ? -LANE : LANE, 0, obstacle.z + 1.6);
      signs.add(sign);
      obstacle.choiceSigns[side] = sign;
    });
    obstacle.signs = signs;
    this.scene.add(signs);
  }

  // ---------- events ----------

  private showItem(index: number, choices: [number, number] | null): void {
    this.currentIndex = index;
    for (let k = index; k <= index + AHEAD; k++) this.obstacleAt(k);
    const obstacle = this.obstacleAt(index);
    if (choices && this.context.mode === "choice") this.addSigns(obstacle, choices);
    this.target.lookBack = 0;
    const waitPoint = new THREE.Vector3(0, 0, obstacle.z + WAIT_GAP);
    const distance = Math.abs(this.queueEnd().z - waitPoint.z);
    this.queue({ kind: "run", to: waitPoint, duration: Math.min(1.1, Math.max(0.35, distance / 15)), onDone: () => { this.target.lookBack = 0.35; } });
  }

  private correct(index: number, streak: number, side?: Side): void {
    const obstacle = this.obstacleAt(index);
    this.target.lookBack = 0;
    if (this.context.mode === "choice" && side) {
      const x = side === "left" ? -LANE : LANE;
      this.queue({ kind: "run", to: new THREE.Vector3(x, 0, obstacle.z + 1.9), duration: 0.28, onDone: () => this.burst(new THREE.Vector3(x, 2.2, obstacle.z + 1.6), 40) });
      this.queue({ kind: "hop", to: new THREE.Vector3(x, 0, obstacle.z - LAND_GAP), duration: 0.42, height: streak >= 5 ? 1.8 : 1.1, spin: streak >= 5 && !this.context.reducedMotion });
      return;
    }
    const big = streak >= 5;
    const glide = streak >= 10 && !this.context.reducedMotion;
    this.queue({
      kind: "leap",
      to: new THREE.Vector3(0, 0, obstacle.z - LAND_GAP - (big ? 1 : 0)),
      duration: glide ? 0.95 : big ? 0.72 : 0.6,
      height: big ? 3.3 : 2.4,
      spin: big && !this.context.reducedMotion,
      glide,
      onDone: () => this.splash(new THREE.Vector3(0, 0.02, obstacle.z - LAND_GAP - (big ? 1 : 0))),
    });
    this.burst(new THREE.Vector3(0, 1.4, obstacle.z), 26 + Math.min(streak, 10) * 4);
  }

  private wrong(index: number, side?: Side): void {
    const obstacle = this.obstacleAt(index);
    this.target.lookBack = 0;
    if (this.context.mode === "choice" && side) {
      const x = side === "left" ? -LANE : LANE;
      this.queue({ kind: "bump", to: new THREE.Vector3(x * 0.8, 0, obstacle.z + 2.4), duration: 0.35, onDone: () => this.scribbleSign(obstacle, side) });
      this.queue({ kind: "walk", to: new THREE.Vector3(0, 0, obstacle.z - LAND_GAP), duration: 0.8 });
      return;
    }
    this.queue({ kind: "bump", to: new THREE.Vector3(0, 0, obstacle.z + 1.15), duration: 0.3, onDone: () => this.scribble(obstacle) });
    this.queue({ kind: "walk", to: new THREE.Vector3(0, 0, obstacle.z - LAND_GAP), duration: 0.75 });
  }

  private shown(index: number): void {
    const obstacle = this.obstacleAt(index);
    obstacle.sinking = 0;
    this.target.lookBack = 0;
    this.queue({ kind: "walk", to: new THREE.Vector3(0, 0, obstacle.z - LAND_GAP), duration: 1.1 });
  }

  private cheer(): void {
    this.cheering = true;
    this.target.lookBack = 1;
    this.burst(this.nibRoot.position.clone().add(new THREE.Vector3(0, 2, 0)), 90);
  }

  // ---------- motion ----------

  private queueEnd(): THREE.Vector3 {
    return this.moves.length ? this.moves[this.moves.length - 1].to : this.nibRoot.position;
  }

  private queue(move: Move): void {
    this.moves.push(move);
  }

  private stepMoves(delta: number): void {
    const move = this.moves[0];
    if (!move) {
      this.target.run = 0;
      this.target.air = 0;
      this.target.spread = this.cheering ? 1 : 0;
      if (this.cheering && !this.context.reducedMotion) {
        const hop = Math.abs(Math.sin(this.time * 4));
        this.nibRoot.position.y = hop * 0.9;
      }
      return;
    }
    if (this.context.reducedMotion) {
      // Actions resolve as short cuts.
      this.nibRoot.position.copy(move.to);
      this.moves.shift();
      move.onDone?.();
      return;
    }
    move.from ??= this.nibRoot.position.clone();
    move.elapsed = (move.elapsed ?? 0) + delta * (this.moves.length > 1 ? 1.7 : 1);
    const s = Math.min(1, move.elapsed / move.duration);
    const eased = move.kind === "leap" || move.kind === "hop" ? s : s * s * (3 - 2 * s);
    this.nibRoot.position.lerpVectors(move.from, move.to, eased);
    if ((move.kind === "leap" || move.kind === "hop") && move.height) {
      const arc = move.glide ? Math.sin(Math.PI * Math.min(1, s * 1.4)) * (s > 0.7 ? 1 - (s - 0.7) * 1.6 : 1) : 4 * s * (1 - s);
      this.nibRoot.position.y = Math.max(0, arc * move.height);
      this.pivot.rotation.x = move.spin ? -Math.PI * 2 * s : 0;
    } else {
      this.pivot.rotation.x = 0;
    }
    this.target.run = move.kind === "run" ? 1 : move.kind === "walk" ? 0.55 : move.kind === "bump" ? 0.8 : 0;
    this.target.air = move.kind === "leap" || move.kind === "hop" ? 1 : 0;
    this.target.spread = move.glide ? 1 : 0;
    if (s >= 1) {
      this.moves.shift();
      this.nibRoot.position.y = 0;
      this.pivot.rotation.x = 0;
      if (move.kind === "bump") {
        this.squashPulse = 1;
        this.wobble = 1;
      }
      if (move.kind === "leap" || move.kind === "hop") this.squashPulse = 0.7;
      move.onDone?.();
    }
  }

  private placeCamera(delta: number): void {
    const p = this.nibRoot.position;
    const choice = this.context.mode === "choice";
    const desired = new THREE.Vector3(p.x * 0.35, choice ? 5.8 : 5.4, p.z + (choice ? 10.5 : 9.5));
    const look = new THREE.Vector3(p.x * 0.2, 0.9, p.z - 9);
    const k = 1 - Math.exp(-delta * 5);
    this.camera.position.lerp(desired, k);
    this.camera.lookAt(look);
  }

  // ---------- effects ----------

  private burst(origin: THREE.Vector3, count: number): void {
    if (this.context.reducedMotion) return;
    for (let i = 0; i < count && this.particles.length < CONFETTI_MAX; i++) {
      this.particles.push({
        position: origin.clone(),
        velocity: new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 5, (Math.random() - 0.5) * 5),
        spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
        rotation: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        life: 1.3 + Math.random() * 0.5,
        color: confettiColors[i % confettiColors.length],
      });
    }
  }

  private splash(at: THREE.Vector3): void {
    if (this.context.reducedMotion) return;
    const kit = this.kit;
    const shape = new THREE.Shape();
    const points = 14;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const radius = 0.8 + (i % 2 === 0 ? 0.35 : 0) * Math.random() + 0.1 * Math.random();
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const geometry = kit.own(new THREE.ShapeGeometry(shape));
    geometry.rotateX(-Math.PI / 2);
    const material = kit.own(new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.85, depthWrite: false }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(at);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.splashes.push({ mesh, age: 0 });
  }

  private scribble(obstacle: Obstacle): void {
    if (obstacle.scribble) return;
    const kit = this.kit;
    const group = new THREE.Group();
    const stroke = kit.own(new THREE.BoxGeometry(2.8, 0.09, 0.09));
    const material = kit.hatch(PALETTE.ink, 1);
    for (const angle of [0.5, -0.5]) {
      const line = new THREE.Mesh(stroke, material);
      line.rotation.z = angle;
      line.position.set(0, 0.8, 0.75);
      group.add(line);
    }
    obstacle.group.add(group);
    obstacle.scribble = group;
    obstacle.sinking = 0;
  }

  private scribbleSign(obstacle: Obstacle, side: Side): void {
    const sign = obstacle.choiceSigns[side];
    if (!sign) return;
    const kit = this.kit;
    const stroke = kit.own(new THREE.BoxGeometry(1.6, 0.08, 0.05));
    const material = kit.hatch(PALETTE.ink, 1);
    for (const angle of [0.7, -0.7]) {
      const line = new THREE.Mesh(stroke, material);
      line.rotation.z = angle;
      line.position.set(0, 2.15, 0.05);
      sign.add(line);
    }
  }

  // ---------- frame ----------

  private readonly loop = (now: number) => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    const raw = (now - this.last) / 1000;
    this.last = now;
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
    this.kit.tick(delta, reduced);
    this.stepMoves(delta);

    const blend = 1 - Math.exp(-delta * 10);
    this.wobble = Math.max(0, this.wobble - delta * 1.2);
    this.squashPulse = Math.max(0, this.squashPulse - delta * 3.5);
    this.target.wobble = this.wobble;
    this.target.squash = this.squashPulse > 0 ? Math.sin(this.squashPulse * Math.PI) : 0;
    this.pose = {
      run: THREE.MathUtils.lerp(this.pose.run, this.target.run, blend),
      air: THREE.MathUtils.lerp(this.pose.air, this.target.air, blend),
      spread: THREE.MathUtils.lerp(this.pose.spread, this.target.spread, blend),
      squash: this.target.squash,
      lookBack: THREE.MathUtils.lerp(this.pose.lookBack, this.target.lookBack, 1 - Math.exp(-delta * 4)),
      wobble: this.target.wobble,
    };
    this.nib.update(this.time, this.pose, delta);
    this.placeCamera(delta);

    const nibZ = this.nibRoot.position.z;
    this.ground.position.z = nibZ - 70;

    // Doodles rise from the page as Nib approaches, and recycle behind.
    for (const piece of this.scenery) {
      if (piece.group.position.z > nibZ + 14) {
        piece.group.position.z -= 34 * 6.5;
        piece.risen = 0;
        piece.group.scale.y = 0.01;
      }
      if (piece.group.position.z > nibZ - 60 && piece.risen < 1) {
        piece.risen = reduced ? 1 : Math.min(1, piece.risen + delta * 2.2);
        const s = piece.risen;
        piece.group.scale.y = Math.max(0.01, s < 1 ? 1.15 * Math.sin(s * Math.PI * 0.62) / Math.sin(Math.PI * 0.62) : 1);
      }
    }

    for (const obstacle of this.obstacles.values()) {
      if (obstacle.z > nibZ + 12) {
        this.removeObstacle(obstacle);
        continue;
      }
      if (obstacle.sinking !== null) {
        obstacle.sinking = Math.min(1, obstacle.sinking + delta * 1.6);
        obstacle.group.scale.y = Math.max(0.01, 1 - obstacle.sinking);
      } else if (obstacle.group.scale.y < 1) {
        obstacle.group.scale.y = reduced ? 1 : Math.min(1, obstacle.group.scale.y + delta * 2.5);
      }
      if (obstacle.signs) {
        for (const sign of obstacle.signs.children) {
          const note = sign.getObjectByName("note");
          if (note) note.lookAt(this.camera.position.x, note.getWorldPosition(new THREE.Vector3()).y, this.camera.position.z);
        }
      }
    }

    // Speed lines on a streak of 3, stronger at 5 and 10.
    const material = (this.speedLines.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined;
    const level = reduced ? 0 : this.streak >= 10 ? 0.75 : this.streak >= 5 ? 0.5 : this.streak >= 3 ? 0.3 : 0;
    const moving = this.pose.run > 0.3 || this.pose.air > 0.3;
    if (material) material.opacity = THREE.MathUtils.lerp(material.opacity, moving ? level : 0, 1 - Math.exp(-delta * 6));
    this.speedLines.position.set(this.nibRoot.position.x, 0, nibZ);
    for (const line of this.speedLines.children) {
      line.position.z += delta * 38;
      if (line.position.z > 6) line.position.z -= 26;
    }

    this.stepParticles(delta);
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const splash = this.splashes[i];
      splash.age += delta;
      splash.mesh.scale.setScalar(Math.min(1, splash.age * 7));
      const material = splash.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.85 - Math.max(0, splash.age - 0.5) * 0.7);
      if (splash.age > 1.8) {
        this.scene.remove(splash.mesh);
        splash.mesh.geometry.dispose();
        material.dispose();
        this.splashes.splice(i, 1);
      }
    }
  }

  private stepParticles(delta: number): void {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= delta;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= 9 * delta;
      particle.velocity.multiplyScalar(1 - delta * 0.6);
      particle.position.addScaledVector(particle.velocity, delta);
      if (particle.position.y < 0.05) {
        particle.position.y = 0.05;
        particle.velocity.set(0, 0, 0);
      }
      particle.rotation.x += particle.spin.x * delta;
      particle.rotation.y += particle.spin.y * delta;
      quaternion.setFromEuler(particle.rotation);
      matrix.compose(particle.position, quaternion, scale);
      this.confetti.setMatrixAt(alive, matrix);
      this.confetti.setColorAt(alive, particle.color);
      alive++;
    }
    this.confetti.count = alive;
    this.confetti.instanceMatrix.needsUpdate = true;
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }

  private removeObstacle(obstacle: Obstacle): void {
    this.scene.remove(obstacle.group);
    if (obstacle.signs) this.scene.remove(obstacle.signs);
    this.obstacles.delete(obstacle.index);
  }

  /** The item the game last showed; for tests. */
  get shownIndex(): number {
    return this.currentIndex;
  }
}
