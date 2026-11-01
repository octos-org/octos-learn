import { useEffect, useRef } from "react";
import { normalizeAuthoringLesson, reduceCanonicalEvents, type CanonicalEvent } from "octos-lesson-language";
import { mountInfiniteBoard, type ImageAssetResolver, type MountedInfiniteBoard } from "octos-lesson-language/web-runtime";
import "octos-lesson-language/web-runtime/styles.css";

import { teachingCameraCeiling, teachingCameraFloor, teachingReadingScale } from "../oll/board-chrome-insets";
import type { CompiledLesson } from "./compile-recording";
import type { BoardTarget } from "./recording";
import { boardTargetFromId, STUDIO_LESSON_ID } from "./studio-board-ids";


function nodeSections(events: CanonicalEvent[]): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const event of events) {
    for (const beat of event.step?.beats ?? []) {
      for (const actions of Object.values(beat.stage ?? {})) {
        for (const action of actions as Array<{ node?: { id?: string } }>) {
          if (action.node?.id && !sections[action.node.id]) sections[action.node.id] = event.step!.id;
        }
      }
    }
  }
  return sections;
}

/**
 * The board while a learner records: the compiled lesson so far, laid out and
 * framed by the same teaching layout and camera rules as playback.
 */
export function TeachBoard({
  compiled,
  resolveAsset,
  onTarget,
}: {
  compiled: CompiledLesson | null;
  resolveAsset: ImageAssetResolver;
  /** Called with what the learner tapped when a pointing tool is active. */
  onTarget?: (target: BoardTarget) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const onTargetRef = useRef(onTarget);
  useEffect(() => {
    onTargetRef.current = onTarget;
  }, [onTarget]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const mounted = mountInfiniteBoard(viewport, (id) => resolveAsset(id));
    mounted.view.setAutomaticCameraMinimumScale(teachingCameraFloor());
    mounted.view.setAutomaticCameraMaximumScale(teachingCameraCeiling());
    mountedRef.current = mounted;
    const handleClick = (event: MouseEvent) => {
      if (!onTargetRef.current) return;
      const element = (event.target as Element | null)?.closest<HTMLElement | SVGElement>("[data-id]");
      const target = boardTargetFromId(element?.dataset.id);
      if (target) onTargetRef.current(target);
    };
    viewport.addEventListener("click", handleClick);
    return () => {
      viewport.removeEventListener("click", handleClick);
      mounted.destroy();
      mountedRef.current = null;
    };
  }, [resolveAsset]);

  useEffect(() => {
    const mounted = mountedRef.current;
    const viewport = viewportRef.current;
    if (!mounted || !viewport) return;
    if (!compiled) {
      mounted.view.render(null);
      return;
    }
    const events = normalizeAuthoringLesson(compiled.lesson, {
      lessonId: STUDIO_LESSON_ID,
      boardId: "studio-board",
      baseRevision: 0,
      resourceContext: compiled.resourceContext,
    });
    mounted.view.setRegionLayouts({
      __legacy__: {
        x: 20, y: 20, flow: "teaching", nodeSections: nodeSections(events),
        composition: { width: viewport.clientWidth, height: viewport.clientHeight, mode: "progressive", readingScale: teachingReadingScale() },
      },
    });
    const state = reduceCanonicalEvents(events);
    mounted.view.render(state);
    if (state.focus.length) mounted.view.focusTargets(state.focus);
  }, [compiled]);

  return <div ref={viewportRef} className="teach-board" data-testid="teach-board" data-pointing={onTarget ? "true" : undefined} />;
}
