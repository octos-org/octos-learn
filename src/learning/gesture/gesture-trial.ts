import { validHandLandmarks, type HandwritingInputFrame } from "../handwriting/handwriting-gesture";

export interface HandReading {
  pose: "lost" | "middle-pinch" | "index-pinch" | "open" | "other";
  middleGap: number | null;
  indexGap: number | null;
}

/** Distances are relative to palm size, with image aspect ratio corrected. */
export function readTrialHand(frame: HandwritingInputFrame, threshold = 0.35): HandReading {
  const lost: HandReading = { pose: "lost", middleGap: null, indexGap: null };
  if (!frame.tracked || !validHandLandmarks(frame.landmarks)) return lost;
  const points = frame.landmarks;
  const aspect = (frame.imageWidth || 640) / (frame.imageHeight || 480);
  const distance = (a: number, b: number) => Math.hypot(
    (points[a].x - points[b].x) * aspect, points[a].y - points[b].y,
  );
  const scale = Math.max(distance(0, 9), distance(5, 17));
  if (scale < 0.02) return lost;
  const middleGap = distance(4, 12) / scale;
  const indexGap = distance(4, 8) / scale;
  const open = [[8, 6], [12, 10], [16, 14], [20, 18]]
    .every(([tip, joint]) => distance(tip, 0) > distance(joint, 0) * 1.15);
  return {
    pose: middleGap <= threshold ? "middle-pinch" : indexGap <= threshold ? "index-pinch" : open ? "open" : "other",
    middleGap, indexGap,
  };
}

/** A combined hit is a pose/sound coincidence, never proof of a finger snap. */
export class GestureTrialTracker {
  private since: number | null = null;
  private lastFrame = -Infinity;
  private ready = false;
  private poses: number[] = [];
  private sounds: number[] = [];
  private lastMatch = -Infinity;

  reset(): void {
    this.since = null; this.lastFrame = -Infinity; this.ready = false;
    this.poses = []; this.sounds = []; this.lastMatch = -Infinity;
  }

  update(frame: HandwritingInputFrame, threshold: number) {
    const reading = readTrialHand(frame, threshold);
    const time = frame.timeMs;
    if (!Number.isFinite(time)) return { reading, ready: false, entered: false, matched: false };
    if (time <= this.lastFrame || time - this.lastFrame > 200) {
      this.since = null; this.ready = false; this.poses = []; this.sounds = [];
    }
    this.lastFrame = time;
    const wasReady = this.ready;
    if (reading.pose === "middle-pinch") {
      this.since ??= time;
      this.ready = time - this.since >= 80;
    } else {
      this.since = null; this.ready = false;
    }
    this.poses = this.poses.filter(value => time - value <= 600);
    if (this.ready) this.poses.push(time);
    return { reading, ready: this.ready, entered: this.ready && !wasReady, matched: this.match(time) };
  }

  sound(time: number): boolean {
    if (!Number.isFinite(time) || time - this.lastMatch < 600) return false;
    this.sounds.push(time);
    return this.match(time);
  }

  private match(time: number): boolean {
    this.sounds = this.sounds.filter(value => Math.max(time, this.lastFrame) - value <= 250);
    if (time - this.lastMatch < 600) return false;
    const paired = this.sounds.findIndex(sound => this.poses.some(pose => Math.abs(sound - pose) <= 250));
    if (paired < 0) return false;
    this.sounds.splice(paired, 1);
    this.lastMatch = time;
    return true;
  }
}
