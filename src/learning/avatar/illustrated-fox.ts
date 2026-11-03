import { bounded, faceChannel, type FaceFrame } from "./face-frame";

export const ILLUSTRATED_FOX_ASSET = "teach-avatars/star-fox/illustrated-v0.1/base.png";
// Coordinates are authored against the supplied 1199×1312 drawing. The base
// deliberately contains no eyes/brows/mouth; animated ink never covers old ink.
const W = 1199, H = 1312, NECK = 796;
export interface IllustratedFoxOptions { timeMs?: number; idleMotion?: boolean; backdrop?: boolean }
const ink = "#65402e", cream = "#fff0d5";

/** Shared by the live canvas and offline animation export. No DOM or services. */
export function drawIllustratedFox(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, frame: FaceFrame,
  { timeMs = 0, idleMotion = false, backdrop = false }: IllustratedFoxOptions = {}): void {
  ctx.clearRect(0, 0, width, height);
  if (backdrop) { ctx.fillStyle = "#f6f0e4"; ctx.fillRect(0, 0, width, height); }
  const scale = Math.min(width / (W + 130), height / (H + 70));
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -H / 2);
  const c = (key: Parameters<typeof faceChannel>[1]) => bounded(faceChannel(frame, key));
  const time = timeMs / 1000, breath = idleMotion ? Math.sin(time * 1.8) * 2.5 : 0;
  ctx.translate(0, breath);
  // Body is steady; a narrow neck overlap conceals small cutout head tilts.
  ctx.save(); ctx.beginPath(); ctx.rect(0, NECK - 6, W, H - NECK + 6); ctx.clip(); ctx.drawImage(image, 0, 0, W, H); ctx.restore();
  const tilt = bounded(-frame.rotation[2], -.1, .1) + (idleMotion ? Math.sin(time * .72) * .022 : 0);
  const nod = bounded(frame.rotation[0], -.35, .35) * 12 + (idleMotion ? Math.sin(time * 1.35) * 2 : 0);
  ctx.save(); ctx.translate(W / 2, NECK); ctx.rotate(tilt); ctx.translate(-W / 2, -NECK + nod);
  ctx.translate(bounded(-frame.rotation[1], -.6, .6) * 12, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, NECK + 4); ctx.clip(); ctx.drawImage(image, 0, 0, W, H); ctx.restore();

  // Natural blinks are an explicit idle animation, never labelled as capture.
  const phase = ((time + .8) % 4.7), autoBlink = idleMotion && phase > 3.9 && phase < 4.17 ? Math.sin((phase - 3.9) / .27 * Math.PI) ** 2 : 0;
  const smile = (c("mouthSmileLeft") + c("mouthSmileRight")) / 2;
  for (const sign of [-1, 1]) {
    const left = sign < 0, x = W / 2 + sign * 142, y = 539;
    const blink = Math.max(c(left ? "eyeBlinkLeft" : "eyeBlinkRight"), autoBlink);
    const lookX = (c(left ? "eyeLookOutLeft" : "eyeLookOutRight") - c(left ? "eyeLookInLeft" : "eyeLookInRight")) * sign * 16;
    const lookY = (c(left ? "eyeLookDownLeft" : "eyeLookDownRight") - c(left ? "eyeLookUpLeft" : "eyeLookUpRight")) * 12;
    const gaze = idleMotion ? Math.sin(time * .6) * 3 : 0;
    const open = Math.max(.012, 1 - blink), rx = 66, ry = 61 * open;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sign * .035);
    ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.bezierCurveTo(-rx * .6, -ry * 1.05, rx * .55, -ry * 1.1, rx, -5 * open);
    ctx.bezierCurveTo(rx * .78, ry * .92, -rx * .75, ry * 1.02, -rx, 0); ctx.closePath();
    if (blink < .96) {
      ctx.fillStyle = "#fffdf2"; ctx.fill(); ctx.save(); ctx.clip();
      ctx.translate(lookX + gaze, lookY);
      const iris = ctx.createLinearGradient(0, -54, 0, 55); iris.addColorStop(0, "#643827"); iris.addColorStop(.48, "#b76326"); iris.addColorStop(1, "#f6ba55");
      ctx.fillStyle = iris; ctx.beginPath(); ctx.ellipse(1, 1, 39, 55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#92532c"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#422d27"; ctx.beginPath(); ctx.ellipse(1, -4, 19, 37, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff9e7"; ctx.beginPath(); ctx.ellipse(-12, -27, 12, 15, .3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .8; ctx.beginPath(); ctx.ellipse(15, 23, 5, 7, .2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = ink; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-rx, 0);
    if (blink > .96) ctx.quadraticCurveTo(0, 20 + smile * 8, rx, 0);
    else ctx.bezierCurveTo(-rx * .6, -ry * 1.05, rx * .55, -ry * 1.1, rx, -5 * open);
    ctx.stroke();
    if (blink < .85) {
      ctx.lineWidth = 2.3; ctx.strokeStyle = "#a97750"; ctx.beginPath(); ctx.moveTo(-rx + 7, 13 * open); ctx.quadraticCurveTo(0, ry * 1.32, rx - 6, 9 * open); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = 5.5; ctx.beginPath();
      const outer = sign * rx; ctx.moveTo(outer - sign * 12, -10 * open); ctx.quadraticCurveTo(outer + sign * 3, -9 * open, outer + sign * 10, -22 * open); ctx.stroke();
    }
    const innerUp = c("browInnerUp") * 14, outerUp = c(left ? "browOuterUpLeft" : "browOuterUpRight") * 13, down = c(left ? "browDownLeft" : "browDownRight") * 12;
    ctx.strokeStyle = "#7b472d"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-50, -86 + down - (left ? outerUp : innerUp));
    ctx.quadraticCurveTo(0, -104 - innerUp * .4 + down, 48, -87 + down - (left ? innerUp : outerUp)); ctx.stroke();
    ctx.restore();
  }
  // A stable mouth anchor with continuously interpolated opening and rounding.
  const jaw = c("jawOpen") * (1 - c("mouthClose")), round = Math.max(c("mouthPucker"), c("mouthFunnel"));
  const mw = 46 + smile * 20 - round * 22, mh = 2 + jaw * 43 + round * 15, my = 690;
  ctx.save(); ctx.translate(W / 2, my); ctx.lineWidth = 4; ctx.strokeStyle = ink; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  if (jaw < .045 && round < .1) {
    ctx.moveTo(-43 - smile * 12, -2); ctx.quadraticCurveTo(-25, 13 + smile * 5, 0, 5); ctx.quadraticCurveTo(25, 13 + smile * 5, 43 + smile * 12, -2); ctx.stroke();
  } else {
    ctx.moveTo(-mw, -mh * .25 - smile * 5); ctx.bezierCurveTo(-mw * .35, -mh * .62, mw * .4, -mh * .62, mw, -mh * .25 - smile * 5);
    ctx.bezierCurveTo(mw * .8, mh * 1.32, -mw * .8, mh * 1.32, -mw, -mh * .25 - smile * 5); ctx.closePath();
    ctx.fillStyle = "#613a32"; ctx.fill(); ctx.save(); ctx.clip();
    ctx.fillStyle = "#cf7c64"; ctx.beginPath(); ctx.ellipse(0, mh * .88, mw * .68, mh * .4, 0, 0, Math.PI * 2); ctx.fill();
    if (jaw > .35 && round < .4) { ctx.fillStyle = cream; ctx.beginPath(); ctx.ellipse(0, -mh * .47, mw * .65, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore(); ctx.stroke();
  }
  ctx.restore(); ctx.restore(); ctx.restore();
}

/** Explicit synthetic preview motion, used only when the user plays the demo. */
export function illustratedDemoFrame(timeMs: number): FaceFrame {
  const t = timeMs / 1000, phase = t % 7;
  const speaking = phase < 4.7, gate = speaking ? Math.max(0, Math.sin(t * 7.8)) : 0;
  return { timeMs, source: "demo", tracked: true, rotation: [Math.sin(t * 1.2) * .12, Math.sin(t * .55) * .16, Math.sin(t * .7) * .035],
    channels: { jawOpen: gate * .7, mouthSmileLeft: .28, mouthSmileRight: .28,
      browInnerUp: phase > 4.7 ? .4 : .08, mouthPucker: phase > 2.9 && phase < 3.6 ? .5 : 0 } };
}
