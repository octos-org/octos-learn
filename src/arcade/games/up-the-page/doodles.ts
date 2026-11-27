// The crayon drawings on the page behind the tower, from the grass up to the
// stars, so climbing the tower feels like climbing the page. Our own simple
// doodles. Plain data: the game colours them in with the crayon kit.

export type Pt = [number, number];
export type DoodleColor = "red" | "orange" | "yellow" | "green" | "darkGreen" | "teal" | "blue" | "sky" | "purple" | "pink" | "brown" | "white" | "outline";

export type DoodleShape =
  | { kind: "line"; points: Pt[]; color: DoodleColor; width: number; smooth?: boolean; closed?: boolean }
  | { kind: "patch"; points: Pt[]; color: DoodleColor; fill?: number };

/** The tower and the hanging blocks need the middle of the page: doodles stay this far out. */
export const CLEAR_X = 5.2;

function circle(x: number, y: number, r: number, steps = 16, squash = 1): Pt[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r * squash] as Pt;
  });
}

function shift(points: Pt[], dx: number, dy: number, scale = 1): Pt[] {
  return points.map(([x, y]) => [dx + x * scale, dy + y * scale] as Pt);
}

function flower(x: number, color: DoodleColor): DoodleShape[] {
  const shapes: DoodleShape[] = [{ kind: "line", points: [[x, 0], [x + 0.1, 0.7], [x - 0.05, 1.3]], color: "darkGreen", width: 0.12, smooth: true }];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    shapes.push({ kind: "patch", points: circle(x - 0.05 + Math.cos(a) * 0.3, 1.45 + Math.sin(a) * 0.3, 0.22, 10), color });
  }
  shapes.push({ kind: "patch", points: circle(x - 0.05, 1.45, 0.17, 10), color: "yellow" });
  return shapes;
}

function house(x: number): DoodleShape[] {
  const wall: Pt[] = [[-1.6, 0], [1.6, 0], [1.6, 2.6], [-1.6, 2.6]];
  const roof: Pt[] = [[-2.0, 2.5], [0, 4.3], [2.0, 2.5]];
  return [
    { kind: "patch", points: shift(wall, x, 0), color: "red", fill: 0.8 },
    { kind: "patch", points: shift(roof, x, 0), color: "brown", fill: 0.85 },
    { kind: "patch", points: shift([[-0.45, 0], [0.45, 0], [0.45, 1.5], [-0.45, 1.5]], x - 0.6, 0), color: "yellow" },
    { kind: "patch", points: shift([[-0.4, -0.35], [0.4, -0.35], [0.4, 0.35], [-0.4, 0.35]], x + 0.85, 1.6), color: "sky" },
    { kind: "line", points: shift([...wall, wall[0]], x, 0), color: "outline", width: 0.13 },
    { kind: "line", points: shift([...roof, roof[0]], x, 0), color: "outline", width: 0.13 },
    { kind: "line", points: shift([[0.85, 1.25], [0.85, 1.95]], x, 0), color: "outline", width: 0.09 },
    { kind: "line", points: shift([[0.45, 1.6], [1.25, 1.6]], x, 0), color: "outline", width: 0.09 },
  ];
}

function tree(x: number, height: number): DoodleShape[] {
  const crown = circle(0, 0, 1.6, 18).map(([cx, cy], i) => [cx * (1 + 0.12 * Math.sin(i * 2.1)), cy * (1 + 0.12 * Math.sin(i * 2.1))] as Pt);
  return [
    { kind: "patch", points: shift([[-0.3, 0], [0.3, 0], [0.22, height], [-0.22, height]], x, 0), color: "brown" },
    { kind: "patch", points: shift(crown, x, height + 1.0), color: "green", fill: 0.88 },
    { kind: "line", points: shift([...crown, crown[0]], x, height + 1.0), color: "darkGreen", width: 0.12, smooth: true, closed: true },
    { kind: "patch", points: circle(x - 0.5, height + 1.4, 0.16, 8), color: "red" },
    { kind: "patch", points: circle(x + 0.6, height + 0.7, 0.16, 8), color: "red" },
  ];
}

function bird(x: number, y: number, s = 1): DoodleShape {
  return { kind: "line", points: shift([[-0.6, 0.15], [-0.3, 0.3], [0, 0], [0.3, 0.3], [0.6, 0.15]], x, y, s), color: "outline", width: 0.1, smooth: true };
}

function cloud(x: number, y: number, s: number): DoodleShape[] {
  const puffs: [number, number, number][] = [[-1.2, 0, 0.8], [-0.3, 0.45, 1.05], [0.8, 0.2, 0.9], [1.6, -0.1, 0.6], [0.2, -0.3, 0.8]];
  return puffs.map(([px, py, r]) => ({ kind: "patch", points: circle(x + px * s, y + py * s, r * s, 14), color: "white", fill: 0.72 }) as DoodleShape);
}

function kite(x: number, y: number): DoodleShape[] {
  const body: Pt[] = [[0, 1.2], [0.8, 0], [0, -1.3], [-0.8, 0]];
  return [
    { kind: "patch", points: shift(body, x, y), color: "yellow" },
    { kind: "patch", points: shift([[0, 1.2], [0.8, 0], [0, 0]], x, y), color: "red" },
    { kind: "patch", points: shift([[0, -1.3], [-0.8, 0], [0, 0]], x, y), color: "red" },
    { kind: "line", points: shift([...body, body[0]], x, y), color: "outline", width: 0.1 },
    { kind: "line", points: shift([[0, -1.3], [0.4, -2.0], [-0.2, -2.7], [0.3, -3.4], [-0.1, -4.2]], x, y), color: "outline", width: 0.07, smooth: true },
    ...[-2.0, -2.7, -3.4].map((dy, i) => ({ kind: "patch", points: shift([[-0.25, 0.15], [0.25, -0.15], [0.25, 0.15], [-0.25, -0.15]], x + (i % 2 ? -0.2 : 0.35), y + dy), color: i % 2 ? "blue" : "green" }) as DoodleShape),
  ];
}

function balloon(x: number, y: number): DoodleShape[] {
  const envelope = circle(0, 0, 1.3, 18, 1.15);
  return [
    { kind: "patch", points: shift(envelope, x, y), color: "orange" },
    { kind: "patch", points: shift([[-0.4, 1.3], [0.4, 1.3], [0.35, -1.3], [-0.35, -1.3]], x, y), color: "yellow" },
    { kind: "line", points: shift([...envelope, envelope[0]], x, y), color: "outline", width: 0.1, smooth: true, closed: true },
    { kind: "line", points: shift([[-0.9, -1.1], [-0.4, -2.2]], x, y), color: "outline", width: 0.06 },
    { kind: "line", points: shift([[0.9, -1.1], [0.4, -2.2]], x, y), color: "outline", width: 0.06 },
    { kind: "patch", points: shift([[-0.45, -2.2], [0.45, -2.2], [0.38, -2.8], [-0.38, -2.8]], x, y), color: "brown" },
  ];
}

function sun(x: number, y: number): DoodleShape[] {
  const shapes: DoodleShape[] = [{ kind: "patch", points: circle(x, y, 1.6, 20), color: "yellow", fill: 0.95 }];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    shapes.push({ kind: "line", points: [[x + Math.cos(a) * 2.0, y + Math.sin(a) * 2.0], [x + Math.cos(a) * 2.8, y + Math.sin(a) * 2.8]], color: "orange", width: 0.16 });
  }
  shapes.push(
    { kind: "patch", points: circle(x - 0.55, y + 0.35, 0.16, 8), color: "outline" },
    { kind: "patch", points: circle(x + 0.55, y + 0.35, 0.16, 8), color: "outline" },
    { kind: "line", points: [[x - 0.7, y - 0.35], [x, y - 0.8], [x + 0.7, y - 0.35]], color: "outline", width: 0.12, smooth: true },
  );
  return shapes;
}

function star(x: number, y: number, r: number, color: DoodleColor = "yellow"): DoodleShape {
  const points: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const k = i % 2 ? r * 0.45 : r;
    return [x + Math.cos(a) * k, y + Math.sin(a) * k];
  });
  return { kind: "patch", points, color, fill: 0.95 };
}

/** Every doodle on the page, from the ground (y = 0) up. */
export function pageDoodles(): DoodleShape[] {
  const shapes: DoodleShape[] = [];
  // The ground: a band of earth and a scribble of grass.
  shapes.push({ kind: "patch", points: [[-140, -40], [140, -40], [140, -0.1], [-140, -0.1]], color: "brown", fill: 0.55 });
  const grass: Pt[] = [];
  for (let i = 0; i <= 620; i++) grass.push([-140 + i * 0.45, i % 2 ? 0.5 + 0.25 * Math.sin(i * 1.4) : 0.05]);
  shapes.push({ kind: "line", points: grass, color: "green", width: 0.22 });
  shapes.push({ kind: "line", points: [[-140, 0], [140, 0]], color: "darkGreen", width: 0.18 });
  shapes.push(...house(-9), ...tree(8.4, 2.4), ...tree(-15, 3.4));
  shapes.push(...flower(-5.6, "pink"), ...flower(5.8, "purple"), ...flower(12.2, "red"), ...flower(-12.4, "blue"));
  shapes.push(bird(-7.5, 9.2), bird(-6.4, 9.9, 0.7), bird(8.2, 11.6), ...kite(9.6, 14.6), bird(-10, 15.2, 0.8));
  shapes.push(...balloon(-8.6, 19.5), ...cloud(9.4, 21, 1.1), ...cloud(-11.2, 25.4, 1.2), bird(7.6, 25.5, 0.9));
  shapes.push(...cloud(8.6, 29.4, 1.3), ...cloud(-7.6, 33.5, 0.9), ...sun(9.6, 37));
  for (const [x, y, r] of [[-8, 39, 0.5], [-11.5, 42, 0.35], [7, 43, 0.4], [11.8, 46, 0.55], [-6.4, 46.5, 0.4], [-12, 50, 0.5], [8.8, 51, 0.35]] as const) shapes.push(star(x, y, r));
  return shapes;
}
