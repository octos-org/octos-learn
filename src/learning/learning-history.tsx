import { useEffect, useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import { SessionList } from "./history/session-list";
import type { LearningSessionRecord } from "./learning-session-store";
import "./learning-history.css";

export function learningSessionHref(session: LearningSessionRecord): string {
  if (session.source) {
    const q = new URLSearchParams({ version: session.source.version, title: session.title, mode: "learn", instance: session.id });
    return `/course/${encodeURIComponent(session.source.packId)}?${q}`;
  }
  return `/board?session=${encodeURIComponent(session.id)}`;
}

/** The board's switcher: pick up another board or lesson without leaving.
 * What happened in each lesson, and deleting it, live on the records page. */
export function LearningHistory({ currentId, onClose, onSelect, onNew, onOpenRecords }: {
  currentId?: string; onClose: () => void;
  onSelect: (session: LearningSessionRecord) => void; onNew: (draft?: string) => void;
  /** Leaves for the records page the way the board leaves anywhere, saving ink first. */
  onOpenRecords: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { previous?.focus(); };
  }, []);
  return <div className="learning-history-overlay" onClick={onClose}>
    <aside ref={panel} className="learning-history-panel" role="dialog" aria-modal="true" aria-label="学习记录" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const elements = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href], summary');
        const first = elements?.[0], last = elements?.[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <header><div><h2>学习记录</h2><p>继续之前的白板与课程</p></div><button onClick={onClose} aria-label="关闭学习记录"><X size={20} /></button></header>
      <SessionList currentId={currentId} onSelect={onSelect} onNew={() => onNew()} />
      <button type="button" className="learning-history-more" onClick={onOpenRecords}>每次学习的经过与删除 <ArrowRight size={15} aria-hidden="true" /></button>
    </aside>
  </div>;
}
