export interface HostTeachingFocusInput {
  teachingFocusAllowed: boolean;
  attentionTargets: string[];
  attentionChanged: boolean;
  compositionTargets: string[];
  compositionChanged: boolean;
  compositionOperationChanged: boolean;
  atPlaybackBoundary: boolean;
  boardFocus: string[];
  focusChanged: boolean;
  variableAnimationActive: boolean;
}

export interface HostTeachingFocusDecision {
  source: "attention" | "composition" | "boundary";
  targets: string[];
}

/**
 * Decides whether the Learn host needs to supplement OLL's camera decision.
 * During a variable animation OLL can derive every visual driven by that
 * variable; Beat composition usually names only the current narrative target
 * and must not narrow the complete animated scene.
 */
export function planHostTeachingFocus(
  input: HostTeachingFocusInput,
): HostTeachingFocusDecision | null {
  if (!input.teachingFocusAllowed) return null;
  if (input.attentionTargets.length > 0 && input.attentionChanged) {
    return { source: "attention", targets: input.attentionTargets };
  }
  if (input.variableAnimationActive) return null;
  if (
    input.compositionTargets.length > 0
    && (input.compositionChanged || input.compositionOperationChanged)
  ) {
    return { source: "composition", targets: input.compositionTargets };
  }
  if (input.atPlaybackBoundary && input.focusChanged) {
    return { source: "boundary", targets: input.boardFocus };
  }
  return null;
}
