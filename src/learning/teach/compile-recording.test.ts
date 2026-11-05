import { describe, expect, it } from "vitest";
import { assertAuthoringSchema, normalizeAuthoringLesson, reduceCanonicalEvents, validateAuthoringLesson } from "octos-lesson-language";
import { HeadlessLessonPlayer } from "octos-lesson-language/player";
import { mountInfiniteBoard } from "octos-lesson-language/web-runtime";

import { compileRecording, compiledCards, CompileError } from "./compile-recording";
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
    expect(lesson.steps.map((step) => step.key)).toEqual(["card-1", "card-2", "card-3", "card-4"]);
    expect(resourceContext.ink_snapshots?.map((snapshot) => snapshot.snapshot_id)).toEqual(["ink-snap:card1@v4", "ink-snap:card2-circle@v4", "ink-snap:card3@v4"]);
    const grid = state.nodes["l:node:grid"]!;
    expect((grid.content.points as Array<{ label: string }>).map((point) => point.label)).toEqual(["A (1, 2)", "B (4, 8)"]);
    expect(state.nodes["l:node:ink-card-3"]!.hidden).toBe(true);
    expect(state.nodes["l:node:neat-fraction"]!.source).toEqual({ selection: "sel-card3-all", confirmed_by: "learner" });
    expect(state.nodes["l:node:ink-card-2"]!.placement).toMatchObject({ relation: "annotates" });
  });

  it("ends a card's highlights when the next card starts", () => {
    let recording = planCards(createRecording({ id: "rec", now, topic: { text: "Sine", type: "math_off_map" }, goals: [] }), now, [{ title: "Circle" }, { title: "Cosine" }, { title: "More" }]);
    recording = record(recording, "card-1", "The height of P is sine.", [
      { t: 0, type: "component.insert", panel: "unit_circle", alias: "circle", variable: "theta" },
      { t: 2_000, type: "tool.highlighter", target: { node: "circle", part: "point-p" } },
      { t: 3_000, type: "tool.highlighter", target: { node: "circle", part: "point-p" } },
    ]);
    recording = record(recording, "card-2", "Now look at the foot.", [
      { t: 1_000, type: "tool.highlighter", target: { node: "circle", part: "foot" } },
    ]);
    recording = record(recording, "card-3", "That is all.", []);
    const { lesson, state } = check(recording);
    const beats = lesson.steps.map((step) => step.beats[0]!.actions as Array<{ do: string; target?: string; emphasis?: string; when?: string }>);
    expect(beats[1]!.filter((action) => action.do === "emphasize")).toEqual([
      { do: "emphasize", target: "circle#point-p", emphasis: "none", when: "before_speech" },
      expect.objectContaining({ target: "circle#foot", emphasis: "focus" }),
    ]);
    expect(beats[2]!.filter((action) => action.do === "emphasize")).toEqual([{ do: "emphasize", target: "circle#foot", emphasis: "none", when: "before_speech" }]);
    const marks = (state.nodes["l:node:circle"]!.emphasis ?? []) as Array<{ target: { fragment_id?: string }; emphasis: string }>;
    const last = (part: string) => marks.filter((mark) => mark.target.fragment_id?.endsWith(`:${part}`)).at(-1)?.emphasis;
    expect([last("point-p"), last("foot")]).toEqual(["none", "none"]);
    // Up to card 2, as the studio board shows it while card 2 is selected: its mark still shows.
    const through = compileRecording(recording, { author, language: "en-US", throughCard: "card-2" });
    expect(through.lesson.steps.map((step) => step.key)).toEqual(["card-1", "card-2"]);
    const shown = reduceCanonicalEvents(normalizeAuthoringLesson(through.lesson, { lessonId: "l", boardId: "b", baseRevision: 0, resourceContext: through.resourceContext }));
    const shownMarks = (shown.nodes["l:node:circle"]!.emphasis ?? []) as Array<{ target: { fragment_id?: string }; emphasis: string }>;
    expect(shownMarks.filter((mark) => mark.target.fragment_id?.endsWith(":foot")).at(-1)?.emphasis).toBe("focus");
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
    // Sentences with no action before or during them join the beat before; nothing is reordered.
    expect(beats).toEqual([
      { say: "Here is a grid.", actions: ["during_speech:write", "after_speech:revise:1"] },
      { say: "Point B. It goes up. Then right.", actions: ["during_speech:revise:2", "after_speech:point", "after_speech:focus"] },
    ]);
    expect(lesson.steps[0]!.beats.map((beat) => beat.key)).toEqual(["card-1-s1", "card-1-s2"]);
    expect(beatSpeech).toEqual({ "card-1-s1": { card: "card-1", speechSpanMs: [0, 1_000] }, "card-1-s2": { card: "card-1", speechSpanMs: [2_000, 7_000] } });
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
    // The point placed during the sentence that was not understood comes as "Look." starts.
    expect(beats.map((beat) => [beat.say, beat.actions.map((action) => `${action.when}:${action.do}`)])).toEqual([
      ["Look.", ["before_speech:write", "during_speech:revise", "after_speech:focus"]],
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
