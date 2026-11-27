// Nib (小墨): a small doodle octopus whose ink draws the notebook world
// (plan §5.6). A stand-in built from simple shapes until the M4 model; warm
// yellow pencil with ink-blue lines, so it never reads as the Octos avatar.

import * as THREE from "three";
import { inkMesh, PALETTE, type NotebookKit } from "./notebook-kit";

export interface NibPose {
  /** Running blend, 0 (still) to 1 (full run). */
  run: number;
  /** In the air: tentacles stream back. */
  air: number;
  /** Tentacles spread wide, for a glide or a cheer. */
  spread: number;
  /** Squash on impact or landing, 0–1. */
  squash: number;
  /** Turned round to look at the player, 0–1. */
  lookBack: number;
  /** A gentle sideways wobble after a stumble, 0–1. */
  wobble: number;
}

export function restPose(): NibPose {
  return { run: 0, air: 0, spread: 0, squash: 0, lookBack: 0, wobble: 0 };
}

const TENTACLES = 6;
const SEGMENTS = [0.19, 0.155, 0.125, 0.095];

export class Nib {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly tentacles: THREE.Group[][] = [];
  private readonly blink: THREE.Group[] = [];
  private nextBlink = 2;

  constructor(kit: NotebookKit) {
    const sphere = kit.own(new THREE.SphereGeometry(1, 18, 12));
    const yellow = PALETTE.yellow;

    const head = inkMesh(kit, sphere, yellow, 0.05);
    head.scale.set(0.64, 0.6, 0.62);
    head.position.y = 1.08;
    this.body.add(head);

    // An ink curl on top: the pen tip Nib is named after.
    const curl = new THREE.Mesh(kit.own(new THREE.TorusGeometry(0.15, 0.045, 8, 20, Math.PI * 1.55)), kit.hatch(PALETTE.ink, 1));
    curl.position.set(0.02, 1.72, 0);
    curl.rotation.set(0, Math.PI / 2, 0.4);
    this.body.add(curl);

    for (const side of [-1, 1]) {
      const eye = inkMesh(kit, sphere, PALETTE.white, 0.18);
      eye.scale.setScalar(0.17);
      eye.position.set(side * 0.22, 1.16, -0.5);
      const pupil = new THREE.Mesh(sphere, kit.hatch(PALETTE.ink, 1));
      pupil.scale.setScalar(0.5);
      pupil.position.set(0, 0.05, -0.62);
      eye.add(pupil);
      this.blink.push(eye);
      this.body.add(eye);

      const cheek = new THREE.Mesh(sphere, kit.hatch(PALETTE.coral, 0.9));
      cheek.scale.set(0.1, 0.06, 0.04);
      cheek.position.set(side * 0.4, 0.96, -0.47);
      this.body.add(cheek);
    }

    for (let i = 0; i < TENTACLES; i++) {
      const chain: THREE.Group[] = [];
      for (const radius of SEGMENTS) {
        const segment = inkMesh(kit, sphere, yellow, Math.round((0.03 / radius) * 1000) / 1000);
        segment.scale.setScalar(radius);
        this.body.add(segment);
        chain.push(segment);
      }
      this.tentacles.push(chain);
    }
    this.root.add(this.body);
  }

  /** Poses Nib for time `t` (seconds). */
  update(t: number, pose: NibPose, delta: number): void {
    const runBob = Math.abs(Math.sin(t * 11)) * 0.22 * pose.run;
    const idleBob = Math.sin(t * 2.4) * 0.05 * (1 - pose.run);
    const squash = pose.squash * 0.28;
    this.body.position.y = runBob + idleBob - squash * 0.4;
    this.body.scale.set(1 + squash, 1 - squash, 1 + squash);
    this.body.rotation.y = Math.PI * pose.lookBack;
    this.body.rotation.z = Math.sin(t * 9) * 0.22 * pose.wobble;
    this.body.rotation.x = -0.18 * pose.run * (1 - pose.air) + 0.25 * pose.air;

    for (let i = 0; i < TENTACLES; i++) {
      const angle = (i / TENTACLES) * Math.PI * 2 + Math.PI / TENTACLES;
      const phase = (i % 2 === 0 ? 0 : Math.PI) + i * 0.4;
      const swing = Math.sin(t * 11 + phase) * pose.run;
      const sway = Math.sin(t * 2 + i) * (1 - pose.run);
      const reach = 0.42 + pose.spread * 0.25;
      const chain = this.tentacles[i];
      for (let j = 0; j < chain.length; j++) {
        const along = reach + j * (0.2 + pose.spread * 0.12);
        const drop = 0.62 - j * (0.15 - pose.air * 0.1 - pose.spread * 0.12);
        const curl = Math.sin(t * 3 + i + j * 0.9) * 0.05 * j;
        const kick = swing * 0.12 * j;
        chain[j].position.set(Math.cos(angle) * along + sway * 0.02 * j, Math.max(0.08, drop + curl + kick * 0.5), Math.sin(angle) * along + kick + pose.air * 0.12 * j);
      }
    }

    this.nextBlink -= delta;
    const closing = this.nextBlink < 0.12;
    for (const eye of this.blink) eye.scale.y = closing ? 0.03 : 0.17;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3;
  }
}
