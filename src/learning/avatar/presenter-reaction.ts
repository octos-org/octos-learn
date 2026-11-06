// A presenter's reaction (OLL teacher.expression) shown on its face for a
// moment: a smile to encourage, a frown of attention to say careful, a big
// smile with raised brows to celebrate. It eases in and out over the moment.

import { useEffect, useRef } from "react";

import type { FaceChannel, FaceFrame } from "./face-frame";

export type PresenterReaction = "encouraging" | "careful" | "celebrating";
export interface ReactionMoment { expression: PresenterReaction; at: number }

/** How long a reaction shows, in milliseconds. */
export const REACTION_MS = 2_600;

const FACES: Record<PresenterReaction, Partial<Record<FaceChannel, number>>> = {
  encouraging: { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.3, cheekSquintRight: 0.3, browInnerUp: 0.2 },
  careful: { browDownLeft: 0.55, browDownRight: 0.55, mouthPressLeft: 0.35, mouthPressRight: 0.35, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 },
  celebrating: { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.45, cheekSquintRight: 0.45, browInnerUp: 0.6, eyeWideLeft: 0.3, eyeWideRight: 0.3 },
};

/** How strongly a reaction shows `since` ms after it started: in over 300 ms, out over the last 600. */
export function reactionWeight(since: number): number {
  if (since < 0 || since >= REACTION_MS) return 0;
  return Math.min(1, since / 300, (REACTION_MS - since) / 600);
}

/** The face with the reaction on it (mouth movement from speech still wins for the mouth's opening). */
export function withReaction(frame: FaceFrame, reaction: ReactionMoment | null, now: number): FaceFrame {
  const weight = reaction ? reactionWeight(now - reaction.at) : 0;
  if (!reaction || !weight) return frame;
  const channels = { ...frame.channels };
  for (const [channel, value] of Object.entries(FACES[reaction.expression]) as Array<[FaceChannel, number]>) {
    channels[channel] = Math.max(channels[channel] ?? 0, value * weight);
  }
  return { ...frame, channels };
}

/** The reaction a ref holds now (read in a draw loop, not during render). */
export function reactionNow(ref: { current: ReactionMoment | null } | undefined): ReactionMoment | null {
  return ref?.current ?? null;
}

/**
 * The latest reaction among the operations the lesson plays, kept in a ref so
 * the character's draw loop reads it without re-rendering.
 */
export function usePresenterReaction(operation: { operation_id: string; action?: { op: string; expression?: string } } | undefined) {
  const moment = useRef<ReactionMoment | null>(null);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!operation || operation.operation_id === seen.current) return;
    seen.current = operation.operation_id;
    const expression = operation.action?.op === "teacher.expression" ? operation.action.expression : undefined;
    if (expression === "encouraging" || expression === "careful" || expression === "celebrating") moment.current = { expression, at: performance.now() };
  }, [operation]);
  return moment;
}
