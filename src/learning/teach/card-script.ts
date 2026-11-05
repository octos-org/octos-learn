// A recorded card as a script: the sentences the learner said, in order, and
// the board actions between and during them. The learner rearranges the
// script by moving an action to another place between sentences, and edits,
// splits or joins sentences. Moves change only when an action plays among the
// words, never what it does; the lesson is made from the result as usual.

import { tr } from "@/i18n";

import { AFTER, DURING, inkStages, rankOf, sentencesOf } from "./compile-recording";
import {
  joinSpoken,
  keptTake,
  RecordingError,
  type LearnerRecording,
  type RecordingCard,
  type RecordingEvent,
  type SpeechSegment,
  type Take,
} from "./recording";

/**
 * Where an action plays: before the first sentence (only sentence 0), while a
 * sentence is said, or after it (before the next one).
 */
export interface ScriptSlot { sentence: number; phase: "before" | "during" | "after" }

export interface ScriptChip {
  /** Stable while the script does not change: "event:<index>" or "ink:<snapshot>:<first stroke>". */
  id: string;
  label: string;
  slot: ScriptSlot;
}

export interface CardScript {
  sentences: string[];
  /** In play order. */
  chips: ScriptChip[];
}

/**
 * The places between sentences an action can be moved to: gap 0 is before the
 * first sentence, gap k (k ≥ 1) is after sentence k-1.
 */
export function gapOf(slot: ScriptSlot): number | undefined {
  if (slot.phase === "before") return 0;
  if (slot.phase === "after") return slot.sentence + 1;
  return undefined;
}

function slotOf(rank: number): ScriptSlot {
  const sentence = Math.floor(rank / 3);
  const phase = rank % 3;
  return { sentence, phase: phase === DURING ? "during" : phase === AFTER ? "after" : "before" };
}

const variableName = (alias: string) => (alias === "theta" ? "θ" : alias);

function eventLabel(event: RecordingEvent): string | undefined {
  switch (event.type) {
    case "component.insert":
      return {
        graph: tr("放上函数图"), coordinate_grid: tr("放上坐标网格"), unit_circle: tr("放上单位圆"), solid_3d: tr("放上长方体"),
      }[event.panel];
    case "point_tool.place":
    case "make_point.confirmed":
      return tr("标出点 {{v0}}", { v0: event.label });
    case "line_tool.draw":
    case "graph_it.confirmed":
      return tr("画一条直线");
    case "tool.laser":
      return tr("指一下");
    case "tool.highlighter":
      return tr("高亮");
    case "tool.arrow":
      return tr("画箭头");
    case "variable.drag":
      return tr("拖动 {{v0}}", { v0: variableName(event.variable) });
    case "view.rotate":
      return tr("转动长方体");
    case "make_neat.confirmed":
      return tr("整理成算式");
    case "ink.hide":
      return tr("擦掉手写");
    default:
      // "Your turn" settings are not played in the lesson.
      return undefined;
  }
}

/** The take a card's script edits: its kept take, when it kept its sentences. */
function scriptTake(card: RecordingCard): Take | undefined {
  const take = keptTake(card);
  return take?.segments?.length ? take : undefined;
}

/** The card as a script, or undefined when its take did not keep its sentences. */
export function cardScript(card: RecordingCard): CardScript | undefined {
  const take = scriptTake(card);
  if (!take) return undefined;
  const sentences = sentencesOf(take);
  const placed: Array<{ chip: ScriptChip; rank: number; t: number }> = [];
  take.events.forEach((event, index) => {
    if (card.kind === "your_turn" && (event.type === "variable.drag" || event.type === "view.rotate")) return;
    const label = eventLabel(event);
    if (!label) return;
    const rank = rankOf(sentences, event.t);
    placed.push({ chip: { id: `event:${index}`, label, slot: slotOf(rank) }, rank, t: event.t });
  });
  for (const ink of card.ink ?? []) {
    if (ink.take !== take.take || !ink.strokeTimesMs?.length) continue;
    let first = 0;
    for (const stage of inkStages(ink.strokeTimesMs, sentences)) {
      const strokes = stage.shown - first;
      placed.push({
        chip: { id: `ink:${ink.snapshotId}:${first}`, label: strokes === 1 ? tr("写字（1 笔）") : tr("写字（{{v0}} 笔）", { v0: strokes }), slot: slotOf(stage.rank) },
        rank: stage.rank, t: Math.max(...ink.strokeTimesMs.slice(first, stage.shown)),
      });
      first = stage.shown;
    }
  }
  placed.sort((a, b) => a.rank - b.rank || a.t - b.t);
  return { sentences: sentences.texts, chips: placed.map((entry) => entry.chip) };
}

function replaceTake(recording: LearnerRecording, key: string, now: string, change: (take: Take, card: RecordingCard) => { take: Take; card?: Partial<RecordingCard> }): LearnerRecording {
  const card = recording.cards.find((candidate) => candidate.key === key);
  const take = card ? scriptTake(card) : undefined;
  if (!card || !take) throw new RecordingError(`Card ${key} has no sentences to edit`);
  const changed = change(take, card);
  return {
    ...recording, updatedAt: now,
    cards: recording.cards.map((candidate) => (candidate === card
      ? { ...candidate, ...changed.card, takes: candidate.takes.map((other) => (other === take ? changed.take : other)) }
      : candidate)),
  };
}

/** The strokes (from, to) of a writing chip: the strokes its stage shows. */
function inkChipStrokes(take: Take, card: RecordingCard, id: string): { snapshot: string; from: number; to: number } | undefined {
  const [, snapshot, first] = /^ink:(.+):(\d+)$/.exec(id) ?? [];
  const ink = (card.ink ?? []).find((candidate) => candidate.snapshotId === snapshot);
  if (!snapshot || !ink?.strokeTimesMs) return undefined;
  const from = Number(first);
  const stage = inkStages(ink.strokeTimesMs, sentencesOf(take)).find((candidate) => candidate.shown > from);
  return stage ? { snapshot, from, to: stage.shown } : undefined;
}

/** Times inside a take for the chip with this id. */
function chipTimes(take: Take, card: RecordingCard, id: string): number[] {
  if (id.startsWith("event:")) {
    const event = take.events[Number(id.slice("event:".length))];
    return event ? [event.t] : [];
  }
  const strokes = inkChipStrokes(take, card, id);
  const ink = strokes && (card.ink ?? []).find((candidate) => candidate.snapshotId === strokes.snapshot);
  return strokes && ink?.strokeTimesMs ? ink.strokeTimesMs.slice(strokes.from, strokes.to) : [];
}

/** Why an action could not be moved there. */
export class ScriptMoveError extends RecordingError {
  readonly reason: "order" | "nothing_to_move";
  constructor(reason: "order" | "nothing_to_move") {
    super(reason === "order" ? "An action cannot play before what it needs" : "Nothing to move");
    this.name = "ScriptMoveError";
    this.reason = reason;
  }
}

/**
 * Moves an action to a gap between sentences, after what is already there.
 * Writing keeps its stroke order, so a later stroke never shows before an
 * earlier one: such a move is refused, as is any move that would shift
 * another action. (The caller also refuses one the lesson cannot play, such
 * as a point placed before its grid.)
 */
export function moveScriptChip(recording: LearnerRecording, key: string, chipId: string, gap: number, now: string): LearnerRecording {
  const before = recording.cards.find((card) => card.key === key);
  const script = before && cardScript(before);
  if (!script || !script.chips.some((chip) => chip.id === chipId)) throw new ScriptMoveError("nothing_to_move");
  // Where each event went when the events were put back in time order (old index → new index).
  let renumber = (id: string) => id;
  const moved = replaceTake(recording, key, now, (take, card) => {
    const segments = [...take.segments!].sort((a, b) => a.startMs - b.startMs).map((segment) => ({ ...segment }));
    // Room inside the gap, after what is already there: the gap is the open interval between two sentences.
    const others = script.chips.filter((chip) => chip.id !== chipId && gapOf(chip.slot) === gap).flatMap((chip) => chipTimes(take, card, chip.id));
    const previous = gap > 0 ? segments[gap - 1] : undefined;
    const next = segments[gap];
    let low = Math.max(previous ? previous.endMs : 0, ...others);
    if (!next) low += 1;
    else if (next.startMs - low < 0.002) {
      // No time between the sentences (or before the first one): the next sentence starts a moment later.
      if (next.endMs - low <= 0.004) throw new ScriptMoveError("order");
      next.startMs = low + 0.002;
    }
    const t = next ? (low + next.startMs) / 2 : low;
    if (chipId.startsWith("event:")) {
      const index = Number(chipId.slice("event:".length));
      const events = take.events.map((event, position) => (position === index ? { ...event, t } : event));
      // Play order follows time; the stable sort keeps the order of actions at the same time.
      const order = events.map((event, position) => ({ event, position })).sort((a, b) => a.event.t - b.event.t || a.position - b.position);
      const newIndex = new Map(order.map((entry, position) => [entry.position, position]));
      renumber = (id) => (id.startsWith("event:") ? `event:${newIndex.get(Number(id.slice("event:".length)))}` : id);
      return { take: { ...take, segments, events: order.map((entry) => entry.event) } };
    }
    const strokes = inkChipStrokes(take, card, chipId)!;
    const ink = (card.ink ?? []).map((piece) => (piece.snapshotId !== strokes.snapshot || !piece.strokeTimesMs ? piece
      : { ...piece, strokeTimesMs: piece.strokeTimesMs.map((time, index) => (index >= strokes.from && index < strokes.to ? t : time)) }));
    return { take: { ...take, segments }, card: { ink } };
  });
  // The moved action lands where it was put, and every other action stays where it was.
  const after = new Map(cardScript(moved.cards.find((card) => card.key === key)!)!.chips.map((chip) => [chip.id, chip.slot]));
  if (after.size !== script.chips.length) throw new ScriptMoveError("order");
  for (const chip of script.chips) {
    const slot = after.get(renumber(chip.id));
    if (!slot) throw new ScriptMoveError("order");
    if (chip.id === chipId ? gapOf(slot) !== gap : JSON.stringify(slot) !== JSON.stringify(chip.slot)) throw new ScriptMoveError("order");
  }
  return moved;
}

/** Splits a sentence where the learner put the cursor; its time is shared by the length of each part. */
export function splitSentence(recording: LearnerRecording, key: string, index: number, at: number, now: string): LearnerRecording {
  return replaceTake(recording, key, now, (take) => {
    const segments = [...take.segments!].sort((a, b) => a.startMs - b.startMs);
    const segment = segments[index];
    if (!segment) throw new RecordingError(`Card ${key} has no sentence ${index + 1}`);
    const head = segment.text.slice(0, at).trim();
    const tail = segment.text.slice(at).trim();
    if (!head || !tail) throw new RecordingError("A sentence splits into two parts with words");
    const middle = segment.startMs + (segment.endMs - segment.startMs) * (at / segment.text.length);
    const parts: SpeechSegment[] = [
      { startMs: segment.startMs, endMs: middle, text: head },
      { startMs: middle + 0.001, endMs: Math.max(segment.endMs, middle + 0.002), text: tail },
    ];
    const next = [...segments.slice(0, index), ...parts, ...segments.slice(index + 1)];
    return { take: { ...take, segments: next, text: joinSpoken(next.map((part) => part.text)), textEditedAt: now } };
  });
}

/** Joins a sentence with the next one; refused while an action plays between them. */
export function joinSentences(recording: LearnerRecording, key: string, index: number, now: string): LearnerRecording {
  const card = recording.cards.find((candidate) => candidate.key === key);
  const script = card && cardScript(card);
  if (script?.chips.some((chip) => gapOf(chip.slot) === index + 1)) throw new ScriptMoveError("order");
  return replaceTake(recording, key, now, (take) => {
    const segments = [...take.segments!].sort((a, b) => a.startMs - b.startMs);
    const [first, second] = [segments[index], segments[index + 1]];
    if (!first || !second) throw new RecordingError(`Card ${key} has no sentence after sentence ${index + 1}`);
    const joined: SpeechSegment = { startMs: first.startMs, endMs: second.endMs, text: joinSpoken([first.text, second.text]) };
    const next = [...segments.slice(0, index), joined, ...segments.slice(index + 2)];
    return { take: { ...take, segments: next, text: joinSpoken(next.map((part) => part.text)), textEditedAt: now } };
  });
}
