import { tr } from "@/i18n";
import { FaceSmoother, normalizeFaceFrame, type FaceFrame } from "./face-frame";
import { AVATAR_TRACK_SCHEMA, type AvatarTrack } from "./performance-track";

export const EXPRESSION_SAMPLES = [
  { id: "mouth", name: () => tr("张嘴与闭嘴") },
  { id: "blink", name: () => tr("左右眨眼") },
  { id: "smile", name: () => tr("微笑着讲述") },
  { id: "pucker", name: () => tr("圆唇与放松") },
  { id: "head", name: () => tr("转头与点头") },
  { id: "loss", name: () => tr("遮挡与恢复") },
] as const;
export type ExpressionSampleId = typeof EXPRESSION_SAMPLES[number]["id"];

/** Synthetic, repeatable rig exercises. These never represent a captured person. */
export function expressionSample(id: ExpressionSampleId): AvatarTrack {
  const smoother = new FaceSmoother();
  const frames: FaceFrame[] = [];
  for (let step = 0; step <= 120; step++) {
    const timeMs = step * 1000 / 30;
    const t = step / 30;
    const pulse = (start: number, end: number) => t <= start || t >= end ? 0 : Math.sin(Math.PI * (t - start) / (end - start)) ** 2;
    const channels: FaceFrame["channels"] = {};
    const rotation: FaceFrame["rotation"] = [0, 0, 0];
    if (id === "mouth") channels.jawOpen = .85 * (pulse(.2, 1.8) + pulse(2.2, 3.8));
    if (id === "blink") { channels.eyeBlinkLeft = pulse(.4, 1.2) + pulse(2.4, 3.2); channels.eyeBlinkRight = pulse(1.4, 2.2) + pulse(2.4, 3.2); }
    if (id === "smile") {
      channels.mouthSmileLeft = channels.mouthSmileRight = .8 * pulse(.2, 3.8);
      channels.jawOpen = .6 * pulse(.2, 3.8) * Math.sin(t * 10) ** 2;
      channels.browInnerUp = .3 * pulse(.2, 3.8);
    }
    if (id === "pucker") { channels.mouthPucker = .9 * pulse(.3, 1.8); channels.mouthFunnel = .8 * pulse(2.2, 3.7); channels.jawOpen = .2 * pulse(2.2, 3.7); }
    if (id === "head") { rotation[1] = .55 * (pulse(.2, 1.2) - pulse(1.3, 2.3)); rotation[0] = .3 * pulse(2.5, 3.8); }
    if (id === "loss") { channels.jawOpen = .7; channels.browInnerUp = .5; rotation[1] = .3; }
    const tracked = id !== "loss" || t < 1.2 || t >= 2.6;
    const frame = normalizeFaceFrame({ timeMs, source: "demo", tracked, channels, rotation });
    // Store displayed decay, just as a real recording does on tracking loss.
    frames.push(id === "loss" ? smoother.update(frame, timeMs) : frame);
  }
  return { schema: AVATAR_TRACK_SCHEMA, durationMs: 4000, frames };
}
