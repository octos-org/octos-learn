import { bounded, faceChannel, type FaceFrame } from "./face-frame";

export const ORIGINAL_FOX_ASSETS = {
  base: "teach-avatars/star-fox/concept-thinking.png",
  clean: "teach-avatars/star-fox/original-v0.1/clean.png",
  expressions: "teach-avatars/star-fox/original-v0.1/expressions.png",
} as const;
export const ORIGINAL_FOX_SIZE = 1254;
type Surface = { canvas: CanvasImageSource; context: CanvasRenderingContext2D };
export type FoxSurfaceFactory = (width: number, height: number) => Surface;
type Region = { x: number; y: number; rx: number; ry: number; angle: number };
const eyes: Region[] = [
  { x: 577, y: 447, rx: 69, ry: 53, angle: .38 },
  { x: 751, y: 516, rx: 70, ry: 53, angle: .38 },
];
const mouth: Region = { x: 638, y: 573, rx: 61, ry: 40, angle: .38 };
const brows: Region[] = [
  { x: 587, y: 386, rx: 56, ry: 22, angle: .38 },
  { x: 779, y: 456, rx: 58, ry: 22, angle: .38 },
];
const S = ORIGINAL_FOX_SIZE;

/** Source-art cutouts. No vector eyes, replacement palette or simplified body. */
export function createOriginalFoxPainter(base: CanvasImageSource, clean: CanvasImageSource, expression: CanvasImageSource, surface: FoxSurfaceFactory) {
  const texture = surface(S, S);
  const patch = (image: CanvasImageSource, region: Region) => {
    const r = Math.ceil(Math.max(region.rx, region.ry) * 1.28), w = r * 2;
    const { canvas, context: ctx } = surface(w, w);
    ctx.drawImage(image, region.x - r, region.y - r, w, w, 0, 0, w, w);
    ctx.save(); ctx.globalCompositeOperation = "destination-in";
    ctx.translate(r, r); ctx.rotate(region.angle); ctx.scale(region.rx, region.ry);
    const feather = ctx.createRadialGradient(0, 0, .76, 0, 0, 1);
    feather.addColorStop(0, "rgba(0,0,0,1)"); feather.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = feather; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    return { canvas, x: region.x - r, y: region.y - r };
  };
  const eyeParts = eyes.map((r) => ({ r, original: patch(base, r), clean: patch(clean, r), closed: patch(expression, r) }));
  const mouthParts = { original: patch(base, mouth), clean: patch(clean, mouth), open: patch(expression, mouth) };
  const browParts = brows.map((r) => ({ r, original: patch(base, r), clean: patch(clean, r) }));
  const put = (part: ReturnType<typeof patch>) => texture.context.drawImage(part.canvas, part.x, part.y);
  const vertices: Array<[number, number]> = [];
  const columns = 14, rows = 14;
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) vertices.push([x * S / columns, y * S / rows]);
  const triangles: Array<[number, number, number]> = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
    triangles.push([a, b, c], [b, d, c]);
  }
  return {
    draw(ctx: CanvasRenderingContext2D, width: number, height: number, frame: FaceFrame, options: { timeMs?: number; idleMotion?: boolean; backdrop?: boolean } = {}) {
      const c = (key: Parameters<typeof faceChannel>[1]) => bounded(faceChannel(frame, key));
      const t = (options.timeMs ?? 0) / 1000;
      const phase = (t + .8) % 4.7;
      const autoBlink = options.idleMotion && phase > 3.9 && phase < 4.17 ? Math.sin((phase - 3.9) / .27 * Math.PI) ** 2 : 0;
      const leftBlink = Math.max(c("eyeBlinkLeft"), autoBlink), rightBlink = Math.max(c("eyeBlinkRight"), autoBlink);
      const jaw = c("jawOpen") * (1 - c("mouthClose"));
      const round = Math.max(c("mouthPucker"), c("mouthFunnel"));
      const brow = [c("browInnerUp") + c("browOuterUpLeft") - c("browDownLeft"), c("browInnerUp") + c("browOuterUpRight") - c("browDownRight")];
      const gaze = [
        [c("eyeLookInLeft") - c("eyeLookOutLeft"), c("eyeLookDownLeft") - c("eyeLookUpLeft")],
        [c("eyeLookOutRight") - c("eyeLookInRight"), c("eyeLookDownRight") - c("eyeLookUpRight")],
      ];
      const facial = leftBlink > .002 || rightBlink > .002 || jaw > .002 || round > .002 || brow.some((v) => Math.abs(v) > .002) || gaze.some((v) => v.some((n) => Math.abs(n) > .002));
      let image = base;
      if (facial) {
        const tx = texture.context; tx.clearRect(0, 0, S, S); tx.drawImage(base, 0, 0, S, S);
        eyeParts.forEach((part, index) => {
          const blink = index === 0 ? leftBlink : rightBlink, look = gaze[index]!;
          if (blink <= .002 && Math.abs(look[0]!) + Math.abs(look[1]!) <= .002) return;
          put(part.clean);
          if (blink > .02) { tx.save(); tx.globalAlpha = Math.min(1, blink * 2); put(part.closed); tx.restore(); }
          if (blink < .98) {
            tx.save(); tx.translate(part.r.x + look[0]! * 4, part.r.y + look[1]! * 3 + blink * 14);
            tx.rotate(part.r.angle); tx.scale(1, Math.max(.02, 1 - blink)); tx.rotate(-part.r.angle); tx.translate(-part.r.x, -part.r.y); put(part.original); tx.restore();
          }
        });
        browParts.forEach((part, index) => {
          const lift = bounded(brow[index]!, -1, 1) * 8;
          if (Math.abs(lift) <= .02) return;
          put(part.clean); tx.save(); tx.translate(0, -lift); put(part.original); tx.restore();
        });
        if (jaw > .002 || round > .002) {
          put(mouthParts.clean);
          const openness = Math.max(jaw, round * .45);
          tx.save(); tx.translate(mouth.x, mouth.y - 9); tx.rotate(mouth.angle);
          tx.scale(1 - round * .28, .14 + openness * .86); tx.rotate(-mouth.angle); tx.translate(-mouth.x, -mouth.y + 9);
          tx.globalAlpha = Math.min(1, openness * 8); put(mouthParts.open); tx.restore();
          if (openness < .12) { tx.save(); tx.globalAlpha = 1 - openness / .12; put(mouthParts.original); tx.restore(); }
        }
        image = texture.canvas;
      }
      ctx.clearRect(0, 0, width, height);
      if (options.backdrop) { ctx.fillStyle = "#f3eee4"; ctx.fillRect(0, 0, width, height); }
      const scale = Math.min(width / (S + 50), height / (S + 36));
      ctx.save(); ctx.translate((width - S * scale) / 2, (height - S * scale) / 2); ctx.scale(scale, scale);
      const pitch = bounded(frame.rotation[0], -.35, .35), yaw = bounded(frame.rotation[1], -.45, .45);
      const roll = bounded(-frame.rotation[2], -.085, .085) + (options.idleMotion ? Math.sin(t * .7) * .008 : 0);
      const smile = (c("mouthSmileLeft") + c("mouthSmileRight")) / 2;
      if (Math.abs(pitch) + Math.abs(yaw) + Math.abs(roll) + smile < .0001) ctx.drawImage(image, 0, 0, S, S);
      else {
        const points = vertices.map(([x, y]): [number, number] => {
          const vertical = bounded((800 - y) / 260), horizontal = Math.exp(-(((x - 650) / 550) ** 4));
          const weight = vertical * vertical * (3 - 2 * vertical) * horizontal;
          const dx = x - 630, dy = y - 660;
          let px = x + ((Math.cos(roll) - 1) * dx - Math.sin(roll) * dy + yaw * 22) * weight;
          let py = y + (Math.sin(roll) * dx + (Math.cos(roll) - 1) * dy + pitch * 24) * weight;
          // Keep the painted smile: only a restrained local corner lift.
          const mouthWeight = Math.exp(-(((x - 638) / 95) ** 2 + ((y - 573) / 55) ** 2) * 2);
          px += (x - 638) * smile * .045 * mouthWeight; py -= smile * 5 * mouthWeight;
          return [px, py];
        });
        for (const triangle of triangles) {
          const [a, b, c] = triangle.map((i) => vertices[i]!) as [[number, number], [number, number], [number, number]];
          const [p, q, r] = triangle.map((i) => points[i]!) as [[number, number], [number, number], [number, number]];
          const denominator = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
          const aa = ((q[0] - p[0]) * (c[1] - a[1]) - (r[0] - p[0]) * (b[1] - a[1])) / denominator;
          const bb = ((q[1] - p[1]) * (c[1] - a[1]) - (r[1] - p[1]) * (b[1] - a[1])) / denominator;
          const cc = ((r[0] - p[0]) * (b[0] - a[0]) - (q[0] - p[0]) * (c[0] - a[0])) / denominator;
          const dd = ((r[1] - p[1]) * (b[0] - a[0]) - (q[1] - p[1]) * (c[0] - a[0])) / denominator;
          ctx.save(); ctx.beginPath();
          const center = [(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3];
          const overlap = 1.15 / scale;
          [p, q, r].forEach(([x, y], i) => { const length = Math.hypot(x - center[0]!, y - center[1]!); const xx = x + (x - center[0]!) / length * overlap, yy = y + (y - center[1]!) / length * overlap; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); });
          ctx.closePath(); ctx.clip(); ctx.transform(aa, bb, cc, dd, p[0] - aa * a[0] - cc * a[1], p[1] - bb * a[0] - dd * a[1]);
          ctx.drawImage(image, 0, 0, S, S); ctx.restore();
        }
      }
      ctx.restore();
    },
  };
}
