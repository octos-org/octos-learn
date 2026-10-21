import type { PlaybackOperation } from "octos-lesson-language/player";

export interface PlaybackObservation {
  cursor: number;
  epoch: number;
  playing: boolean;
  operation?: PlaybackOperation;
}
export interface CompletedBeatEvidence { stepId: string; beatId: string; presentation: "audio" | "text" }

/** Tracks actual contiguous playback, never infers coverage from a checkpoint.
 * The caller must sample every durable Runtime advance, before coalescing UI
 * updates; a skipped observation conservatively invalidates the active beat.
 */
export class PlaybackEvidenceTracker {
  private cursor: number;
  private epoch: number;
  private active?: CompletedBeatEvidence;

  constructor(initial: Pick<PlaybackObservation, "cursor" | "epoch">) {
    this.cursor = initial.cursor;
    this.epoch = initial.epoch;
  }

  narrationEnded(beatId: string, reason: "ended" | "disabled" | "failed" | "cancelled") {
    if (this.active?.beatId !== beatId) return;
    if (reason === "ended") this.active.presentation = "audio";
    else if (reason === "disabled") this.active.presentation = "text";
    else this.active = undefined;
  }

  observe(next: PlaybackObservation): CompletedBeatEvidence | undefined {
    const unchanged = next.cursor === this.cursor && next.epoch === this.epoch;
    if (unchanged) return undefined; // pause/resume does not fabricate a frame
    const contiguous = next.cursor === this.cursor + 1 && next.epoch === this.epoch;
    this.cursor = next.cursor;
    this.epoch = next.epoch;
    if (!next.playing || !contiguous) { this.active = undefined; return undefined; }
    const op = next.operation;
    if (!op) { this.active = undefined; return undefined; }
    if (op.type === "beat.begin" && op.beat_id && op.step_id) {
      this.active = { beatId: op.beat_id, stepId: op.step_id, presentation: "text" };
    }
    if (op.type !== "beat.end") return undefined;
    const result = this.active?.beatId === op.beat_id ? this.active : undefined;
    this.active = undefined;
    return result;
  }
}
