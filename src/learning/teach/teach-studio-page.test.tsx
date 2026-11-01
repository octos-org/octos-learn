import { setLocale } from "@/i18n";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { CompiledLesson } from "./compile-recording";
import type { BoardTarget } from "./recording";

const board = vi.hoisted(() => ({
  compiled: null as CompiledLesson | null,
  onTarget: undefined as ((target: BoardTarget) => void) | undefined,
  onVariableGesture: undefined as ((gesture: { variable: string; via: "slider" | "geometry_point"; from: number; to: number; durationMs: number; startedAgoMs: number }) => void) | undefined,
  onSceneGesture: undefined as ((gesture: { node: string; yaw: number; pitch: number }) => void) | undefined,
  frozen: null as null | { svg: string; width: number; height: number; annotates?: { node: string; x: number; y: number; width: number; height: number } },
  pen: [] as string[],
  values: {} as Record<string, number>,
  inkCount: 0,
  onSelect: undefined as ((selected: number) => void) | undefined,
  selected: null as null | { svg: string; width: number; height: number },
  cut: null as null | { svg: string; width: number; height: number; annotates?: { node: string; x: number; y: number; width: number; height: number } },
  pointers: [] as Array<BoardTarget | { at: { x: number; y: number } } | null>,
  onStroke: undefined as ((box: { x: number; y: number; width: number; height: number }) => void) | undefined,
  strokes: [] as Array<{ x: number; y: number }>,
  inkDocuments: [] as string[],
}));
vi.mock("./teach-board", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    TeachBoard: forwardRef((props: { compiled: CompiledLesson | null; onTarget?: (target: BoardTarget) => void; onStroke?: typeof board.onStroke; onVariableGesture?: typeof board.onVariableGesture; onSceneGesture?: typeof board.onSceneGesture }, ref) => {
      board.compiled = props.compiled;
      board.onStroke = props.onStroke;
      board.onTarget = props.onTarget;
      board.onVariableGesture = props.onVariableGesture;
      board.onSceneGesture = props.onSceneGesture;
      useImperativeHandle(ref, () => ({
        startInk: async (documentId: string) => { board.inkDocuments.push(documentId); },
        setPen: (mode: string) => { board.pen.push(mode); },
        freezeInk: async () => board.frozen,
        discardInk: async () => undefined,
        variableValue: (alias: string) => board.values[alias],
        inkCount: () => board.inkCount,
        selectInk: (onChange: (selected: number) => void) => { board.pen.push("select"); board.onSelect = onChange; return () => { board.onSelect = undefined; }; },
        selectAllInk: () => { board.selected ??= { svg: "<svg/>", width: 80, height: 40 }; },
        selectedInk: async () => board.selected,
        cutSelectedInk: async () => board.cut,
        showPointer: (target: BoardTarget | { at: { x: number; y: number } } | null) => { board.pointers.push(target); },
        hasStrokeAt: (point: { x: number; y: number }) => board.strokes.some((stroke) => stroke.x === point.x && stroke.y === point.y),
      }));
      return <div data-testid="teach-board" />;
    }),
  };
});
const voice = vi.hoisted(() => ({
  listening: true,
  onUtterance: undefined as ((wav: Blob) => void) | undefined,
  onSpeechStart: undefined as (() => void) | undefined,
  onAudioFrame: undefined as ((frame: Float32Array) => void) | undefined,
  pending: null as null | Promise<void>,
  available: true,
  transcripts: [] as string[],
}));
vi.mock("@/home/voice/use-voice-capture", () => ({
  useVoiceCapture: () => ({
    capturing: false, error: null, getError: () => null,
    start: async (onUtterance: (wav: Blob) => void, options?: { onSpeechStart?: () => void; onAudioFrame?: (frame: Float32Array) => void }) => {
      voice.onUtterance = onUtterance; voice.onSpeechStart = options?.onSpeechStart; voice.onAudioFrame = options?.onAudioFrame; return voice.listening;
    },
    stop: async () => undefined,
  }),
}));
vi.mock("@/api/cloud-asr", () => ({
  fetchCloudAsrStatus: async () => ({ available: voice.available, detail: "" }),
  transcribeCloudSpeech: async () => {
    const transcript = voice.transcripts.shift() ?? "";
    if (voice.pending) await voice.pending;
    return { status: "speech", transcript };
  },
}));
const assist = vi.hoisted(() => ({
  question: "Why did you pick that point?" as string | Error,
  neat: { latex: "\\dfrac{6}{3}=2", confidence: "high", readable: true } as { latex: string; confidence: string; readable: boolean },
  review: { cards: [] as Array<{ key: string; status: string; kind: string; message: string }>, overall: "Nice work." },
  octoCalls: [] as string[],
}));
vi.mock("./teach-assist", () => ({
  askOcto: vi.fn(async (_recording: unknown, _compiled: unknown, key: string) => {
    assist.octoCalls.push(key);
    if (assist.question instanceof Error) throw assist.question;
    return assist.question;
  }),
  inkToMath: vi.fn(async () => assist.neat),
  reviewLesson: vi.fn(async () => assist.review),
}));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token", getSelectedProfileId: () => "learner-1" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));

import { createRecording, keptTake, planCards } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { TeachStudioPage } from "./teach-studio-page";

let time = 0;

beforeEach(() => {
  localStorage.clear();
  setLocale("en-US");
  time = 1_000;
  board.compiled = null;
  board.onTarget = undefined;
  board.frozen = null;
  board.pen = [];
  board.values = {};
  board.inkCount = 0;
  board.onSelect = undefined;
  board.selected = null;
  board.cut = null;
  board.pointers = [];
  board.strokes = [];
  voice.pending = null;
  assist.question = "Why did you pick that point?";
  assist.octoCalls = [];
  board.inkDocuments = [];
  voice.listening = true;
  voice.available = true;
  voice.transcripts = [];
  const recording = planCards(
    createRecording({ id: "rec-1", now: "2026-10-31T12:00:00.000Z", topic: { text: "Finding slope", type: "math_off_map" }, goals: ["Find slope"] }),
    "2026-10-31T12:00:00.000Z",
    [{ title: "Pick two points" }, { title: "Rise over run" }],
  );
  saveRecordingDraft(localStorage, "learner-1", recording);
});
afterEach(() => { cleanup(); setLocale("zh-CN"); });

function renderStudio(id = "rec-1") {
  render(
    <MemoryRouter initialEntries={[`/teach/${id}`]}>
      <Routes><Route path="/teach/:id" element={<TeachStudioPage clock={() => time} />} /></Routes>
    </MemoryRouter>,
  );
}

it("records a card: a grid, a point, a pointer tap, then the learner's captions", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  time = 1_400;
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  time = 3_100;
  fireEvent.click(screen.getByRole("button", { name: "Place a point" }));
  fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "1" } });
  fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: "2" } });
  expect(screen.getByText("This point is called A")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  time = 5_000;
  fireEvent.click(screen.getByRole("button", { name: /Laser pointer/ }));
  expect(board.onTarget).toBeTypeOf("function");
  board.onTarget!({ node: "grid-1", part: "point-a" });
  expect(board.pointers.at(-1)).toEqual({ node: "grid-1", part: "point-a" });
  time = 9_000;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record this card" })).toBeTruthy());

  const [draft] = loadRecordingDrafts(localStorage, "learner-1");
  const take = keptTake(draft!.cards[0]!)!;
  expect(take.durationMs).toBe(8_000);
  expect(take.events.map((event) => [event.t, event.type])).toEqual([[400, "component.insert"], [2_100, "point_tool.place"], [4_000, "tool.laser"]]);
  expect(board.compiled?.lesson.steps[0]!.beats[0]!.actions.map((action) => action.do)).toEqual(["write", "point", "focus"]);

  fireEvent.change(screen.getByRole("textbox", { name: "What you said on this card" }), { target: { value: "Point A is at 1 comma 2." } });
  fireEvent.click(screen.getByRole("button", { name: "Save captions" }));
  expect(keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)?.text).toBe("Point A is at 1 comma 2.");
  expect(board.compiled?.lesson.steps[0]!.beats[0]!.say).toBe("Point A is at 1 comma 2.");
});

it("keeps other cards locked while one records, and discarding a take leaves no trace", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  expect((screen.getByRole("button", { name: /Rise over run/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Discard this take" }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes).toEqual([]);
  expect((screen.getByRole("button", { name: /Rise over run/ }) as HTMLButtonElement).disabled).toBe(false);
});

it("only offers pointing while recording", () => {
  renderStudio();
  expect(screen.queryByRole("button", { name: /Laser pointer/ })).toBeNull();
  expect(board.onTarget).toBeUndefined();
});

it("says so when the draft does not exist", () => {
  renderStudio("missing");
  expect(screen.getByRole("alert").textContent).toBe("This lesson draft can't be found.");
});

it("refuses a point outside the grid and says where the grid ends", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: "Place a point" }));
  fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "4" } });
  fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: "8" } });
  expect(screen.getByRole("alert").textContent).toBe("This point is outside the grid: x goes from -5 to 5, y from -5 to 5.");
  expect((screen.getByRole("button", { name: "Put on the board" }) as HTMLButtonElement).disabled).toBe(true);
});

it("freezes the take's handwriting onto the card, as an annotation when written on a component", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  expect(board.inkDocuments).toEqual(["rec-1:card-1:take-1"]);
  fireEvent.click(screen.getByRole("button", { name: /Pen/ }));
  expect(board.pen.at(-1)).toBe("draw");
  fireEvent.click(screen.getByRole("button", { name: /Eraser/ }));
  expect(board.pen.at(-1)).toBe("erase");
  board.frozen = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L9 9\"/></svg>", width: 40, height: 30, annotates: { node: "grid-1", x: 0.3, y: 0.5, width: 0.1, height: 0.1 } };
  time = 4_000;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink).toHaveLength(1));
  const [ink] = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink!;
  expect(ink!.snapshotId).toBe("ink-snap:rec-1-card-1-t1@v1");
  expect(ink!.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(ink!.annotates).toEqual({ node: "grid-1", x: 0.3, y: 0.5, width: 0.1, height: 0.1 });
  expect(JSON.parse(localStorage.getItem("octos-learn:learner-ink:v1:learner-1")!)["ink-snap:rec-1-card-1-t1@v1"].width).toBe(40);
  expect(board.pen.at(-1)).toBe("off");
});

it("turns what the learner says into the card's captions, timed from the take start", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  voice.transcripts = ["Here is a grid.", "Point A is at one two."];
  expect(screen.getByText("Start talking. Your words will show up here.")).toBeTruthy();
  time = 1_600; voice.onSpeechStart!();
  time = 4_000; voice.onUtterance!(new Blob(["a"]));
  // The words show while the learner is still recording.
  expect(await screen.findByText("Here is a grid.")).toBeTruthy();
  time = 4_500; voice.onSpeechStart!();
  time = 7_000; voice.onUtterance!(new Blob(["b"]));
  expect(await screen.findByText("Here is a grid. Point A is at one two.")).toBeTruthy();
  time = 8_000;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record this card" })).toBeTruthy());
  const take = keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)!;
  expect(take.text).toBe("Here is a grid. Point A is at one two.");
  expect(take.speechSpanMs).toEqual([600, 6_000]);
  expect((screen.getByRole("textbox", { name: "What you said on this card" }) as HTMLTextAreaElement).value).toBe("Here is a grid. Point A is at one two.");
});

it("asks the learner to type the words when recognition is not connected", async () => {
  voice.available = false;
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  // Said before the learner starts talking, not only after the take.
  expect(await screen.findByText(/Speech recognition isn't connected, so your words won't turn into captions/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  voice.onSpeechStart!(); voice.onUtterance!(new Blob(["a"]));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByText("Speech recognition isn't connected yet. Please type what you said on this card below.")).toBeTruthy();
});

it("says when nothing was heard during a take", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  await act(async () => undefined);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByText("I didn't hear you this time. Check that your microphone is on, or type what you said below.")).toBeTruthy();
});

it("shows the microphone level and whether words are heard and being turned into text", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  expect(screen.getByText("Turning on the microphone…")).toBeTruthy();
  expect(await screen.findByText("Listening. Start talking.")).toBeTruthy();
  act(() => voice.onAudioFrame!(new Float32Array(512).fill(0.05)));
  expect(Number((screen.getByRole("meter", { name: "Microphone level" }) as HTMLMeterElement).value)).toBeCloseTo(0.6);
  act(() => voice.onSpeechStart!());
  expect(screen.getByText("Hearing you…")).toBeTruthy();
  let release!: () => void;
  voice.pending = new Promise((resolve) => { release = resolve; });
  voice.transcripts = ["Slope is steepness."];
  act(() => voice.onUtterance!(new Blob(["a"])));
  expect(await screen.findByText("Turning your words into text…")).toBeTruthy();
  await act(async () => release());
  expect(await screen.findByText("Slope is steepness.")).toBeTruthy();
  expect(screen.getByText("Listening. Start talking.")).toBeTruthy();
});

it("points at one stroke of the learner's writing, live and in the lesson", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: /Laser pointer/ }));
  time = 2_000;
  act(() => board.onStroke!({ x: 140, y: 80, width: 20, height: 40 }));
  expect(board.pointers.at(-1)).toEqual({ at: { x: 150, y: 100 } });
  // A second stroke that the learner then erases points at nothing.
  act(() => board.onStroke!({ x: 300, y: 300, width: 10, height: 10 }));
  board.strokes = [{ x: 150, y: 100 }];
  board.frozen = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>", x: 100, y: 60, width: 100, height: 80 } as typeof board.frozen;
  time = 5_000;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink).toHaveLength(1));
  const ink = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink![0]!;
  expect(ink.selections).toEqual(["sel-card-1-t1-m1"]);
  expect(JSON.parse(localStorage.getItem("octos-learn:learner-ink:v1:learner-1")!)[ink.snapshotId].regions).toEqual({ "sel-card-1-t1-m1": { x: 0.4, y: 0.25, width: 0.2, height: 0.5 } });
  await waitFor(() => expect(board.compiled!.lesson.steps[0]!.beats[0]!.actions.filter((action) => action.do === "point"))
    .toEqual([expect.objectContaining({ target: expect.stringMatching(/^ink-card-1#/) })]));
});

it("tells the learner when the microphone cannot be used", async () => {
  voice.listening = false;
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  expect(await screen.findByText("The microphone isn't available. You can still record, then type what you said below.")).toBeTruthy();
});

it("records a drag of the unit circle and a turn of the box, at the nearest named view", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Unit circle" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: "Box" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  expect(board.onVariableGesture).toBeTypeOf("function");
  time = 4_000;
  act(() => board.onVariableGesture!({ variable: "theta", via: "geometry_point", from: 0, to: 1.2, durationMs: 2_000, startedAgoMs: 2_000 }));
  time = 5_000;
  act(() => board.onSceneGesture!({ node: "box-1", yaw: 0.05, pitch: 1.45 }));
  fireEvent.click(screen.getByRole("button", { name: /Pen/ }));
  expect(board.onVariableGesture).toBeUndefined();
  const actions = board.compiled!.lesson.steps[0]!.beats[0]!.actions;
  expect(actions.find((action) => action.do === "animate")).toMatchObject({ variable: "theta", value: 1.2, duration_intent: "normal" });
  expect(actions.find((action) => action.do === "view")).toMatchObject({ target: "box-1", preset: "top" });
  const take = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes[0]!;
  expect(take.events.map((event) => [event.type, event.t])).toEqual([["component.insert", 0], ["component.insert", 0], ["variable.drag", 1_000], ["view.rotate", 4_000]]);
});

function placeGridWithPoints(points: Array<[string, string]>) {
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  for (const [x, y] of points) {
    fireEvent.click(screen.getByRole("button", { name: "Place a point" }));
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: x } });
    fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: y } });
    fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  }
}

it("draws the line through two placed points and points an arrow at it", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  placeGridWithPoints([["1", "2"], ["2", "4"]]);
  fireEvent.click(screen.getByRole("button", { name: "Line through two points" }));
  expect(screen.getByText("y = 2·x")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /Arrow/ }));
  expect(screen.getByText("Tap where the arrow starts.")).toBeTruthy();
  act(() => board.onTarget!({ node: "grid-1", part: "point-a" }));
  expect(screen.getByText("Now tap where the arrow points.")).toBeTruthy();
  act(() => board.onTarget!({ node: "line-1", part: "line" }));
  const actions = board.compiled!.lesson.steps[0]!.beats[0]!.actions;
  expect(actions.find((action) => action.do === "write" && action.as === "line-1")).toMatchObject({ kind: "plot", content: { curves: [{ expression: "2*x" }] } });
  expect(actions.find((action) => action.do === "connect")).toMatchObject({ from: "grid-1#point-a", to: "line-1#line" });
});

it("sets up a Your turn exercise from the learner's demonstration", async () => {
  localStorage.clear();
  const recording = planCards(
    createRecording({ id: "rec-1", now: "2026-10-31T12:00:00.000Z", topic: { text: "Sine", type: "math_off_map" }, goals: ["Sine is height"] }),
    "2026-10-31T12:00:00.000Z",
    [{ title: "The circle" }, { title: "Your turn", kind: "your_turn" }],
  );
  saveRecordingDraft(localStorage, "learner-1", recording);
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Unit circle" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record this card" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /2\. Your turn/ }));
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  board.values.theta = 3 * Math.PI / 2;
  fireEvent.click(screen.getByRole("button", { name: "This is the answer" }));
  expect(screen.getByText("Viewers need to make it equal -1")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Give a hint (optional)" }), { target: { value: "Where is the point lowest?" } });
  fireEvent.click(screen.getByRole("button", { name: "Save this exercise" }));
  expect(board.compiled!.lesson.lesson.tasks?.[0]).toMatchObject({
    completion: { kind: "expression_target", expression: "sin(theta)", value: -1, tolerance: 0.01 },
    allowed_operations: [{ kind: "variable_change", variable: "theta", controls: ["slider", "geometry_point"] }],
    hints: ["Where is the point lowest?"],
  });
});

it("records a back-and-forth drag as moves in order", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Unit circle" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  time = 6_000;
  act(() => {
    board.onVariableGesture!({ variable: "theta", via: "geometry_point", from: 0, to: 1.2, durationMs: 2_000, startedAgoMs: 3_000 });
    board.onVariableGesture!({ variable: "theta", via: "geometry_point", from: 1.2, to: 0.6, durationMs: 400, startedAgoMs: 1_000 });
    board.onVariableGesture!({ variable: "theta", via: "geometry_point", from: 0.6, to: 1.57, durationMs: 600, startedAgoMs: 600 });
  });
  const take = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes[0]!;
  expect(take.events.filter((event) => event.type === "variable.drag").map((event) => [event.t, event.type === "variable.drag" && event.to])).toEqual([[2_000, 1.2], [4_000, 0.6], [4_400, 1.57]]);
});

it("Octo asks about a card once it is recorded, and the learner's answer stays on the card", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByText("Why did you pick that point?")).toBeTruthy();
  expect(assist.octoCalls).toEqual(["card-1"]);
  fireEvent.change(screen.getByRole("textbox", { name: "Your answer (only you can see it)" }), { target: { value: "It is easy to count." } });
  fireEvent.click(screen.getByRole("button", { name: "Answer Octo" }));
  const card = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!;
  expect(card.octo).toEqual({ question: "Why did you pick that point?", answer: "It is easy to count." });
  expect(JSON.stringify(board.compiled!.lesson)).not.toContain("easy to count");
});

it("keeps recording when Octo cannot ask", async () => {
  assist.question = new Error("model unavailable");
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByText("Octo couldn't think of a question this time. You can go on to the next card.")).toBeTruthy();
});

it("makes circled handwriting neat, and the formula takes its place on the board right away", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  board.inkCount = 3;
  fireEvent.click(screen.getByRole("button", { name: "Make it neat" }));
  expect(board.pen.at(-1)).toBe("select");
  const circled = screen.getByRole("button", { name: "Make the circled writing neat" }) as HTMLButtonElement;
  expect(circled.disabled).toBe(true);
  board.selected = { svg: "<svg/>", width: 50, height: 30 };
  act(() => board.onSelect!(2));
  expect(circled.disabled).toBe(false);
  fireEvent.click(circled);
  const formula = await screen.findByRole("textbox", { name: "Formula (you can edit it)" });
  fireEvent.change(formula, { target: { value: "\\dfrac{8-2}{4-1}=2" } });
  board.cut = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>", width: 50, height: 30, annotates: { node: "grid-1", x: 0.1, y: 0.7, width: 0.3, height: 0.2 } };
  time = 3_000;
  fireEvent.click(screen.getByRole("button", { name: "Use this" }));
  // Still recording, the formula is already on the board in the writing's place.
  await waitFor(() => expect(board.compiled!.lesson.steps[0]!.beats[0]!.actions.find((action) => action.do === "write" && action.kind === "math"))
    .toMatchObject({ content: { fragments: [{ latex: "\\dfrac{8-2}{4-1}=2" }] }, place: { relation: "replaces", anchor: "ink-card-1" }, source: { selection: "sel-card-1-t1-n1", confirmed_by: "learner" } }));
  expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
  expect(board.compiled!.resourceContext.ink_snapshots?.[0]?.snapshot_id).toBe("ink-snap:rec-1-card-1-t1-n1@v1");

  board.frozen = null;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink).toHaveLength(1));
  const card = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!;
  expect(card.ink![0]).toMatchObject({ selections: ["sel-card-1-t1-n1"], annotates: { node: "grid-1" }, neat: { selection: "sel-card-1-t1-n1", latex: "\\dfrac{8-2}{4-1}=2" } });
  expect(keptTake(card)!.ink).toBeUndefined();

  // Re-recording the card keeps the neat formula in the writing's place.
  fireEvent.click(await screen.findByRole("button", { name: "Re-record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)!.take).toBe(2));
  await waitFor(() => expect(board.compiled!.lesson.steps[0]!.beats[0]!.actions.map((action) => [action.do, (action as { as?: string }).as]))
    .toEqual(expect.arrayContaining([["write", "ink-card-1"], ["write", "formula-1"]])));
});

it("re-recording keeps the card's board, and starting over clears it", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(await screen.findByRole("button", { name: "Re-record this card" }));
  expect(board.compiled!.lesson.steps[0]!.beats[0]!.actions.some((action) => action.do === "write" && action.kind === "geometry")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Discard this take" }));
  fireEvent.click(screen.getByRole("button", { name: "Start this card over" }));
  expect(board.compiled).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
});

it("can make all of a card's writing neat in one go", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  board.inkCount = 1;
  fireEvent.click(screen.getByRole("button", { name: "Make it neat" }));
  fireEvent.click(screen.getByRole("button", { name: "Make all my writing neat" }));
  expect(await screen.findByRole("textbox", { name: "Formula (you can edit it)" })).toBeTruthy();
});

it("asks for writing first when there is no handwriting to tidy", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Make it neat" }));
  expect(await screen.findByText("Write something first, then ask Octo to tidy it.")).toBeTruthy();
});

it("Octo reviews the whole lesson card by card and points to the card to fix", async () => {
  assist.review = { cards: [
    { key: "card-1", status: "good", kind: "none", message: "Clear points." },
    { key: "card-2", status: "check", kind: "slip", message: "You said one half; the board shows 2." },
  ], overall: "Fix how you read card 2." };
  renderStudio();
  for (const name of [/Pick two points/, /Rise over run/]) {
    fireEvent.click(screen.getByRole("button", { name }));
    fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
    fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByRole("button", { name: "Re-record this card" });
  }
  fireEvent.click(screen.getByRole("button", { name: "Ask Octo" }));
  expect(await screen.findByText("You said one half; the board shows 2.")).toBeTruthy();
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.review?.overall).toBe("Fix how you read card 2.");
  const fixButtons = screen.getAllByRole("button", { name: "Fix this card" });
  fireEvent.click(fixButtons.at(-1)!);
  expect(screen.getByRole("button", { name: /Rise over run/ }).getAttribute("aria-pressed")).toBe("true");
});
