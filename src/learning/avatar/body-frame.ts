/** Compact animation parameters only: no camera images or identifying mesh. */
export type HandGesture = "relaxed" | "open" | "point" | "fist";
export interface ArmPose { tracked: boolean; upper: number; lower: number; wrist: number; gesture: HandGesture }
export interface BodyPose { tracked: boolean; lean: number; left: ArmPose; right: ArmPose }
export interface BodyLandmark { x: number; y: number; z?: number; visibility?: number }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
export const neutralArm = (): ArmPose => ({ tracked: false, upper: 0, lower: 0, wrist: Math.PI, gesture: "relaxed" });
export const neutralBody = (): BodyPose => ({ tracked: false, lean: 0, left: neutralArm(), right: neutralArm() });
const valid = (p?: BodyLandmark): p is BodyLandmark => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 4 && Math.abs(p.y) < 4 && (p.visibility === undefined || p.visibility >= .5));
const distance = (a: BodyLandmark, b: BodyLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

export function handGesture(points: BodyLandmark[]): HandGesture {
  if (points.length !== 21 || !points.every(valid)) return "relaxed";
  const extended = [8, 12, 16, 20].map((tip) => distance(points[tip]!, points[0]!) > distance(points[tip - 2]!, points[0]!) * 1.16);
  if (extended[0] && extended.slice(1).every((v) => !v)) return "point";
  if (extended.filter(Boolean).length >= 3) return "open";
  if (!extended.some(Boolean)) return "fist";
  return "relaxed";
}

/** Input is unmirrored camera landmarks. Mirror x exactly once, like the preview.
 * left/right stay anatomical subject labels; rendered left is viewer-left. */
export function bodyFromLandmarks(pose: BodyLandmark[], hands: Array<{ side: "left" | "right"; points: BodyLandmark[] }>, width: number, height: number): BodyPose {
  const result = neutralBody();
  const aspect = Number.isFinite(width / height) && height > 0 ? width / height : 1;
  const vector = (a: BodyLandmark, b: BodyLandmark) => ({ x: -(b.x - a.x) * aspect, y: b.y - a.y });
  const ls = pose[11], rs = pose[12];
  if (valid(ls) && valid(rs) && distance(ls, rs) > .035) {
    const v = vector(ls, rs); result.tracked = true; result.lean = clamp(Math.atan2(v.y, Math.abs(v.x)), -.35, .35);
  }
  for (const [side, shoulder, elbow, wrist] of [["left", 11, 13, 15], ["right", 12, 14, 16]] as const) {
    const a = pose[shoulder], b = pose[elbow], c = pose[wrist];
    if (!valid(a) || !valid(b) || !valid(c) || distance(a, b) < .025 || distance(b, c) < .025) continue;
    const upper = vector(a, b), lower = vector(b, c);
    result[side] = { tracked: true, upper: angle(Math.atan2(-upper.x, upper.y) - result.lean), lower: angle(Math.atan2(-lower.x, lower.y) - result.lean),
      wrist: angle(Math.atan2(-lower.x, lower.y) + Math.PI - result.lean), gesture: "relaxed" };
  }
  const assigned = new Set<"left" | "right">();
  for (const hand of hands) {
    if (hand.points.length !== 21 || !hand.points.every(valid)) continue;
    // Match the camera-space wrist, rather than trusting handedness labels
    // whose convention differs between mirrored and unmirrored inputs.
    const candidates = (["left", "right"] as const).filter((side) => result[side].tracked && !assigned.has(side))
      .map((side) => ({ side, distance: distance(pose[side === "left" ? 15 : 16]!, hand.points[0]!) }))
      .sort((a, b) => a.distance - b.distance);
    const match = candidates[0];
    if (!match || match.distance > .2) continue;
    assigned.add(match.side);
    const direction = vector(hand.points[0]!, hand.points[9]!);
    result[match.side].wrist = angle(Math.atan2(direction.x, -direction.y) - result.lean);
    result[match.side].gesture = handGesture(hand.points);
  }
  return result;
}

export function parseBodyPose(raw: unknown): BodyPose {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_body_pose");
  const data = raw as BodyPose;
  if (typeof data.tracked !== "boolean" || !Number.isFinite(data.lean) || Math.abs(data.lean) > .5) throw new Error("invalid_body_pose");
  const read = (arm: ArmPose): ArmPose => {
    if (!arm || typeof arm !== "object" || typeof arm.tracked !== "boolean" || ![arm.upper, arm.lower, arm.wrist].every((v) => Number.isFinite(v) && Math.abs(v) <= Math.PI + .001)
      || !["relaxed", "open", "point", "fist"].includes(arm.gesture)) throw new Error("invalid_body_pose");
    return { tracked: arm.tracked, upper: arm.upper, lower: arm.lower, wrist: arm.wrist, gesture: arm.gesture };
  };
  return { tracked: data.tracked, lean: data.lean, left: read(data.left), right: read(data.right) };
}

export function mixBody(before: BodyPose, after: BodyPose, weight: number): BodyPose {
  const mix = (a: number, b: number) => angle(a + angle(b - a) * weight);
  const arm = (a: ArmPose, b: ArmPose): ArmPose => ({ tracked: b.tracked, upper: mix(a.upper, b.upper), lower: mix(a.lower, b.lower), wrist: mix(a.wrist, b.wrist), gesture: weight < .5 ? a.gesture : b.gesture });
  return { tracked: after.tracked, lean: before.lean + (after.lean - before.lean) * weight, left: arm(before.left, after.left), right: arm(before.right, after.right) };
}

export class BodySmoother {
  private current: BodyPose | undefined;
  private last: number | undefined;
  reset() { this.current = undefined; this.last = undefined; }
  update(input: BodyPose | undefined, now: number): BodyPose | undefined {
    if (!input && !this.current) return undefined;
    const desired = input ? structuredClone(input) : neutralBody();
    for (const side of ["left", "right"] as const) if (!desired[side].tracked) desired[side] = neutralArm();
    if (!desired.tracked) desired.lean = 0;
    const dt = this.last === undefined ? 100 : clamp(now - this.last, 0, 100); this.last = now;
    this.current = mixBody(this.current ?? neutralBody(), desired, 1 - Math.exp(-dt / (desired.tracked ? 65 : 220)));
    // Gestures are discrete states, not angles. A small smoothing weight must
    // not permanently retain the previous gesture at normal display rates.
    this.current.left.gesture = desired.left.gesture;
    this.current.right.gesture = desired.right.gesture;
    return structuredClone(this.current);
  }
}
