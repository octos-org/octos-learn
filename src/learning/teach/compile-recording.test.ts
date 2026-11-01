import { describe, expect, it } from "vitest";
import { assertAuthoringSchema, normalizeAuthoringLesson, reduceCanonicalEvents, validateAuthoringLesson } from "octos-lesson-language";

import { compileRecording, CompileError } from "./compile-recording";
import { appendEvent, createRecording, finishTake, planCards, startTake, type LearnerRecording, type RecordingEvent } from "./recording";

const now = "2026-10-31T12:00:00.000Z";
const author = { kind: "learner" as const, learner_ref: "learner:demo-jordan", presented_by: { avatar_ref: "avatar:fox", voice_ref: "voice:learner-warm-1" } };
const SHA = "a".repeat(64);

function record(recording: LearnerRecording, key: string, text: string, events: RecordingEvent[], extra: Parameters<typeof finishTake>[3] extends infer R ? Partial<R> : never = {}) {
  let next = startTake(recording, key, now);
  for (const event of events) next = appendEvent(next, key, event, now);
  return finishTake(next, key, now, { durationMs: 10_000, asrText: text, speechSpanMs: [500, 9_000], ...extra });
}

function check(recording: LearnerRecording) {
  const compiled = compileRecording(recording, { author, language: "en-US" });
  assertAuthoringSchema(compiled.lesson);
  validateAuthoringLesson(compiled.lesson, compiled.resourceContext);
  const events = normalizeAuthoringLesson(compiled.lesson, { lessonId: "l", boardId: "b", baseRevision: 0, resourceContext: compiled.resourceContext });
  return { ...compiled, state: reduceCanonicalEvents(events) };
}

function jordan(): LearnerRecording {
  let recording = planCards(
    createRecording({ id: "rec", now, topic: { text: "Finding slope from two points", type: "math_off_map" }, goals: ["Find the slope from any two points"] }),
    now,
    [{ title: "What is slope?" }, { title: "Pick two points" }, { title: "Rise over run" }, { title: "Check it on the graph" }],
  );
  recording = record(recording, "card-1", "Slope is how steep a line is.", [
    { t: 7_300, type: "tool.laser", target: { inkSelection: "sel-card1-steep" } },
  ], { ink: [{ snapshotId: "ink-snap:card1@v4", sha256: SHA, selections: ["sel-card1-gentle", "sel-card1-steep"] }] });
  recording = record(recording, "card-2", "Point A is at 1 comma 2, and point B is at 4 comma 8.", [
    { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
    { t: 2_100, type: "point_tool.place", node: "grid", point: "point-a", x: 1, y: 2, label: "A (1, 2)" },
    { t: 5_200, type: "point_tool.place", node: "grid", point: "point-b", x: 4, y: 8, label: "B (4, 8)" },
    { t: 6_000, type: "tool.laser", target: { node: "grid", part: "point-a" } },
  ], { ink: [{ snapshotId: "ink-snap:card2-circle@v4", sha256: SHA, selections: [], annotates: { node: "grid", x: 0.36, y: 0.59, width: 0.16, height: 0.16 } }] });
  recording = record(recording, "card-3", "Rise is 6. Run is 3. So the slope is 2.", [
    { t: 1_200, type: "tool.highlighter", target: { inkSelection: "sel-card3-rise" } },
    { t: 9_500, type: "make_neat.confirmed", selection: "sel-card3-all", latex: "m=\\dfrac{6}{3}=2", alias: "neat-fraction", replacesInk: true },
  ], { ink: [{ snapshotId: "ink-snap:card3@v4", sha256: SHA, selections: ["sel-card3-rise", "sel-card3-run", "sel-card3-all"] }] });
  recording = record(recording, "card-4", "The line goes through A and B.", [
    { t: 300, type: "graph_it.confirmed", points: ["grid#point-a", "grid#point-b"], expression: "2*x", alias: "line-plot", x: [-1, 6], y: [-1, 10] },
    { t: 6_500, type: "tool.arrow", from: { node: "neat-fraction" }, to: { node: "line-plot", part: "line" }, label: "slope 2" },
  ]);
  return recording;
}

describe("compileRecording", () => {
  it("compiles Jordan's slope lesson into a valid learner-taught lesson", () => {
    const { lesson, resourceContext, state } = check(jordan());
    expect(lesson.lesson.mode).toBe("learner_taught");
    expect(lesson.lesson.author).toEqual(author);
    expect(lesson.steps[0]!.beats.map((beat) => beat.key)).toEqual(["card-1", "card-2", "card-3", "card-4"]);
    expect(resourceContext.ink_snapshots?.map((snapshot) => snapshot.snapshot_id)).toEqual(["ink-snap:card1@v4", "ink-snap:card2-circle@v4", "ink-snap:card3@v4"]);
    const grid = state.nodes["l:node:grid"]!;
    expect((grid.content.points as Array<{ label: string }>).map((point) => point.label)).toEqual(["A (1, 2)", "B (4, 8)"]);
    expect(state.nodes["l:node:ink-card-3"]!.hidden).toBe(true);
    expect(state.nodes["l:node:neat-fraction"]!.source).toEqual({ selection: "sel-card3-all", confirmed_by: "learner" });
    expect(state.nodes["l:node:ink-card-2"]!.placement).toMatchObject({ relation: "annotates" });
  });

  it("puts each action in the speech phase it happened in", () => {
    const { lesson } = check(jordan());
    const card3 = lesson.steps[0]!.beats[2]!.actions as Array<{ do: string; when?: string }>;
    expect(card3.find((action) => action.do === "emphasize")?.when).toBe("during_speech");
    expect(card3.find((action) => action.do === "write" && (action as { kind?: string }).kind === "math")?.when).toBe("after_speech");
  });

  it("ends every card on a single target the learner touched last", () => {
    const { lesson } = check(jordan());
    const ends = lesson.steps[0]!.beats.map((beat) => (beat.actions.at(-1) as { do: string; targets?: string[] }));
    expect(ends.every((action) => action.do === "focus" && action.targets?.length === 1)).toBe(true);
    expect(ends.map((action) => action.targets![0])).toEqual(["ink-card-1", "grid", "neat-fraction", "line-plot"]);
  });

  it("compiles Riley's unit circle with variables, back-and-forth drags and a Your turn task", () => {
    let recording = planCards(
      createRecording({ id: "rec", now, topic: { text: "Unit circle and sine", type: "on_map_lit", starTopicId: "mt_x" }, goals: ["See sine on the circle"] }),
      now,
      [{ title: "The arm" }, { title: "Height is sine" }, { title: "Your turn", kind: "your_turn" }],
    );
    recording = record(recording, "card-1", "This arm is always length 1.", [
      { t: 0, type: "component.insert", panel: "unit_circle", alias: "unit-circle", variable: "theta" },
      { t: 2_600, type: "tool.laser", target: { node: "unit-circle", part: "radius" } },
    ]);
    recording = record(recording, "card-2", "Watch the height as I turn it.", [
      { t: 800, type: "variable.drag", variable: "theta", via: "geometry_point", from: 0, to: 1.2, durationMs: 2_100 },
      { t: 2_900, type: "variable.drag", variable: "theta", via: "geometry_point", from: 1.2, to: 0.6, durationMs: 800 },
      { t: 3_700, type: "variable.drag", variable: "theta", via: "geometry_point", from: 0.6, to: Math.PI / 2, durationMs: 1_700 },
      { t: 4_000, type: "component.insert", panel: "graph", alias: "sine-plot", expression: "sin(x)", x: [0, 6.3], y: [-1.2, 1.2], linkedVariable: "theta" },
    ]);
    recording = record(recording, "card-3", "Drag the point so sine equals negative 1.", [
      { t: 1_000, type: "variable.drag", variable: "theta", via: "geometry_point", from: Math.PI / 2, to: 4.7124, durationMs: 1_500 },
      { t: 3_000, type: "your_turn.demonstrated", variable: "theta", value: 4.7124 },
      { t: 3_600, type: "your_turn.check_picked", expression: "sin(theta)", value: -1, tolerance: 0.01 },
      { t: 4_800, type: "your_turn.hint_spoken", text: "Where is the point lowest?" },
    ]);
    const { lesson } = check(recording);
    expect(lesson.lesson.variables?.map((variable) => variable.as)).toEqual(["theta"]);
    const animations = lesson.steps[0]!.beats[1]!.actions.filter((action) => action.do === "animate") as Array<{ value: number; duration_intent: string }>;
    expect(animations.map((action) => [action.value, action.duration_intent])).toEqual([[1.2, "normal"], [0.6, "brief"], [Math.PI / 2, "normal"]]);
    expect(lesson.steps[0]!.beats[2]!.actions.some((action) => action.do === "animate")).toBe(false);
    expect(lesson.lesson.tasks?.[0]).toMatchObject({
      prompt: "Drag the point so sine equals negative 1.",
      allowed_operations: [{ kind: "variable_change", variable: "theta", controls: ["slider", "geometry_point"] }],
      completion: { kind: "expression_target", expression: "sin(theta)", value: -1, tolerance: 0.01 },
      hints: ["Where is the point lowest?"],
    });
  });

  it("turns a 3D box to the named view nearest where the learner left it", () => {
    let recording = planCards(
      createRecording({ id: "rec", now, topic: { text: "Surface area", type: "math_off_map" }, goals: ["Add the six faces"] }),
      now,
      [{ title: "The box" }, { title: "From above" }],
    );
    recording = record(recording, "card-1", "This box is 4 by 3 by 2.", [
      { t: 0, type: "component.insert", panel: "solid_3d", alias: "box", shape: "box", size: { x: 4, y: 3, z: 2 } },
    ]);
    recording = record(recording, "card-2", "From above it is 4 by 3.", [
      { t: 900, type: "view.rotate", node: "box", yaw: 0.1, pitch: 1.4 },
      { t: 1_500, type: "tool.highlighter", target: { node: "box", part: "top-face" } },
    ]);
    const { lesson, state } = check(recording);
    expect(lesson.steps[0]!.beats[1]!.actions[0]).toMatchObject({ do: "view", target: "box", preset: "top" });
    expect(state.nodes["l:node:box"]!.view_intent).toEqual({ preset: "top" });
  });

  it("points at a point placed on a grid in an earlier card", () => {
    const recording = record(jordan(), "card-4", "Now a third point C.", [
      { t: 500, type: "point_tool.place", node: "grid", point: "point-c", x: 2, y: 4, label: "C (2, 4)" },
      { t: 900, type: "tool.laser", target: { node: "grid", part: "point-c" } },
    ]);
    const { lesson, state } = check(recording);
    const created = lesson.steps[0]!.beats[1]!.actions.find((action) => action.do === "write" && action.as === "grid") as { content: { points: Array<{ label: string }> } };
    expect(created.content.points.map((point) => point.label)).toEqual(["A (1, 2)", "B (4, 8)"]);
    expect((state.nodes["l:node:grid"]!.content.points as Array<{ id: string; label: string }>).map((point) => [point.id, point.label])).toContainEqual(["l:node:grid:fragment:point-c", "C (2, 4)"]);
  });

  it("only compiles recorded cards and refuses ink selections the lesson does not have", () => {
    const empty = planCards(createRecording({ id: "rec", now, topic: { text: "x", type: "other" }, goals: [] }), now, [{ title: "One" }]);
    expect(() => compileRecording(empty, { author, language: "en-US" })).toThrow(CompileError);
    const bad = record(empty, "card-1", "Look here.", [{ t: 100, type: "tool.laser", target: { inkSelection: "sel-nowhere" } }]);
    expect(() => compileRecording(bad, { author, language: "en-US" })).toThrow(CompileError);
  });
});

describe("studio helpers", () => {
  it("writes the line through two points as y = m·x + b", async () => {
    const { lineThrough } = await import("./studio-helpers");
    expect(lineThrough({ x: 1, y: 2 }, { x: 4, y: 8 })).toBe("2*x");
    expect(lineThrough({ x: 0, y: 3 }, { x: 2, y: 2 })).toBe("-0.5*x+3");
    expect(lineThrough({ x: 1, y: 1 }, { x: 3, y: -3 })).toBe("-2*x+3");
    expect(lineThrough({ x: 0, y: 4 }, { x: 5, y: 4 })).toBe("4");
    expect(lineThrough({ x: 2, y: 0 }, { x: 2, y: 5 })).toBeUndefined();
  });
});

describe("Your turn demonstrations", () => {
  it("show on the board while the card records, and never in the finished lesson", () => {
    let recording = planCards(
      createRecording({ id: "rec", now, topic: { text: "Sine", type: "math_off_map" }, goals: ["Sine"] }),
      now,
      [{ title: "Circle" }, { title: "Your turn", kind: "your_turn" }],
    );
    recording = record(recording, "card-1", "A circle.", [{ t: 0, type: "component.insert", panel: "unit_circle", alias: "unit-circle", variable: "theta" }]);
    recording = appendEvent(startTake(recording, "card-2", now), "card-2",
      { t: 500, type: "variable.drag", variable: "theta", via: "geometry_point", from: 0, to: 4.7124, durationMs: 1_000 }, now);
    const live = compileRecording(recording, { author, language: "en-US", includeTakeInProgress: true });
    expect(live.lesson.steps[0]!.beats[1]!.actions.some((action) => action.do === "animate")).toBe(true);
    const finished = finishTake(recording, "card-2", now, { durationMs: 2_000, asrText: "Your turn." });
    const lesson = compileRecording(finished, { author, language: "en-US" }).lesson;
    expect(lesson.steps[0]!.beats[1]!.actions.some((action) => action.do === "animate")).toBe(false);
  });
});

describe("segmentDrag", () => {
  it("splits a drag where it reverses, keeping each move's timing", async () => {
    const { segmentDrag } = await import("./studio-helpers");
    const samples = [0, 0.4, 0.8, 1.2, 1.0, 0.6, 0.9, 1.57].map((value, index) => ({ value, at: index * 100 }));
    expect(segmentDrag(samples)).toEqual([
      { from: 0, to: 1.2, startAt: 0, endAt: 300 },
      { from: 1.2, to: 0.6, startAt: 300, endAt: 500 },
      { from: 0.6, to: 1.57, startAt: 500, endAt: 700 },
    ]);
  });

  it("splits after a pause and ignores samples that do not move", async () => {
    const { segmentDrag } = await import("./studio-helpers");
    expect(segmentDrag([{ value: 0, at: 0 }, { value: 1, at: 100 }, { value: 1, at: 300 }, { value: 2, at: 700 }, { value: 3, at: 800 }])).toEqual([
      { from: 0, to: 1, startAt: 0, endAt: 100 },
      { from: 1, to: 3, startAt: 100, endAt: 800 },
    ]);
    expect(segmentDrag([{ value: 2, at: 0 }, { value: 2, at: 500 }])).toEqual([]);
  });
});

describe("unwrapAngle", () => {
  it("reads crossing zero on a circle as a small move, within the variable's range", async () => {
    const { unwrapAngle } = await import("./studio-helpers");
    const range = { min: 0, max: 2 * Math.PI };
    expect(unwrapAngle(0, 6.27, range)).toBe(0);
    expect(unwrapAngle(6.2, 0.05, range)).toBeCloseTo(2 * Math.PI);
    expect(unwrapAngle(1.0, 1.2, range)).toBeCloseTo(1.2);
  });
});
