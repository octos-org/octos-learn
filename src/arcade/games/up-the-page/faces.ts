// The front of each Up the Page block, drawn in crayon on a canvas: its
// decoration (dots, stars, a gift ribbon, windows, bricks…) and, in the
// middle, a white crayon label with the number ("?" until it is answered).

import * as THREE from "three";
import { scribbleEllipse, scribbler, skip } from "../../render/crayon-kit";
import type { StyleKit } from "../../render/notebook-kit";
import { canvasTexture } from "../../render/stroke-geometry";
import type { Deco, Size } from "./tower";

const WIDTH = 512;
const WHITE = "#fbf6ea";
const DARK = "#2f2219";

type Context = CanvasRenderingContext2D;

interface Face {
  context: Context;
  width: number;
  height: number;
  /** Canvas pixels per world unit. */
  unit: number;
  random: () => number;
  /** The label's middle and half-sizes, in pixels: decorations keep out of it. */
  label: { x: number; y: number; rx: number; ry: number };
}

/** A face `size` big (world units), for a block of colour `body`. */
export function blockFaceTexture(kit: Pick<StyleKit, "own">, deco: Deco | "none", body: THREE.Color, size: Size, text: string | null, ring: THREE.Color | null, seed: number): THREE.CanvasTexture {
  const height = Math.max(64, Math.round((WIDTH * size.height) / size.width));
  return canvasTexture(kit, WIDTH, context => {
    const unit = WIDTH / size.width;
    const random = scribbler(seed);
    const chars = text?.length ?? 1;
    const ry = Math.min(0.42 * unit, height * 0.4);
    const rx = Math.min((0.74 + 0.15 * (chars - 1)) * unit, WIDTH * 0.44);
    const face: Face = { context, width: WIDTH, height, unit, random, label: { x: WIDTH / 2, y: deco === "windows" ? height * 0.64 : height / 2, rx, ry } };
    context.lineCap = "round";
    context.lineJoin = "round";
    DRAW[deco]?.(face, body);
    if (text !== null) drawLabel(face, text, ring);
    skip(context, WIDTH, height, random, Math.round(WIDTH * height * 0.006));
  }, height);
}

function css(color: THREE.Color): string {
  return `#${color.getHexString()}`;
}

function light(body: THREE.Color): boolean {
  return 0.2126 * body.r + 0.7152 * body.g + 0.0722 * body.b > 0.5;
}

/** A crayon that shows up on `body`: white on a dark block, a deeper shade of its own colour on a light one. */
function contrast(body: THREE.Color): string {
  return light(body) ? css(body.clone().multiplyScalar(0.6)) : WHITE;
}

function outsideLabel(face: Face, x: number, y: number, pad: number): boolean {
  const { label } = face;
  const dx = (x - label.x) / (label.rx + pad);
  const dy = (y - label.y) / (label.ry + pad);
  return dx * dx + dy * dy > 1;
}

/** Spots spread over the face, clear of the label and the edges. */
function scatter(face: Face, step: number, pad: number): [number, number][] {
  const points: [number, number][] = [];
  const s = step * face.unit;
  for (let y = s * 0.55; y < face.height - s * 0.3; y += s) {
    for (let x = s * 0.55 + ((Math.round(y / s) % 2) * s) / 2; x < face.width - s * 0.3; x += s) {
      const px = x + (face.random() - 0.5) * s * 0.4;
      const py = y + (face.random() - 0.5) * s * 0.4;
      if (outsideLabel(face, px, py, pad * face.unit)) points.push([px, py]);
    }
  }
  return points;
}

/** A rectangle coloured in with back-and-forth crayon strokes. */
function scribbleRect(context: Context, x: number, y: number, w: number, h: number, color: string, random: () => number): void {
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  context.strokeStyle = color;
  context.lineWidth = 7;
  context.beginPath();
  for (let k = x - h; k < x + w + h; k += 5 + random() * 2) {
    context.moveTo(k + random() * 3, y - 4);
    context.lineTo(k + h * 0.6 + random() * 3, y + h + 4);
  }
  context.stroke();
  context.restore();
}

function starPath(context: Context, x: number, y: number, r: number, turn: number): void {
  context.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + turn;
    const k = i % 2 ? r * 0.45 : r;
    if (i === 0) context.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    else context.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  context.closePath();
}

function heartPath(context: Context, x: number, y: number, r: number): void {
  context.beginPath();
  context.moveTo(x, y + r * 0.9);
  context.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.35);
  context.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  context.closePath();
}

const DRAW: Record<Deco | "none", ((face: Face, body: THREE.Color) => void) | null> = {
  none: null,
  dots(face, body) {
    const { context, unit, random } = face;
    const ink = contrast(body);
    for (const [x, y] of scatter(face, 0.42, 0.1)) {
      context.fillStyle = random() < 0.25 && !light(body) ? "#f8d046" : ink;
      context.beginPath();
      context.arc(x, y, (0.07 + random() * 0.035) * unit, 0, Math.PI * 2);
      context.fill();
    }
  },
  stars(face, body) {
    const { context, unit, random } = face;
    const ink = contrast(body);
    for (const [x, y] of scatter(face, 0.5, 0.12)) {
      context.fillStyle = random() < 0.5 && !light(body) ? "#f8d046" : ink;
      starPath(context, x, y, (0.12 + random() * 0.05) * unit, random());
      context.fill();
    }
  },
  stripes(face, body) {
    const { context, unit, height, width, random } = face;
    const band = 0.16 * unit;
    for (const y of [0.08 * unit, height - 0.08 * unit - band]) scribbleRect(context, 0, y, width, band, contrast(body), random);
  },
  gift(face, body) {
    const { context, unit, height, width, random, label } = face;
    const ribbon = body.r > 0.85 && body.g > 0.7 ? "#e2493f" : "#f8d046";
    scribbleRect(context, label.x - 0.17 * unit, 0, 0.34 * unit, height, ribbon, random);
    scribbleRect(context, 0, label.y - 0.15 * unit, width, 0.3 * unit, ribbon, random);
  },
  windows(face) {
    const { context, unit, random, width } = face;
    const w = 0.5 * unit;
    const h = 0.46 * unit;
    for (const x of [width / 2 - 0.62 * unit - w / 2, width / 2 + 0.62 * unit - w / 2]) {
      const y = 0.14 * unit;
      scribbleRect(context, x, y, w, h, "#8fcdf2", random);
      context.strokeStyle = DARK;
      context.lineWidth = 7;
      context.strokeRect(x, y, w, h);
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(x + w / 2, y);
      context.lineTo(x + w / 2, y + h);
      context.moveTo(x, y + h / 2);
      context.lineTo(x + w, y + h / 2);
      context.stroke();
    }
  },
  bricks(face) {
    const { context, unit, height, width } = face;
    const row = 0.3 * unit;
    const brick = 0.62 * unit;
    context.strokeStyle = "rgba(251,246,234,0.75)";
    context.lineWidth = 6;
    context.beginPath();
    for (let y = row, r = 0; y < height; y += row, r++) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    for (let y = 0, r = 0; y < height; y += row, r++) {
      for (let x = (r % 2) * brick * 0.5 + brick * 0.5; x < width; x += brick) {
        if (!outsideLabel(face, x, y + row / 2, 0.04 * unit)) continue;
        context.moveTo(x, y + 3);
        context.lineTo(x, y + row - 3);
      }
    }
    context.stroke();
  },
  crate(face) {
    const { context, unit, height, width } = face;
    context.strokeStyle = "#7a5232";
    context.lineWidth = 7;
    const inset = 0.08 * unit;
    context.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    context.lineWidth = 5;
    context.beginPath();
    for (let y = 0.4 * unit; y < height - 0.2 * unit; y += 0.4 * unit) {
      context.moveTo(inset, y);
      context.lineTo(width - inset, y);
    }
    context.stroke();
    context.fillStyle = DARK;
    for (const [x, y] of [[inset * 2.2, inset * 2.2], [width - inset * 2.2, inset * 2.2], [inset * 2.2, height - inset * 2.2], [width - inset * 2.2, height - inset * 2.2]]) {
      context.beginPath();
      context.arc(x, y, 0.045 * unit, 0, Math.PI * 2);
      context.fill();
    }
  },
  cheese(face) {
    const { context, unit, random } = face;
    for (const [x, y] of scatter(face, 0.48, 0.12)) {
      if (random() < 0.3) continue;
      const r = (0.07 + random() * 0.09) * unit;
      scribbleEllipse(context, x, y, r, r * 0.85, "#d68a26", random);
    }
  },
  cake(face) {
    const { context, unit, width, random } = face;
    // Icing along the top, dripping down.
    context.fillStyle = WHITE;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(width, 0);
    const base = 0.22 * unit;
    context.lineTo(width, base);
    const drips = 6;
    for (let i = drips; i >= 0; i--) {
      const x = (i / drips) * width;
      const drop = (0.08 + random() * 0.14) * unit;
      context.quadraticCurveTo(x + width / drips / 2, base + drop * 2, x, base);
    }
    context.closePath();
    context.fill();
    // Sprinkles.
    const colors = ["#f8d046", "#3f86d6", "#5db558", "#fbf6ea"];
    context.lineWidth = 6;
    for (const [x, y] of scatter(face, 0.34, 0.08)) {
      if (y < base + 0.25 * unit) continue;
      const a = random() * Math.PI;
      context.strokeStyle = colors[Math.floor(random() * colors.length)];
      context.beginPath();
      context.moveTo(x - Math.cos(a) * 0.06 * unit, y - Math.sin(a) * 0.06 * unit);
      context.lineTo(x + Math.cos(a) * 0.06 * unit, y + Math.sin(a) * 0.06 * unit);
      context.stroke();
    }
  },
  zigzag(face, body) {
    const { context, unit, height, width } = face;
    context.strokeStyle = contrast(body);
    context.lineWidth = 11;
    for (const y of [0.2 * unit, height - 0.2 * unit]) {
      context.beginPath();
      for (let x = 0, k = 0; x <= width + 0.2 * unit; x += 0.22 * unit, k++) {
        const py = y + (k % 2 ? 0.09 : -0.09) * unit;
        if (k === 0) context.moveTo(x, py);
        else context.lineTo(x, py);
      }
      context.stroke();
    }
  },
  hearts(face, body) {
    const { context, unit, random } = face;
    const pale = light(body);
    for (const [x, y] of scatter(face, 0.5, 0.12)) {
      context.fillStyle = pale ? (random() < 0.5 ? "#e2493f" : contrast(body)) : (random() < 0.5 ? WHITE : "#f283ad");
      heartPath(context, x, y, (0.11 + random() * 0.04) * unit);
      context.fill();
    }
  },
};

function drawLabel(face: Face, text: string, ring: THREE.Color | null): void {
  const { context, random, label } = face;
  scribbleEllipse(context, label.x, label.y, label.rx, label.ry, WHITE, random);
  if (ring) {
    context.strokeStyle = css(ring);
    context.lineWidth = Math.max(8, label.ry * 0.17);
    for (const [dx, dy, grow] of [[0, 0, 0], [3, -2, 4]]) {
      context.beginPath();
      context.ellipse(label.x + dx, label.y + dy, label.rx + 2 + grow, label.ry + 2 + grow, -0.04, 0.2, Math.PI * 2 + 0.1);
      context.stroke();
    }
  }
  context.fillStyle = DARK;
  context.font = `900 ${Math.round(label.ry * (text.length > 2 ? 1.45 : 1.75))}px "Hanken Grotesk Variable", "Inter Variable", system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, label.x, label.y + label.ry * 0.1);
}
