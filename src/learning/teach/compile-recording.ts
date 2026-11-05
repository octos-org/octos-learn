// Turns a learner's recording into an OLL learner-taught lesson. The mapping is
// deterministic code, never a model: the same recording always gives the same
// lesson, and what the learner sees while recording is what plays back.

import type { AuthoringAction, AuthoringLesson, LessonAuthor, ResourceContext } from "octos-lesson-language";

import {
  keptTake,
  currentTake,
  type BoardTarget,
  type CardInk,
  type ComponentInsert,
  type LearnerRecording,
  type RecordingCard,
  type RecordingEvent,
  type Take,
} from "./recording";
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
      return { ...entry.action, when: (phase === 0 ? "before_speech" : phase === DURING ? "during_speech" : "after_speech") as Phase } as Action;
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
      else add(sentence, "", chunk.map((action) => ({ ...action, when: index < spoken ? "before_speech" : "after_speech" }) as Action));
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

/**
 * The box's six faces, around its centre at the origin (the view turns about
 * the origin, so the box stays put). Each is drawn only once the learner
 * highlights it, and can be tapped while it faces the viewer.
 */
function boxFaces(size: { x: number; y: number; z: number }) {
  const [hx, hy, hz] = [size.x / 2, size.y / 2, size.z / 2];
  const face = (as: string, label: string, points: Array<[number, number, number]>) =>
    ({ as, kind: "face", label, shown: "when_emphasized", points: points.map(([x, y, z]) => ({ x, y, z })) });
  const area = (a: number, b: number) => `${a} × ${b}`;
  return [
    face("top-face", `top ${area(size.x, size.y)}`, [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]),
    face("bottom-face", `bottom ${area(size.x, size.y)}`, [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]]),
    // The viewer looks from +y (OLL's "front" preset), so the front face is the +y one.
    face("front-face", `front ${area(size.x, size.z)}`, [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]),
    face("back-face", `back ${area(size.x, size.z)}`, [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]),
    face("left-face", `left ${area(size.y, size.z)}`, [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz]]),
    face("right-face", `right ${area(size.y, size.z)}`, [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]),
  ];
}

/** Neat math the learner confirmed for a piece of their ink, in its place or below it. */
function neatWrite(alias: string, latex: string, ink: string, selection: string, replacesInk: boolean): Action {
  return {
    do: "write", as: alias, kind: "math", role: "derivation",
    content: { fragments: [{ as: "formula", latex }] },
    place: replacesInk ? { relation: "replaces", anchor: ink } : { relation: "below", anchor: ink },
    source: { selection, confirmed_by: "learner" },
  } as Action;
}

/** Compiles one recording; the lesson still has to pass OLL validation. */
export function compileRecording(recording: LearnerRecording, options: CompileOptions): CompiledLesson {
  const variables = new Map<string, { as: string; initial: number; min: number; max: number; wrap?: true; label: string; unit: string; control: { kind: "slider"; step: number } }>();
  const geometryPoints = new Map<string, Point[]>();
  const geometryContent = new Map<string, Record<string, unknown>>();
  // Lines drawn across a grid: the segment and its two (hidden) end points on the grid's edges.
  const geometryLines = new Map<string, Array<{ segment: Record<string, unknown>; ends: Point[] }>>();
  const angleControlled = new Set<string>();
  const scenes = new Set<string>();
  const inkSelections = new Map<string, string>(); // selection id -> "ink-alias#fragment"
  const inkOfSelection = new Map<string, string>(); // selection id -> ink alias
  const hidden = new Set<string>();
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
    return value.part ? `${value.node}#${value.part}` : value.node;
  };
  const owner = (reference: string) => reference.split("#")[0]!;
  const pointsAtMissingInk = (value: BoardTarget) => "inkSelection" in value && !inkSelections.has(value.inkSelection);

  const insert = (component: ComponentInsert, cardTitle: string): Action => {
    const alias = requireAlias(component.alias, "Component");
    // A component the learner did not name carries the card's title.
    const title = { title: component.title?.trim() || cardTitle };
    if (component.panel === "graph") {
      const content: Record<string, unknown> = {
        ...title,
        axes: { x: { min: component.x[0], max: component.x[1] }, y: { min: component.y[0], max: component.y[1] } },
        curves: [{ as: "curve", expression: component.expression, label: `y = ${component.expression}` }],
      };
      if (component.linkedVariable) {
        if (!variables.has(component.linkedVariable)) throw new CompileError(`Graph is linked to unknown variable '${component.linkedVariable}'`);
        const variable = component.linkedVariable;
        content.points = [{ as: "current", x: component.x[0], y: 0, label: "now" }];
        content.bindings = [
          { target: "current.x", expression: variable },
          { target: "current.y", expression: component.expression.replace(/\bx\b/g, variable) },
        ];
      }
      return { do: "write", as: alias, kind: "plot", role: "diagram", content, place: placeNext() } as Action;
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
      return {
        do: "write", as: alias, kind: "geometry", role: "diagram", place: placeNext(),
        content: {
          ...title,
          axes: { x: { min: -1.25, max: 1.25, label: "x" }, y: { min: -1.25, max: 1.25, label: "y" }, equal_scale: true },
          points: [
            { as: "origin", x: 0, y: 0, label: "O" },
            { as: "point-p", x: 1, y: 0, label: "P", interaction: { kind: "angle_control", variable, center: "origin" } },
            { as: "foot", x: 1, y: 0, label: "" },
          ],
          circles: [{ as: "circle", center: "origin", radius: 1, label: "r = 1" }],
          segments: [
            { as: "radius", from: "origin", to: "point-p", label: "1", style: "solid" },
            { as: "height", from: "point-p", to: "foot", label: "sin θ", style: "projection" },
          ],
          arcs: [{ as: "angle", center: "origin", radius: 0.28, start_angle: 0, end_angle: 0, label: "θ" }],
          bindings: [
            { target: "point-p.x", expression: `cos(${variable})` },
            { target: "point-p.y", expression: `sin(${variable})` },
            { target: "foot.x", expression: `cos(${variable})` },
            { target: "angle.end_angle", expression: variable },
          ],
        },
      } as Action;
    }
    scenes.add(alias);
    return {
      do: "write", as: alias, kind: "scene3d", role: "diagram", place: placeNext(),
      content: {
        ...title,
        fallback: `A box ${component.size.x} by ${component.size.y} by ${component.size.z}.`,
        axes: false,
        camera: { yaw: 0.72, pitch: 0.55, zoom: 1 },
        objects: [{ as: "solid", kind: "box", center: { x: 0, y: 0, z: 0 }, size: component.size }],
        highlights: boxFaces(component.size),
      },
    } as Action;
  };

  /** A grid created with no points yet keeps a hidden origin so it is a valid diagram. */
  const gridContent = (alias: string): Record<string, unknown> => {
    const lines = geometryLines.get(alias) ?? [];
    const points = [...geometryPoints.get(alias)!, ...lines.flatMap((line) => line.ends)];
    return {
      ...geometryContent.get(alias),
      // Copies: points and lines added in later cards must not appear in earlier ones.
      points: points.length ? points.map((point) => ({ ...point })) : [{ as: "origin", x: 0, y: 0, visible: false }],
      ...(lines.length ? { segments: lines.map((line) => ({ ...line.segment })) } : {}),
    };
  };

  // One step per card, one beat per run of the card's sentences between board actions.
  const steps: AuthoringLesson["steps"] = [];
  const beatSpeech: NonNullable<CompiledLesson["beatSpeech"]> = {};
  // How many things had to be brought ahead of when they happened, because something used them earlier.
  let forwarded = 0;
  // What the highlighter marked on the previous card: a mark belongs to the card it was made on.
  let highlighted: string[] = [];
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
    highlighted = [];
    // Writing on a component, with the stages it was written in (when timed).
    const annotations: Array<{ action: Action; stages?: Array<{ rank: number; shown: number }> }> = [];
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
      if (ink.annotates) {
        const { node, ...position } = ink.annotates;
        annotations.push({
          action: { do: "write", as: alias, kind: "ink", role: "annotation", content: { ...content, annotation: position }, place: { relation: "annotates", anchor: node } } as Action,
          ...(staged ? { stages: staged } : stages ? { stages } : {}),
        });
      } else {
        const [first, ...more] = staged ?? [];
        actions.push({ do: "write", as: alias, kind: "ink", role: "note", content: first ? { ...content, shown_strokes: first.shown } : content,
          place: placeNext(), ...(stages ? { when: stages[0]!.rank } : {}) } as unknown as Action);
        for (const stage of more) {
          actions.push({ do: "revise", target: alias, content: { ...content, shown_strokes: stage.shown }, reason: "the learner wrote more", when: stage.rank } as unknown as Action);
        }
        lastNode = alias;
        focus = [alias];
      }
    });

    for (const event of take.events as RecordingEvent[]) {
      // On a Your turn card, dragging and turning only demonstrate the answer;
      // played back they would give it away. While the card is still being
      // recorded the board keeps showing the demonstration.
      if (card.kind === "your_turn" && take.status !== "recording" && (event.type === "variable.drag" || event.type === "view.rotate")) continue;
      const when = rankOf(sentences, event.t) as unknown as Phase;
      switch (event.type) {
        case "component.insert": {
          const action = insert(event, card.title);
          // Put next to a card in the current row: it joins that row beside it.
          const beside = event.nextTo ? { place: { relation: "right_of", anchor: event.nextTo }, role: "supporting_visual" } : {};
          actions.push({ ...action, ...beside, when } as Action);
          lastNode = event.alias;
          focus = [event.alias];
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
        case "tool.highlighter":
          if (pointsAtMissingInk(event.target)) break;
          actions.push({ do: "emphasize", target: target(event.target), emphasis: "focus", when } as Action);
          if (!highlighted.includes(target(event.target))) highlighted.push(target(event.target));
          focus = [owner(target(event.target))];
          break;
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
          actions.push({ ...neatWrite(alias, event.latex, ink, event.selection, event.replacesInk), when } as Action);
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
    }


    // Ink drawn on a component appears once that component is on the board.
    // Timed writing on it appears stroke by stroke, never before the component.
    for (const { action: annotation, stages } of annotations) {
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
      actions.splice(created + 1, 0, { ...annotation, ...(more.length ? { content: { ...content, shown_strokes: first!.shown } } : {}), when: rankAt(first!.rank) } as unknown as Action);
      for (const stage of more) {
        actions.push({ do: "revise", target: annotation.as, content: { ...content, shown_strokes: stage.shown }, reason: "the learner wrote more", when: rankAt(stage.rank) } as unknown as Action);
      }
    }

    // Neat math kept from an earlier take replaces its ink as soon as the ink is written.
    for (const { ink, neat } of keptNeat) {
      const written = actions.findIndex((action) => action.do === "write" && action.as === ink);
      const alias = requireAlias(neat.alias, "Formula");
      actions.splice(written + 1, 0, { ...neatWrite(alias, neat.latex, ink, neat.selection, true), ...(actions[written]?.when !== undefined ? { when: actions[written]!.when } : {}) } as Action);
      hidden.add(ink);
      if (lastNode === ink) lastNode = alias;
      focus = focus.map((id) => (id === ink ? alias : id));
    }

    if (card.kind === "your_turn") {
      // The learner may set the exercise up more than once; the latest wins.
      const check = [...take.events].reverse().find((event) => event.type === "your_turn.check_picked");
      const demo = [...take.events].reverse().find((event) => event.type === "your_turn.demonstrated");
      if (check && demo && check.type === "your_turn.check_picked" && demo.type === "your_turn.demonstrated") {
        const hints = take.events.flatMap((event) => (event.type === "your_turn.hint_spoken" ? [event.text] : []));
        tasks.push({
          as: `task-${card.key}`,
          prompt: take.text?.trim() || card.title,
          availability: { kind: "after_lesson" },
          allowed_operations: [{ kind: "variable_change", variable: demo.variable, controls: angleControlled.has(demo.variable) ? ["slider", "geometry_point"] : ["slider"] }],
          completion: { kind: "expression_target", expression: check.expression, value: check.value, tolerance: check.tolerance },
          hints: hints.length ? hints : [card.title],
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
    const ranked: Ranked[] = actions.map(({ when, ...action }) => ({ action: action as Action, rank: typeof when === "number" ? when : DURING }));
    forwarded += bringReferencesForward(ranked);

    // A card being recorded may have nothing on the board yet; a kept one must.
    if (!actions.length && take.status === "recording") continue;
    if (!actions.length) throw new CompileError(`Card '${card.title}' has nothing on the board`);
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
  return { lesson, resourceContext: { ink_snapshots: snapshots }, beatSpeech, forwarded };
}
