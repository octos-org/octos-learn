// The order of a recorded card, as a strip under the board: what the learner
// said and what they did, block after block, in the order the lesson plays
// them. Actions are dragged to another place (or moved with the arrow keys);
// a sentence is edited in place, where Enter splits it and Backspace at its
// start joins it to the one before. The strip folds away to one line.

import { tr } from "@/i18n";
import {
  ArrowUpRight, Box, ChevronDown, ChevronUp, Crosshair, Eraser, Grid3x3, Highlighter, MessageSquare, MousePointer2, MoveHorizontal,
  PenLine, Play, Sparkles, TrendingUp, type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";

import { cardSequence, joinWithPrevious, moveAction, SequenceError, splitSentence, type ActionKind, type SequenceItem } from "./card-script";
import { correctSentence, type LearnerRecording, type RecordingCard } from "./recording";

const ICONS: Record<ActionKind, LucideIcon> = {
  insert: Grid3x3, point: Crosshair, line: TrendingUp, laser: MousePointer2, highlight: Highlighter, arrow: ArrowUpRight,
  drag: MoveHorizontal, rotate: Box, neat: Sparkles, hide: Eraser, write: PenLine,
};

const FOLDED_KEY = "octos-learn:teach-sequence-folded";
/** How far, in pixels, a pointer moves before pressing an action becomes dragging it. */
const DRAG_START = 5;

export interface SequenceBarProps {
  card: RecordingCard;
  cardNumber: number;
  update: (change: (current: LearnerRecording) => LearnerRecording) => void;
  now: () => string;
  /** Why the lesson could not play the changed recording, or null when it can. */
  check: (before: LearnerRecording, after: LearnerRecording) => string | null;
  /** Where "play from this sentence" goes. */
  watchFrom?: (sentence: number) => string | undefined;
}

interface Drag { id: string; pointer: number; startX: number; startY: number; dx: number; dy: number; active: boolean; to: number }

function readFolded(): boolean {
  try { return localStorage.getItem(FOLDED_KEY) === "1"; } catch { return false; }
}

export function SequenceBar({ card, cardNumber, update, now, check, watchFrom }: SequenceBarProps) {
  const sequence = cardSequence(card) ?? [];
  const [folded, setFolded] = useState(readFolded);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const track = useRef<HTMLOListElement>(null);
  const focusAfter = useRef<string | null>(null);

  useEffect(() => {
    if (!problem) return;
    const timer = setTimeout(() => setProblem(null), 6_000);
    return () => clearTimeout(timer);
  }, [problem]);
  // Keyboard moves keep the moved block focused.
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    track.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`)?.focus();
  });

  const fold = (value: boolean) => {
    setFolded(value);
    try { localStorage.setItem(FOLDED_KEY, value ? "1" : "0"); } catch { /* Only a convenience. */ }
  };

  /** Applies a change unless the lesson could not play the result; says why when refused. */
  const apply = (change: (current: LearnerRecording) => LearnerRecording): boolean => {
    let applied = false;
    setProblem(null);
    update((current) => {
      try {
        const next = change(current);
        const why = check(current, next);
        if (why) { setProblem(why); return current; }
        applied = true;
        return next;
      } catch (error) {
        setProblem(error instanceof SequenceError && error.reason === "join_blocked"
          ? tr("这两句中间还有动作，先把动作拖走再合并。")
          : error instanceof SequenceError && error.reason === "order"
            ? tr("不能放在那里：动作要在它用到的东西之后，先写的笔画也要先出现。")
            : tr("这个改动做不了。"));
        return current;
      }
    });
    return applied;
  };

  // ---- Dragging an action

  /** Where a block dropped at this x lands: how many of the other blocks are before it. */
  const dropIndex = (id: string, x: number) => {
    const others = Array.from(track.current?.querySelectorAll<HTMLElement>("[data-item]") ?? []).filter((element) => element.dataset.item !== id);
    return others.filter((element) => { const box = element.getBoundingClientRect(); return box.left + box.width / 2 < x; }).length;
  };
  const onPointerDown = (item: SequenceItem) => (event: ReactPointerEvent<HTMLElement>) => {
    if (item.kind !== "action" || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: item.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, active: false, to: sequence.findIndex((other) => other.id === item.id) });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    const active = drag.active || Math.hypot(dx, dy) > DRAG_START;
    // Near an end of the strip, it scrolls along.
    const box = track.current?.getBoundingClientRect();
    if (active && box && track.current) {
      if (event.clientX < box.left + 40) track.current.scrollLeft -= 12;
      else if (event.clientX > box.right - 40) track.current.scrollLeft += 12;
    }
    setDrag({ ...drag, dx, dy, active, to: active ? dropIndex(drag.id, event.clientX) : drag.to });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const done = drag;
    setDrag(null);
    // Dropped where it was: nothing changes.
    if (done.active && done.to !== sequence.findIndex((item) => item.id === done.id)) {
      apply((current) => moveAction(current, card.key, done.id, done.to, now()));
    }
  };
  const onActionKey = (item: SequenceItem, position: number) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const to = event.key === "ArrowLeft" ? position - 1 : position + 1;
    if (to < 0 || to > sequence.length - 1) return;
    focusAfter.current = item.id;
    if (!apply((current) => moveAction(current, card.key, item.id, to, now()))) focusAfter.current = null;
  };

  // ---- Editing a sentence

  const commit = (index: number, text: string) => {
    setEditing(null);
    const sentence = sequence.find((item) => item.kind === "sentence" && item.index === index);
    if (sentence?.kind === "sentence" && text.trim() !== sentence.text) apply((current) => correctSentence(current, card.key, index, text, now()));
  };
  const onSentenceKey = (index: number) => (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const box = event.currentTarget;
    if (event.key === "Escape") { event.preventDefault(); setEditing(null); return; }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const at = box.selectionStart;
      const text = box.value;
      setEditing(null);
      // Enter inside the words splits there; at either end it just finishes editing.
      if (at > 0 && at < text.trim().length) {
        apply((current) => splitSentence(correctSentence(current, card.key, index, text, now()), card.key, index, at, now()));
      } else commit(index, text);
      return;
    }
    if (event.key === "Backspace" && box.selectionStart === 0 && box.selectionEnd === 0 && index > 0) {
      event.preventDefault();
      const text = box.value;
      setEditing(null);
      apply((current) => joinWithPrevious(text.trim() ? correctSentence(current, card.key, index, text, now()) : current, card.key, index, now()));
    }
  };

  const others = drag?.active ? sequence.filter((item) => item.id !== drag.id) : sequence;
  const marker = drag?.active ? drag.to : -1;

  return (
    <section className="teach-sequence" data-folded={folded || undefined} aria-label={tr("第 {{v0}} 张的顺序", { v0: cardNumber })}>
      <header className="teach-sequence-head">
        <button type="button" className="teach-sequence-toggle" aria-expanded={!folded} onClick={() => fold(!folded)}>
          {folded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          {tr("第 {{v0}} 张的顺序", { v0: cardNumber })}
        </button>
        {!folded && (problem
          ? <p role="alert" className="teach-sequence-note" data-problem>{problem}</p>
          : <p className="teach-sequence-note">{editing
            ? tr("按回车：从光标处分成两句。在句首按退格：和前一句合并。")
            : tr("拖动动作换位置；点你说的话可以修改。")}</p>)}
      </header>
      {!folded && (
        <ol ref={track} className="teach-sequence-track">
          {sequence.map((item, position) => {
            const dragged = drag?.active && drag.id === item.id;
            const slot = drag?.active ? others.findIndex((other) => other.id === item.id) : position;
            const before = marker >= 0 && !dragged && slot === marker;
            if (item.kind === "action") {
              const Icon = ICONS[item.action];
              return (
                <li key={item.id} className="teach-sequence-slot" data-before-marker={before || undefined}>
                  <div role="button" tabIndex={0} data-item={item.id} className="teach-sequence-block" data-action data-dragging={dragged || undefined}
                    aria-label={tr("{{v0}}：拖动，或用左右方向键换位置", { v0: item.label })}
                    style={dragged ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : undefined}
                    onPointerDown={onPointerDown(item)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}
                    onKeyDown={onActionKey(item, position)}>
                    <Icon size={16} aria-hidden="true" /><span>{item.label}</span>
                  </div>
                </li>
              );
            }
            const from = watchFrom?.(item.index);
            return (
              <li key={item.id} className="teach-sequence-slot" data-before-marker={before || undefined}>
                <div data-item={item.id} className="teach-sequence-block" data-sentence data-editing={editing?.index === item.index || undefined}>
                  <MessageSquare size={16} aria-hidden="true" />
                  {editing?.index === item.index ? (
                    <textarea autoFocus className="teach-sequence-text" value={editing.text} aria-label={tr("第 {{v0}} 句", { v0: item.index + 1 })}
                      onChange={(event) => setEditing({ index: item.index, text: event.target.value })}
                      onKeyDown={onSentenceKey(item.index)} onBlur={(event) => { if (editing) commit(item.index, event.currentTarget.value); }} />
                  ) : (
                    <button type="button" className="teach-sequence-words" title={tr("点一下修改")}
                      aria-label={tr("第 {{v0}} 句：{{v1}}。点一下修改", { v0: item.index + 1, v1: item.text || tr("（没听清）") })}
                      onClick={() => setEditing({ index: item.index, text: item.text })}>
                      {item.text || <span className="academy-muted">{tr("这句没听清，点这里写下你说的话。")}</span>}
                    </button>
                  )}
                  {from && editing?.index !== item.index && (
                    <Link className="teach-sequence-play" to={from} aria-label={tr("从这句开始看")} title={tr("从这句开始看")}><Play size={14} aria-hidden="true" /></Link>
                  )}
                </div>
              </li>
            );
          })}
          <li className="teach-sequence-slot teach-sequence-end" data-before-marker={marker >= 0 && marker === others.length || undefined} aria-hidden="true" />
        </ol>
      )}
    </section>
  );
}
