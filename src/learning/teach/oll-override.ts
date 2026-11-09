// Advanced mode: the learner may edit the lesson's OLL by hand. The edit is
// used (played, checked for the screen, saved) only while the lesson made from
// the recording is still the one it was edited from; recording again, adding
// or renaming cards makes it out of date, and the recording's lesson is used.

import { assertAuthoringSchema, normalizeAuthoringLesson, reduceCanonicalEvents, validateAuthoringLesson } from "octos-lesson-language";

import { compileRecording, type CompiledLesson } from "./compile-recording";
import type { LearnerRecording } from "./recording";

/** A short, stable fingerprint of a lesson made from the recording. */
export function lessonFingerprint(lesson: CompiledLesson["lesson"]): string {
  const text = JSON.stringify(lesson);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export type OverrideState = "none" | "active" | "stale";

/** The lesson to play and save: the learner's edit while it is current, else the recording's. */
export function effectiveLesson(recording: LearnerRecording, compiled: CompiledLesson): { compiled: CompiledLesson; override: OverrideState } {
  if (!recording.oll) return { compiled, override: "none" };
  if (recording.oll.basedOn !== lessonFingerprint(compiled.lesson)) {
    const { author, language } = compiled.lesson.lesson;
    const hasSolid = compiled.lesson.steps.some((step) => step.beats.some((beat) =>
      beat.actions.some((action) => action.do === "write" && action.kind === "scene3d")));
    // A renderer upgrade must not invalidate an edit made against the same recording.
    if (!author || !hasSolid || recording.oll.basedOn !== lessonFingerprint(
      compileRecording(recording, { author, language, legacyFaceTargets: true }).lesson,
    )) return { compiled, override: "stale" };
  }
  return { compiled: { ...compiled, lesson: recording.oll.lesson as CompiledLesson["lesson"] }, override: "active" };
}

/**
 * Reads hand-edited OLL and checks it the way the board loads it. Returns the
 * lesson, or why it cannot be used.
 */
export function checkOllEdit(text: string, compiled: CompiledLesson): { lesson: CompiledLesson["lesson"] } | { error: string } {
  let lesson: unknown;
  try { lesson = JSON.parse(text); } catch (error) { return { error: `JSON: ${(error as Error).message}` }; }
  try {
    assertAuthoringSchema(lesson);
    const typed = lesson as CompiledLesson["lesson"];
    validateAuthoringLesson(typed, compiled.resourceContext);
    reduceCanonicalEvents(normalizeAuthoringLesson(typed, { lessonId: "oll-check", boardId: "oll-check-board", baseRevision: 0, resourceContext: compiled.resourceContext }));
    return { lesson: typed };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
