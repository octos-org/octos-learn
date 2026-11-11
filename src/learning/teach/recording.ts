// A learner's lesson recording: the cards they planned, every take of each
// card, and the timed board actions of a take. The recording is the source the
// deterministic compiler turns into an OLL learner-taught lesson; it never
// holds raw audio.

export const LEARNER_RECORDING_SCHEMA = "octos.learner-recording.v1" as const;

/** How the chosen topic relates to the star map; it sets help, checks and sharing. */
export type TopicType = "on_map_lit" | "on_map_unlit" | "math_off_map" | "other";

export interface RecordingTopic {
  text: string;
  type: TopicType;
  /** Star map topic id when the topic is on the star map. */
  starTopicId?: string;
}

/** A selection of the learner's own ink, frozen when it is used. */
export interface InkTarget {
  inkSelection: string;
}

/** A board node, or one addressable part of it. */
export interface NodeTarget {
  node: string;
  part?: string;
}

export function sameBoardTarget(a: BoardTarget, b: BoardTarget): boolean {
  if ("inkSelection" in a) return "inkSelection" in b && a.inkSelection === b.inkSelection;
  return "node" in b && a.node === b.node && a.part === b.part;
}

export type BoardTarget = InkTarget | NodeTarget;

/** Components the insert panel offers, with the settings the learner chose. */
/** Where an inserted component goes: by default a new row; or beside a card in the current row. */
export interface ComponentPlacement { nextTo?: string }

export type ComponentInsert = ComponentPlacement & (
  | { panel: "graph"; alias: string; expression: string; x: [number, number]; y: [number, number]; title?: string;
      /** Letters of the expression the learner made sliders (a in y = a*x), each a lesson variable. */
      parameters?: GraphParameter[];
      /** Shows the point (v, f(v)) for a lesson variable v, so the graph follows a slider or dragged point. */
      linkedVariable?: string }
  | { panel: "coordinate_grid"; alias: string; x: [number, number]; y: [number, number]; title?: string }
  | { panel: "unit_circle"; alias: string; variable: string; title?: string }
  | ({ panel: "solid_3d"; alias: string; title?: string;
      /** A horizontal cutting plane the learner moves with a slider, showing the cross-section. */
      cut?: { variable: string };
      /** A slider (0 to 1) that opens the solid into its net; only for solids that have one (solidUnfolds). */
      unfold?: { variable: string } } & Solid)
  /** Words on the board: said (from the learner's own captions) or typed. */
  | { panel: "text"; alias: string; text: string; title?: string }
  /** A short note with a meaning: a conclusion, something to be careful about, a summary or a definition. */
  | { panel: "note"; alias: string; text: string; role: NoteRole; title?: string }
  /** A table; cells can be left empty and filled while talking (table.fill). */
  | { panel: "table"; alias: string; columns: string[]; rows: string[][]; title?: string }
  /** A regular polygon inscribed in a circle, with its perimeter; its number of sides may be a slider. */
  | { panel: "polygon"; alias: string; sides: number; slider?: { variable: string }; title?: string }
  /**
   * An object moving at constant speed along a track, linked to its
   * distance–time graph (physics plugin). Time is a slider from 0 to
   * `time.max` seconds; the speed (metres per second) may be a slider too.
   */
  | { panel: "constant_speed"; alias: string; time: { variable: string; max: number };
      speed: { initial: number; slider?: { variable: string; max: number } }; title?: string }
  /**
   * A number line (math plugin, OLL decision 0013): a range with each unit split
   * into equal parts, an optional start point (a number or an exact fraction
   * such as "3/4"), and an optional jump from it, drawn hop by hop if asked; the
   * jump's size may be a slider.
   */
  | { panel: "number_line"; alias: string; range: [number, number]; subdivisions: number; start?: string;
      jump?: { by: string; hops: boolean; slider?: { variable: string } }; title?: string }
  /** Boxes joined by arrows: steps in order, or a cycle that comes back to the first box. More boxes can be added while talking (diagram.add). */
  | { panel: "diagram"; alias: string; shape: "steps" | "cycle"; boxes: string[]; title?: string });

// 3D solids are the math plugin's shared layer (OLL decision 0012), which
// builds Studio's 3D panel and can build Coach's AI lessons.
export {
  baseCorners, compositeHeight, solidUnfolds, solidZRange,
  type CompositeSolid, type Solid, type SolidBase, type SolidShape,
} from "octos-lesson-language/plugin-math";
import type { Solid } from "octos-lesson-language/plugin-math";

/** How the presenter can react while the learner talks. */
export type PresenterReaction = "encouraging" | "careful" | "celebrating";

/** What a highlight means: important, also look, careful, or done. */
export type Emphasis = "focus" | "supporting" | "warning" | "resolved";

/** A letter of a graph's expression shown as a slider: the lesson variable it reads and the slider's range. */
export interface GraphParameter { letter: string; variable: string; initial: number; min: number; max: number }

export type NoteRole = "conclusion" | "warning" | "summary" | "definition";

export type ComponentPanel = ComponentInsert["panel"];

/** One board action of a take, `t` milliseconds after the take started. */
export type RecordingEvent =
  | { t: number; type: "tool.laser"; target: BoardTarget }
  /** A lasting mark (important when absent) or an explicit removal. */
  | { t: number; type: "tool.highlighter"; target: BoardTarget; emphasis?: Emphasis | "none" }
  | { t: number; type: "tool.arrow"; from: BoardTarget; to: BoardTarget; label?: string }
  | ({ t: number; type: "component.insert" } & ComponentInsert)
  | { t: number; type: "point_tool.place"; node: string; point: string; x: number; y: number; label: string }
  | { t: number; type: "variable.drag"; variable: string; via: "slider" | "geometry_point"; from: number; to: number; durationMs: number }
  | { t: number; type: "view.rotate"; node: string; yaw: number; pitch: number }
  | { t: number; type: "make_neat.confirmed"; selection: string; latex: string; alias: string; replacesInk: boolean }
  /** Older drafts: a line through two points as its own graph card. New lines are drawn on the grid (line_tool.draw). */
  | { t: number; type: "graph_it.confirmed"; points: string[]; expression: string; alias: string; x: [number, number]; y: [number, number] }
  /** A line through two points of a coordinate grid, drawn across that grid. */
  | { t: number; type: "line_tool.draw"; node: string; from: string; to: string; alias: string }
  | { t: number; type: "make_point.confirmed"; selection: string; node: string; point: string; x: number; y: number; label: string }
  | { t: number; type: "ink.hide"; node: string }
  /** Words put into one cell of a table on the board (row and column count from 0, rows below the header). */
  | { t: number; type: "table.fill"; node: string; row: number; column: number; text: string }
  /** The presenter reacts at this moment: encouraging, careful or celebrating (OLL teacher.expression). */
  | { t: number; type: "presenter.react"; expression: PresenterReaction }
  /** A circle on a coordinate grid, around one of its points. */
  | { t: number; type: "geometry.circle"; node: string; center: string; radius: number; alias: string }
  /** A segment on a coordinate grid between two of its points. */
  | { t: number; type: "geometry.segment"; node: string; from: string; to: string; alias: string }
  /** One more curve on a graph, to compare with the ones already there. */
  | { t: number; type: "graph.add_curve"; node: string; expression: string }
  /** One more box at the end of a diagram's steps or cycle, with words on the arrow into it if any. */
  | { t: number; type: "diagram.add"; node: string; label: string; link?: string }
  | { t: number; type: "your_turn.demonstrated"; variable: string; value: number }
  | { t: number; type: "your_turn.check_picked"; expression: string; value: number; tolerance: number }
  | { t: number; type: "your_turn.hint_spoken"; text: string }
  /** "Your turn" asks for a number: the answer as the viewer would type it (whole, decimal, fraction or mixed). */
  | { t: number; type: "your_turn.answer_set"; answer: string; unit?: string; simplest?: boolean }
  /** "Your turn" asks the viewer to turn a 3D scene so they look at it from this direction. */
  | { t: number; type: "your_turn.view_set"; node: string; yaw: number; pitch: number };

/** One sentence of a take, in take time; `asrText` is what recognition heard, before the learner's corrections. */
export interface SpeechSegment {
  startMs: number;
  endMs: number;
  text: string;
  asrText?: string;
  /** Recognition failed for this sentence; the learner can type what they said. */
  failed?: true;
}

/** Joins spoken pieces with a space unless the text is written without spaces (Chinese, Japanese). */
export function joinSpoken(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).reduce((text, part) => {
    if (!text) return part;
    const unspaced = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}。！？，、；：]$/u.test(text) && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part);
    return unspaced ? `${text}${part}` : `${text} ${part}`;
  }, "");
}

export type TakeStatus = "recording" | "kept" | "superseded";

export interface Take {
  take: number;
  status: TakeStatus;
  startedAt: string;
  durationMs?: number;
  /** Transcript as recognised, before the learner's corrections. */
  asrText?: string;
  /** Transcript the lesson narrates; personal details are removed before publishing. */
  text?: string;
  /** When the learner last changed `text` by hand; a check made before it no longer applies. */
  textEditedAt?: string;
  /** Start and end of speech inside the take, for action phases. */
  speechSpanMs?: [number, number];
  /**
   * What the learner said, sentence by sentence, with when each was said. The
   * lesson keeps the order of these sentences and the board actions between
   * and during them. `text` is always these sentences joined. Takes recorded
   * before sentences were kept have none and play as one sentence.
   */
  segments?: SpeechSegment[];
  /** The take's camera performance (face and head parameters, no images) is kept on this device (take-performance-store). */
  camera?: true;
  events: RecordingEvent[];
  /** Ink frozen during the take, such as handwriting made neat; it joins the card's ink when the take is kept. */
  ink?: CardInk[];
  /** The learner started the card over: the card's earlier board and ink are replaced when this take is kept. */
  fresh?: boolean;
  /**
   * Strokes of the take's live writing the learner pointed at, by their box on
   * the board. When the writing is frozen each becomes a selection of that ink.
   */
  inkMarks?: InkMark[];
}

/** A stroke of live writing the learner pointed at: the selection it will become, and its box on the board. */
export interface InkMark {
  selection: string;
  box: { x: number; y: number; width: number; height: number };
}

/**
 * A piece of the learner's ink on a card, frozen when the card stops. Ink
 * belongs to the card, not a take. Ink drawn on a component annotates it at a
 * position on that component (fractions of its card).
 */
export interface CardInk {
  snapshotId: string;
  sha256: string;
  selections: string[];
  annotates?: { node: string; x: number; y: number; width: number; height: number };
  /**
   * Written on or just below a handwriting or math card of an earlier card:
   * it continues that card at this offset (board units from its top-left).
   */
  continues?: { node: string; x: number; y: number };
  /** The size it was written at, in board units; the lesson shows it at this size. */
  drawnSize?: { width: number; height: number };
  /** The neat math the learner confirmed for this ink, shown in its place. */
  neat?: { selection: string; latex: string; alias: string };
  /** The take the ink was written in. */
  take?: number;
  /**
   * When each stroke was written, in take time and in the snapshot's stroke
   * order, so the lesson shows the writing stroke by stroke as it was written.
   * Absent for ink written before strokes were timed.
   */
  strokeTimesMs?: number[];
}

/** Octo's question after a card, and the learner's answer; private, never part of the lesson. */
export interface OctoExchange {
  question: string;
  answer?: string;
}

export interface RecordingCard {
  key: string;
  title: string;
  kind: "teach" | "your_turn";
  takes: Take[];
  ink?: CardInk[];
  octo?: OctoExchange;
}

/** The review of the recorded lesson, kept with the draft for the learner. */
/** The last "Check my lesson": Octo's review and, card by card, what the screen check found. */
export interface RecordingReview {
  at: string;
  cards: Array<{ key: string; status: "good" | "check"; kind: "none" | "slip" | "misconception" | "unclear"; message: string }>;
  overall: string;
  /** Personal details Octo found in what the learner said, by card, as the learner's own words. */
  personal?: Array<{ card: string; quote: string; kind: string }>;
  /** Cards not readable at their end on a checked screen; absent in drafts checked before the screen check joined. */
  screen?: Array<{ card: string; board: "chromebook" | "large"; problems: Array<"small_text" | "small_diagram" | "out_of_view" | "overflow" | "missing_ink" | "no_focus"> }>;
}

export interface LearnerRecording {
  schema: typeof LEARNER_RECORDING_SCHEMA;
  id: string;
  createdAt: string;
  updatedAt: string;
  topic: RecordingTopic;
  goals: string[];
  cards: RecordingCard[];
  review?: RecordingReview;
  /** Who presents the lesson: catalog IDs of the avatar and voice the learner chose. */
  presenter?: Presenter;
  /**
   * Advanced mode: the lesson's OLL as the learner edited it by hand. It is
   * played and saved instead of the lesson made from the recording, while that
   * lesson is still the one it was edited from (`basedOn`); once the recording
   * changes, the edit is out of date and the recording's lesson is used again.
   */
  oll?: OllOverride;
}

export interface OllOverride {
  /** The authoring lesson (OLL JSON) the learner wrote. */
  lesson: unknown;
  /** Fingerprint of the lesson made from the recording when the edit was made. */
  basedOn: string;
  editedAt: string;
}

export interface Presenter {
  avatar?: string;
  /** Earlier drafts chose a voice separately; ignored now: each character speaks in its own voice. */
  voice?: string;
  /** Opt-in basic final-audio mouth motion. */
  mouthMotion?: "off" | "basic";
  /**
   * Opt-in: the camera moves the character while the learner records. Only
   * expression and head parameters are kept, on this device; a prepared
   * lesson carries them re-timed onto the synthetic narration. Needs mouth motion.
   */
  cameraMotion?: "off" | "on";
}

export class RecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordingError";
  }
}

const MAX_CARDS = 6;
const MAX_CARD_TITLE = 80;

export function createRecording(input: { id: string; now: string; topic: RecordingTopic; goals: string[] }): LearnerRecording {
  if (!input.topic.text.trim()) throw new RecordingError("A recording needs a topic");
  return {
    schema: LEARNER_RECORDING_SCHEMA,
    id: input.id,
    createdAt: input.now,
    updatedAt: input.now,
    topic: { ...input.topic, text: input.topic.text.trim() },
    goals: input.goals.map((goal) => goal.trim()).filter(Boolean),
    cards: [],
  };
}

function cardKey(index: number): string {
  return `card-${index + 1}`;
}

function touch(recording: LearnerRecording, now: string, cards: RecordingCard[]): LearnerRecording {
  return { ...recording, updatedAt: now, cards };
}

function findCard(recording: LearnerRecording, key: string): RecordingCard {
  const card = recording.cards.find((candidate) => candidate.key === key);
  if (!card) throw new RecordingError(`Unknown card ${key}`);
  return card;
}

function replaceCard(recording: LearnerRecording, key: string, update: (card: RecordingCard) => RecordingCard): RecordingCard[] {
  return recording.cards.map((card) => (card.key === key ? update(card) : card));
}

/** Plans the cards. Keys follow the final order; cards without takes may be reordered or removed freely. */
export function planCards(
  recording: LearnerRecording,
  now: string,
  cards: Array<{ title: string; kind?: RecordingCard["kind"]; from?: string }>,
): LearnerRecording {
  if (cards.length === 0) throw new RecordingError("A lesson needs at least one card");
  if (cards.length > MAX_CARDS) throw new RecordingError(`A lesson has at most ${MAX_CARDS} cards`);
  const kept = new Set(cards.map((card) => card.from).filter(Boolean));
  const dropped = recording.cards.filter((card) => !kept.has(card.key) && card.takes.length > 0);
  if (dropped.length) throw new RecordingError(`Card ${dropped[0]!.key} already has a recording`);
  const next = cards.map((card, index): RecordingCard => {
    const previous = card.from ? findCard(recording, card.from) : undefined;
    const title = card.title.trim();
    if (!title) throw new RecordingError("Every card needs a title");
    return {
      key: cardKey(index),
      title,
      kind: card.kind ?? previous?.kind ?? "teach",
      takes: previous?.takes ?? [],
      ...(previous?.ink ? { ink: previous.ink } : {}),
    };
  });
  return touch(recording, now, next);
}

/** The take whose board a card shows now: the one being recorded, else the kept one. */
export function boardTake(card: RecordingCard): Take | undefined {
  return currentTake(card) ?? keptTake(card);
}

export function currentTake(card: RecordingCard): Take | undefined {
  return card.takes.find((take) => take.status === "recording");
}

/** The take the lesson uses: the latest kept one. */
export function keptTake(card: RecordingCard): Take | undefined {
  return [...card.takes].reverse().find((take) => take.status === "kept");
}

/** What a card's board is built from, as opposed to the learner's words and pointing. */
// What stays on the board when only the words are re-recorded: cards, arrows
// and highlights. The laser and drags are moments in the talk and are redone.
const BOARD_CONTENT = new Set<RecordingEvent["type"]>([
  "component.insert", "point_tool.place", "make_point.confirmed", "graph_it.confirmed", "line_tool.draw", "ink.hide", "table.fill", "diagram.add", "graph.add_curve", "geometry.circle", "geometry.segment",
  "tool.arrow", "tool.highlighter",
  "your_turn.demonstrated", "your_turn.check_picked", "your_turn.hint_spoken", "your_turn.answer_set", "your_turn.view_set",
]);

/**
 * Starts a take. Re-recording a card replaces what the learner says and how
 * they point and drag; the board they built (components, points, lines, the
 * exercise, ink and neat math) stays, already shown when the take begins.
 * Starting the card over (`fresh`) begins from an empty card instead.
 */
export function startTake(recording: LearnerRecording, key: string, now: string, options: { fresh?: boolean } = {}): LearnerRecording {
  const card = findCard(recording, key);
  if (currentTake(card)) throw new RecordingError(`Card ${key} is already recording`);
  if (recording.cards.some((other) => currentTake(other))) {
    throw new RecordingError("Another card is recording");
  }
  const board = options.fresh ? [] : (keptTake(card)?.events ?? []).filter((event) => BOARD_CONTENT.has(event.type)).map((event) => ({ ...event, t: 0 }));
  const take: Take = { take: card.takes.length + 1, status: "recording", startedAt: now, events: board, ...(options.fresh ? { fresh: true } : {}) };
  return touch(recording, now, replaceCard(recording, key, (existing) => ({ ...existing, takes: [...existing.takes, take] })));
}

export function appendEvent(recording: LearnerRecording, key: string, event: RecordingEvent, now: string): LearnerRecording {
  const take = currentTake(findCard(recording, key));
  if (!take) throw new RecordingError(`Card ${key} is not recording`);
  if (!Number.isFinite(event.t) || event.t < 0) throw new RecordingError("Event time must be a non-negative number");
  const last = take.events.at(-1);
  if (last && event.t < last.t) throw new RecordingError("Events must be in time order");
  return touch(recording, now, replaceCard(recording, key, (card) => ({
    ...card,
    takes: card.takes.map((candidate) => (candidate === take ? { ...take, events: [...take.events, event] } : candidate)),
  })));
}

/**
 * Undo during a take: takes back the take's last `count` board actions, and
 * with them the frozen ink (by snapshot) or ink mark (by selection) that the
 * same step added (an arrow between two strokes adds two marks). Board content carried over from the kept take is never
 * removed this way: only actions recorded in this take can be taken back.
 */
export function undoTakeEvents(
  recording: LearnerRecording, key: string, count: number, now: string,
  added: { inkSnapshot?: string; inkMarks?: string[] } = {},
): LearnerRecording {
  const take = currentTake(findCard(recording, key));
  if (!take) throw new RecordingError(`Card ${key} is not recording`);
  if (!Number.isInteger(count) || count < 0 || count > take.events.length) throw new RecordingError("Nothing to undo");
  const ink = added.inkSnapshot ? (take.ink ?? []).filter((piece) => piece.snapshotId !== added.inkSnapshot) : take.ink;
  const marks = new Set(added.inkMarks ?? []);
  const inkMarks = marks.size ? (take.inkMarks ?? []).filter((mark) => !marks.has(mark.selection)) : take.inkMarks;
  const next: Take = { ...take, events: take.events.slice(0, take.events.length - count) };
  if (ink) next.ink = ink;
  if (inkMarks) next.inkMarks = inkMarks;
  return touch(recording, now, replaceCard(recording, key, (card) => ({
    ...card,
    takes: card.takes.map((candidate) => (candidate === take ? next : candidate)),
  })));
}

/** Adds ink frozen during the take, for example handwriting the learner just made neat. */
export function addTakeInk(recording: LearnerRecording, key: string, ink: CardInk, now: string): LearnerRecording {
  const take = currentTake(findCard(recording, key));
  if (!take) throw new RecordingError(`Card ${key} is not recording`);
  return touch(recording, now, replaceCard(recording, key, (card) => ({
    ...card,
    takes: card.takes.map((candidate) => (candidate === take ? { ...take, ink: [...(take.ink ?? []), ink] } : candidate)),
  })));
}

/** Remembers a stroke of live writing the learner pointed at. */
export function addInkMark(recording: LearnerRecording, key: string, mark: InkMark, now: string): LearnerRecording {
  const take = currentTake(findCard(recording, key));
  if (!take) throw new RecordingError(`Card ${key} is not recording`);
  return touch(recording, now, replaceCard(recording, key, (card) => ({
    ...card,
    takes: card.takes.map((candidate) => (candidate === take ? { ...take, inkMarks: [...(take.inkMarks ?? []), mark] } : candidate)),
  })));
}

/** Ends the take, keeps it, and marks the card's earlier kept take as superseded. */
export function finishTake(
  recording: LearnerRecording,
  key: string,
  now: string,
  result: { durationMs: number; asrText: string; speechSpanMs?: [number, number]; segments?: SpeechSegment[]; ink?: CardInk[]; camera?: boolean },
): LearnerRecording {
  const card = findCard(recording, key);
  const take = currentTake(card);
  if (!take) throw new RecordingError(`Card ${key} is not recording`);
  if (!(result.durationMs > 0)) throw new RecordingError("A take must have a duration");
  // Ink belongs to the card: a re-take adds its new strokes to what is already there.
  const ink = [...(take.ink ?? []), ...(result.ink ?? [])];
  const kept: Take = { ...take };
  delete kept.ink;
  delete kept.inkMarks;
  return touch(recording, now, replaceCard(recording, key, (existing) => ({
    ...existing,
    ...(take.fresh ? { ink } : ink.length ? { ink: [...(existing.ink ?? []), ...ink] } : {}),
    takes: existing.takes.map((candidate): Take => {
      if (candidate === take) {
        return {
          ...kept,
          status: "kept",
          durationMs: result.durationMs,
          asrText: result.asrText,
          text: result.asrText,
          ...(result.speechSpanMs ? { speechSpanMs: result.speechSpanMs } : {}),
          ...(result.segments?.length ? { segments: result.segments.map((segment) => ({ ...segment })) } : {}),
          ...(result.camera ? { camera: true as const } : {}),
        };
      }
      return candidate.status === "kept" ? { ...candidate, status: "superseded" } : candidate;
    }),
  })));
}

/** Discards an unfinished take, for example when the learner cancels. */
export function cancelTake(recording: LearnerRecording, key: string, now: string): LearnerRecording {
  const take = currentTake(findCard(recording, key));
  if (!take) return recording;
  return touch(recording, now, replaceCard(recording, key, (card) => ({
    ...card,
    takes: card.takes.filter((candidate) => candidate !== take),
  })));
}

/** The learner fixes what speech recognition heard. */
export function correctTranscript(recording: LearnerRecording, key: string, text: string, now: string): LearnerRecording {
  const take = keptTake(findCard(recording, key));
  if (!take) throw new RecordingError(`Card ${key} has no recording to correct`);
  // A take with sentences is corrected sentence by sentence, so its text stays their join.
  if (take.segments) throw new RecordingError(`Card ${key} is corrected one sentence at a time`);
  const corrected = text.trim();
  if (!corrected) throw new RecordingError("The transcript cannot be empty");
  return touch(recording, now, replaceCard(recording, key, (card) => ({
    ...card,
    takes: card.takes.map((candidate) => (candidate === take ? (corrected === take.text ? take : { ...take, text: corrected, textEditedAt: now }) : candidate)),
  })));
}

/**
 * The learner fixes one sentence of the kept take. A sentence may be left
 * empty (nothing is said there; its actions still play), but not every one.
 */
export function correctSentence(recording: LearnerRecording, key: string, index: number, text: string, now: string): LearnerRecording {
  const take = keptTake(findCard(recording, key));
  if (!take?.segments) throw new RecordingError(`Card ${key} has no sentences to correct`);
  const segment = take.segments[index];
  if (!segment) throw new RecordingError(`Card ${key} has no sentence ${index + 1}`);
  const corrected = text.trim();
  if (corrected === segment.text) return recording;
  const segments = take.segments.map((candidate, position) => (position === index ? { ...candidate, text: corrected } : candidate));
  const joined = joinSpoken(segments.map((candidate) => candidate.text));
  if (!joined) throw new RecordingError("The transcript cannot be empty");
  return touch(recording, now, replaceCard(recording, key, (card) => ({
    ...card,
    takes: card.takes.map((candidate) => (candidate === take ? { ...take, segments, text: joined, textEditedAt: now } : candidate)),
  })));
}

/** Whether every card has a kept take and nothing is still recording. */
export function recordingComplete(recording: LearnerRecording): boolean {
  return recording.cards.length > 0
    && recording.cards.every((card) => !currentTake(card) && keptTake(card));
}

/** Octo asked about a card; a new question replaces an earlier one and its answer. */
export function setOctoQuestion(recording: LearnerRecording, key: string, question: string, now: string): LearnerRecording {
  findCard(recording, key);
  return touch(recording, now, replaceCard(recording, key, (card) => ({ ...card, octo: { question: question.trim() } })));
}

export function answerOcto(recording: LearnerRecording, key: string, answer: string, now: string): LearnerRecording {
  const card = findCard(recording, key);
  if (!card.octo) throw new RecordingError(`Octo has not asked about card ${key}`);
  return touch(recording, now, replaceCard(recording, key, (existing) => ({ ...existing, octo: { ...existing.octo!, answer: answer.trim() } })));
}

/** The learner renames a card. */
export function renameCard(recording: LearnerRecording, key: string, title: string, now: string): LearnerRecording {
  const trimmed = title.trim();
  if (!trimmed) throw new RecordingError("Every card needs a title");
  if (trimmed.length > MAX_CARD_TITLE) throw new RecordingError(`A card title has at most ${MAX_CARD_TITLE} characters`);
  findCard(recording, key);
  return touch(recording, now, replaceCard(recording, key, (card) => ({ ...card, title: trimmed })));
}

/**
 * Makes a card a "Your turn" exercise, or a card that teaches. Only a card with
 * nothing recorded yet changes, and a lesson has one exercise at most.
 */
export function setCardKind(recording: LearnerRecording, key: string, kind: RecordingCard["kind"], now: string): LearnerRecording {
  const card = findCard(recording, key);
  if (card.kind === kind) return recording;
  if (card.takes.length > 0) throw new RecordingError(`Card ${key} already has a recording`);
  if (kind === "your_turn" && recording.cards.some((other) => other.kind === "your_turn")) throw new RecordingError("A lesson has one \"Your turn\" card at most");
  return touch(recording, now, replaceCard(recording, key, (current) => ({ ...current, kind })));
}

/** Advanced mode: keeps (or, with null, drops) the learner's hand-edited OLL. */
export function setOllOverride(recording: LearnerRecording, override: OllOverride | null, now: string): LearnerRecording {
  const next: LearnerRecording = { ...recording, updatedAt: now };
  if (override) next.oll = override; else delete next.oll;
  return next;
}

/** The learner chooses who presents the lesson. */
export function setPresenter(recording: LearnerRecording, presenter: Presenter, now: string): LearnerRecording {
  return { ...recording, updatedAt: now, presenter: { ...recording.presenter, ...presenter } };
}

export function setReview(recording: LearnerRecording, review: RecordingReview, now: string): LearnerRecording {
  return { ...recording, updatedAt: now, review };
}
