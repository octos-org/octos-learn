// Shared 2D stroke geometry for the hand-drawn media (chalk, crayon): ribbons
// along a polyline, smooth curves through points, and small canvas textures.

import * as THREE from "three";
import type { StyleKit } from "./notebook-kit";

/** A flat ribbon along a polyline, with its distance along the line (aU) and across it (aV, −1 to 1). */
export function strokeGeometry(points: THREE.Vector2[], width: number): THREE.BufferGeometry {
  const count = points.length;
  const positions = new Float32Array(count * 2 * 3);
  const along = new Float32Array(count * 2);
  const across = new Float32Array(count * 2);
  let length = 0;
  const normal = new THREE.Vector2();
  const before = new THREE.Vector2();
  const after = new THREE.Vector2();
  for (let i = 0; i < count; i++) {
    if (i > 0) length += points[i].distanceTo(points[i - 1]);
    before.copy(points[i]).sub(points[Math.max(0, i - 1)]);
    after.copy(points[Math.min(count - 1, i + 1)]).sub(points[i]);
    if (before.lengthSq() < 1e-10) before.copy(after);
    if (after.lengthSq() < 1e-10) after.copy(before);
    before.normalize();
    after.normalize();
    const tangent = before.clone().add(after);
    if (tangent.lengthSq() < 1e-8) tangent.copy(after);
    tangent.normalize();
    normal.set(-tangent.y, tangent.x);
    // Mitre, capped so sharp corners never spike.
    const mitre = Math.min(2, 1 / Math.max(0.35, normal.dot(new THREE.Vector2(-after.y, after.x))));
    const half = (width / 2) * mitre;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const k = i * 2 + side;
      positions[k * 3] = points[i].x + normal.x * half * sign;
      positions[k * 3 + 1] = points[i].y + normal.y * half * sign;
      positions[k * 3 + 2] = 0;
      along[k] = length;
      across[k] = sign;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < count - 1; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aU", new THREE.BufferAttribute(along, 1));
  geometry.setAttribute("aV", new THREE.BufferAttribute(across, 1));
  geometry.setIndex(indices);
  geometry.userData.length = length;
  return geometry;
}

/** Points along a smooth curve through `points` (uniform Catmull-Rom). */
export function smoothCurve(points: readonly (readonly [number, number])[], closed = false, steps = 8): THREE.Vector2[] {
  const p = points.map(([x, y]) => new THREE.Vector2(x, y));
  if (p.length < 3) return p;
  const n = p.length;
  const at = (i: number) => (closed ? p[((i % n) + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  const out: THREE.Vector2[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(new THREE.Vector2(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      ));
    }
  }
  out.push(closed ? p[0].clone() : p[n - 1].clone());
  return out;
}

/** Points round a small circle (an eye, a bubble). */
export function circlePoints(x: number, y: number, radius: number, steps = 18): THREE.Vector2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    return new THREE.Vector2(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  });
}

/** A texture drawn on a 2D canvas (`size` wide, `height` tall, square by default). */
export function canvasTexture(kit: Pick<StyleKit, "own">, size: number, draw: (context: CanvasRenderingContext2D) => void, height = size): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  draw(context);
  const texture = kit.own(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
