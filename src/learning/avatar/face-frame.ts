import { BodySmoother, type BodyPose } from "./body-frame";
/** Device-independent expression data. No images, identity mesh or microphone data. */
export const FACE_CHANNELS = [
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "cheekPuff", "cheekSquintLeft", "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight",
  "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
  "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
  "jawForward", "jawLeft", "jawOpen", "jawRight", "mouthClose", "mouthDimpleLeft", "mouthDimpleRight",
  "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper",
  "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight",
  "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight", "tongueOut",
] as const;

export type FaceChannel = typeof FACE_CHANNELS[number];
export type FaceSource = "mediapipe" | "arkit" | "demo";
export interface FaceFrame {
  timeMs: number;
  source: FaceSource;
  tracked: boolean;
  /** Missing channels remain missing: sources do not have identical capabilities. */
  channels: Partial<Record<FaceChannel, number>>;
  /** Radians, unmirrored subject coordinates: pitch, yaw, roll. */
  rotation: [number, number, number];
  body?: BodyPose;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const bounded = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export function neutralFrame(timeMs = 0, source: FaceSource = "demo"): FaceFrame {
  return { timeMs, source, tracked: false, channels: {}, rotation: [0, 0, 0] };
}

export function faceChannel(frame: FaceFrame, channel: FaceChannel): number { return frame.channels[channel] ?? 0; }

/** ARKit names and MediaPipe names are mapped by name, never by array position. */
export function normalizeFaceFrame(input: {
  timeMs: number; source: FaceSource; tracked: boolean;
  channels: Record<string, unknown>; rotation?: readonly unknown[];
}): FaceFrame {
  const frame = neutralFrame(finite(input.timeMs) ? Math.max(0, input.timeMs) : 0, input.source);
  if (!input.tracked) return frame;
  frame.tracked = true;
  for (const key of FACE_CHANNELS) {
    const value = input.channels[key];
    if (finite(value)) frame.channels[key] = bounded(value);
  }
  frame.rotation = [0, 1, 2].map((i) => finite(input.rotation?.[i]) ? bounded(input.rotation![i] as number, -1.25, 1.25) : 0) as [number, number, number];
  return frame;
}

export function mediaPipeFrame(timeMs: number, categories: Array<{ categoryName: string; score: number }>, matrix?: number[]): FaceFrame {
  const m = matrix;
  // MediaPipe's face transformation matrix is column-major. Extract YXZ angles.
  const pitch = m?.length === 16 ? Math.asin(bounded(-m[9]!, -1, 1)) : 0;
  const yaw = m?.length === 16 ? Math.atan2(m[8]!, m[10]!) : 0;
  const roll = m?.length === 16 ? Math.atan2(m[1]!, m[5]!) : 0;
  return normalizeFaceFrame({ timeMs, source: "mediapipe", tracked: categories.length > 0,
    channels: Object.fromEntries(categories.map((item) => [item.categoryName, item.score])), rotation: [pitch, yaw, roll] });
}

/** Mouth and closing eyelids react quickly; reopening and head motion settle.
 * Blink closure must survive a single 20 FPS capture sample. No event is invented.
 */
export class FaceSmoother {
  private body = new BodySmoother();
  private frame = neutralFrame();
  private lastTime: number | undefined;
  private neutral: FaceFrame | undefined;
  calibrate(frame: FaceFrame): void { if (frame.tracked) this.neutral = structuredClone(frame); }
  reset(): void { this.frame = neutralFrame(); this.lastTime = undefined; this.neutral = undefined; this.body.reset(); }
  update(input: FaceFrame, now: number): FaceFrame {
    const delta = this.lastTime === undefined ? 100 : bounded(now - this.lastTime, 0, 100);
    this.lastTime = now;
    const channels: FaceFrame["channels"] = {};
    for (const key of FACE_CHANNELS) {
      if (input.channels[key] === undefined && this.frame.channels[key] === undefined) continue;
      const raw = faceChannel(input, key);
      const baseline = Math.min(.3, faceChannel(this.neutral ?? neutralFrame(), key));
      const target = input.tracked ? bounded((raw - baseline) / (1 - baseline)) : 0;
      const isBlink = key === "eyeBlinkLeft" || key === "eyeBlinkRight";
      const tau = !input.tracked ? 180 : isBlink ? (target > faceChannel(this.frame,key) ? 12 : 50)
        : /^(mouth|jaw|tongue)/.test(key) ? 22 : 65;
      const factor = 1 - Math.exp(-delta / tau);
      channels[key] = faceChannel(this.frame, key) + factor * (target - faceChannel(this.frame, key));
    }
    const rotation = input.rotation.map((value, i) => {
      const target = input.tracked ? bounded(value - (this.neutral?.rotation[i] ?? 0), -1, 1) : 0;
      return this.frame.rotation[i]! + (1 - Math.exp(-delta / (input.tracked ? 65 : 180))) * (target - this.frame.rotation[i]!);
    }) as FaceFrame["rotation"];
    const body = this.body.update(input.body, now);
    this.frame = { ...input, channels, rotation, ...(body ? { body } : {}) };
    return this.frame;
  }
}

/** Reproducible engineering exercise; never presented as live face capture. */
export function demoFaceFrame(timeMs: number): FaceFrame {
  const phase = (timeMs % 12000) / 1000;
  const channels: Record<string, number> = {};
  if (phase < 4) {
    channels.jawOpen = .12 + .55 * Math.max(0, Math.sin(phase * 9));
    channels.mouthSmileLeft = channels.mouthSmileRight = .35;
  } else if (phase < 7) {
    channels.eyeBlinkLeft = channels.eyeBlinkRight = Math.max(0, 1 - Math.abs(phase - 5.5) * 5);
    channels.browInnerUp = .5;
  } else {
    channels.mouthPucker = Math.max(0, Math.sin((phase - 7) * 2));
    channels.eyeLookOutLeft = channels.eyeLookInRight = .25;
  }
  return normalizeFaceFrame({ timeMs, source: "demo", tracked: true, channels,
    rotation: [.06 * Math.sin(phase), .28 * Math.sin(phase * .7), .05 * Math.sin(phase * .9)] });
}
