// The order of a recorded card, as a strip under the board, on two tracks:
// what the learner said above, what they did below. An action sits under the
// sentence it is done with, or in the gap between two sentences. Actions are
// dragged to another column (or moved with the arrow keys); a sentence is
// edited in place, where Enter splits it and Backspace at its start joins it
// to the one before. The strip folds away to one line.

import { tr } from "@/i18n";
import { ArrowUpRight, Box, ChevronDown, ChevronUp, Crosshair, Eraser, Grid3x3, Highlighter, type LucideIcon, Merge, MessageSquare, MousePointer2, MoveHorizontal, PenLine, Play, Pointer, Smile, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";

import { cardTracks, joinWithPrevious, placeAction, SequenceError, splitSentence, type ActionKind, type TrackColumn } from "./card-script";
import { correctSentence, type LearnerRecording, type RecordingCard } from "./recording";

export const ICONS: Record<ActionKind, LucideIcon> = {
  insert: Grid3x3, point: Crosshair, line: TrendingUp, laser: MousePointer2, highlight: Highlighter, arrow: ArrowUpRight,
  drag: MoveHorizontal, rotate: Box, neat: Sparkles, hide: Eraser, write: PenLine, react: Smile,
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

/** A place an action can go: a column, and how many of the column's other actions come before it. */
interface Place { slot: number; position: number }

interface Drag { id: string; pointer: number; startX: number; startY: number; dx: number; dy: number; active: boolean; to: Place }

function readFolded(): boolean {
  try { return localStorage.getItem(FOLDED_KEY) === "1"; } catch { return false; }
}

/** Where the action is now. */
function placeOf(columns: TrackColumn[], id: string): Place {
  for (const column of columns) {
    const position = column.actions.findIndex((action) => action.id === id);
    if (position >= 0) return { slot: column.slot, position };
  }
  return { slot: -1, position: -1 };
}

/** Every place the action could go, left to right. */
function placesFor(columns: TrackColumn[], id: string): Place[] {
  return columns.flatMap((column) => {
    const others = column.actions.filter((action) => action.id !== id).length;
    return Array.from({ length: others + 1 }, (_, position) => ({ slot: column.slot, position }));
  });
}

const samePlace = (a: Place, b: Place) => a.slot === b.slot && a.position === b.position;

export function SequenceBar({ card, cardNumber, update, now, check, watchFrom }: SequenceBarProps) {
  const columns = cardTracks(card, { gaps: true }) ?? [];
  const sentences = columns.flatMap((column) => (column.sentence ? [column.sentence] : []));
  const [folded, setFolded] = useState(readFolded);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<string | null>(null);

  useEffect(() => {
    if (!problem) return;
    const timer = setTimeout(() => setProblem(null), 6_000);
    return () => clearTimeout(timer);
  }, [problem]);
  // A mouse wheel scrolls the strip sideways (it only scrolls up and down by itself).
  useEffect(() => {
    const strip = track.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, [folded]);
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
        setProblem(error instanceof SequenceError && error.reason === "order"
            ? tr("不能放在那里：动作要在它用到的东西之后，先写的笔画也要先出现。")
            : tr("这个改动做不了。"));
        return current;
      }
    });
    return applied;
  };

  // ---- Dragging an action

  /** Where an action dropped at this x lands: the column under it, among that column's other actions. */
  const dropPlace = (id: string, x: number): Place => {
    const elements = Array.from(track.current?.querySelectorAll<HTMLElement>("[data-slot]") ?? []);
    let nearest: HTMLElement | undefined, distance = Infinity;
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      const away = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
      if (away < distance) { distance = away; nearest = element; }
    }
    if (!nearest) return placeOf(columns, id);
    const others = Array.from(nearest.querySelectorAll<HTMLElement>("[data-action]")).filter((element) => element.dataset.item !== id);
    return { slot: Number(nearest.dataset.slot), position: others.filter((element) => { const box = element.getBoundingClientRect(); return box.left + box.width / 2 < x; }).length };
  };
  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, active: false, to: placeOf(columns, id) });
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
    setDrag({ ...drag, dx, dy, active, to: active ? dropPlace(drag.id, event.clientX) : drag.to });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const done = drag;
    setDrag(null);
    // Dropped where it was: nothing changes.
    if (done.active && !samePlace(done.to, placeOf(columns, done.id))) {
      apply((current) => placeAction(current, card.key, done.id, done.to.slot, done.to.position, now()));
    }
  };
  const onActionKey = (id: string) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const places = placesFor(columns, id);
    const here = places.findIndex((place) => samePlace(place, placeOf(columns, id)));
    const to = places[event.key === "ArrowLeft" ? here - 1 : here + 1];
    if (!to) return;
    focusAfter.current = id;
    if (!apply((current) => placeAction(current, card.key, id, to.slot, to.position, now()))) focusAfter.current = null;
  };

  // ---- Editing a sentence

  const commit = (index: number, text: string) => {
    setEditing(null);
    const sentence = sentences.find((item) => item.index === index);
    if (sentence && text.trim() !== sentence.text) apply((current) => correctSentence(current, card.key, index, text, now()));
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

  const target = drag?.active ? drag.to : null;
  const title = tr("第 {{v0}} 张：说的话和动作", { v0: cardNumber });

  return (
    <section className="teach-sequence" data-folded={folded || undefined} aria-label={title}>
      <header className="teach-sequence-head">
        <button type="button" className="teach-sequence-toggle" aria-expanded={!folded} onClick={() => fold(!folded)}>
          {folded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          {title}
        </button>
        {!folded && (problem
          ? <p role="alert" className="teach-sequence-note" data-problem>{problem}</p>
          : <p className="teach-sequence-note">{editing
            ? tr("按回车：从光标处分成两句。在句首按退格：和前一句合并。")
            : tr("把动作拖到一句话下面，就在说这句时做；拖到两句之间，就在停顿时做。点你说的话可以修改。")}</p>)}
      </header>
      {!folded && (
        <div className="teach-tracks" data-dragging={target ? true : undefined}>
          <div className="teach-tracks-labels" aria-hidden="true">
            <span><MessageSquare size={14} />{tr("说")}</span>
            <span><Pointer size={14} />{tr("做")}</span>
          </div>
          <div ref={track} className="teach-tracks-scroll">
            <ol className="teach-tracks-columns">
              {columns.map((column) => {
                const item = column.sentence;
                const from = item && watchFrom?.(item.index);
                const dropHere = target?.slot === column.slot;
                const others = column.actions.filter((action) => action.id !== drag?.id);
                return (
                  <li key={column.slot} className="teach-tracks-column" data-slot={column.slot} data-place={column.place}
                    data-empty={!item && !column.actions.length || undefined} data-drop={dropHere || undefined}>
                    <div className="teach-tracks-speech">
                      {item ? (
                        <div data-item={item.id} className="teach-tracks-sentence" data-sentence data-editing={editing?.index === item.index || undefined}>
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
                          {editing?.index !== item.index && (
                            <span className="teach-sequence-block-tools">
                              {from && <Link className="teach-sequence-tool" to={from} aria-label={tr("从这句开始看")} title={tr("从这句开始看")}><Play size={14} aria-hidden="true" /></Link>}
                              {item.index > 0 && (
                                <button type="button" className="teach-sequence-tool" aria-label={tr("和前一句合并成一句")} title={tr("和前一句合并成一句")}
                                  onClick={() => apply((current) => joinWithPrevious(current, card.key, item.index, now()))}>
                                  <Merge size={14} aria-hidden="true" />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      ) : <span className="teach-tracks-pause" aria-hidden="true" />}
                    </div>
                    <ul className="teach-tracks-actions" data-drop-end={dropHere && target!.position === others.length || undefined}
                      aria-label={item ? tr("说第 {{v0}} 句时做的", { v0: item.index + 1 }) : column.place === "before" ? tr("开口之前做的") : tr("两句话之间做的")}>
                      {column.actions.map((action) => {
                        const Icon = ICONS[action.action];
                        const dragged = target && drag!.id === action.id;
                        const before = dropHere && !dragged && others.indexOf(action) === target!.position;
                        return (
                          <li key={action.id} className="teach-tracks-slot" data-before-marker={before || undefined}>
                            <div role="button" tabIndex={0} data-item={action.id} className="teach-tracks-action" data-action data-dragging={dragged || undefined}
                              aria-label={tr("{{v0}}：拖动，或用左右方向键换位置", { v0: action.label })}
                              style={dragged ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : undefined}
                              onPointerDown={onPointerDown(action.id)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}
                              onKeyDown={onActionKey(action.id)}>
                              <Icon size={14} aria-hidden="true" /><span>{action.label}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
