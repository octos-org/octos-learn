// A recorded card as a sequence: the sentences the learner said and the board
// actions, in the order they play. The learner moves an action to another
// place in the sequence, and edits, splits or joins sentences. A move changes
// only when an action plays among the words, never what it does; the lesson
// is made from the result as usual. Sentences keep the order they were said
// in, since the voice and camera movement follow them.

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

/** What an action does, for its icon. */
export type ActionKind = "insert" | "point" | "line" | "laser" | "highlight" | "arrow" | "drag" | "rotate" | "neat" | "hide" | "write";

export type SequenceItem =
  | { kind: "sentence"; id: string; index: number; text: string }
  /** `id` is "event:<index in the take>" or "ink:<snapshot>:<first stroke>". */
  | { kind: "action"; id: string; action: ActionKind; label: string };

const variableName = (alias: string) => (alias === "theta" ? "θ" : alias);

function describe(event: RecordingEvent): { action: ActionKind; label: string } | undefined {
  switch (event.type) {
    case "component.insert":
      return { action: "insert", label: {
        graph: tr("放上函数图"), coordinate_grid: tr("放上坐标网格"), unit_circle: tr("放上单位圆"), solid_3d: tr("放上长方体"),
        text: tr("写上一段话"), note: tr("写上一条提示"), table: tr("放上表格"),
      }[event.panel] };
    case "table.fill":
      return { action: "insert", label: tr("填表格") };
    case "point_tool.place":
    case "make_point.confirmed":
      return { action: "point", label: tr("标出点 {{v0}}", { v0: event.label }) };
    case "line_tool.draw":
    case "graph_it.confirmed":
      return { action: "line", label: tr("画一条直线") };
    case "tool.laser":
      return { action: "laser", label: tr("指一下") };
    case "tool.highlighter":
      return { action: "highlight", label: tr("高亮") };
    case "tool.arrow":
      return { action: "arrow", label: tr("画箭头") };
    case "variable.drag":
      return { action: "drag", label: tr("拖动 {{v0}}", { v0: variableName(event.variable) }) };
    case "view.rotate":
      return { action: "rotate", label: tr("转动长方体") };
    case "make_neat.confirmed":
      return { action: "neat", label: tr("整理成算式") };
    case "ink.hide":
      return { action: "hide", label: tr("擦掉手写") };
    default:
      // "Your turn" settings are not played in the lesson.
      return undefined;
  }
}

/** The take a card's sequence edits: its kept take, when it kept its sentences. */
function sequenceTake(card: RecordingCard): Take | undefined {
  const take = keptTake(card);
  return take?.segments?.length ? take : undefined;
}

/**
 * An item and the time that orders it. An action plays at its time; a
 * sentence is ordered by its end, so actions made while it was said (which
 * play as it starts) come before it, and actions after it come after.
 */
interface Timed { item: SequenceItem; key: number; times: number[]; start?: number }

function timedSequence(card: RecordingCard, take: Take): Timed[] {
  const sentences = sentencesOf(take);
  const timed: Timed[] = sentences.texts.map((text, index) => ({
    item: { kind: "sentence", id: `sentence:${index}`, index, text }, key: sentences.spans[index]![1], times: [], start: sentences.spans[index]![0],
  }));
  take.events.forEach((event, index) => {
    if (card.kind === "your_turn" && (event.type === "variable.drag" || event.type === "view.rotate")) return;
    const described = describe(event);
    if (described) timed.push({ item: { kind: "action", id: `event:${index}`, ...described }, key: event.t, times: [event.t] });
  });
  for (const ink of card.ink ?? []) {
    if (ink.take !== take.take || !ink.strokeTimesMs?.length) continue;
    let first = 0;
    for (const stage of inkStages(ink.strokeTimesMs, sentences)) {
      const strokes = stage.shown - first;
      const times = ink.strokeTimesMs.slice(first, stage.shown);
      timed.push({
        item: { kind: "action", id: `ink:${ink.snapshotId}:${first}`, action: "write", label: strokes === 1 ? tr("写字（1 笔）") : tr("写字（{{v0}} 笔）", { v0: strokes }) },
        key: Math.max(...times), times,
      });
      first = stage.shown;
    }
  }
  // Time order; a sentence comes after actions at the same time; recorded order on other ties.
  return timed
    .map((entry, position) => ({ entry, position }))
    .sort((a, b) => a.entry.key - b.entry.key || Number(a.entry.item.kind === "sentence") - Number(b.entry.item.kind === "sentence") || a.position - b.position)
    .map(({ entry }) => entry);
}

/** The card as a sequence, or undefined when its take did not keep its sentences. */
export function cardSequence(card: RecordingCard): SequenceItem[] | undefined {
  const take = sequenceTake(card);
  return take ? timedSequence(card, take).map((entry) => entry.item) : undefined;
}

type SentenceItem = Extract<SequenceItem, { kind: "sentence" }>;
type ActionItem = Extract<SequenceItem, { kind: "action" }>;

/**
 * One column of a card's two tracks (words above, actions below): a sentence
 * with the actions that play while it is said, or the actions that play
 * between sentences (before the first, or after one and before the next).
 */
export interface TrackColumn {
  /** Where the column is along the card: 3k+1 is sentence k, 3k+2 the gap after it, 0 the gap before the first. */
  slot: number;
  place: "before" | "during" | "after";
  /** The sentence said, for a "during" column. */
  sentence?: SentenceItem;
  actions: ActionItem[];
}

/**
 * The card as two tracks, in the columns it plays in: what is done while a
 * sentence is said sits under that sentence. Columns follow the sentences,
 * not seconds, since the lesson's voice is made again and its sentences last
 * as long as the voice takes. Undefined when the take did not keep its sentences.
 */
export function cardTracks(card: RecordingCard, options: { gaps?: boolean } = {}): TrackColumn[] | undefined {
  const take = sequenceTake(card);
  return take ? tracksOf(card, take, options) : undefined;
}

/** With `gaps`, every gap between sentences has its column, empty or not (somewhere to drop an action). */
function tracksOf(card: RecordingCard, take: Take, { gaps = false }: { gaps?: boolean }): TrackColumn[] {
  const sentences = sentencesOf(take);
  const columns = new Map<number, TrackColumn>();
  const at = (rank: number) => {
    let column = columns.get(rank);
    if (!column) {
      column = { slot: rank, place: rank % 3 === DURING ? "during" : rank % 3 === AFTER ? "after" : "before", actions: [] };
      columns.set(rank, column);
    }
    return column;
  };
  // Every sentence has its column, actions or not.
  sentences.texts.forEach((_, index) => {
    if (gaps && index === 0) at(0);
    at(3 * index + DURING);
    if (gaps) at(3 * index + AFTER);
  });
  for (const { item, key } of timedSequence(card, take)) {
    if (item.kind === "sentence") at(3 * item.index + DURING).sentence = item;
    else at(rankOf(sentences, key)).actions.push(item);
  }
  return [...columns.entries()].sort(([a], [b]) => a - b).map(([, column]) => column);
}

function replaceTake(recording: LearnerRecording, key: string, now: string, change: (take: Take, card: RecordingCard) => { take: Take; card?: Partial<RecordingCard> }): LearnerRecording {
  const card = recording.cards.find((candidate) => candidate.key === key);
  const take = card ? sequenceTake(card) : undefined;
  if (!card || !take) throw new RecordingError(`Card ${key} has no sentences to edit`);
  const changed = change(take, card);
  return {
    ...recording, updatedAt: now,
    cards: recording.cards.map((candidate) => (candidate === card
      ? { ...candidate, ...changed.card, takes: candidate.takes.map((other) => (other === take ? changed.take : other)) }
      : candidate)),
  };
}

/** Why the sequence could not be changed that way. */
export class SequenceError extends RecordingError {
  readonly reason: "order" | "nothing";
  constructor(reason: "order" | "nothing") {
    super(reason);
    this.name = "SequenceError";
    this.reason = reason;
  }
}

/**
 * Gives an action (all of its strokes, for writing) a new time, keeping the
 * take's events in time order. Returns how item ids change with it.
 */
function retime(recording: LearnerRecording, key: string, id: string, strokes: number, t: number, now: string) {
  let renumber = (itemId: string) => itemId;
  const moved = replaceTake(recording, key, now, (current, owner) => {
    if (id.startsWith("event:")) {
      const index = Number(id.slice("event:".length));
      const events = current.events.map((event, position) => (position === index ? { ...event, t } : event));
      const order = events.map((event, position) => ({ event, position })).sort((a, b) => a.event.t - b.event.t || a.position - b.position);
      const newIndex = new Map(order.map((entry, position) => [entry.position, position]));
      renumber = (itemId) => (itemId.startsWith("event:") ? `event:${newIndex.get(Number(itemId.slice("event:".length)))}` : itemId);
      return { take: { ...current, events: order.map((entry) => entry.event) } };
    }
    const match = /^ink:(.+):(\d+)$/.exec(id)!;
    const [snapshot, from] = [match[1]!, Number(match[2])];
    const ink = (owner.ink ?? []).map((piece) => (piece.snapshotId !== snapshot || !piece.strokeTimesMs ? piece
      : { ...piece, strokeTimesMs: piece.strokeTimesMs.map((time, index) => (index >= from && index < from + strokes ? t : time)) }));
    return { take: current, card: { ink } };
  });
  return { moved, renumber };
}

/**
 * Puts an action in a column of the card's tracks (see cardTracks: a
 * sentence, so it is done while that sentence is said, or a gap between
 * sentences), at `position` among the column's other actions. Its time moves
 * there, so the lesson plays it there. Refused when the tracks would come out
 * different, for example when a later stroke of writing would show before an
 * earlier one.
 */
export function placeAction(recording: LearnerRecording, key: string, id: string, slot: number, position: number, now: string): LearnerRecording {
  const card = recording.cards.find((candidate) => candidate.key === key);
  const take = card && sequenceTake(card);
  if (!card || !take) throw new SequenceError("nothing");
  const timed = timedSequence(card, take);
  const moving = timed.find((entry) => entry.item.id === id && entry.item.kind === "action");
  if (!moving) throw new SequenceError("nothing");
  const spans = sentencesOf(take).spans;
  const sentence = Math.floor(slot / 3);
  if (slot < 0 || sentence >= spans.length || (slot % 3 === 0 && slot !== 0)) throw new SequenceError("nothing");

  // The tracks as they should come out: every column's ids, with the action in its new place.
  const tracks = tracksOf(card, take, { gaps: true }).map((column) => ({ slot: column.slot, ids: column.actions.map((action) => action.id).filter((other) => other !== id) }));
  const target = tracks.find((column) => column.slot === slot)!;
  const at = Math.max(0, Math.min(position, target.ids.length));
  const keyOf = (other: string) => timed.find((entry) => entry.item.id === other)!.key;
  // The column's own bounds: before the first sentence starts, while a sentence is said, or between two.
  const [low, high] = slot === 0 ? [-Infinity, spans[0]![0]]
    : slot % 3 === DURING ? [spans[sentence]![0], spans[sentence]![1]]
      : [spans[sentence]![1], spans[sentence + 1]?.[0] ?? Infinity];
  const prev = at > 0 ? keyOf(target.ids[at - 1]!) : low;
  const next = at < target.ids.length ? keyOf(target.ids[at]!) : high;
  if (!(next > prev)) throw new SequenceError("order");
  const t = prev === -Infinity ? next - 1_000 : next === Infinity ? prev + 1_000 : (prev + next) / 2;
  target.ids.splice(at, 0, id);

  const { moved, renumber } = retime(recording, key, id, moving.times.length, t, now);
  const result = cardTracks(moved.cards.find((candidate) => candidate.key === key)!, { gaps: true })!;
  const wanted = tracks.map((column) => `${column.slot}:${column.ids.map(renumber).join(",")}`).join("\n");
  if (result.map((column) => `${column.slot}:${column.actions.map((action) => action.id).join(",")}`).join("\n") !== wanted) throw new SequenceError("order");
  return moved;
}

/** Splits a sentence at a place in its words; its time is shared by the length of each part. */
export function splitSentence(recording: LearnerRecording, key: string, index: number, at: number, now: string): LearnerRecording {
  return replaceTake(recording, key, now, (take) => {
    const segments = [...take.segments!].sort((a, b) => a.startMs - b.startMs);
    const segment = segments[index];
    if (!segment) throw new RecordingError(`Card ${key} has no sentence ${index + 1}`);
    const head = segment.text.slice(0, at).trim();
    const tail = segment.text.slice(at).trim();
    if (!head || !tail) throw new SequenceError("nothing");
    const middle = segment.startMs + (segment.endMs - segment.startMs) * (at / segment.text.length);
    const parts: SpeechSegment[] = [
      { startMs: segment.startMs, endMs: middle, text: head },
      { startMs: middle + 0.001, endMs: Math.max(segment.endMs, middle + 0.002), text: tail },
    ];
    const next = [...segments.slice(0, index), ...parts, ...segments.slice(index + 1)];
    return { take: { ...take, segments: next, text: joinSpoken(next.map((part) => part.text)), textEditedAt: now } };
  });
}

/**
 * Joins a sentence with the one before it, for a sentence that speech
 * recognition cut in two at a pause. Actions made in that pause are then made
 * while the joined sentence is said, so they play as it starts.
 */
export function joinWithPrevious(recording: LearnerRecording, key: string, index: number, now: string): LearnerRecording {
  if (index < 1) throw new SequenceError("nothing");
  return replaceTake(recording, key, now, (take) => {
    const segments = [...take.segments!].sort((a, b) => a.startMs - b.startMs);
    const [first, second] = [segments[index - 1]!, segments[index]!];
    const joined: SpeechSegment = { startMs: first.startMs, endMs: second.endMs, text: joinSpoken([first.text, second.text]) };
    const next = [...segments.slice(0, index - 1), joined, ...segments.slice(index + 1)];
    return { take: { ...take, segments: next, text: joinSpoken(next.map((part) => part.text)), textEditedAt: now } };
  });
}
