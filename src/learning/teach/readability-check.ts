// Before a lesson is submitted it is played, off screen, on a school
// Chromebook-sized board and a large one, and every card end is checked with
// the same rules as the OLL teaching playback check: text readable on screen,
// diagrams large enough, the focused card in view, nothing overflowing, ink
// present. The end-of-lesson overview is not checked.

import { getLocale } from "@/i18n";
import { normalizeAuthoringLesson, type CanonicalEvent } from "octos-lesson-language";
import { HeadlessLessonPlayer } from "octos-lesson-language/player";
import { mountInfiniteBoard, type ImageAssetResolver } from "octos-lesson-language/web-runtime";
import { collectTeachingObservation, evaluateTeachingObservation } from "octos-lesson-language/web-runtime/testing";

import { teachingCameraCeiling, teachingCameraFloor } from "../oll/board-chrome-insets";
import type { CompiledLesson } from "./compile-recording";
import { teachingRegionLayout } from "./teaching-board-setup";

export const CHECKED_BOARDS = [
  { name: "chromebook", width: 1366, height: 768 },
  { name: "large", width: 1920, height: 1080 },
] as const;

export type CheckedBoard = (typeof CHECKED_BOARDS)[number]["name"];

/** What can be wrong at the end of one card, in terms a learner can act on. */
export type ReadabilityProblem = "small_text" | "small_diagram" | "out_of_view" | "overflow" | "missing_ink" | "no_focus";

export interface CardReadability {
  card: string;
  board: CheckedBoard;
  problems: ReadabilityProblem[];
}

const PROBLEM_OF: Record<string, ReadabilityProblem> = {
  G3_TEXT_TOO_SMALL: "small_text",
  G3_DIAGRAM_TOO_SMALL: "small_diagram",
  G3_FOCUS_OUT_OF_VIEW: "out_of_view",
  G3_CONTENT_OVERFLOW: "overflow",
  G3_ASSET_LOAD_FAILED: "missing_ink",
  G1_MISSING_BEAT_FOCUS: "no_focus",
};

/** Turns observer issues at one card end into learner-facing problems, once each. */
export function readabilityProblems(codes: string[]): ReadabilityProblem[] {
  return [...new Set(codes.flatMap((code) => (PROBLEM_OF[code] ? [PROBLEM_OF[code]!] : [])))];
}

const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function checkBoard(events: CanonicalEvent[], resolveAsset: ImageAssetResolver, board: (typeof CHECKED_BOARDS)[number]): Promise<CardReadability[]> {
  const host = document.createElement("div");
  host.className = "teach-readability-probe";
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-30000px", top: "0", width: `${board.width}px`, height: `${board.height}px`, overflow: "hidden" });
  document.body.append(host);
  const mounted = mountInfiniteBoard(host, resolveAsset);
  try {
    (mounted.view as unknown as { setLocale?: (locale: string) => void }).setLocale?.(getLocale());
    mounted.view.setAutomaticCameraMinimumScale(teachingCameraFloor());
    mounted.view.setAutomaticCameraMaximumScale(teachingCameraCeiling());
    mounted.view.setRegionLayouts(teachingRegionLayout(events, board.width, board.height));
    const player = new HeadlessLessonPlayer(events);
    const results: CardReadability[] = [];
    for (let frame = player.advance(); frame; frame = player.advance()) {
      mounted.view.render(frame.projection.board, frame.operation);
      if (frame.operation.type !== "beat.end" || !frame.projection.board) continue;
      await document.fonts?.ready;
      await settle();
      const observation = collectTeachingObservation({
        viewport: mounted.elements.viewport, world: mounted.elements.world,
        board: frame.projection.board, operation: frame.operation, cursor: frame.projection.cursor,
      });
      const problems = readabilityProblems(evaluateTeachingObservation(observation).issues.map((issue) => issue.code));
      const card = frame.operation.beat_id?.split(":").at(-1) ?? "";
      if (problems.length) results.push({ card, board: board.name, problems });
    }
    return results;
  } finally {
    mounted.destroy();
    host.remove();
  }
}

/** Plays the lesson on each checked board; an empty result means every card end is readable. */
export async function checkReadability(compiled: CompiledLesson, resolveAsset: ImageAssetResolver): Promise<CardReadability[]> {
  const events = normalizeAuthoringLesson(compiled.lesson, {
    lessonId: "studio-check", boardId: "studio-check-board", baseRevision: 0, resourceContext: compiled.resourceContext,
  });
  const results: CardReadability[] = [];
  for (const board of CHECKED_BOARDS) results.push(...await checkBoard(events, resolveAsset, board));
  return results;
}
