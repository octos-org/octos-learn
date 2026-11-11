// Turns a learner's recording into an OLL learner-taught lesson. The mapping is
// deterministic code, never a model: the same recording always gives the same
// lesson, and what the learner sees while recording is what plays back.

import type { AuthoringAction, AuthoringLesson, LessonAuthor, ResourceContext } from "octos-lesson-language";
import { baseCorners, buildCirclePolygons, buildFunctionPlot, buildNumberLine, buildSolid, buildUnitCircle, describeSolid, functionCurveId, numberLineValue, NUMBER_LINE_LIMITS, solidUnfolds, solidZRange } from "octos-lesson-language/plugin-math";
import { buildConstantSpeedMotion } from "octos-lesson-language/plugin-physics";
import { PROCESS_CYCLE_EDGE_ID, processDiagramContent, processEdgeId, processStepId } from "octos-lesson-language/plugin-shared";
import { normalizeLocale, tr } from "@/i18n";

import {
  keptTake,
  currentTake,
  type BoardTarget,
  type CardInk,
  type ComponentInsert,
  type LearnerRecording,
  type NoteRole,
  type RecordingCard,
  type RecordingEvent,
  type Take,
} from "./recording";
import { parseGraphEntry } from "./graph-entry";
import { prePluginCurveId, prePluginDiagramContent, prePluginGraphContent, prePluginPolygon, prePluginUnitCircle } from "./legacy-panels";
import { lineAcross, lineLabel } from "./studio-helpers";

type Action = AuthoringAction & Record<string, unknown>;
type Phase = "before_speech" | "during_speech" | "after_speech";

/** OLL's limit on beats in one step; a card with more continues in further steps of its own. */
const MAX_BEATS = 12;

/** The key of a card's later steps, when it needs more beats than one step holds. */
export const CARD_PART_SEPARATOR = "-part";
type Point = { as: string; x: number; y: number; label?: string; visible?: boolean; interaction?: unknown };

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

/** Nothing is on the board yet: no card has been recorded, or the one being recorded is still empty. */
export class EmptyLessonError extends CompileError {
  constructor() {
    super("No card has been recorded yet");
    this.name = "EmptyLessonError";
  }
}

export interface CompileOptions {
  author: LessonAuthor;
  language: string;
  /** Reproduce the original solid content when checking a saved OLL edit's fingerprint. */
  legacyFaceTargets?: boolean;
  /**
   * Reproduce how the unit circle, polygon, graph and diagram panels compiled
   * before they came from the OLL plugins, when checking a saved OLL edit's
   * fingerprint (legacy-panels.ts). Part names are not mapped.
   */
  prePluginPanels?: boolean;
  /** Show the take being recorded instead of the card's kept take, for the live board. */
  includeTakeInProgress?: boolean;
  /**
   * Stop after this card: the lesson as viewers see it at the end of that
   * card, which is what the studio board shows while the card is selected.
   */
  throughCard?: string;
}

export interface CompiledLesson {
  lesson: AuthoringLesson;
  resourceContext: ResourceContext;
  /**
   * For each beat (by key), its card and when its sentences were said in the
   * take, so the take's camera movement can follow each beat's narration.
   */
  beatSpeech?: Record<string, { card: string; speechSpanMs?: [number, number]; sentences?: [number, number] }>;
  /** How many board actions play earlier than they happened, because an earlier action uses them. */
  forwarded?: number;
  /**
   * The block of a card's sequence each lesson action plays (card-script ids), by the action's
   * place in the lesson: "<step>:<beat>:<action>", counted from 1 as OLL numbers action IDs.
   */
  actionSources?: Record<string, string>;
}

/** The recorded cards of a compiled lesson, in order, each with its actions in play order across its beats. */
export function compiledCards(compiled: CompiledLesson | null | undefined): Array<{ key: string; actions: AuthoringAction[] }> {
  const cards: Array<{ key: string; actions: AuthoringAction[] }> = [];
  for (const step of compiled?.lesson.steps ?? []) {
    const key = step.key.split(CARD_PART_SEPARATOR)[0]!;
    const actions = step.beats.flatMap((beat) => beat.actions);
    // A card's later steps continue it.
    if (cards.at(-1)?.key === key) cards.at(-1)!.actions.push(...actions);
    else cards.push({ key, actions });
  }
  return cards;
}

/** One recorded card's actions in play order, across its beats. */
export function compiledCardActions(compiled: CompiledLesson | null | undefined, key: string): AuthoringAction[] {
  return compiledCards(compiled).find((card) => card.key === key)?.actions ?? [];
}

const ALIAS = /^[a-z][a-z0-9-]{0,63}$/;
const FULL_TURN = 2 * Math.PI;

function requireAlias(value: string, what: string): string {
  if (!ALIAS.test(value)) throw new CompileError(`${what} '${value}' is not a lesson alias`);
  return value;
}

/**
 * Where in a take something happened, as a rank along what the learner said:
 * sentence k spans ranks 3k (before it, only for the first sentence), 3k+1
 * (while it is said) and 3k+2 (after it, before the next one). Ranks keep the
 * recorded order of sentences and board actions, and decide the beats.
 */
export interface Sentences {
  /** Start and end of each sentence, in take time, in the order said. */
  spans: Array<[number, number]>;
  texts: string[];
}

/** The take's sentences; a take kept before sentences were stored is one sentence over its speech. */
export function sentencesOf(take: Take): Sentences {
  if (take.segments?.length) {
    const segments = [...take.segments].sort((a, b) => a.startMs - b.startMs);
    return { spans: segments.map((segment) => [segment.startMs, segment.endMs]), texts: segments.map((segment) => segment.text.trim()) };
  }
  return { spans: take.speechSpanMs ? [take.speechSpanMs] : [], texts: [take.text?.trim() ?? ""] };
}

export const DURING = 1;
export const AFTER = 2;

export function rankOf(sentences: Sentences, t: number): number {
  const { spans } = sentences;
  // No speech heard at all: everything plays while the words are said.
  if (!spans.length) return DURING;
  if (t < spans[0]![0]) return 0;
  for (let index = 0; index < spans.length; index += 1) {
    const [start, end] = spans[index]!;
    const next = spans[index + 1];
    if (t >= start && t <= end) return 3 * index + DURING;
    if (t > end && (!next || t < next[0])) return 3 * index + AFTER;
  }
  return 3 * (spans.length - 1) + AFTER;
}

/** The aliases an action refers to: its anchor, target, ends and focus. */
function referencedAliases(action: Action): string[] {
  const place = action.place as { anchor?: unknown } | undefined;
  const references = [place?.anchor, action.target, action.from, action.to, ...(Array.isArray(action.targets) ? action.targets : [])];
  return references.flatMap((reference) => (typeof reference === "string" ? [reference.split("#")[0]!] : []));
}

/**
 * Something the learner made before it was used (neat math replacing
 * writing, a card placed below it) may have no time of its own, such as ink;
 * whatever an action refers to is brought forward to that action's rank, so
 * nothing refers ahead in time.
 */
function bringReferencesForward(actions: Ranked[]): number {
  let moved = 0;
  const creators = new Map(actions.flatMap((entry) => (typeof entry.action.as === "string" ? [[entry.action.as, entry] as const] : [])));
  for (let changed = true, rounds = 0; changed && rounds < actions.length; rounds += 1) {
    changed = false;
    for (const entry of actions) {
      for (const alias of referencedAliases(entry.action)) {
        const creator = creators.get(alias);
        if (creator && creator !== entry && creator.rank > entry.rank) {
          creator.rank = entry.rank;
          changed = true;
          moved += 1;
        }
      }
    }
  }
  return moved;
}

/**
 * When a piece of writing shows, in stages: the rank at which each stage
 * happened and how many strokes (in the snapshot's order) show from then on.
 * A stroke shows only once every stroke before it was written, so moving a
 * stroke (which can reorder strokes) never shows writing early.
 */
export function inkStages(times: number[], sentences: Sentences): Array<{ rank: number; shown: number }> {
  const stages: Array<{ rank: number; shown: number }> = [];
  let reached = -1;
  times.forEach((t, index) => {
    reached = Math.max(reached, rankOf(sentences, t));
    const last = stages.at(-1);
    if (last?.rank === reached) last.shown = index + 1;
    else stages.push({ rank: reached, shown: index + 1 });
  });
  return stages;
}

/**
 * Which block of the card's sequence (see card-script) an action plays:
 * "event:<index in the take>" or "ink:<snapshot>:<first stroke>". Kept beside
 * the actions, which are copied as the lesson is put together.
 */
const sources = new WeakMap<object, string>();
function from<T extends object>(source: string | undefined, action: T): T {
  if (source) sources.set(action, source);
  return action;
}

/** An action and where it happened among the card's sentences. */
interface Ranked { action: Action; rank: number }

/** OLL's limit on actions in one beat; more continue in beats of their own. */
const MAX_BEAT_ACTIONS = 24;

/**
 * Splits a card into beats in the recorded order: one beat per sentence, so
 * captions follow the sentences and a lesson can be played from any of them,
 * with each action before, during or after the sentence it happened at. A
 * sentence with neither words nor actions (not understood, nothing done)
 * makes no beat.
 */
function cardBeats(card: RecordingCard, sentences: Sentences, ranked: Ranked[], speech: NonNullable<CompiledLesson["beatSpeech"]>): AuthoringLesson["steps"][number]["beats"] {
  const count = Math.max(1, sentences.texts.length);
  // Stable sort keeps the recorded order of actions at the same rank.
  const ordered = [...ranked].sort((a, b) => a.rank - b.rank);
  const beats: AuthoringLesson["steps"][number]["beats"] = [];
  const add = (sentence: number, say: string, actions: Action[]) => {
    const key = `${card.key}-s${beats.length + 1}`;
    const span = sentences.spans[sentence];
    speech[key] = { card: card.key, sentences: [sentence, sentence], ...(span && say ? { speechSpanMs: [span[0], span[1]] as [number, number] } : {}) };
    // Every beat after a card's first goes straight on, like the next sentence of the same talk.
    beats.push({ key, ...(say ? { say } : {}), ...(beats.length ? { pace: "continuous" as const } : {}), actions: actions as AuthoringAction[] });
  };
  for (let sentence = 0; sentence < count; sentence += 1) {
    const say = sentences.texts[sentence]?.trim() ?? "";
    const actions = ordered.filter((entry) => Math.floor(entry.rank / 3) === sentence).map((entry) => {
      const phase = entry.rank % 3;
      return from(sources.get(entry.action), { ...entry.action, when: (phase === 0 ? "before_speech" : phase === DURING ? "during_speech" : "after_speech") as Phase } as Action);
    });
    if (!say && !actions.length) continue;
    if (actions.length <= MAX_BEAT_ACTIONS) { add(sentence, say, actions); continue; }
    // Too many actions for one beat: those before the words, and those after the sentence's
    // beat is full, play in beats of their own, in the same order.
    const firstSpoken = Math.max(0, actions.findIndex((action) => action.when !== "before_speech"));
    const chunks: Action[][] = [];
    for (let index = 0; index < actions.length; index += MAX_BEAT_ACTIONS) chunks.push(actions.slice(index, index + MAX_BEAT_ACTIONS));
    const spoken = Math.min(Math.floor(firstSpoken / MAX_BEAT_ACTIONS), chunks.length - 1);
    chunks.forEach((chunk, index) => {
      if (index === spoken) add(sentence, say, chunk);
      else add(sentence, "", chunk.map((action) => from(sources.get(action), { ...action, when: index < spoken ? "before_speech" : "after_speech" } as Action)));
    });
  }
  return beats;
}

/** Card ink aliases: one card may hold several pieces of ink. */
function inkAlias(card: RecordingCard, index: number): string {
  return index === 0 ? `ink-${card.key}` : `ink-${card.key}-${index + 1}`;
}

/** A selection's fragment alias inside its ink card. */
function selectionAlias(selectionId: string, index: number): string {
  const slug = selectionId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return ALIAS.test(slug) ? slug : `sel-${index + 1}`;
}

function durationIntent(ms: number): "brief" | "normal" | "extended" {
  if (ms < 1_200) return "brief";
  if (ms < 3_500) return "normal";
  return "extended";
}

/** The named view closest to where the learner turned a 3D scene. */
function nearestPreset(yaw: number, pitch: number): "front" | "top" | "side" | "isometric" {
  if (Math.abs(pitch) > 1.1) return "top";
  const yawFromFront = Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
  if (Math.abs(pitch) < 0.3 && yawFromFront < 0.4) return "front";
  if (Math.abs(pitch) < 0.3 && Math.abs(yawFromFront - Math.PI / 2) < 0.4) return "side";
  return "isometric";
}

/** Neat math the learner confirmed for a piece of their ink, in its place or below it. */
/**
 * Neat math for a learner's handwriting: in the writing's place, or below it.
 * Writing that continued a card is a line of that card's working, so its neat
 * math lines its "=" up with the line above; neat math for part of such
 * writing continues it, just under it.
 */
function neatWrite(alias: string, latex: string, ink: string, selection: string, replacesInk: boolean,
  continued?: { drawnHeight: number }): Action {
  const place = replacesInk ? { relation: "replaces", anchor: ink, ...(continued ? { align: "equals" } : {}) }
    : continued ? { relation: "continues", anchor: ink, offset: { x: 0, y: Math.round(continued.drawnHeight + NEAT_GAP) }, align: "equals" }
      : { relation: "below", anchor: ink };
  return {
    do: "write", as: alias, kind: "math", role: "derivation",
    content: { fragments: [{ as: "formula", latex }] },
    place,
    source: { selection, confirmed_by: "learner" },
  } as Action;
}

/** A diagram of boxes joined by arrows; each box after the first may carry words on the arrow into it. */
interface Diagram { shape: "steps" | "cycle"; title: string; boxes: Array<{ label: string; link?: string }> }
/**
 * Part names Studio gave these visuals before the math plugin built them.
 * Saved recordings may point at them, so compiling maps them to the
 * builder's names.
 */
export const UNIT_CIRCLE_LEGACY_PARTS: Readonly<Record<string, string>> = {
  "point-p": "moving-point", foot: "projection-foot", circle: "unit-circle", height: "projection",
};
export const CIRCLE_POLYGON_LEGACY_PARTS: Readonly<Record<string, string>> = { origin: "center", polygon: "inscribed" };
export const GRAPH_LEGACY_PARTS: Readonly<Record<string, string>> = {
  curve: "primary-curve", current: "moving-point",
  ...Object.fromEntries([2, 3, 4, 5, 6, 7, 8].map((n) => [`curve-${n}`, functionCurveId(n - 1)])),
};
export const DIAGRAM_LEGACY_PARTS: Readonly<Record<string, string>> = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`box-${n}`, processStepId(n)])),
  ...Object.fromEntries([2, 3, 4, 5, 6, 7, 8].map((n) => [`link-${n}`, processEdgeId(n - 1)])),
  "link-close": PROCESS_CYCLE_EDGE_ID,
};

/** The most sides the studio offers a regular polygon (OLL allows 384). */
export const MAX_POLYGON_SIDES = 48;
const polygonLabel = (language: string) => (language.toLowerCase().startsWith("zh") ? "正多边形" : "regular polygon");
const sidesLabel = (language: string) => (language.toLowerCase().startsWith("zh") ? "边数" : "sides");

/** The number line panel as recorded. */
type NumberLinePanel = Extract<ComponentInsert, { panel: "number_line" }>;
/**
 * A value the learner typed for the number line: a plain number ("3", "−5",
 * "0.5") becomes a number; a fraction ("3/4", "1 1/2") stays an exact string.
 */
export function numberLinePanelValue(text: string): number | string | undefined {
  const typed = text.trim().replace(/−/gu, "-");
  if (/^-?\d+(?:\.\d+)?$/u.test(typed)) return Number(typed);
  return numberLineValue(typed) === undefined ? undefined : typed;
}
const panelNumber = (text: string) => { const value = numberLinePanelValue(text); return value === undefined ? undefined : numberLineValue(value); };

/** Number line ranges the panel offers: a span of at most 40 units, split into at most 12 parts each. */
export const NUMBER_LINE_SUBDIVISIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12] as const;
export const MAX_NUMBER_LINE_SPAN = 40;

/**
 * Why a number line panel cannot be drawn, in the learner's words, or
 * undefined when it can. The insert form and the compiler share it, so the
 * form never offers a line that would fail to compile.
 */
export function numberLinePanelProblem(panel: Pick<NumberLinePanel, "range" | "subdivisions" | "start" | "jump">): string | undefined {
  const [min, max] = panel.range;
  if (!Number.isInteger(min) || !Number.isInteger(max) || !(min < max) || max - min > MAX_NUMBER_LINE_SPAN) return tr("数轴的两端要是整数，从小到大，最多相差 {{v0}}。", { v0: MAX_NUMBER_LINE_SPAN });
  if (!(NUMBER_LINE_SUBDIVISIONS as readonly number[]).includes(panel.subdivisions)) return tr("每格分成的份数不在可选范围里。");
  if ((max - min) * panel.subdivisions > NUMBER_LINE_LIMITS.ticks) return tr("刻度太多了：请缩短数轴，或者每格少分几份。");
  const start = panel.start === undefined ? undefined : panelNumber(panel.start);
  if (panel.start !== undefined && (start === undefined || start < min || start > max)) return tr("起点要是数轴范围里的数或分数，例如 3 或 3/4。");
  if (!panel.jump) return undefined;
  if (start === undefined) return tr("要先有起点，才能画移动。");
  const by = panelNumber(panel.jump.by);
  if (by === undefined || by === 0) return tr("移动多少要是不为 0 的数或分数，例如 −5 或 1/4。");
  if (start + by < min || start + by > max) return tr("移动后要停在数轴范围里。");
  const unit = 1 / panel.subdivisions;
  // A slider lets the jump reach either end of the line; hop by hop, that must stay within the hop limit.
  const longest = panel.jump.slider ? Math.max(start - min, max - start) : Math.abs(by);
  const hops = longest / unit;
  if (panel.jump.hops && (!panel.jump.slider && Math.abs(hops - Math.round(hops)) > 1e-9 || Math.ceil(hops - 1e-9) > NUMBER_LINE_LIMITS.hops)) {
    return tr("一格一跳时，移动要是整数个小格，最多 {{v0}} 跳。", { v0: NUMBER_LINE_LIMITS.hops });
  }
  return undefined;
}

/** Labels of the number line panel, in the lesson's language. */
function numberLineLabels(language: string) {
  const zh = language.toLowerCase().startsWith("zh");
  return { start: zh ? "起点" : "start", end: zh ? "终点" : "end", move: zh ? "移动" : "move" };
}
const signedValue = (value: string) => { const text = value.trim().replace(/^-/u, "−"); return text.startsWith("−") ? text : `+${text}`; };

/** The longest run a constant-speed motion panel offers, in seconds, and its fastest speed in metres per second. */
export const MAX_MOTION_TIME = 3600;
export const MAX_MOTION_SPEED = 1000;
/** The constant-speed motion panel's labels, in the lesson's language. */
function motionText(language: string, title: string) {
  const zh = language.toLowerCase().startsWith("zh");
  return {
    title,
    start: zh ? "起点" : "start", object: zh ? "物体" : "object",
    distance_readout: zh ? "物体 s = " : "object s = ", distance_unit: "m",
    distance_axis: zh ? "路程 s（m）" : "distance s (m)", time_axis: zh ? "时间 t（s）" : "time t (s)",
    plot_title: zh ? "路程随时间变化" : "Distance against time", curve_label: "s = v t",
    current_state: zh ? "此刻" : "now", link_label: zh ? "同一时刻" : "same moment",
    group_label: zh ? "匀速运动与路程—时间图像" : "constant-speed motion and its distance–time graph",
  };
}
const motionVariableLabel = (language: string, quantity: "time" | "speed") =>
  language.toLowerCase().startsWith("zh") ? (quantity === "time" ? "时间 t" : "速度 v") : (quantity === "time" ? "time t" : "speed v");

/** The most curves the studio puts on one graph. */
export const MAX_CURVES = 4;
/** The most boxes OLL lays out as steps (and the studio offers for a cycle). */
export const MAX_DIAGRAM_BOXES = 8;

/**
 * OLL diagram content, built by the shared plugin: steps step-01…, edges
 * edge-01… from each step to the next; a cycle's last edge (edge-close) goes
 * from the newest step back to the first. Recordings saved with the older
 * box-N / link-N names are mapped (DIAGRAM_LEGACY_PARTS).
 */
function diagramContent(diagram: Diagram): Record<string, unknown> {
  // The shared plugin's builder, which Coach's AI lessons also use.
  return processDiagramContent({
    title: diagram.title,
    steps: diagram.boxes.map((box) => ({ label: box.label, ...(box.link ? { link: box.link } : {}) })),
    shape: diagram.shape === "cycle" ? "cycle" : "chain",
  });
}

const NOTE_HEADINGS: Record<"zh" | "en", Record<NoteRole, string>> = {
  zh: { conclusion: "结论", warning: "注意", summary: "小结", definition: "定义" },
  en: { conclusion: "Conclusion", warning: "Be careful", summary: "Summary", definition: "Definition" },
};
/** What a note is, as its heading in the lesson's language (lessons are recorded in Chinese or English). */
function noteHeading(role: NoteRole, language: string): string {
  return NOTE_HEADINGS[language.toLowerCase().startsWith("zh") ? "zh" : "en"][role];
}

/** The net's slider, in the lesson's language. */
function unfoldLabel(language: string): string {
  return language.toLowerCase().startsWith("zh") ? "展开" : "unfold";
}

/** The cutting plane's slider, in the lesson's language. */
function cutLabel(language: string): string {
  return language.toLowerCase().startsWith("zh") ? "切面高度" : "cut height";
}

/** A slider's step: about a hundredth of its range, rounded to 1, 2 or 5 times a power of ten. */
export function sliderStep(min: number, max: number): number {
  const raw = (max - min) / 100;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw)!;
  return Number(step.toPrecision(3));
}

/** How close (in radians) the viewer must turn a 3D scene to the direction a "Your turn" asks for. */
const VIEW_TOLERANCE = 0.3;

/** Space between handwriting that continues a card and neat math for part of it, in board units. */
const NEAT_GAP = 12;

/** Compiles one recording; the lesson still has to pass OLL validation. */
export function compileRecording(recording: LearnerRecording, options: CompileOptions): CompiledLesson {
  const variables = new Map<string, { as: string; initial: number; min: number; max: number; wrap?: true; label: string; unit?: string; control: { kind: "slider"; step: number } }>();
  const geometryPoints = new Map<string, Point[]>();
  const geometryContent = new Map<string, Record<string, unknown>>();
  // Segments between two points of a grid, and circles round one of its points.
  const geometrySegments = new Map<string, Array<Record<string, unknown>>>();
  const geometryCircles = new Map<string, Array<Record<string, unknown>>>();
  // Lines drawn across a grid: the segment and its two (hidden) end points on the grid's edges.
  const geometryLines = new Map<string, Array<{ segment: Record<string, unknown>; ends: Point[] }>>();
  const angleControlled = new Set<string>();
  const scenes = new Set<string>();
  // Each graph's content so far and the slider letters it reads, so a curve added later revises the graph.
  const graphs = new Map<string, { content: Record<string, unknown>; letters: Map<string, string> }>();
  // Each diagram's boxes so far, so adding a box revises the whole diagram.
  const diagrams = new Map<string, Diagram>();
  // Each table's content as filled so far, so filling a cell revises the whole table.
  const tables = new Map<string, { title: string; columns: string[]; rows: string[][] }>();
  const inkSelections = new Map<string, string>(); // selection id -> "ink-alias#fragment"
  // Part names a recording saved before its visual came from a plugin builder.
  const legacyParts = new Map<string, Readonly<Record<string, string>>>();
  const curveId = options.prePluginPanels ? prePluginCurveId : functionCurveId;
  const diagramContentOf = options.prePluginPanels ? prePluginDiagramContent : diagramContent;
  const inkOfSelection = new Map<string, string>(); // selection id -> ink alias
  const hidden = new Set<string>();
  // Cards written so far (in earlier cards' steps or this card's actions), which writing may continue.
  const written = new Set<string>();
  // Handwriting that continues a card, with the height it was written at.
  const continuedInk = new Map<string, { drawnHeight: number }>();
  const snapshots: NonNullable<ResourceContext["ink_snapshots"]> = [];
  const tasks: NonNullable<AuthoringLesson["lesson"]["tasks"]> = [];
  let lastNode: string | undefined;
  let lastFocus: string[] = [];

  const placeNext = (): { relation: string; anchor?: string } => {
    const anchor = lastNode && !hidden.has(lastNode) ? lastNode : undefined;
    return anchor ? { relation: "below", anchor } : { relation: "new_region" };
  };
  const target = (value: BoardTarget): string => {
    if ("inkSelection" in value) {
      const resolved = inkSelections.get(value.inkSelection);
      if (!resolved) throw new CompileError(`Selection '${value.inkSelection}' is not part of this lesson's ink`);
      return resolved;
    }
    if (!value.part) return value.node;
    return `${value.node}#${legacyParts.get(value.node)?.[value.part] ?? value.part}`;
  };
  const owner = (reference: string) => reference.split("#")[0]!;
  const pointsAtMissingInk = (value: BoardTarget) => "inkSelection" in value && !inkSelections.has(value.inkSelection);

  const insert = (component: ComponentInsert, cardTitle: string): Action | Action[] => {
    const alias = requireAlias(component.alias, "Component");
    // A component the learner did not name carries the card's title.
    const title = { title: component.title?.trim() || cardTitle };
    if (component.panel === "graph") {
      // Letters the learner made sliders read lesson variables; the curve's label keeps the letters.
      let expression = component.expression;
      for (const parameter of component.parameters ?? []) {
        if (variables.has(parameter.variable)) throw new CompileError(`Variable '${parameter.variable}' is already used`);
        if (!(parameter.min < parameter.max) || parameter.initial < parameter.min || parameter.initial > parameter.max) {
          throw new CompileError(`The slider ${parameter.letter} needs a range from a smaller to a larger number that holds its starting value`);
        }
        variables.set(parameter.variable, { as: parameter.variable, initial: parameter.initial, min: parameter.min, max: parameter.max,
          label: parameter.letter, control: { kind: "slider", step: sliderStep(parameter.min, parameter.max) } });
        expression = expression.replace(new RegExp(`(?<![A-Za-z0-9_])${parameter.letter}(?![A-Za-z0-9_])`, "g"), parameter.variable);
      }
      let linked: string | undefined;
      if (component.linkedVariable) {
        if (!variables.has(component.linkedVariable)) throw new CompileError(`Graph is linked to unknown variable '${component.linkedVariable}'`);
        linked = component.linkedVariable;
      }
      const letters = new Map((component.parameters ?? []).map((parameter) => [parameter.letter, parameter.variable]));
      if (options.prePluginPanels) {
        const content = prePluginGraphContent(expression, component.expression, component.x, component.y, linked, title);
        graphs.set(alias, { content, letters });
        return { do: "write", as: alias, kind: "plot", role: "diagram", content: structuredClone(content), place: placeNext() } as Action;
      }
      legacyParts.set(alias, GRAPH_LEGACY_PARTS);
      // The math plugin's builder, which Coach's AI lessons also use. A linked
      // graph's point follows the curve as the sliders read it.
      const built = buildFunctionPlot({
        as: alias, role: "diagram", place: placeNext(), ...title,
        axes: { x: { min: component.x[0], max: component.x[1] }, y: { min: component.y[0], max: component.y[1] } },
        curves: [{ expression, label: `y = ${component.expression}` }],
        ...(linked ? { samples: [{ x: component.x[0], y: 0, label: "now", x_expression: linked }] } : {}),
      });
      const written = built.actions[0] as Action & { content: Record<string, unknown> };
      const content = written.content;
      graphs.set(alias, { content: structuredClone(content), letters });
      return written;
    }
    if (component.panel === "coordinate_grid") {
      geometryPoints.set(alias, []);
      geometryContent.set(alias, {
        ...title,
        axes: { x: { min: component.x[0], max: component.x[1], label: "x" }, y: { min: component.y[0], max: component.y[1], label: "y" }, equal_scale: true },
      });
      // Empty when it appears; each point and line is added when the learner placed it.
      return { do: "write", as: alias, kind: "geometry", role: "diagram", content: gridContent(alias), place: placeNext() } as Action;
    }
    if (component.panel === "unit_circle") {
      const variable = component.variable;
      if (variables.has(variable)) throw new CompileError(`Variable '${variable}' is already used`);
      variables.set(variable, { as: variable, initial: 0, min: 0, max: FULL_TURN, wrap: true, label: "θ", unit: "rad", control: { kind: "slider", step: 0.01 } });
      angleControlled.add(variable);
      if (options.prePluginPanels) return prePluginUnitCircle(alias, variable, title, placeNext()) as Action;
      legacyParts.set(alias, UNIT_CIRCLE_LEGACY_PARTS);
      // The math plugin's builder, which Coach's AI lessons also use.
      return buildUnitCircle({
        as: alias, role: "diagram", place: placeNext(),
        angle: { variable, expression: variable, initial: 0 },
        text: { ...title, point_label: "P", radius_label: "1", foot_label: "" },
      }).actions[0] as Action;
    }
    if (component.panel === "text" || component.panel === "note") {
      // Words keep only a title the learner gave them: the card's title would repeat what is said.
      // A note is headed by what kind of note it is, in the lesson's language.
      const heading = component.title?.trim() || (component.panel === "note" ? noteHeading(component.role, options.language) : "");
      const named = heading ? { title: heading } : {};
      return {
        // A text card's role is its kind, so the board shows no heading the learner did not give it.
        do: "write", as: alias, kind: component.panel, role: component.panel === "note" ? component.role : "text", place: placeNext(),
        content: { ...named, text: component.text.trim() },
      } as Action;
    }
    if (component.panel === "polygon") {
      // A regular polygon in a circle of radius 1, showing its perimeter against the circle's;
      // its number of sides may be a slider the learner drags while talking.
      const sides = Math.round(component.sides);
      if (!(sides >= 3 && sides <= MAX_POLYGON_SIDES)) throw new CompileError(`A regular polygon has 3 to ${MAX_POLYGON_SIDES} sides`);
      if (component.slider) {
        if (variables.has(component.slider.variable)) throw new CompileError(`Variable '${component.slider.variable}' is already used`);
        variables.set(component.slider.variable, { as: component.slider.variable, initial: sides, min: 3, max: MAX_POLYGON_SIDES, label: sidesLabel(options.language), control: { kind: "slider", step: 1 } });
      }
      if (options.prePluginPanels) return prePluginPolygon(alias, sides, component.slider?.variable, polygonLabel(options.language), title, placeNext()) as Action;
      legacyParts.set(alias, CIRCLE_POLYGON_LEGACY_PARTS);
      // The math plugin's builder, which Coach's AI lessons also use.
      return buildCirclePolygons({
        as: alias, role: "diagram", place: placeNext(), radius: 1,
        sides: component.slider ? { expression: component.slider.variable, initial: sides } : sides,
        circumscribed: false,
        text: { ...title, inscribed_label: polygonLabel(options.language) },
      }).actions[0] as Action;
    }
    if (component.panel === "number_line") {
      // The math plugin's builder, which Coach's AI lessons also use (OLL decision 0013).
      const problem = numberLinePanelProblem(component);
      if (problem) throw new CompileError(problem);
      const [min, max] = component.range;
      const labels = numberLineLabels(options.language);
      const start = component.start === undefined ? undefined : panelNumber(component.start)!;
      const jump = component.jump;
      const by = jump ? panelNumber(jump.by)! : 0;
      if (jump?.slider) {
        if (variables.has(jump.slider.variable)) throw new CompileError(`Variable '${jump.slider.variable}' is already used`);
        // The slider reaches either end of the line from the start, never past it.
        variables.set(jump.slider.variable, { as: jump.slider.variable, initial: by, min: min - start!, max: max - start!, label: labels.move,
          control: { kind: "slider", step: 1 / component.subdivisions } });
      }
      return buildNumberLine({
        as: alias, role: "diagram", place: placeNext(), ...title,
        range: { min, max }, ticks: { step: 1, subdivisions: component.subdivisions, labels: component.subdivisions > 1 ? "all" : "major" },
        ...(start !== undefined ? { points: [
          { as: "start", value: numberLinePanelValue(component.start!)!, label: `${labels.start} ${component.start!.trim().replace(/^-/u, "−")}` },
          // Without a slider the jump ends at one value, which gets its own point.
          ...(jump && !jump.slider ? [{ as: "end", value: start + by, label: labels.end }] : []),
        ] } : {}),
        ...(jump ? { jumps: [{
          as: "move", from: "start", hops: jump.hops,
          by: jump.slider ? { expression: jump.slider.variable, initial: by } : numberLinePanelValue(jump.by)!,
          ...(jump.slider ? {} : { label: signedValue(jump.by) }),
        }] } : {}),
      }).actions as Action[];
    }
    if (component.panel === "constant_speed") {
      // The physics plugin's builder, which Coach's AI lessons also use: a track
      // and a distance–time graph, linked and grouped under the component's alias.
      const { time, speed } = component;
      if (!(time.max > 0 && time.max <= MAX_MOTION_TIME)) throw new CompileError(`A motion runs for more than 0 and at most ${MAX_MOTION_TIME} seconds`);
      if (!(speed.initial > 0 && speed.initial <= MAX_MOTION_SPEED)) throw new CompileError(`A speed is above 0 and at most ${MAX_MOTION_SPEED} m/s`);
      if (speed.slider && !(speed.slider.max >= speed.initial && speed.slider.max <= MAX_MOTION_SPEED)) {
        throw new CompileError("The speed slider's largest value must hold the starting speed");
      }
      for (const variable of [time.variable, speed.slider?.variable]) {
        if (variable && variables.has(variable)) throw new CompileError(`Variable '${variable}' is already used`);
      }
      variables.set(time.variable, { as: time.variable, initial: 0, min: 0, max: time.max, label: motionVariableLabel(options.language, "time"), unit: "s",
        control: { kind: "slider", step: sliderStep(0, time.max) } });
      if (speed.slider) {
        variables.set(speed.slider.variable, { as: speed.slider.variable, initial: speed.initial, min: 0, max: speed.slider.max,
          label: motionVariableLabel(options.language, "speed"), unit: "m/s", control: { kind: "slider", step: sliderStep(0, speed.slider.max) } });
      }
      return buildConstantSpeedMotion({
        as: alias, role: "diagram", place: placeNext(),
        time: { expression: time.variable, initial: 0, max: time.max },
        speed: speed.slider ? { expression: speed.slider.variable, initial: speed.initial, max: speed.slider.max } : { initial: speed.initial, max: speed.initial },
        text: motionText(options.language, title.title),
      }).actions as Action[];
    }
    if (component.panel === "diagram") {
      const diagram: Diagram = { shape: component.shape, title: title.title, boxes: [] };
      for (const box of component.boxes) diagram.boxes.push({ label: box.trim() });
      diagrams.set(alias, diagram);
      if (!options.prePluginPanels) legacyParts.set(alias, DIAGRAM_LEGACY_PARTS);
      return { do: "write", as: alias, kind: "diagram", role: "diagram", place: placeNext(), content: diagramContentOf(diagram) } as Action;
    }
    if (component.panel === "table") {
      const table = { ...title, columns: component.columns.map((column) => column.trim()), rows: component.rows.map((row) => row.map((cell) => cell.trim())) };
      tables.set(alias, table);
      return { do: "write", as: alias, kind: "table", role: "observation", place: placeNext(), content: structuredClone(table) } as Action;
    }
    scenes.add(alias);
    const solid = component as Extract<ComponentInsert, { panel: "solid_3d" }>;
    if (solid.cut && solid.unfold) throw new CompileError("A solid is either cut or unfolded, not both");
    if (solid.unfold && !solidUnfolds(solid)) throw new CompileError(`A ${solid.shape} has no net to unfold`);
    if ((solid.shape === "prism" || solid.shape === "pyramid") && "base" in solid && !baseCorners(solid.base)) {
      throw new CompileError("The three sides do not make a triangle");
    }
    if (solid.unfold) {
      // The net opens from 0 (the closed solid) to 1 (lying flat).
      if (variables.has(solid.unfold.variable)) throw new CompileError(`Variable '${solid.unfold.variable}' is already used`);
      variables.set(solid.unfold.variable, { as: solid.unfold.variable, initial: 0, min: 0, max: 1, label: unfoldLabel(options.language), control: { kind: "slider", step: 0.02 } });
    }
    if (solid.cut) {
      // A cutting plane across the solid, moved by a slider from its bottom to its top.
      const [bottom, top] = solidZRange(solid);
      const middle = Number(((bottom + top) / 2).toFixed(6));
      if (variables.has(solid.cut.variable)) throw new CompileError(`Variable '${solid.cut.variable}' is already used`);
      variables.set(solid.cut.variable, { as: solid.cut.variable, initial: middle, min: Number(bottom.toFixed(6)), max: Number(top.toFixed(6)), label: cutLabel(options.language),
        control: { kind: "slider", step: sliderStep(bottom, top) } });
    }
    const locale = normalizeLocale(options.language);
    // The math plugin's builder, which Coach's AI lessons can also use.
    const built = buildSolid({
      as: alias, role: "diagram", place: placeNext(), ...title, solid,
      fallback: describeSolid(solid, options.language) + (solid.unfold ? (options.language.toLowerCase().startsWith("zh") ? "拖动滑杆把它展开成平面图。" : " A slider opens it into its net.") : ""),
      face_targets: !options.legacyFaceTargets && (solid.shape !== "box" || Boolean(solid.unfold)),
      ...(solid.shape === "box" && !(options.legacyFaceTargets && solid.unfold) ? { box_faces: {
        names: { top: tr("顶面", {}, locale), bottom: tr("底面", {}, locale), front: tr("前面", {}, locale), back: tr("后面", {}, locale), left: tr("左侧面", {}, locale), right: tr("右侧面", {}, locale) },
        legacy: options.legacyFaceTargets,
      } } : {}),
      ...(solid.unfold ? { unfold: { expression: solid.unfold.variable } } : {}),
      ...(solid.cut ? { cut: { expression: solid.cut.variable } } : {}),
    }).actions[0] as Action;
    // Keep Studio's key order: a hand-edited OLL stays valid only while the
    // compiled lesson's text is unchanged (oll-override.ts).
    const { do: verb, as, kind, role, content, place } = built;
    return { do: verb, as, kind, role, place, content } as Action;
  };

  /** A grid created with no points yet keeps a hidden origin so it is a valid diagram. */
  const gridContent = (alias: string): Record<string, unknown> => {
    const lines = geometryLines.get(alias) ?? [];
    const points = [...geometryPoints.get(alias)!, ...lines.flatMap((line) => line.ends)];
    const segments = [...lines.map((line) => line.segment), ...(geometrySegments.get(alias) ?? [])];
    const circles = geometryCircles.get(alias) ?? [];
    return {
      ...geometryContent.get(alias),
      // Copies: points and lines added in later cards must not appear in earlier ones.
      points: points.length ? points.map((point) => ({ ...point })) : [{ as: "origin", x: 0, y: 0, visible: false }],
      ...(segments.length ? { segments: segments.map((segment) => ({ ...segment })) } : {}),
      ...(circles.length ? { circles: circles.map((circle) => ({ ...circle })) } : {}),
    };
  };

  // One step per card, one beat per run of the card's sentences between board actions.
  const steps: AuthoringLesson["steps"] = [];
  const beatSpeech: NonNullable<CompiledLesson["beatSpeech"]> = {};
  // How many things had to be brought ahead of when they happened, because something used them earlier.
  let forwarded = 0;
  // What the highlighter marked on the previous card: a mark belongs to the card it was made on.
  const highlighted = new Set<string>();
  let reachedLast = false;
  for (const card of recording.cards) {
    if (reachedLast) break;
    reachedLast = card.key === options.throughCard;
    const take = options.includeTakeInProgress ? currentTake(card) ?? keptTake(card) : keptTake(card);
    if (!take) continue;
    const sentences = sentencesOf(take);
    // While a card is built, an action's `when` is its rank among the sentences (see rankOf).
    const actions: Action[] = [];
    for (const marked of highlighted) {
      if (hidden.has(owner(marked))) continue;
      actions.push({ do: "emphasize", target: marked, emphasis: "none", when: 0 } as unknown as Action);
    }
    highlighted.clear();
    // Writing on a component, with the stages it was written in (when timed).
    const annotations: Array<{ action: Action; stages?: Array<{ rank: number; shown: number }>; snapshot: string }> = [];
    let focus: string[] = [];

    // Neat math confirmed in an earlier take stays in its ink's place; one
    // confirmed in this take appears when the learner confirmed it.
    const confirmedNow = new Set(take.events.flatMap((event) => (event.type === "make_neat.confirmed" ? [event.selection] : [])));
    const keptNeat: Array<{ ink: string; neat: NonNullable<CardInk["neat"]> }> = [];

    // Ink is the card's own (plus what this take froze so far); it is written
    // first and replays while the learner speaks.
    const cardInk = take.status !== "recording" ? card.ink ?? []
      : [...(take.fresh ? [] : card.ink ?? []), ...(take.ink ?? [])];
    cardInk.forEach((ink: CardInk, index) => {
      const alias = inkAlias(card, index);
      const selections = ink.selections.map((id, position) => {
        const fragment = selectionAlias(id, position);
        inkSelections.set(id, `${alias}#${fragment}`);
        inkOfSelection.set(id, alias);
        return { as: fragment, selection_id: id };
      });
      snapshots.push({ snapshot_id: ink.snapshotId, sha256: ink.sha256, selection_ids: [...ink.selections] });
      if (ink.neat && !confirmedNow.has(ink.neat.selection)) keptNeat.push({ ink: alias, neat: ink.neat });
      const content: Record<string, unknown> = {
        snapshot_id: ink.snapshotId, sha256: ink.sha256, replay: "stroke_order",
        alt: `Handwriting: ${card.title}`,
        ...(selections.length ? { selections } : {}),
      };
      // Writing timed in this take shows stroke by stroke where it was written among the words.
      const stages = ink.take === take.take && ink.strokeTimesMs?.length ? inkStages(ink.strokeTimesMs, sentences) : undefined;
      const staged = stages && stages.length > 1 ? stages : undefined;
      // Shown at the size it was written, not squeezed into a standard card.
      if (ink.drawnSize && !ink.annotates) content.drawn_size = { width: ink.drawnSize.width, height: ink.drawnSize.height };
      // Written under an earlier card's handwriting or math, it is the next line of that card, where it was written.
      const continues = ink.continues && !ink.annotates && written.has(ink.continues.node) && !hidden.has(ink.continues.node) ? ink.continues : undefined;
      if (continues) continuedInk.set(alias, { drawnHeight: ink.drawnSize?.height ?? 0 });
      if (ink.annotates) {
        const { node, ...position } = ink.annotates;
        annotations.push({
          action: { do: "write", as: alias, kind: "ink", role: "annotation", content: { ...content, annotation: position }, place: { relation: "annotates", anchor: node } } as Action,
          ...(staged ? { stages: staged } : stages ? { stages } : {}),
          snapshot: ink.snapshotId,
        });
      } else {
        const [first, ...more] = staged ?? [];
        const place = continues ? { relation: "continues", anchor: continues.node, offset: { x: continues.x, y: continues.y } } : placeNext();
        actions.push(from(stages && `ink:${ink.snapshotId}:0`, { do: "write", as: alias, kind: "ink", role: "note", content: first ? { ...content, shown_strokes: first.shown } : content,
          place, ...(stages ? { when: stages[0]!.rank } : {}) } as unknown as Action));
        let shown = first?.shown ?? 0;
        for (const stage of more) {
          actions.push(from(`ink:${ink.snapshotId}:${shown}`, { do: "revise", target: alias, content: { ...content, shown_strokes: stage.shown }, reason: "the learner wrote more", when: stage.rank } as unknown as Action));
          shown = stage.shown;
        }
        lastNode = alias;
        focus = [alias];
      }
    });

    for (const [eventIndex, event] of (take.events as RecordingEvent[]).entries()) {
      const madeBefore = actions.length;
      // On a Your turn card, dragging and turning only demonstrate the answer;
      // played back they would give it away. While the card is still being
      // recorded the board keeps showing the demonstration.
      if (card.kind === "your_turn" && take.status !== "recording" && (event.type === "variable.drag" || event.type === "view.rotate")) continue;
      const when = rankOf(sentences, event.t) as unknown as Phase;
      switch (event.type) {
        case "component.insert": {
          const made = insert(event, card.title);
          // Put next to a card in the current row: it joins that row beside it.
          const beside = event.nextTo ? { place: { relation: "right_of", anchor: event.nextTo }, role: "supporting_visual" } : {};
          // A component built from several cards (motion and its graph) places its first card; the rest follow it.
          (Array.isArray(made) ? made : [made]).forEach((action, index) => actions.push({ ...action, ...(index === 0 ? beside : {}), when } as Action));
          lastNode = event.alias;
          focus = [event.alias];
          break;
        }
        case "presenter.react":
          actions.push({ do: "expression", expression: event.expression, when } as Action);
          break;
        case "geometry.circle":
        case "geometry.segment": {
          const points = geometryPoints.get(event.node);
          if (!points) throw new CompileError(`'${event.node}' is not a coordinate grid`);
          const named = (point: string) => points.find((candidate) => candidate.as === point) ?? (() => { throw new CompileError(`'${event.node}' has no point '${point}'`); })();
          const alias = requireAlias(event.alias, event.type === "geometry.circle" ? "Circle" : "Segment");
          if (event.type === "geometry.circle") {
            if (!(event.radius > 0)) throw new CompileError("A circle needs a radius above 0");
            const center = named(event.center);
            geometryCircles.set(event.node, [...(geometryCircles.get(event.node) ?? []), { as: alias, center: center.as, radius: event.radius, label: `r = ${event.radius}` }]);
          } else {
            const a = named(event.from), b = named(event.to);
            if (a.x === b.x && a.y === b.y) throw new CompileError("A segment needs two different points");
            geometrySegments.set(event.node, [...(geometrySegments.get(event.node) ?? []), { as: alias, from: a.as, to: b.as, label: `${a.label?.split(" ")[0] ?? a.as}${b.label?.split(" ")[0] ?? b.as}`, style: "solid" }]);
          }
          actions.push({ do: "revise", target: event.node, content: gridContent(event.node), reason: event.type === "geometry.circle" ? "the learner drew a circle" : "the learner joined two points", when } as Action);
          focus = [event.node];
          break;
        }
        case "graph.add_curve": {
          const graph = graphs.get(event.node);
          if (!graph) throw new CompileError(`'${event.node}' is not a graph`);
          const curves = graph.content.curves as Array<Record<string, unknown>>;
          if (curves.length >= MAX_CURVES) throw new CompileError(`'${event.node}' already has ${MAX_CURVES} curves`);
          // OLL cannot revise a card's bindings, so a graph following an angle keeps the curve it has.
          if (graph.content.bindings) throw new CompileError(`'${event.node}' follows an angle, so it cannot take more curves`);
          const entry = parseGraphEntry(event.expression);
          if (!entry) throw new CompileError(`'${event.expression}' is not a function, a line x = … or y = …, or an equation`);
          // The graph's slider letters read the same sliders in the new curve.
          const reading = (expression: string) => {
            let read = expression;
            for (const [letter, variable] of graph.letters) read = read.replace(new RegExp(`(?<![A-Za-z0-9_])${letter}(?![A-Za-z0-9_])`, "g"), variable);
            return read;
          };
          if (entry.kind === "guide") {
            const guides = (graph.content.guides ??= []) as Array<Record<string, unknown>>;
            guides.push({ as: `guide-${guides.length + 1}`, kind: entry.axis === "x" ? "vertical_line" : "horizontal_line", value: entry.value, label: `${entry.axis} = ${entry.value}` });
          } else if (entry.kind === "equation") {
            curves.push({ as: curveId(curves.length), kind: "implicit", expression: reading(entry.expression), level: 0, label: entry.label });
          } else {
            curves.push({ as: curveId(curves.length), expression: reading(entry.expression), label: `y = ${entry.expression}` });
          }
          actions.push({ do: "revise", target: event.node, content: structuredClone(graph.content), reason: "the learner added a curve", when } as Action);
          focus = [event.node];
          break;
        }
        case "diagram.add": {
          const diagram = diagrams.get(event.node);
          if (!diagram) throw new CompileError(`'${event.node}' is not a diagram of steps or a cycle`);
          if (diagram.boxes.length >= MAX_DIAGRAM_BOXES) throw new CompileError(`'${event.node}' already has ${MAX_DIAGRAM_BOXES} boxes`);
          diagram.boxes.push({ label: event.label.trim(), ...(event.link?.trim() ? { link: event.link.trim() } : {}) });
          actions.push({ do: "revise", target: event.node, content: diagramContentOf(diagram), reason: "the learner added a box", when } as Action);
          focus = [event.node];
          break;
        }
        case "table.fill": {
          const table = tables.get(event.node);
          const row = table?.rows[event.row];
          if (!table || !row || event.column < 0 || event.column >= table.columns.length) throw new CompileError(`'${event.node}' has no cell at row ${event.row + 1}, column ${event.column + 1}`);
          row[event.column] = event.text.trim();
          actions.push({ do: "revise", target: event.node, content: structuredClone(table), reason: "the learner filled a cell", when } as Action);
          focus = [event.node];
          break;
        }
        case "point_tool.place":
        case "make_point.confirmed": {
          const points = geometryPoints.get(event.node);
          if (!points) throw new CompileError(`Points can only be placed on a coordinate grid ('${event.node}')`);
          points.push({ as: requireAlias(event.point, "Point"), x: event.x, y: event.y, label: event.label });
          actions.push({ do: "revise", target: event.node, content: gridContent(event.node), reason: "the learner placed a point", when } as Action);
          focus = [event.node];
          break;
        }
        // Pointing at writing that is no longer on the board (erased, or not frozen yet) points at nothing.
        case "tool.laser":
          if (pointsAtMissingInk(event.target)) break;
          actions.push({ do: "point", target: target(event.target), when } as Action);
          focus = [owner(target(event.target))];
          break;
        case "tool.highlighter": {
          if (pointsAtMissingInk(event.target)) break;
          const marked = target(event.target);
          actions.push({ do: "emphasize", target: marked, emphasis: event.emphasis ?? "focus", when } as Action);
          if (event.emphasis === "none") highlighted.delete(marked);
          else highlighted.add(marked);
          focus = [owner(marked)];
          break;
        }
        case "tool.arrow": {
          if (pointsAtMissingInk(event.from) || pointsAtMissingInk(event.to)) break;
          const from = target(event.from); const to = target(event.to);
          const alias = `arrow-${card.key}-${actions.filter((action) => action.do === "connect").length + 1}`;
          actions.push({ do: "connect", as: alias, from, to, relation: "points_to", ...(event.label ? { label: event.label } : {}), when } as Action);
          break;
        }
        case "variable.drag":
          if (!variables.has(event.variable)) throw new CompileError(`Unknown variable '${event.variable}'`);
          actions.push({ do: "animate", variable: event.variable, value: event.to, easing: "ease_in_out", duration_intent: durationIntent(event.durationMs), when } as Action);
          break;
        case "view.rotate":
          if (!scenes.has(event.node)) throw new CompileError(`'${event.node}' is not a 3D scene`);
          actions.push({ do: "view", target: event.node, preset: nearestPreset(event.yaw, event.pitch), when } as Action);
          focus = [event.node];
          break;
        case "make_neat.confirmed": {
          const ink = inkOfSelection.get(event.selection);
          if (!ink) throw new CompileError(`Selection '${event.selection}' is not part of this lesson's ink`);
          const alias = requireAlias(event.alias, "Formula");
          actions.push({ ...neatWrite(alias, event.latex, ink, event.selection, event.replacesInk, continuedInk.get(ink)), when } as Action);
          if (event.replacesInk) hidden.add(ink);
          lastNode = alias;
          focus = [alias];
          break;
        }
        case "line_tool.draw": {
          const points = geometryPoints.get(event.node);
          const range = (geometryContent.get(event.node)?.axes ?? undefined) as { x: { min: number; max: number }; y: { min: number; max: number } } | undefined;
          const a = points?.find((point) => point.as === event.from);
          const b = points?.find((point) => point.as === event.to);
          if (!points || !range || !a || !b) throw new CompileError(`A line needs two points of the grid '${event.node}'`);
          const ends = lineAcross(a, b, { x: [range.x.min, range.x.max], y: [range.y.min, range.y.max] });
          if (!ends) throw new CompileError(`The line through ${a.label ?? a.as} and ${b.label ?? b.as} does not cross the grid`);
          const alias = requireAlias(event.alias, "Line");
          geometryLines.set(event.node, [...(geometryLines.get(event.node) ?? []), {
            segment: { as: alias, from: `${alias}-start`, to: `${alias}-end`, label: lineLabel(a, b) },
            ends: ends.map((end, index) => ({ as: `${alias}-${index ? "end" : "start"}`, x: end.x, y: end.y, visible: false })),
          }]);
          actions.push({ do: "revise", target: event.node, content: gridContent(event.node), reason: "the learner drew a line through two points", when } as Action);
          focus = [event.node];
          break;
        }
        case "graph_it.confirmed": {
          const alias = requireAlias(event.alias, "Graph");
          const points = event.points.map((reference) => {
            const [node, point] = reference.split("#");
            const found = geometryPoints.get(node!)?.find((candidate) => candidate.as === point);
            if (!found) throw new CompileError(`Point '${reference}' does not exist`);
            return { as: found.as, x: found.x, y: found.y, label: found.label ?? found.as };
          });
          actions.push({
            do: "write", as: alias, kind: "plot", role: "diagram", when, place: placeNext(),
            content: {
              axes: { x: { min: event.x[0], max: event.x[1] }, y: { min: event.y[0], max: event.y[1] } },
              curves: [{ as: "line", expression: event.expression, label: `y = ${event.expression}` }],
              points,
            },
          } as Action);
          lastNode = alias;
          focus = [alias];
          break;
        }
        case "ink.hide":
          actions.push({ do: "hide", target: event.node, when } as Action);
          hidden.add(event.node);
          focus = focus.filter((id) => id !== event.node);
          break;
        case "your_turn.demonstrated":
        case "your_turn.check_picked":
        case "your_turn.hint_spoken":
          break;
      }
      for (const made of actions.slice(madeBefore)) from(`event:${eventIndex}`, made);
    }


    // Ink drawn on a component appears once that component is on the board.
    // Timed writing on it appears stroke by stroke, never before the component.
    for (const { action: annotation, stages, snapshot } of annotations) {
      const anchor = (annotation.place as { anchor: string }).anchor;
      const created = actions.findIndex((action) => action.do === "write" && action.as === anchor);
      const anchorRank = created < 0 ? undefined : actions[created]!.when as unknown as number | undefined;
      if (!stages) {
        actions.splice(created + 1, 0, created < 0 ? annotation : { ...annotation, when: anchorRank } as unknown as Action);
        continue;
      }
      const rankAt = (rank: number) => Math.max(rank, anchorRank ?? DURING);
      const [first, ...more] = stages;
      const content = annotation.content as Record<string, unknown>;
      actions.splice(created + 1, 0, from(`ink:${snapshot}:0`, { ...annotation, ...(more.length ? { content: { ...content, shown_strokes: first!.shown } } : {}), when: rankAt(first!.rank) } as unknown as Action));
      let shown = first!.shown;
      for (const stage of more) {
        actions.push(from(`ink:${snapshot}:${shown}`, { do: "revise", target: annotation.as, content: { ...content, shown_strokes: stage.shown }, reason: "the learner wrote more", when: rankAt(stage.rank) } as unknown as Action));
        shown = stage.shown;
      }
    }

    // Neat math kept from an earlier take replaces its ink as soon as the ink is written.
    for (const { ink, neat } of keptNeat) {
      const inkAt = actions.findIndex((action) => action.do === "write" && action.as === ink);
      const alias = requireAlias(neat.alias, "Formula");
      actions.splice(inkAt + 1, 0, { ...neatWrite(alias, neat.latex, ink, neat.selection, true, continuedInk.get(ink)), ...(actions[inkAt]?.when !== undefined ? { when: actions[inkAt]!.when } : {}) } as Action);
      hidden.add(ink);
      if (lastNode === ink) lastNode = alias;
      focus = focus.map((id) => (id === ink ? alias : id));
    }

    if (card.kind === "your_turn") {
      // The learner may set the exercise up more than once, in any of its kinds; the latest wins.
      const setups = take.events.flatMap((event, index) => (
        event.type === "your_turn.check_picked" || event.type === "your_turn.answer_set" || event.type === "your_turn.view_set" ? [{ event, index }] : []));
      const latest = setups.at(-1)?.event;
      const hints = take.events.flatMap((event) => (event.type === "your_turn.hint_spoken" ? [event.text] : []));
      const base = { as: `task-${card.key}`, prompt: take.text?.trim() || card.title, availability: { kind: "after_lesson" }, hints: hints.length ? hints : [card.title] };
      const demo = [...take.events].reverse().find((event) => event.type === "your_turn.demonstrated");
      if (latest?.type === "your_turn.check_picked" && demo?.type === "your_turn.demonstrated") {
        tasks.push({
          ...base,
          allowed_operations: [{ kind: "variable_change", variable: demo.variable, controls: angleControlled.has(demo.variable) ? ["slider", "geometry_point"] : ["slider"] }],
          completion: { kind: "expression_target", expression: latest.expression, value: latest.value, tolerance: latest.tolerance },
        } as never);
      } else if (latest?.type === "your_turn.answer_set") {
        // The answer box sits by what this card put on the board last (or the lesson's latest card).
        const anchor = [...actions].reverse().find((action) => action.do === "write" && !hidden.has(action.as))?.as
          ?? (lastNode && !hidden.has(lastNode) ? lastNode : undefined);
        if (!anchor) throw new CompileError(`"${card.title}" needs something on the board for its question to sit by`);
        tasks.push({
          ...base, anchor,
          allowed_operations: [{ kind: "answer_entry" }],
          completion: { kind: "numeric_answer", answer: latest.answer.trim(), ...(latest.unit?.trim() ? { unit: latest.unit.trim() } : {}), ...(latest.simplest ? { form: "simplest_fraction" } : {}) },
        } as never);
      } else if (latest?.type === "your_turn.view_set") {
        if (!scenes.has(latest.node)) throw new CompileError(`'${latest.node}' is not a 3D scene`);
        tasks.push({
          ...base,
          allowed_operations: [{ kind: "scene3d_view", node: latest.node, controls: ["orbit", "zoom", "preset", "reset"] }],
          completion: { kind: "scene3d_view_target", node: latest.node, match: "view_direction", yaw: latest.yaw, pitch: latest.pitch, zoom: 1,
            angular_tolerance: VIEW_TOLERANCE, zoom_tolerance: 4.8 },
        } as never);
      }
    }

    // End on one readable card: what the learner touched last, else what they last showed.
    if (!focus.length || focus.some((id) => hidden.has(id))) focus = lastFocus.filter((id) => !hidden.has(id));
    if (focus.length) {
      actions.push({ do: "focus", targets: focus, intent: "learner_card_end", when: 3 * (Math.max(1, sentences.texts.length) - 1) + AFTER } as unknown as Action);
      lastFocus = focus;
    }
    // Writing has no time of its own yet: it plays while the card's first sentence is said.
    const ranked: Ranked[] = actions.map((original) => {
      const { when, ...action } = original;
      return { action: from(sources.get(original), action as Action), rank: typeof when === "number" ? when : DURING };
    });
    forwarded += bringReferencesForward(ranked);

    // A card being recorded may have nothing on the board yet; a kept one must.
    if (!actions.length && take.status === "recording") continue;
    if (!actions.length) throw new CompileError(`Card '${card.title}' has nothing on the board`);
    for (const action of actions) if (action.do === "write") written.add(action.as);
    const beats = cardBeats(card, sentences, ranked, beatSpeech);
    for (let part = 0; part * MAX_BEATS < beats.length; part += 1) {
      steps.push({ key: part ? `${card.key}${CARD_PART_SEPARATOR}${part + 1}` : card.key, purpose: card.title, beats: beats.slice(part * MAX_BEATS, (part + 1) * MAX_BEATS) });
    }
  }
  if (!steps.length) throw new EmptyLessonError();

  const lesson: AuthoringLesson = {
    dsl: "octos.lesson",
    version: "0.1",
    profile: "authoring",
    lesson: {
      mode: "learner_taught",
      author: options.author,
      language: options.language,
      title: recording.topic.text,
      goals: recording.goals.length ? recording.goals : [recording.topic.text],
      ...(variables.size ? { variables: [...variables.values()] } : {}),
      ...(tasks.length ? { tasks } : {}),
      adaptation: { strategies: ["learner-taught", "one-card-per-step"] },
    },
    steps,
    close: { summary: recording.goals[0] ?? recording.topic.text, focus: lastFocus },
  };
  // Where each lesson action came from, by its place in the lesson (as OLL numbers actions: step:beat:action, from 1).
  const actionSources: Record<string, string> = {};
  steps.forEach((step, stepIndex) => step.beats.forEach((beat, beatIndex) => beat.actions.forEach((action, actionIndex) => {
    const source = sources.get(action);
    if (source) actionSources[`${stepIndex + 1}:${beatIndex + 1}:${actionIndex + 1}`] = source;
  })));
  return { lesson, resourceContext: { ink_snapshots: snapshots }, beatSpeech, forwarded, actionSources };
}
