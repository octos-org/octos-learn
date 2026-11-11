import { describe, expect, it } from "vitest";
import { assertAuthoringSchema, deriveExecutionRequirements, normalizeAuthoringLesson, reduceCanonicalEvents, setLessonVariable, validateAuthoringLesson } from "octos-lesson-language";
import { HeadlessLessonPlayer } from "octos-lesson-language/player";
import { mountInfiniteBoard } from "octos-lesson-language/web-runtime";

import { compileRecording, compiledCards, CompileError, sliderStep } from "./compile-recording";
import { addTakeInk, appendEvent, createRecording, finishTake, planCards, startTake, type LearnerRecording, type RecordingEvent } from "./recording";

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
  return { ...compiled, events, state: reduceCanonicalEvents(events) };
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
    expect(lesson.steps.map((step) => step.key)).toEqual(["card-1", "card-2", "card-3", "card-4"]);
    expect(resourceContext.ink_snapshots?.map((snapshot) => snapshot.snapshot_id)).toEqual(["ink-snap:card1@v4", "ink-snap:card2-circle@v4", "ink-snap:card3@v4"]);
    const grid = state.nodes["l:node:grid"]!;
    expect((grid.content.points as Array<{ label: string }>).map((point) => point.label)).toEqual(["A (1, 2)", "B (4, 8)"]);
    expect(state.nodes["l:node:ink-card-3"]!.hidden).toBe(true);
    expect(state.nodes["l:node:neat-fraction"]!.source).toEqual({ selection: "sel-card3-all", confirmed_by: "learner" });
    expect(state.nodes["l:node:ink-card-2"]!.placement).toMatchObject({ relation: "annotates" });
  });

  it("builds the unit circle and polygon with the math plugin, mapping saved part names", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Pi", type: "math_off_map" }, goals: [] }), now, [{ title: "Circle" }]);
    recording = record(recording, "card-1", "The polygon hugs the circle.", [
      { t: 0, type: "component.insert", panel: "polygon", alias: "poly", sides: 6, slider: { variable: "n" } },
      { t: 500, type: "component.insert", panel: "unit_circle", alias: "circle", variable: "theta" },
      { t: 1_000, type: "tool.highlighter", target: { node: "poly", part: "polygon" } },
      { t: 1_500, type: "tool.highlighter", target: { node: "poly", part: "circle" } },
      { t: 2_000, type: "tool.highlighter", target: { node: "circle", part: "moving-point" } },
    ]);
    const { lesson, state } = check(recording);
    const actions = lesson.steps[0]!.beats[0]!.actions as Array<{ do: string; target?: string }>;
    expect(actions.filter((action) => action.do === "emphasize").map((action) => action.target))
      .toEqual(["poly#inscribed", "poly#circle", "circle#moving-point"]);
    const poly = state.nodes["l:node:poly"]!.content as { regular_polygons: Array<{ sides: number; relation: string }>; bindings: Array<{ target: string }> };
    expect(poly.regular_polygons.map((polygon) => [polygon.relation, polygon.sides])).toEqual([["inscribed", 6]]);
    expect(poly.bindings.map((binding) => binding.target.split(":").at(-1))).toEqual(["inscribed.sides"]);
  });

  it("builds constant-speed motion with the physics plugin: a track and its distance–time graph share time and speed", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Constant speed", type: "science" }, goals: [] }), now, [{ title: "A cart" }]);
    recording = record(recording, "card-1", "The cart moves the same distance every second.", [
      { t: 0, type: "component.insert", panel: "constant_speed", alias: "motion-1", time: { variable: "t", max: 10 }, speed: { initial: 2, slider: { variable: "v", max: 5 } } },
      { t: 1_000, type: "variable.drag", variable: "t", via: "slider", from: 0, to: 6, durationMs: 2_000 },
      { t: 4_000, type: "tool.highlighter", target: { node: "motion-1-graph", part: "primary-curve" } },
    ]);
    const { lesson, state } = check(recording);
    const actions = lesson.steps[0]!.beats[0]!.actions as Array<{ do: string; as?: string; kind?: string; target?: string }>;
    expect(actions.filter((action) => action.do === "write").map((action) => [action.as, action.kind]))
      .toEqual([["motion-1-track", "geometry"], ["motion-1-graph", "plot"]]);
    expect(actions.some((action) => action.do === "group" && action.as === "motion-1")).toBe(true);
    expect(lesson.lesson.variables?.map((variable) => [variable.as, variable.min, variable.max, variable.unit])).toEqual([["t", 0, 10, "s"], ["v", 0, 5, "m/s"]]);
    const track = state.nodes["l:node:motion-1-track"]!.content as { points: Array<{ id: string; x: number; label?: string }> };
    const cart = track.points.find((point) => point.id.endsWith(":object"))!;
    expect([cart.x, cart.label]).toEqual([12, "object s = 12 m"]);
    const graph = state.nodes["l:node:motion-1-graph"]!.content as { curves: Array<{ expression: string }>; axes: { y: { max: number } } };
    expect(graph.curves[0]!.expression).toBe("(v)*x");
    expect(graph.axes.y.max).toBe(50);
  });

  it("refuses a constant-speed motion without time or with a speed outside its slider", () => {
    const base = planCards(createRecording({ id: "rec", now, topic: { text: "Constant speed", type: "science" }, goals: [] }), now, [{ title: "A cart" }]);
    const bad = (time: number, speed: { initial: number; slider?: { variable: string; max: number } }) =>
      () => compileRecording(record(base, "card-1", "Go.", [{ t: 0, type: "component.insert", panel: "constant_speed", alias: "m", time: { variable: "t", max: time }, speed }]), { author, language: "en-US" });
    expect(bad(0, { initial: 2 })).toThrow(CompileError);
    expect(bad(10, { initial: 3, slider: { variable: "v", max: 2 } })).toThrow(CompileError);
    expect(bad(10, { initial: 0 })).toThrow(CompileError);
  });

  it("builds graphs with the math plugin, mapping saved curve and point names", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Waves", type: "math_off_map" }, goals: [] }), now, [{ title: "Graphs" }]);
    recording = record(recording, "card-1", "The point follows the wave.", [
      { t: 0, type: "component.insert", panel: "unit_circle", alias: "circle", variable: "theta" },
      { t: 100, type: "component.insert", panel: "graph", alias: "wave", expression: "sin(x)", x: [0, 6.3], y: [-1.2, 1.2], linkedVariable: "theta" },
      { t: 200, type: "component.insert", panel: "graph", alias: "lines", expression: "x", x: [-3, 3], y: [-3, 3] },
      { t: 300, type: "graph.add_curve", node: "lines", expression: "2*x" },
      { t: 1_000, type: "tool.highlighter", target: { node: "wave", part: "current" } },
      { t: 1_500, type: "tool.highlighter", target: { node: "wave", part: "curve" } },
      { t: 2_000, type: "tool.highlighter", target: { node: "lines", part: "curve-2" } },
    ]);
    const { lesson, state } = check(recording);
    const actions = lesson.steps[0]!.beats[0]!.actions as Array<{ do: string; target?: string }>;
    expect(actions.filter((action) => action.do === "emphasize").map((action) => action.target))
      .toEqual(["wave#moving-point", "wave#primary-curve", "lines#curve-02"]);
    const wave = state.nodes["l:node:wave"]!.content as { bindings: Array<{ target: string; expression: string }> };
    expect(wave.bindings.map((binding) => [binding.target.split(":").at(-1), binding.expression])).toEqual([["moving-point.x", "theta"], ["moving-point.y", "sin(theta)"]]);
    const lines = state.nodes["l:node:lines"]!.content as { curves: Array<{ id: string }> };
    expect(lines.curves.map((curve) => curve.id.split(":").at(-1))).toEqual(["primary-curve", "curve-02"]);
  });

  it("ends a card's highlights when the next card starts", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Sine", type: "math_off_map" }, goals: [] }), now, [{ title: "Circle" }, { title: "Cosine" }, { title: "More" }]);
    recording = record(recording, "card-1", "The height of P is sine.", [
      { t: 0, type: "component.insert", panel: "unit_circle", alias: "circle", variable: "theta" },
      { t: 2_000, type: "tool.highlighter", target: { node: "circle", part: "point-p" } },
      { t: 3_000, type: "tool.highlighter", target: { node: "circle", part: "point-p" } },
      { t: 3_200, type: "tool.highlighter", target: { node: "circle", part: "foot" } },
      { t: 3_400, type: "tool.highlighter", target: { node: "circle", part: "foot" }, emphasis: "none" },
    ]);
    recording = record(recording, "card-2", "Now look at the foot.", [
      { t: 1_000, type: "tool.highlighter", target: { node: "circle", part: "foot" } },
    ]);
    recording = record(recording, "card-3", "That is all.", []);
    const { lesson, state } = check(recording);
    // The recording saved Studio's older part names; they compile to the math plugin's names.
    const beats = lesson.steps.map((step) => step.beats[0]!.actions as Array<{ do: string; target?: string; emphasis?: string; when?: string }>);
    expect(beats[0]!.filter((action) => action.target === "circle#projection-foot").map((action) => action.emphasis)).toEqual(["focus", "none"]);
    expect(beats[1]!.filter((action) => action.do === "emphasize")).toEqual([
      { do: "emphasize", target: "circle#moving-point", emphasis: "none", when: "before_speech" },
      expect.objectContaining({ target: "circle#projection-foot", emphasis: "focus" }),
    ]);
    expect(beats[2]!.filter((action) => action.do === "emphasize")).toEqual([{ do: "emphasize", target: "circle#projection-foot", emphasis: "none", when: "before_speech" }]);
    const marks = (state.nodes["l:node:circle"]!.emphasis ?? []) as Array<{ target: { fragment_id?: string }; emphasis: string }>;
    const last = (part: string) => marks.filter((mark) => mark.target.fragment_id?.endsWith(`:${part}`)).at(-1)?.emphasis;
    expect([last("moving-point"), last("projection-foot")]).toEqual(["none", "none"]);
    // Up to card 2, as the studio board shows it while card 2 is selected: its mark still shows.
    const through = compileRecording(recording, { author, language: "en-US", throughCard: "card-2" });
    expect(through.lesson.steps.map((step) => step.key)).toEqual(["card-1", "card-2"]);
    const shown = reduceCanonicalEvents(normalizeAuthoringLesson(through.lesson, { lessonId: "l", boardId: "b", baseRevision: 0, resourceContext: through.resourceContext }));
    const shownMarks = (shown.nodes["l:node:circle"]!.emphasis ?? []) as Array<{ target: { fragment_id?: string }; emphasis: string }>;
    expect(shownMarks.filter((mark) => mark.target.fragment_id?.endsWith(":projection-foot")).at(-1)?.emphasis).toBe("focus");
  });

  it("plays handwriting drawn on a graph and then made neat, with the formula over the handwriting", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "The line" }]);
    recording = record(recording, "card-1", "The slope is 2.", [
      { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
      { t: 8_000, type: "make_neat.confirmed", selection: "sel-card1-all", latex: "m=2", alias: "neat", replacesInk: true },
    ], { ink: [{ snapshotId: "ink-snap:card1@v4", sha256: SHA, selections: ["sel-card1-all"], annotates: { node: "grid", x: 0.1, y: 0.7, width: 0.3, height: 0.2 } }] });
    const { lesson, resourceContext, state } = check(recording);
    expect(state.nodes["l:node:ink-card-1"]!.hidden).toBe(true);
    const host = document.createElement("div");
    document.body.append(host);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><path d="M0 40 L16 0"/></svg>';
    const mounted = mountInfiniteBoard(host, () => ({ src: "", svg, intrinsic_width: 120, intrinsic_height: 40, regions: { "sel-card1-all": { x: 0, y: 0, width: 1, height: 1 } } }));
    try {
      const player = new HeadlessLessonPlayer(normalizeAuthoringLesson(lesson, { lessonId: "l", boardId: "b", baseRevision: 0, resourceContext }));
      for (let frame = player.advance(); frame; frame = player.advance()) mounted.view.render(frame.projection.board, frame.operation);
      expect(host.querySelector('[data-id="l:node:neat"]')?.classList.contains("annotation")).toBe(true);
    } finally {
      mounted.destroy();
      host.remove();
    }
  });

  it("plays a card whose writing was made neat before the learner started talking", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "Rise over run" }]);
    recording = startTake(recording, "card-1", now);
    recording = addTakeInk(recording, "card-1", { snapshotId: "ink-snap:c1-n1@v1", sha256: SHA, selections: ["sel-n1"], neat: { selection: "sel-n1", latex: "m=2", alias: "formula-1" } }, now);
    recording = appendEvent(recording, "card-1", { t: 1_000, type: "make_neat.confirmed", selection: "sel-n1", latex: "m=2", alias: "formula-1", replacesInk: true }, now);
    recording = appendEvent(recording, "card-1", { t: 2_000, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now);
    recording = finishTake(recording, "card-1", now, { durationMs: 12_000, asrText: "Rise over run is 6 over 3.", speechSpanMs: [5_000, 11_000] });
    const { lesson, state } = check(recording);
    expect(state.nodes["l:node:formula-1"]).toBeTruthy();
    expect(state.nodes["l:node:ink-card-1"]!.hidden).toBe(true);
    const actions = lesson.steps[0]!.beats[0]!.actions as Array<{ do: string; as?: string; when?: string }>;
    expect(actions.find((action) => action.as === "ink-card-1")?.when).toBe("before_speech");
  });

  it("draws a line through two points across a grid from an earlier card, vertical lines included", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Lines", type: "math_off_map" }, goals: [] }), now, [{ title: "Points" }, { title: "Line" }]);
    recording = record(recording, "card-1", "Two points.", [
      { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
      { t: 100, type: "point_tool.place", node: "grid", point: "point-a", x: 1, y: 2, label: "A (1, 2)" },
      { t: 200, type: "point_tool.place", node: "grid", point: "point-b", x: 1, y: 8, label: "B (1, 8)" },
    ]);
    recording = record(recording, "card-2", "Straight up.", [
      { t: 600, type: "line_tool.draw", node: "grid", from: "point-a", to: "point-b", alias: "line-1" },
      { t: 900, type: "tool.laser", target: { node: "grid", part: "line-1" } },
    ]);
    const { lesson, state } = check(recording);
    const card2 = lesson.steps[1]!.beats[0]!.actions as Array<Record<string, unknown>>;
    expect(card2[0]).toMatchObject({ do: "revise", target: "grid", content: { segments: [{ as: "line-1", label: "x = 1" }] } });
    expect(card2[1]).toMatchObject({ do: "point", target: "grid#line-1" });
    expect((state.nodes["l:node:grid"]!.content.points as Array<{ id: string; x: number; y: number }>).filter((point) => /line-1-(start|end)$/.test(point.id)).map(({ x, y }) => [x, y])).toEqual([[1, -1], [1, 9]]);
    // The first card still shows the grid without the line.
    expect((lesson.steps[0]!.beats[0]!.actions[0] as { content: Record<string, unknown> }).content.segments).toBeUndefined();
  });

  it("puts each action in the speech phase it happened in", () => {
    const { lesson } = check(jordan());
    const card3 = lesson.steps[2]!.beats[0]!.actions as Array<{ do: string; when?: string }>;
    expect(card3.find((action) => action.do === "emphasize")?.when).toBe("during_speech");
    expect(card3.find((action) => action.do === "write" && (action as { kind?: string }).kind === "math")?.when).toBe("after_speech");
  });

  it("keeps the recorded order of sentences and board actions within a card", () => {
    let recording = planCards(
      createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }),
      now, [{ title: "Two points" }],
    );
    // Said: s1 (0–1 s), s2 (2–3 s), s3 (4–5 s), s4 (6–7 s). Done: insert during s1, a point in the
    // pause after s1, another point during s2, nothing around s3, a laser after the last sentence.
    recording = record(recording, "card-1", "", [
      { t: 500, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
      { t: 1_500, type: "point_tool.place", node: "grid", point: "point-a", x: 1, y: 2, label: "A" },
      { t: 2_500, type: "point_tool.place", node: "grid", point: "point-b", x: 4, y: 8, label: "B" },
      { t: 8_000, type: "tool.laser", target: { node: "grid", part: "point-b" } },
    ], {
      asrText: "Here is a grid. Point B. It goes up. Then right.",
      speechSpanMs: [0, 7_000],
      segments: [
        { startMs: 0, endMs: 1_000, text: "Here is a grid." },
        { startMs: 2_000, endMs: 3_000, text: "Point B." },
        { startMs: 4_000, endMs: 5_000, text: "It goes up." },
        { startMs: 6_000, endMs: 7_000, text: "Then right." },
      ],
    });
    const { lesson, beatSpeech } = check(recording);
    const beats = lesson.steps[0]!.beats.map((beat) => ({
      say: beat.say,
      actions: (beat.actions as Array<{ do: string; when?: string; content?: { points: Array<{ label?: string }> } }>)
        .map((action) => `${action.when}:${action.do}${action.do === "revise" ? `:${action.content!.points.length}` : ""}`),
    }));
    // One beat per sentence; each action before, during or after the sentence it happened at.
    expect(beats).toEqual([
      { say: "Here is a grid.", actions: ["during_speech:write", "after_speech:revise:1"] },
      { say: "Point B.", actions: ["during_speech:revise:2"] },
      { say: "It goes up.", actions: [] },
      { say: "Then right.", actions: ["after_speech:point", "after_speech:focus"] },
    ]);
    expect(lesson.steps[0]!.beats.map((beat) => beat.key)).toEqual(["card-1-s1", "card-1-s2", "card-1-s3", "card-1-s4"]);
    expect(beatSpeech).toMatchObject({
      "card-1-s1": { card: "card-1", sentences: [0, 0], speechSpanMs: [0, 1_000] },
      "card-1-s2": { card: "card-1", sentences: [1, 1], speechSpanMs: [2_000, 3_000] },
      "card-1-s4": { card: "card-1", sentences: [3, 3], speechSpanMs: [6_000, 7_000] },
    });
  });

  it("plays actions before the first sentence before it, and leaves out untyped sentences' words", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }), now, [{ title: "Grid" }]);
    recording = record(recording, "card-1", "", [
      { t: 100, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
      { t: 1_500, type: "point_tool.place", node: "grid", point: "point-a", x: 1, y: 2, label: "A" },
    ], {
      asrText: "Look.", speechSpanMs: [1_000, 3_000],
      segments: [{ startMs: 1_000, endMs: 2_000, text: "", failed: true }, { startMs: 2_500, endMs: 3_000, text: "Look." }],
    });
    const beats = check(recording).lesson.steps[0]!.beats;
    // The sentence that was not understood has no words; its point still comes before "Look.".
    expect(beats.map((beat) => [beat.say, beat.actions.map((action) => `${action.when}:${action.do}`)])).toEqual([
      [undefined, ["before_speech:write", "during_speech:revise"]],
      ["Look.", ["after_speech:focus"]],
    ]);
  });

  it("continues a card that switches between talking and the board more often than a lesson step holds", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }), now, [{ title: "Grid" }, { title: "Next" }]);
    const segments = Array.from({ length: 14 }, (_, index) => ({ startMs: index * 1_000, endMs: index * 1_000 + 500, text: `Point ${index}.` }));
    recording = record(recording, "card-1", "", [
      { t: 100, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 20], y: [-1, 20] },
      ...segments.slice(1).map((segment, index) => ({ t: segment.startMs + 100, type: "point_tool.place" as const, node: "grid", point: `p-${index}`, x: index, y: index, label: `P${index}` })),
    ], { asrText: "x", speechSpanMs: [0, 13_500], segments });
    recording = record(recording, "card-2", "Done.", [{ t: 100, type: "tool.laser", target: { node: "grid" } }]);
    const compiled = check(recording);
    expect(compiled.lesson.steps.map((step) => [step.key, step.beats.length])).toEqual([["card-1", 12], ["card-1-part2", 2], ["card-2", 1]]);
    expect(compiledCards(compiled).map((card) => card.key)).toEqual(["card-1", "card-2"]);
  });

  it("writes a card's handwriting stroke by stroke where it was written among the words", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }), now, [{ title: "Rise over run" }]);
    // Strokes 1–2 written while sentence 1 is said, stroke 3 in the pause, 4–5 during sentence 2.
    recording = record(recording, "card-1", "", [], {
      asrText: "Rise is six. Run is three.", speechSpanMs: [0, 3_000],
      segments: [{ startMs: 0, endMs: 1_000, text: "Rise is six." }, { startMs: 2_000, endMs: 3_000, text: "Run is three." }],
      ink: [{ snapshotId: "ink-snap:card1@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [200, 600, 1_500, 2_100, 2_400] }],
    });
    const { lesson } = check(recording);
    const beats = lesson.steps[0]!.beats.map((beat) => [beat.say, beat.actions.map((action) => {
      const shown = (action as { content?: { shown_strokes?: number } }).content?.shown_strokes;
      return `${action.when}:${action.do}${shown ? `:${shown}` : ""}`;
    })]);
    expect(beats).toEqual([
      ["Rise is six.", ["during_speech:write:2", "after_speech:revise:3"]],
      ["Run is three.", ["during_speech:revise:5", "after_speech:focus"]],
    ]);
  });

  it("says which recorded action or stage of writing each lesson action plays", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }), now, [{ title: "A" }]);
    recording = record(recording, "card-1", "", [
      { t: 500, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
      { t: 2_500, type: "tool.laser", target: { node: "grid" } },
    ], {
      asrText: "One. Two.", speechSpanMs: [0, 3_000],
      segments: [{ startMs: 0, endMs: 1_000, text: "One." }, { startMs: 2_000, endMs: 3_000, text: "Two." }],
      ink: [{ snapshotId: "ink-snap:w@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [200, 2_200, 2_300] }],
    });
    const { lesson, actionSources } = check(recording);
    const placed = lesson.steps[0]!.beats.flatMap((beat, beatIndex) => beat.actions.map((action, actionIndex) => [action.do, actionSources![`1:${beatIndex + 1}:${actionIndex + 1}`]]));
    expect(placed).toEqual([
      ["write", "ink:ink-snap:w@v1:0"], ["write", "event:0"],
      ["revise", "ink:ink-snap:w@v1:1"], ["point", "event:1"], ["focus", undefined],
    ]);
  });

  it("never shows a stroke before every stroke drawn ahead of it, and leaves untimed writing whole", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }), now, [{ title: "A" }]);
    // Stroke 2 (by order) was drawn last, after sentence 2 started: strokes 2 and 3 wait for it.
    recording = record(recording, "card-1", "", [], {
      asrText: "One. Two.", speechSpanMs: [0, 3_000],
      segments: [{ startMs: 0, endMs: 1_000, text: "One." }, { startMs: 2_000, endMs: 3_000, text: "Two." }],
      ink: [
        { snapshotId: "ink-snap:a@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [200, 2_500, 300] },
        { snapshotId: "ink-snap:b@v1", sha256: SHA, selections: [] },
      ],
    });
    const actions = compiledCards(check(recording)).at(0)!.actions as Array<{ do: string; as?: string; target?: string; content?: { shown_strokes?: number } }>;
    expect(actions.filter((action) => action.as === "ink-card-1" || action.target === "ink-card-1").map((action) => [action.do, action.content?.shown_strokes]))
      .toEqual([["write", 1], ["revise", 3]]);
    expect(actions.find((action) => action.as === "ink-card-1-2")!.content!.shown_strokes).toBeUndefined();
  });

  it("writes handwriting on a component stroke by stroke, never before the component", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Slope", type: "math_off_map" }, goals: ["Read slope"] }), now, [{ title: "A" }]);
    recording = record(recording, "card-1", "", [
      { t: 1_500, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-1, 6], y: [-1, 9] },
    ], {
      asrText: "One. Two.", speechSpanMs: [0, 3_000],
      segments: [{ startMs: 0, endMs: 1_000, text: "One." }, { startMs: 2_000, endMs: 3_000, text: "Two." }],
      ink: [{ snapshotId: "ink-snap:circle@v1", sha256: SHA, selections: [], take: 1, strokeTimesMs: [1_600, 2_200],
        annotates: { node: "grid", x: 0.3, y: 0.5, width: 0.1, height: 0.1 } }],
    });
    const beats = check(recording).lesson.steps[0]!.beats.map((beat) => beat.actions.map((action) => `${action.when}:${action.do}`));
    expect(beats).toEqual([["after_speech:write", "after_speech:write"], ["during_speech:revise", "after_speech:focus"]]);
  });

  it("ends every card on a single target the learner touched last", () => {
    const { lesson } = check(jordan());
    const ends = lesson.steps.map((step) => (step.beats[0]!.actions.at(-1) as { do: string; targets?: string[] }));
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
    const animations = lesson.steps[1]!.beats[0]!.actions.filter((action) => action.do === "animate") as Array<{ value: number; duration_intent: string }>;
    expect(animations.map((action) => [action.value, action.duration_intent])).toEqual([[1.2, "normal"], [0.6, "brief"], [Math.PI / 2, "normal"]]);
    expect(lesson.steps[2]!.beats[0]!.actions.some((action) => action.do === "animate")).toBe(false);
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
    expect(lesson.steps[1]!.beats[0]!.actions[0]).toMatchObject({ do: "view", target: "box", preset: "top" });
    expect(state.nodes["l:node:box"]!.view_intent).toEqual({ preset: "top" });
    // The box turns about its own centre; its faces show only once highlighted, and the front faces the viewer (+y).
    const box = lesson.steps[0]!.beats[0]!.actions[0] as unknown as { content: { objects: Array<{ center: object }>; highlights: Array<{ as: string; shown: string; points: Array<{ y: number; z: number }> }> } };
    expect(box.content.objects[0]!.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(box.content.highlights.every((face) => face.shown === "when_emphasized")).toBe(true);
    const face = (as: string) => box.content.highlights.find((candidate) => candidate.as === as)!.points;
    expect(face("front-face").every((point) => point.y === 1.5)).toBe(true);
    expect(face("top-face").every((point) => point.z === 1)).toBe(true);
  });

  it("points at a point placed on a grid in an earlier card", () => {
    const recording = record(jordan(), "card-4", "Now a third point C.", [
      { t: 500, type: "point_tool.place", node: "grid", point: "point-c", x: 2, y: 4, label: "C (2, 4)" },
      { t: 900, type: "tool.laser", target: { node: "grid", part: "point-c" } },
    ]);
    const { lesson, state } = check(recording);
    // The grid appears empty, then each point when the learner placed it.
    const card2 = lesson.steps[1]!.beats[0]!.actions as Array<{ do: string; as?: string; target?: string; content?: { points: Array<{ label?: string; visible?: boolean }> } }>;
    const labels = (action: (typeof card2)[number]) => action.content!.points.filter((point) => point.visible !== false).map((point) => point.label);
    expect(card2.filter((action) => action.as === "grid" || action.target === "grid").map((action) => [action.do, labels(action)]))
      .toEqual([["write", []], ["revise", ["A (1, 2)"]], ["revise", ["A (1, 2)", "B (4, 8)"]]]);
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
    expect(live.lesson.steps[1]!.beats[0]!.actions.some((action) => action.do === "animate")).toBe(true);
    const finished = finishTake(recording, "card-2", now, { durationMs: 2_000, asrText: "Your turn." });
    const lesson = compileRecording(finished, { author, language: "en-US" }).lesson;
    expect(lesson.steps[1]!.beats[0]!.actions.some((action) => action.do === "animate")).toBe(false);
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

  it("lets a wrapping angle turn on past a full turn, recorded as steps under half a turn within the range", async () => {
    const { unwrapAngle, wrapDrag, segmentDrag } = await import("./studio-helpers");
    const turn = 2 * Math.PI;
    const range = { min: 0, max: turn, wrap: true as const };
    // Left at 2π, the point is dragged on counterclockwise to 0.95.
    expect(unwrapAngle(6.27, 0.08, range)).toBeCloseTo(0.08 + turn);
    const moves = wrapDrag(segmentDrag([{ value: 6.27, at: 0 }, { value: 6.27 + 0.5, at: 200 }, { value: 0.95 + turn, at: 400 }]), range);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.from).toBeCloseTo(6.27);
    expect(moves[0]!.to).toBeCloseTo(0.95);
    // Most of a turn by the slider, down from 6.0 to 0.5: two steps, both going down.
    const long = wrapDrag([{ from: 6, to: 0.5, startAt: 0, endAt: 1000 }], range);
    expect(long.map((move) => [+move.from.toFixed(2), +move.to.toFixed(2)])).toEqual([[6, 3.25], [3.25, 0.5]]);
    expect(long.map((move) => move.endAt)).toEqual([500, 1000]);
  });
});

describe("a worked solution grows in one card where it was written", () => {
  /** 3x + 5 = 20 made neat; −5 and 3x = 15 written under it; x = 5 written and made neat under that. */
  function equation(continuesAnchor = "problem"): LearnerRecording {
    let recording = planCards(
      createRecording({ id: "rec", now, topic: { text: "Solve 3x + 5 = 20", type: "math_off_map" }, goals: ["Solve it"] }),
      now, [{ title: "The problem" }, { title: "Take away 5" }, { title: "Divide by 3" }],
    );
    recording = record(recording, "card-1", "Here is the problem.", [
      { t: 2_000, type: "make_neat.confirmed", selection: "sel-c1", latex: "3x+5=20", alias: "problem", replacesInk: true },
    ], { ink: [{ snapshotId: "ink-snap:c1@v1", sha256: SHA, selections: ["sel-c1"], drawnSize: { width: 300, height: 70 } }] });
    recording = record(recording, "card-2", "Take five away from both sides.", [], {
      ink: [{ snapshotId: "ink-snap:c2@v1", sha256: SHA, selections: [], drawnSize: { width: 260, height: 110 }, continues: { node: continuesAnchor, x: 10, y: 90 } }],
    });
    recording = record(recording, "card-3", "Divide by three.", [
      { t: 3_000, type: "make_neat.confirmed", selection: "sel-c3", latex: "x=5", alias: "answer", replacesInk: true },
    ], { ink: [{ snapshotId: "ink-snap:c3@v1", sha256: SHA, selections: ["sel-c3"], drawnSize: { width: 120, height: 60 }, continues: { node: "ink-card-2", x: 60, y: 120 } }] });
    return recording;
  }

  it("continues the card at the offset it was written, at its drawn size, and lines up the neat '='", () => {
    const { state, lesson } = check(equation());
    expect(state.nodes["l:node:ink-card-2"]!.placement).toEqual({ relation: "continues", anchor: "l:node:problem", offset: { x: 10, y: 90 } });
    expect(state.nodes["l:node:ink-card-2"]!.content).toMatchObject({ drawn_size: { width: 260, height: 110 } });
    expect(state.nodes["l:node:ink-card-3"]!.placement).toMatchObject({ relation: "continues", anchor: "l:node:ink-card-2", offset: { x: 60, y: 120 } });
    expect(state.nodes["l:node:answer"]!.placement).toEqual({ relation: "replaces", anchor: "l:node:ink-card-3", align: "equals" });
    // The first card's own handwriting was not a continuation: its neat math simply replaces it.
    expect(state.nodes["l:node:problem"]!.placement).toEqual({ relation: "replaces", anchor: "l:node:ink-card-1" });
    expect(lesson.lesson.author).toBeDefined();
  });

  it("writes a card of its own when the card it continued is no longer in the lesson", () => {
    const { state } = check(equation("gone"));
    expect(state.nodes["l:node:ink-card-2"]!.placement).toMatchObject({ relation: "below" });
  });
});

describe("words on the board: text, notes and tables", () => {
  it("writes a text card, a note with its meaning, and a table whose cells are filled while talking", () => {
    let recording = planCards(
      createRecording({ id: "rec", now, topic: { text: "States of matter", type: "other" }, goals: ["Tell solids, liquids and gases apart"] }),
      now, [{ title: "Three states" }],
    );
    recording = record(recording, "card-1", "Matter comes in three states. Ice is a solid. Water is a liquid.", [
      { t: 500, type: "component.insert", panel: "text", alias: "text-1", text: " Matter comes in three states. " },
      { t: 1_500, type: "component.insert", panel: "table", alias: "table-1", columns: ["State", "Example"], rows: [["Solid", ""], ["Liquid", ""]] },
      { t: 4_000, type: "table.fill", node: "table-1", row: 0, column: 1, text: "Ice" },
      { t: 6_000, type: "table.fill", node: "table-1", row: 1, column: 1, text: "Water" },
      { t: 8_000, type: "component.insert", panel: "note", alias: "note-1", role: "conclusion", text: "Heat changes the state." },
    ]);
    const { state } = check(recording);
    expect(state.nodes["l:node:text-1"]).toMatchObject({ kind: "text", content: { text: "Matter comes in three states." } });
    expect(state.nodes["l:node:text-1"]!.content.title).toBeUndefined();
    expect(state.nodes["l:node:note-1"]).toMatchObject({ kind: "note", role: "conclusion", content: { title: "Conclusion", text: "Heat changes the state." } });
    expect(state.nodes["l:node:table-1"]!.content).toEqual({ title: "Three states", columns: ["State", "Example"], rows: [["Solid", "Ice"], ["Liquid", "Water"]] });
  });

  it("refuses to fill a cell that is not in the table", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Tables", type: "other" }, goals: [] }), now, [{ title: "One" }]);
    recording = record(recording, "card-1", "A table.", [
      { t: 500, type: "component.insert", panel: "table", alias: "table-1", columns: ["A"], rows: [["x"]] },
      { t: 900, type: "table.fill", node: "table-1", row: 3, column: 0, text: "y" },
    ]);
    expect(() => compileRecording(recording, { author, language: "en-US" })).toThrow(CompileError);
  });
});

describe("diagrams of steps and cycles", () => {
  it("joins the boxes in order, closes a cycle back to the first box, and grows while talking", () => {
    let recording = planCards(
      createRecording({ id: "rec", now, topic: { text: "The water cycle", type: "other" }, goals: ["Follow water round the cycle"] }),
      now, [{ title: "Round and round" }],
    );
    recording = record(recording, "card-1", "Water evaporates, forms clouds and falls as rain.", [
      { t: 500, type: "component.insert", panel: "diagram", alias: "diagram-1", shape: "cycle", boxes: ["Sea", "Water vapour", "Clouds"] },
      { t: 6_000, type: "diagram.add", node: "diagram-1", label: "Rain", link: "falls" },
      { t: 7_000, type: "tool.highlighter", target: { node: "diagram-1", part: "box-4" } },
    ]);
    const { state } = check(recording);
    const content = state.nodes["l:node:diagram-1"]!.content as { title: string; elements: Array<{ label: string }>; edges: Array<{ id: string; from: string; to: string; label?: string }> };
    expect(content.title).toBe("Round and round");
    expect(content.elements.map((element) => element.label)).toEqual(["Sea", "Water vapour", "Clouds", "Rain"]);
    // Steps are named by the shared plugin's builder; the highlight above saved Studio's older "box-4".
    const box = (n: number) => `l:node:diagram-1:fragment:step-0${n}`;
    expect(content.edges.map((edge) => [edge.from, edge.to, edge.label ?? ""])).toEqual([
      [box(1), box(2), ""], [box(2), box(3), ""], [box(3), box(4), "falls"], [box(4), box(1), ""],
    ]);
    const marks = (state.nodes["l:node:diagram-1"]!.emphasis ?? []) as Array<{ target: { fragment_id?: string } }>;
    expect(marks.map((mark) => mark.target.fragment_id)).toContain(box(4));

    let steps = planCards(createRecording({ id: "rec", now, topic: { text: "Steps", type: "other" }, goals: [] }), now, [{ title: "How" }]);
    steps = record(steps, "card-1", "First this, then that.", [
      { t: 500, type: "component.insert", panel: "diagram", alias: "diagram-1", shape: "steps", boxes: ["Mix", "Heat"] },
    ]);
    const stepEdges = (check(steps).state.nodes["l:node:diagram-1"]!.content as { edges: unknown[] }).edges;
    expect(stepEdges).toHaveLength(1);
  });
});

describe("Your turn beyond dragging: answer a number, turn a 3D shape", () => {
  function practice(events: RecordingEvent[]) {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Box", type: "math_off_map" }, goals: ["Surface area"] }), now,
      [{ title: "The box" }, { title: "Your turn", kind: "your_turn" }]);
    recording = record(recording, "card-1", "Here is a box.", [
      { t: 500, type: "component.insert", panel: "solid_3d", alias: "box-1", shape: "box", size: { x: 4, y: 3, z: 2 } },
    ]);
    return record(recording, "card-2", "How big is the top face?", [
      { t: 500, type: "component.insert", panel: "text", alias: "text-1", text: "Top face area = ?" },
      ...events,
    ]);
  }

  it("asks for a number by the card's last board item, with its unit and form", () => {
    const { lesson } = check(practice([
      { t: 1_000, type: "your_turn.answer_set", answer: "12", unit: "cm²" },
      { t: 1_200, type: "your_turn.hint_spoken", text: "Length times width." },
    ]));
    expect(lesson.lesson.tasks).toEqual([expect.objectContaining({
      anchor: "text-1", prompt: "How big is the top face?", allowed_operations: [{ kind: "answer_entry" }],
      completion: { kind: "numeric_answer", answer: "12", unit: "cm²" }, hints: ["Length times width."],
    })]);
  });

  it("asks to turn the shape to a direction, and the latest setup wins", () => {
    const { lesson } = check(practice([
      { t: 1_000, type: "your_turn.answer_set", answer: "3/4", simplest: true },
      { t: 2_000, type: "your_turn.view_set", node: "box-1", yaw: 0, pitch: 1.5 },
    ]));
    expect(lesson.lesson.tasks).toEqual([expect.objectContaining({
      allowed_operations: [{ kind: "scene3d_view", node: "box-1", controls: ["orbit", "zoom", "preset", "reset"] }],
      completion: expect.objectContaining({ kind: "scene3d_view_target", node: "box-1", match: "view_direction", yaw: 0, pitch: 1.5 }),
    })]);
    const answered = check(practice([{ t: 2_000, type: "your_turn.view_set", node: "box-1", yaw: 0, pitch: 1.5 }, { t: 3_000, type: "your_turn.answer_set", answer: "3/4", simplest: true }]));
    expect(answered.lesson.lesson.tasks![0]!.completion).toEqual({ kind: "numeric_answer", answer: "3/4", form: "simplest_fraction" });
  });
});

describe("graphs with sliders", () => {
  it("makes each letter the learner chose a slider the curve reads, and dragging it animates the curve", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Vertex form", type: "math_off_map" }, goals: ["Move a parabola"] }), now, [{ title: "Move it" }]);
    recording = record(recording, "card-1", "Change h and k to move the parabola.", [
      { t: 500, type: "component.insert", panel: "graph", alias: "graph-1", expression: "(x-h)^2+k", x: [-6, 6], y: [-6, 10],
        parameters: [{ letter: "h", variable: "h", initial: 0, min: -4, max: 4 }, { letter: "k", variable: "k_2", initial: 1, min: -3, max: 5 }] },
      { t: 4_000, type: "variable.drag", variable: "h", via: "slider", from: 0, to: 2, durationMs: 900 },
    ]);
    const { lesson, state } = check(recording);
    expect(lesson.lesson.variables).toEqual([
      { as: "h", initial: 0, min: -4, max: 4, label: "h", control: { kind: "slider", step: 0.1 } },
      { as: "k_2", initial: 1, min: -3, max: 5, label: "k", control: { kind: "slider", step: 0.1 } },
    ]);
    const curve = (state.nodes["l:node:graph-1"]!.content as { curves: Array<{ expression: string; label: string }> }).curves[0]!;
    expect(curve).toMatchObject({ expression: "(x-h)^2+k_2", label: "y = (x-h)^2+k" });
    expect(state.variables!.h!.value).toBe(2);
  });

  it("picks slider steps of 1, 2 or 5 times a power of ten", () => {
    expect([sliderStep(-5, 5), sliderStep(0, 1), sliderStep(0, 300), sliderStep(-2, 2)]).toEqual([0.1, 0.01, 5, 0.05]);
  });
});

describe("what marks mean", () => {
  it("highlights with the meaning the learner picked, ended at the next card like any highlight, and labels arrows", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Burns", type: "other" }, goals: [] }), now, [{ title: "Steam" }, { title: "Next" }]);
    recording = record(recording, "card-1", "Steam is hot. It comes from boiling water.", [
      { t: 300, type: "component.insert", panel: "text", alias: "text-1", text: "Steam is hot" },
      { t: 600, type: "component.insert", panel: "text", alias: "text-2", text: "Boiling water" },
      { t: 900, type: "tool.highlighter", target: { node: "text-1" }, emphasis: "warning" },
      { t: 1_200, type: "tool.arrow", from: { node: "text-2" }, to: { node: "text-1" }, label: "makes" },
    ]);
    recording = record(recording, "card-2", "Next.", [{ t: 300, type: "component.insert", panel: "text", alias: "text-3", text: "Next" }]);
    const { lesson, state } = check(recording);
    const actions = lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions)) as Array<Record<string, unknown>>;
    expect(actions).toContainEqual(expect.objectContaining({ do: "emphasize", target: "text-1", emphasis: "warning" }));
    expect(actions).toContainEqual(expect.objectContaining({ do: "emphasize", target: "text-1", emphasis: "none" }));
    expect(Object.values(state.connections)[0]).toMatchObject({ label: "makes" });
  });
});

describe("3D solids beyond the box", () => {
  it("puts a cylinder, a cone or a sphere on the board, and a cutting plane the learner moves with a slider", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Cross-sections", type: "math_off_map" }, goals: [] }), now, [{ title: "Cut it" }]);
    recording = record(recording, "card-1", "Move the cut up through the cone.", [
      { t: 300, type: "component.insert", panel: "solid_3d", alias: "solid-1", shape: "cone", radius: 2, height: 4, cut: { variable: "cut" } },
      { t: 900, type: "component.insert", panel: "solid_3d", alias: "solid-2", shape: "sphere", radius: 1.5 },
      { t: 2_000, type: "variable.drag", variable: "cut", via: "slider", from: 0, to: 1.5, durationMs: 800 },
    ]);
    const { lesson, state } = check(recording);
    expect(lesson.lesson.variables).toEqual([{ as: "cut", initial: 0, min: -2, max: 2, label: "cut height", control: { kind: "slider", step: 0.05 } }]);
    const cone = state.nodes["l:node:solid-1"]!.content as { objects: Array<Record<string, unknown>>; sections: Array<Record<string, unknown>>; fallback: string };
    expect(cone.objects[0]).toMatchObject({ kind: "cone", radius: 2, height: 4 });
    expect(cone.sections[0]).toMatchObject({ axis: "z", display: "plane_and_intersection", value: 1.5 });
    expect(cone.fallback).toBe("A cone of radius 2 and height 4.");
    expect((state.nodes["l:node:solid-2"]!.content as { objects: Array<Record<string, unknown>> }).objects[0]).toMatchObject({ kind: "sphere", radius: 1.5 });
  });
});

describe("adding curves to a graph while talking", () => {
  it("adds a curve that reads the graph's sliders", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Shifts", type: "math_off_map" }, goals: [] }), now, [{ title: "Up and down" }]);
    recording = record(recording, "card-1", "Compare x squared with x squared plus k.", [
      { t: 300, type: "component.insert", panel: "graph", alias: "graph-1", expression: "x^2", x: [-4, 4], y: [-2, 12],
        parameters: [] },
      { t: 900, type: "graph.add_curve", node: "graph-1", expression: "x^2+3" },
    ]);
    const { state } = check(recording);
    const curves = (state.nodes["l:node:graph-1"]!.content as { curves: Array<{ expression: string; label: string }> }).curves;
    expect(curves.map((curve) => curve.label)).toEqual(["y = x^2", "y = x^2+3"]);
  });

  it("refuses a curve on a graph that follows an angle, which OLL could not keep following", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Sine", type: "math_off_map" }, goals: [] }), now, [{ title: "Waves" }]);
    recording = record(recording, "card-1", "Sine and cosine.", [
      { t: 100, type: "component.insert", panel: "unit_circle", alias: "unit-circle-1", variable: "theta" },
      { t: 300, type: "component.insert", panel: "graph", alias: "graph-1", expression: "sin(x)", x: [0, 6.3], y: [-1.2, 1.2], linkedVariable: "theta" },
      { t: 900, type: "graph.add_curve", node: "graph-1", expression: "cos(x)" },
    ]);
    expect(() => compileRecording(recording, { author, language: "en-US" })).toThrow("follows an angle");
  });
});

describe("geometry on a grid, and regular polygons", () => {
  it("draws a circle round a point and a segment between two points of a grid", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Circles", type: "math_off_map" }, goals: [] }), now, [{ title: "Radius" }]);
    recording = record(recording, "card-1", "Every point on the circle is 3 from the centre.", [
      { t: 100, type: "component.insert", panel: "coordinate_grid", alias: "grid", x: [-5, 5], y: [-5, 5] },
      { t: 300, type: "point_tool.place", node: "grid", point: "point-a", x: 0, y: 0, label: "A (0, 0)" },
      { t: 500, type: "point_tool.place", node: "grid", point: "point-b", x: 3, y: 0, label: "B (3, 0)" },
      { t: 800, type: "geometry.circle", node: "grid", center: "point-a", radius: 3, alias: "circle-1" },
      { t: 1_200, type: "geometry.segment", node: "grid", from: "point-a", to: "point-b", alias: "segment-1" },
    ]);
    const content = check(recording).state.nodes["l:node:grid"]!.content as { circles: Array<Record<string, unknown>>; segments: Array<Record<string, unknown>> };
    expect(content.circles[0]).toMatchObject({ radius: 3, label: "r = 3" });
    expect(content.segments[0]).toMatchObject({ label: "AB", style: "solid" });
  });

  it("puts a regular polygon in a circle, its number of sides on a slider", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Pi", type: "math_off_map" }, goals: [] }), now, [{ title: "More sides" }]);
    recording = record(recording, "card-1", "With more sides the perimeter gets close to the circle's.", [
      { t: 100, type: "component.insert", panel: "polygon", alias: "polygon-1", sides: 6, slider: { variable: "sides" } },
      { t: 900, type: "variable.drag", variable: "sides", via: "slider", from: 6, to: 24, durationMs: 1_500 },
    ]);
    const { lesson, state } = check(recording);
    expect(lesson.lesson.variables).toEqual([{ as: "sides", initial: 6, min: 3, max: 48, label: "sides", control: { kind: "slider", step: 1 } }]);
    const polygon = (state.nodes["l:node:polygon-1"]!.content as { regular_polygons: Array<Record<string, unknown>> }).regular_polygons[0]!;
    expect(polygon).toMatchObject({ relation: "inscribed", sides: 24, show_measurements: true });
  });
});

describe("guides and equations on a graph", () => {
  it("adds a guide line and an equation drawn as a curve", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Circles", type: "math_off_map" }, goals: [] }), now, [{ title: "Graph" }]);
    recording = record(recording, "card-1", "A circle and a line.", [
      { t: 100, type: "component.insert", panel: "graph", alias: "graph-1", expression: "x", x: [-4, 4], y: [-4, 4] },
      { t: 400, type: "graph.add_curve", node: "graph-1", expression: "x = 1" },
      { t: 700, type: "graph.add_curve", node: "graph-1", expression: "x^2 + y^2 = 4" },
    ]);
    const content = check(recording).state.nodes["l:node:graph-1"]!.content as { curves: Array<Record<string, unknown>>; guides: Array<Record<string, unknown>> };
    expect(content.guides).toEqual([expect.objectContaining({ kind: "vertical_line", value: 1, label: "x = 1" })]);
    expect(content.curves[1]).toMatchObject({ kind: "implicit", expression: "(x^2+y^2)-(4)", level: 0 });
  });
});

describe("presenter reactions", () => {
  it("plays the learner's reaction as a teacher expression at that moment", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Well done", type: "other" }, goals: [] }), now, [{ title: "Done" }]);
    recording = record(recording, "card-1", "You got it.", [
      { t: 300, type: "component.insert", panel: "text", alias: "text-1", text: "x = 5" },
      { t: 900, type: "presenter.react", expression: "celebrating" },
    ]);
    const { lesson } = check(recording);
    expect(lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions))).toContainEqual(expect.objectContaining({ do: "expression", expression: "celebrating" }));
  });
});

describe("more solids", () => {
  it("compiles every solid, with a cut that spans it", () => {
    const solids = [
      { shape: "prism", sides: 6, radius: 2, height: 3 }, { shape: "pyramid", sides: 4, radius: 2, height: 3 },
      { shape: "frustum", radius: 2, topRadius: 1, height: 3 }, { shape: "hemisphere", radius: 2 }, { shape: "torus", radius: 2, tube: 0.6 },
      { shape: "tetrahedron", radius: 2 }, { shape: "octahedron", radius: 2 }, { shape: "dodecahedron", radius: 2 }, { shape: "icosahedron", radius: 2 },
      { shape: "box", size: { x: 3, y: 3, z: 3 } },
    ] as const;
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Solids", type: "math_off_map" }, goals: [] }), now, [{ title: "All of them" }]);
    recording = record(recording, "card-1", "Look.", solids.map((solid, index) => (
      { t: 100 + index, type: "component.insert", panel: "solid_3d", alias: `solid-${index + 1}`, ...solid, cut: { variable: `cut_${index + 1}` } } as RecordingEvent)));
    const { lesson, state } = check(recording);
    const hemisphere = lesson.lesson.variables!.find((variable) => variable.as === "cut_4")!;
    expect([hemisphere.min, hemisphere.max, hemisphere.initial]).toEqual([0, 2, 1]);
    expect((state.nodes["l:node:solid-1"]!.content as { objects: Array<Record<string, unknown>> }).objects[0]).toMatchObject({ kind: "prism", sides: 6 });
    expect((state.nodes["l:node:solid-3"]!.content as { objects: Array<Record<string, unknown>> }).objects[0]).toMatchObject({ kind: "frustum", top_radius: 1 });
  });
});

describe("bases, composites and nets", () => {
  const scene = (solids: Array<Record<string, unknown>>) => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Solids", type: "math_off_map" }, goals: [] }), now, [{ title: "All of them" }]);
    recording = record(recording, "card-1", "Look.", solids.map((solid, index) => (
      { t: 100 + index, type: "component.insert", panel: "solid_3d", alias: `solid-${index + 1}`, ...solid } as RecordingEvent)));
    return recording;
  };
  const objects = (state: ReturnType<typeof check>["state"], alias: string) => (state.nodes[`l:node:${alias}`]!.content as { objects: Array<Record<string, unknown>> }).objects;

  it("compiles prisms and pyramids on any base, truncated pyramids, ellipsoids and stacked solids", () => {
    const { state, lesson } = check(scene([
      { shape: "prism", base: { kind: "right_triangle", a: 3, b: 4 }, height: 2 },
      { shape: "pyramid", base: { kind: "rectangle", length: 4, width: 3 }, height: 3, topScale: 0.5 },
      { shape: "prism", base: { kind: "triangle", a: 5, b: 4, c: 3 }, height: 2, cut: { variable: "cut_1" } },
      { shape: "ellipsoid", radii: { x: 3, y: 2, z: 1.5 }, cut: { variable: "cut_2" } },
      { shape: "composite", parts: "cylinder_cone", radius: 1, height: 4, topHeight: 2, cut: { variable: "cut_3" } },
      { shape: "composite", parts: "cylinder_hemisphere", radius: 1, height: 3 },
      { shape: "composite", parts: "box_pyramid", width: 2, height: 2, topHeight: 1 },
      { shape: "composite", parts: "two_cylinders", radius: 2, height: 1, topRadius: 1, topHeight: 2 },
    ]));
    expect(objects(state, "solid-1")[0]).toMatchObject({ kind: "prism", base: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }], height: 2 });
    expect(objects(state, "solid-2")[0]).toMatchObject({ kind: "pyramid", top_scale: 0.5 });
    // Sides 5, 4, 3: a right triangle, its top corner above the bottom's left end.
    expect(objects(state, "solid-3")[0]!.base).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 1.8, y: 2.4 }]);
    expect(objects(state, "solid-4")[0]).toMatchObject({ kind: "ellipsoid", radii: { x: 3, y: 2, z: 1.5 } });
    // A pencil 6 high: the cylinder from -3 to 1, the cone from 1 to 3; the cut spans both and cuts both.
    expect(objects(state, "solid-5").map((object) => [object.kind, (object.center as { z: number }).z])).toEqual([["cylinder", -1], ["cone", 2]]);
    const cut = lesson.lesson.variables!.find((variable) => variable.as === "cut_3")!;
    expect([cut.min, cut.max]).toEqual([-3, 3]);
    expect((state.nodes["l:node:solid-5"]!.content as { sections: Array<{ targets: string[] }> }).sections[0]!.targets).toHaveLength(2);
    expect(objects(state, "solid-6").map((object) => [object.kind, (object.center as { z: number }).z])).toEqual([["cylinder", -0.5], ["hemisphere", 1]]);
    expect(objects(state, "solid-7")[1]).toMatchObject({ kind: "pyramid", sides: 4, radius: 1.414214 });
    expect(objects(state, "solid-8").map((object) => object.radius)).toEqual([2, 1]);
    expect(lesson.steps[0]!.beats[0]!.actions.find((action) => action.as === "solid-8")).toMatchObject({ content: { fallback: expect.stringContaining("radius 1 and height 2 on top") } });
  });

  it("opens a box, prism, pyramid, cylinder or cone into its net on a slider", () => {
    const { state, lesson, events } = check(scene([
      { shape: "box", size: { x: 3, y: 2, z: 1 }, unfold: { variable: "open_1" } },
      { shape: "cylinder", radius: 1, height: 2, unfold: { variable: "open_2" } },
      { shape: "pyramid", base: { kind: "right_triangle", a: 3, b: 4 }, height: 2, unfold: { variable: "open_3" } },
    ]));
    expect(lesson.lesson.variables!.find((variable) => variable.as === "open_1")).toMatchObject({ initial: 0, min: 0, max: 1, label: "unfold" });
    expect(objects(state, "solid-1")[0]).toMatchObject({ kind: "box", unfold: 0, face_targets: true });
    const faces = state.nodes["l:node:solid-1"]!.content.highlights as unknown[];
    expect(faces).toHaveLength(6);
    expect(faces).toContainEqual(expect.objectContaining({ label: "top\n3 × 2", shown: "when_emphasized" }));
    expect(deriveExecutionRequirements(events).requiredCapabilities).toContain("scene3d:unfold");
    const opened = setLessonVariable(state, "open_2", 0.5);
    expect(objects(opened, "solid-2")[0]!.unfold).toBe(0.5);
    // A sphere has no net; a solid is cut or unfolded, not both.
    expect(() => compileRecording(scene([{ shape: "sphere", radius: 1, unfold: { variable: "open_1" } }]), { author, language: "en-US" })).toThrow(CompileError);
    expect(() => compileRecording(scene([{ shape: "cone", radius: 1, height: 2, unfold: { variable: "open_1" }, cut: { variable: "cut_1" } }]), { author, language: "en-US" })).toThrow(CompileError);
    expect(() => compileRecording(scene([{ shape: "prism", base: { kind: "triangle", a: 1, b: 1, c: 3 }, height: 1 }]), { author, language: "en-US" })).toThrow(CompileError);
  });
});
