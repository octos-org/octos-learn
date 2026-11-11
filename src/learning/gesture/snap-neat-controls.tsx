import { useLayoutEffect, type RefObject } from "react";
import { Sparkles } from "lucide-react";
import { tr } from "@/i18n";
import type { useSnapNeat } from "./use-snap-neat";
import "./snap-neat.css";

const SELECTION_BOX = ".selection-tool-selection-background";

export function SnapNeatZone({ snap, viewportRef, selectionRevision }: {
  snap: ReturnType<typeof useSnapNeat>;
  viewportRef: RefObject<HTMLDivElement | null>;
  selectionRevision: number;
}) {
  const { zoneRef } = snap;
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const zone = zoneRef.current;
    if (!viewport || !zone) return;
    let frame = 0;
    let selectionBox: Element | null = null;
    const selectionObserver = new MutationObserver(() => schedule());
    const place = () => {
      frame = 0;
      const current = viewport.querySelector(SELECTION_BOX);
      if (current !== selectionBox) {
        selectionObserver.disconnect();
        selectionBox = current;
        if (current) selectionObserver.observe(current, { attributes: true, attributeFilter: ["style"] });
      }
      const selection = current?.getBoundingClientRect();
      if (!selection || !selection.width || !selection.height) {
        zone.style.removeProperty("left");
        zone.style.removeProperty("top");
        return;
      }
      const board = viewport.getBoundingClientRect();
      const width = zone.offsetWidth;
      const height = zone.offsetHeight;
      const gap = 12;
      const clamp = (position: number, size: number, limit: number) => Math.max(gap, Math.min(position, limit - size - gap));
      const centerX = (selection.left + selection.right) / 2 - board.left - width / 2;
      const centerY = (selection.top + selection.bottom) / 2 - board.top - height / 2;
      const candidates = [
        { x: centerX, y: selection.top - board.top - height - gap },
        { x: centerX, y: selection.bottom - board.top + gap },
        { x: selection.right - board.left + gap, y: centerY },
        { x: selection.left - board.left - width - gap, y: centerY },
      ].map(({ x, y }) => ({ x: clamp(x, width, board.width), y: clamp(y, height, board.height) }));
      const scope = viewport.closest("[data-air-scope]") ?? viewport.parentElement;
      const obstacles = [selection, ...Array.from(scope?.querySelectorAll("[data-learning-board-occlusion]") ?? [],
        element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height)];
      const clear = candidates.find(({ x, y }) => obstacles.every(rect =>
        board.left + x + width <= rect.left || board.left + x >= rect.right
        || board.top + y + height <= rect.top || board.top + y >= rect.bottom));
      const position = clear ?? candidates[0]!;
      zone.style.left = `${position.x}px`;
      zone.style.top = `${position.y}px`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    const tree = new MutationObserver(() => {
      if (!selectionBox || !viewport.contains(selectionBox)) schedule();
    });
    tree.observe(viewport, { subtree: true, childList: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(viewport);
    resize?.observe(zone);
    place();
    return () => {
      tree.disconnect();
      selectionObserver.disconnect();
      resize?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [viewportRef, zoneRef, selectionRevision]);

  return <div ref={zoneRef} className="snap-neat-zone" role="group" data-aimed={snap.aimed} data-ready={snap.handReady}
    aria-label={tr("响指整理区域")}>
    <strong><Sparkles size={16} aria-hidden="true" />{tr("响指整理")}</strong>
    {snap.needsMic
      ? <button type="button" data-handwriting-controls="" data-air-pass-through="" onClick={() => void snap.requestMic()}>{tr("允许麦克风")}</button>
      : <span role="status">{snap.notice || snap.status}</span>}
  </div>;
}
