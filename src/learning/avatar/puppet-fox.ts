import { bounded, faceChannel, type FaceFrame } from "./face-frame";
import { neutralBody, type ArmPose } from "./body-frame";
import type { FoxSurfaceFactory } from "./original-fox";

const root = "teach-avatars/star-fox/puppet-v0.1/";
export const PUPPET_FOX_ASSETS = {
  head: `${root}head.png`, headClean: `${root}head-clean.png`, headExpression: `${root}head-expression.png`,
  torso: `${root}torso.png`, leftArm: `${root}leftArm.png`, rightArm: `${root}rightArm.png`,
  openHand: `${root}hand-open.png`, pointHand: `${root}hand-point.png`, fistHand: `${root}hand-fist.png`,
} as const;
export type PuppetFoxImages = Record<keyof typeof PUPPET_FOX_ASSETS, CanvasImageSource>;
type Point = [number, number];
const W = 1600, H = 1480;

/** Upright authored head, independent torso, shoulder/elbow chains and hands. */
export function createPuppetFoxPainter(images: PuppetFoxImages, surface: FoxSurfaceFactory) {
  const head = surface(500, 475);
  const patch = (image: CanvasImageSource, x: number, y: number, rx: number, ry: number) => {
    const radius = Math.ceil(Math.max(rx, ry) * 1.3), buffer = surface(radius * 2, radius * 2), ctx = buffer.context;
    ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2, 0, 0, radius * 2, radius * 2);
    ctx.save(); ctx.globalCompositeOperation = "destination-in"; ctx.translate(radius, radius); ctx.scale(rx, ry);
    const feather = ctx.createRadialGradient(0, 0, .75, 0, 0, 1); feather.addColorStop(0, "rgba(0,0,0,1)"); feather.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = feather; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); return { canvas: buffer.canvas, x: x - radius, y: y - radius };
  };
  const eyes = [195, 321].map((x) => ({ x, y: 292, base: patch(images.head, x, 292, 51, 34), clean: patch(images.headClean, x, 292, 51, 34), closed: patch(images.headExpression, x, 292, 51, 34) }));
  const mouths = { base: patch(images.head, 260, 359, 45, 27), clean: patch(images.headClean, 260, 359, 45, 27), open: patch(images.headExpression, 260, 359, 45, 27) };
  const eyebrows = [195, 322].map((x) => ({ base: patch(images.head, x, 249, 47, 14), clean: patch(images.headClean, x, 249, 47, 14) }));
  const arms = [images.leftArm, images.rightArm].map((image, index) => ({
    image, shoulder: [index ? 65 : 120, 35] as Point, elbow: [index ? 105 : 80, 245] as Point,
    wrist: [index ? 105 : 80, 460] as Point,
  }));
  const rows = [0, 100, 175, 205, 225, 245, 265, 285, 320, 400, 495];
  const transform = (point: Point, from: Point, to: Point, sourceEnd: Point, rotation: number, length: number): Point => {
    const sourceAngle = Math.atan2(-(sourceEnd[0] - from[0]), sourceEnd[1] - from[1]);
    const theta = rotation - sourceAngle, scale = length / Math.hypot(sourceEnd[0] - from[0], sourceEnd[1] - from[1]);
    const x = point[0] - from[0], y = point[1] - from[1];
    return [to[0] + (x * Math.cos(theta) - y * Math.sin(theta)) * scale, to[1] + (x * Math.sin(theta) + y * Math.cos(theta)) * scale];
  };
  // Continuous two-bone cloth skinning: no hard cut across the elbow.
  const drawSleeve = (ctx: CanvasRenderingContext2D, index: number, pose: ArmPose, shoulder: Point, elbow: Point, front: boolean) => {
    const arm = arms[index]!;
    const deform = (p: Point): Point => {
      let weight = bounded((p[1] - 175) / 140); weight = weight * weight * (3 - 2 * weight);
      const a = transform(p, arm.shoulder, shoulder, arm.elbow, pose.upper, 220);
      const b = transform(p, arm.elbow, elbow, arm.wrist, pose.lower, 230);
      return [a[0] * (1 - weight) + b[0] * weight, a[1] * (1 - weight) + b[1] * weight];
    };
    for (let row = 0; row < rows.length - 1; row++) {
      if ((rows[row]! >= 205) !== front) continue;
      for (let col = 0; col < 2; col++) {
        const a: Point = [col * 95, rows[row]!], b: Point = [(col + 1) * 95, rows[row]!], c: Point = [col * 95, rows[row + 1]!], d: Point = [(col + 1) * 95, rows[row + 1]!];
        for (const [u, v, w] of [[a, b, c], [b, d, c]] as [Point, Point, Point][]) {
          const p = deform(u), q = deform(v), r = deform(w);
          const denominator = (v[0] - u[0]) * (w[1] - u[1]) - (w[0] - u[0]) * (v[1] - u[1]);
          const aa = ((q[0] - p[0]) * (w[1] - u[1]) - (r[0] - p[0]) * (v[1] - u[1])) / denominator;
          const bb = ((q[1] - p[1]) * (w[1] - u[1]) - (r[1] - p[1]) * (v[1] - u[1])) / denominator;
          const cc = ((r[0] - p[0]) * (v[0] - u[0]) - (q[0] - p[0]) * (w[0] - u[0])) / denominator;
          const dd = ((r[1] - p[1]) * (v[0] - u[0]) - (q[1] - p[1]) * (w[0] - u[0])) / denominator;
          ctx.save(); ctx.beginPath();
          const cx = (p[0] + q[0] + r[0]) / 3, cy = (p[1] + q[1] + r[1]) / 3;
          [p, q, r].forEach(([x, y], i) => { const length = Math.hypot(x - cx, y - cy) || 1; const xx = x + (x - cx) / length * .65, yy = y + (y - cy) / length * .65; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); });
          ctx.closePath(); ctx.clip(); ctx.transform(aa, bb, cc, dd, p[0] - aa * u[0] - cc * u[1], p[1] - bb * u[0] - dd * u[1]);
          ctx.drawImage(arm.image, 0, 0, 190, 495); ctx.restore();
        }
      }
    }
  };
  const endpoint = (p: Point, angle: number, length: number): Point => [p[0] - Math.sin(angle) * length, p[1] + Math.cos(angle) * length];
  return {
    draw(ctx: CanvasRenderingContext2D, width: number, height: number, frame: FaceFrame, options: { timeMs?: number; idleMotion?: boolean; backdrop?: boolean } = {}) {
      ctx.clearRect(0, 0, width, height);
      if (options.backdrop) { ctx.fillStyle = "#f4efe6"; ctx.fillRect(0, 0, width, height); }
      const scale = Math.min(width / W, height / H); ctx.save(); ctx.translate((width - W * scale) / 2, (height - H * scale) / 2); ctx.scale(scale, scale);
      const body = frame.body ?? neutralBody();
      ctx.translate(800, 1040); ctx.rotate(bounded(body.lean, -.35, .35)); ctx.translate(-800, -1040);
      const poses = [body.left, body.right], shoulders: Point[] = [[610, 705], [990, 705]];
      const endpoints = poses.map((pose, i) => ({ elbow: endpoint(shoulders[i]!, pose.upper, 220), wrist: endpoint(endpoint(shoulders[i]!, pose.upper, 220), pose.lower, 230) }));
      // Shoulder caps sit behind the vest; forearms and hands can cross its front.
      poses.forEach((pose, i) => drawSleeve(ctx, i, pose, shoulders[i]!, endpoints[i]!.elbow, false));
      ctx.drawImage(images.torso, 552, 626, 496, 760);
      poses.forEach((pose, i) => {
        const p = endpoints[i]!;
        drawSleeve(ctx, i, pose, shoulders[i]!, p.elbow, true);
        const hand = pose.gesture === "point" ? images.pointHand : pose.gesture === "open" ? images.openHand : images.fistHand;
        ctx.save(); ctx.translate(...p.wrist); ctx.rotate(pose.wrist); ctx.scale(i === 1 ? -.18 : .18, .18);
        ctx.drawImage(hand, -362, -675, 724, 724); ctx.restore();
      });
      const c = (key: Parameters<typeof faceChannel>[1]) => bounded(faceChannel(frame, key));
      const tx = head.context; tx.clearRect(0, 0, 500, 475); tx.drawImage(images.head, 0, 0, 500, 475);
      const put = (p: ReturnType<typeof patch>) => tx.drawImage(p.canvas, p.x, p.y);
      const t = (options.timeMs ?? 0) / 1000, blinkPhase = (t + .8) % 4.7;
      const auto = options.idleMotion && blinkPhase > 3.9 && blinkPhase < 4.17 ? Math.sin((blinkPhase - 3.9) / .27 * Math.PI) ** 2 : 0;
      eyes.forEach((eye, i) => {
        const blink = Math.max(c(i ? "eyeBlinkRight" : "eyeBlinkLeft"), auto);
        const dx = (c(i ? "eyeLookOutRight" : "eyeLookInLeft") - c(i ? "eyeLookInRight" : "eyeLookOutLeft")) * 3;
        const dy = (c(i ? "eyeLookDownRight" : "eyeLookDownLeft") - c(i ? "eyeLookUpRight" : "eyeLookUpLeft")) * 2;
        if (blink > .002 || Math.abs(dx) + Math.abs(dy) > .002) {
          put(eye.clean); if (blink > .02) { tx.save(); tx.globalAlpha = Math.min(1, blink * 2); put(eye.closed); tx.restore(); }
          if (blink < .98) { tx.save(); tx.translate(eye.x + dx, eye.y + dy + blink * 6); tx.scale(1, Math.max(.02, 1 - blink)); tx.translate(-eye.x, -eye.y); put(eye.base); tx.restore(); }
        }
        const lift = (c("browInnerUp") + c(i ? "browOuterUpRight" : "browOuterUpLeft") - c(i ? "browDownRight" : "browDownLeft")) * 4;
        if (Math.abs(lift) > .02) { put(eyebrows[i]!.clean); tx.save(); tx.translate(0, -lift); put(eyebrows[i]!.base); tx.restore(); }
      });
      const jaw = c("jawOpen") * (1 - c("mouthClose")), round = Math.max(c("mouthPucker"), c("mouthFunnel")), open = Math.max(jaw, round * .4);
      if (open > .002) {
        put(mouths.clean); tx.save(); tx.translate(260, 354); tx.scale(1 - round * .25, .15 + open * .85); tx.translate(-260, -354); tx.globalAlpha = Math.min(1, open * 8); put(mouths.open); tx.restore();
        if (open < .12) { tx.save(); tx.globalAlpha = 1 - open / .12; put(mouths.base); tx.restore(); }
      }
      const smile = (c("mouthSmileLeft") + c("mouthSmileRight")) / 2;
      if (smile > .01 && open < .1) { tx.save(); tx.translate(260, 359); tx.scale(1 + smile * .08, 1); tx.translate(-260, -359); put(mouths.base); tx.restore(); }
      ctx.save(); ctx.translate(800 + bounded(-frame.rotation[1], -.5, .5) * 12, 650 + bounded(frame.rotation[0], -.35, .35) * 15);
      ctx.rotate(bounded(-frame.rotation[2] - body.lean, -.22, .22)); ctx.scale(1.15, 1.15); ctx.drawImage(head.canvas, -260, -450); ctx.restore();
      ctx.restore();
    },
  };
}

export function bodyPreset(name: "rest" | "left" | "right" | "point" | "both" | "wave", timeMs = 0) {
  const body = neutralBody(); body.tracked = true;
  const raise = (arm: ArmPose, sign: number, point = false) => { arm.tracked = true; arm.upper = sign * .9; arm.lower = sign * 2.55; arm.wrist = sign * -.25; arm.gesture = point ? "point" : "open"; };
  if (["left", "point", "both", "wave"].includes(name)) raise(body.left, 1, name === "point");
  if (["right", "both"].includes(name)) raise(body.right, -1);
  if (name === "wave") { body.left.lower += Math.sin(timeMs / 220) * .35; body.left.wrist += Math.sin(timeMs / 180) * .25; }
  return body;
}
