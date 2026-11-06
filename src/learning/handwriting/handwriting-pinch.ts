import type { HandLandmark } from "./handwriting-gesture";

type Point = { x: number; y: number; z: number };
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function tipToSegment(tip: Point, start: Point, end: Point): number {
  const x = end.x - start.x, y = end.y - start.y, z = end.z - start.z;
  const squared = x * x + y * y + z * z;
  if (squared < 1e-10) return length(tip, end);
  const ratio = Math.min(1, Math.max(0, ((tip.x - start.x) * x + (tip.y - start.y) * y + (tip.z - start.z) * z) / squared));
  return length(tip, { x: start.x + ratio * x, y: start.y + ratio * y, z: start.z + ratio * z });
}

function contactScore(points: Point[]): number {
  if (points.length !== 21 || points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return Infinity;
  if (length(points[0]!, points[9]!) <= 0.005 || length(points[5]!, points[17]!) <= 0.005) return Infinity;
  const palmLengths = [5, 9, 13, 17].map(joint => length(points[0]!, points[joint]!));
  palmLengths.push(length(points[5]!, points[17]!));
  palmLengths.sort((a, b) => a - b);
  const scale = palmLengths[2]!;
  if (scale <= 0.005) return Infinity;
  // Landmarks describe bone centers. A pad pinch can touch the distal finger
  // segment while the two tip landmarks remain separated.
  const contact = Math.min(tipToSegment(points[4]!, points[7]!, points[8]!),
    tipToSegment(points[8]!, points[3]!, points[4]!));
  return contact / scale;
}

/** Both estimates retain depth, so projected overlap alone cannot close a pinch. */
export function handPinchContactScore(image: HandLandmark[], world: HandLandmark[] | undefined, aspectRatio: number): number {
  const imagePoints = image.map(p => ({ x: p.x * aspectRatio, y: p.y, z: (p.z ?? 0) * aspectRatio }));
  const imageScore = contactScore(imagePoints);
  const worldScore = world ? contactScore(world.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 }))) : Infinity;
  // A noisy depth estimate in one model output must not veto a consistent
  // 3D contact in the other output. Neither path uses screen distance alone.
  return Math.min(imageScore, worldScore);
}
