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

type Action = AuthoringAction & Record<string, unknown>;
type Phase = "before_speech" | "during_speech" | "after_speech";
type Point = { as: string; x: number; y: number; label?: string; visible?: boolean; interaction?: unknown };

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

export interface CompileOptions {
  author: LessonAuthor;
  language: string;
  /** Show the take being recorded instead of the card's kept take, for the live board. */
  includeTakeInProgress?: boolean;
}

export interface CompiledLesson {
  lesson: AuthoringLesson;
  resourceContext: ResourceContext;
}

const ALIAS = /^[a-z][a-z0-9-]{0,63}$/;
const FULL_TURN = 2 * Math.PI;

function requireAlias(value: string, what: string): string {
  if (!ALIAS.test(value)) throw new CompileError(`${what} '${value}' is not a lesson alias`);
  return value;
}

function phaseOf(take: Take, t: number): Phase {
  const span = take.speechSpanMs;
  if (!span) return "during_speech";
  if (t < span[0]) return "before_speech";
  if (t > span[1]) return "after_speech";
  return "during_speech";
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

function boxFaces(size: { x: number; y: number; z: number }) {
  const [hx, hy, z] = [size.x / 2, size.y / 2, size.z];
  const face = (as: string, label: string, points: Array<[number, number, number]>) =>
    ({ as, kind: "face", label, points: points.map(([x, y, pz]) => ({ x, y, z: pz })) });
  const area = (a: number, b: number) => `${a} × ${b}`;
  return [
    face("top-face", `top ${area(size.x, size.y)}`, [[-hx, -hy, z], [hx, -hy, z], [hx, hy, z], [-hx, hy, z]]),
    face("bottom-face", `bottom ${area(size.x, size.y)}`, [[-hx, -hy, 0], [hx, -hy, 0], [hx, hy, 0], [-hx, hy, 0]]),
    face("front-face", `front ${area(size.x, size.z)}`, [[-hx, -hy, 0], [hx, -hy, 0], [hx, -hy, z], [-hx, -hy, z]]),
    face("back-face", `back ${area(size.x, size.z)}`, [[-hx, hy, 0], [hx, hy, 0], [hx, hy, z], [-hx, hy, z]]),
    face("left-face", `left ${area(size.y, size.z)}`, [[-hx, -hy, 0], [-hx, hy, 0], [-hx, hy, z], [-hx, -hy, z]]),
    face("right-face", `right ${area(size.y, size.z)}`, [[hx, -hy, 0], [hx, hy, 0], [hx, hy, z], [hx, -hy, z]]),
  ];
}

/** Compiles one recording; the lesson still has to pass OLL validation. */
export function compileRecording(recording: LearnerRecording, options: CompileOptions): CompiledLesson {
  const variables = new Map<string, { as: string; initial: number; min: number; max: number; label: string; unit: string; control: { kind: "slider"; step: number } }>();
  const geometryPoints = new Map<string, Point[]>();
  const geometryContent = new Map<string, Record<string, unknown>>();
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
      return { do: "write", as: alias, kind: "geometry", role: "diagram", content: {}, place: placeNext() } as Action;
    }
    if (component.panel === "unit_circle") {
      const variable = component.variable;
      if (variables.has(variable)) throw new CompileError(`Variable '${variable}' is already used`);
      variables.set(variable, { as: variable, initial: 0, min: 0, max: FULL_TURN, label: "θ", unit: "rad", control: { kind: "slider", step: 0.01 } });
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
        objects: [{ as: "solid", kind: "box", center: { x: 0, y: 0, z: component.size.z / 2 }, size: component.size }],
        highlights: boxFaces(component.size),
      },
    } as Action;
  };

  /** A grid created with no points yet keeps a hidden origin so it is a valid diagram. */
  const gridContent = (alias: string): Record<string, unknown> => {
    const points = geometryPoints.get(alias)!;
    return {
      ...geometryContent.get(alias),
      // A copy: points placed in later cards must not appear in earlier ones.
      points: points.length ? points.map((point) => ({ ...point })) : [{ as: "origin", x: 0, y: 0, visible: false }],
    };
  };

  const steps: AuthoringLesson["steps"] = [{ key: "teach", purpose: `${recording.topic.text}: taught by the learner`, beats: [] }];
  for (const card of recording.cards) {
    const take = options.includeTakeInProgress ? currentTake(card) ?? keptTake(card) : keptTake(card);
    if (!take) continue;
    const actions: Action[] = [];
    const createdGrids: Array<{ alias: string; index: number }> = [];
    const annotations: Action[] = [];
    let focus: string[] = [];

    // Ink is the card's own; it is written first and replays while the learner speaks.
    (card.ink ?? []).forEach((ink: CardInk, index) => {
      const alias = inkAlias(card, index);
      const selections = ink.selections.map((id, position) => {
        const fragment = selectionAlias(id, position);
        inkSelections.set(id, `${alias}#${fragment}`);
        inkOfSelection.set(id, alias);
        return { as: fragment, selection_id: id };
      });
      snapshots.push({ snapshot_id: ink.snapshotId, sha256: ink.sha256, selection_ids: [...ink.selections] });
      const content: Record<string, unknown> = {
        snapshot_id: ink.snapshotId, sha256: ink.sha256, replay: "stroke_order",
        alt: `Handwriting: ${card.title}`,
        ...(selections.length ? { selections } : {}),
      };
      if (ink.annotates) {
        const { node, ...position } = ink.annotates;
        annotations.push({ do: "write", as: alias, kind: "ink", role: "annotation", content: { ...content, annotation: position }, place: { relation: "annotates", anchor: node } } as Action);
      } else {
        actions.push({ do: "write", as: alias, kind: "ink", role: "note", content, place: placeNext() } as Action);
        lastNode = alias;
        focus = [alias];
      }
    });

    for (const event of take.events as RecordingEvent[]) {
      const when = phaseOf(take, event.t);
      switch (event.type) {
        case "component.insert": {
          const action = insert(event, card.title);
          actions.push({ ...action, when } as Action);
          if (event.panel === "coordinate_grid") createdGrids.push({ alias: event.alias, index: actions.length - 1 });
          lastNode = event.alias;
          focus = [event.alias];
          break;
        }
        case "point_tool.place":
        case "make_point.confirmed": {
          const points = geometryPoints.get(event.node);
          if (!points) throw new CompileError(`Points can only be placed on a coordinate grid ('${event.node}')`);
          points.push({ as: requireAlias(event.point, "Point"), x: event.x, y: event.y, label: event.label });
          if (!createdGrids.some((grid) => grid.alias === event.node)) {
            actions.push({ do: "revise", target: event.node, content: gridContent(event.node), reason: "the learner placed a point", when } as Action);
          }
          focus = [event.node];
          break;
        }
        case "tool.laser":
          actions.push({ do: "point", target: target(event.target), when } as Action);
          focus = [owner(target(event.target))];
          break;
        case "tool.highlighter":
          actions.push({ do: "emphasize", target: target(event.target), emphasis: "focus", when } as Action);
          focus = [owner(target(event.target))];
          break;
        case "tool.arrow": {
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
          actions.push({
            do: "write", as: alias, kind: "math", role: "derivation", when,
            content: { fragments: [{ as: "formula", latex: event.latex }] },
            place: event.replacesInk ? { relation: "replaces", anchor: ink } : { relation: "below", anchor: ink },
            source: { selection: event.selection, confirmed_by: "learner" },
          } as Action);
          if (event.replacesInk) hidden.add(ink);
          lastNode = alias;
          focus = [alias];
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

    // A grid created in this card shows every point placed in it.
    for (const grid of createdGrids) actions[grid.index] = { ...actions[grid.index]!, content: gridContent(grid.alias) } as Action;

    // Ink drawn on a component appears once that component is on the board.
    for (const annotation of annotations) {
      const anchor = (annotation.place as { anchor: string }).anchor;
      const created = actions.findIndex((action) => action.do === "write" && action.as === anchor);
      actions.splice(created + 1, 0, created < 0 ? annotation : { ...annotation, when: actions[created]!.when } as Action);
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
      actions.push({ do: "focus", targets: focus, intent: "learner_card_end", when: "after_speech" } as Action);
      lastFocus = focus;
    }
    if (!actions.length) throw new CompileError(`Card '${card.title}' has nothing on the board`);
    steps[0]!.beats.push({ key: card.key, ...(take.text?.trim() ? { say: take.text.trim() } : {}), actions: actions as AuthoringAction[] });
  }
  if (!steps[0]!.beats.length) throw new CompileError("No card has been recorded yet");

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
      adaptation: { strategies: ["learner-taught", "one-card-per-beat"] },
    },
    steps,
    close: { summary: recording.goals[0] ?? recording.topic.text, focus: lastFocus },
  };
  return { lesson, resourceContext: { ink_snapshots: snapshots } };
}
