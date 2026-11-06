import { setLocale } from "@/i18n";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  inkEdits: new Set<(steps: number) => void>(),
  inkUndos: [] as number[],
  marks: [] as Array<Array<{ x: number; y: number; width: number; height: number }>>,
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
        cutSelectedInk: async () => (board.cut ? { ...board.cut, undoSteps: 1 } : null),
        onInkEdit: (listener: (steps: number) => void) => { board.inkEdits.add(listener); return () => { board.inkEdits.delete(listener); }; },
        undoInk: async (steps = 1) => { board.inkUndos.push(steps); },
        markInk: (boxes: Array<{ x: number; y: number; width: number; height: number }>) => { board.marks.push(boxes); },
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
const screenCheck = vi.hoisted(() => ({ results: [] as unknown[] }));
vi.mock("./readability-check", () => ({ checkReadability: vi.fn(async () => screenCheck.results) }));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token", getSelectedProfileId: () => "learner-1" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));

const camera = vi.hoisted(() => ({ starts: [] as number[], stops: 0, cancels: 0, opens: 0, closes: 0, saved: [] as unknown[],
  track: { schema: "octos.avatar-performance.v1", durationMs: 1000, frames: [] as unknown[] } as unknown }));
vi.mock("./use-take-camera", () => ({ useTakeCamera: () => ({ video: { current: null }, state: "tracking", error: null,
  open: () => { camera.opens++; }, close: () => { camera.closes++; }, frame: () => ({ timeMs: 0, source: "mediapipe", tracked: false, channels: {}, rotation: [0, 0, 0] }),
  begin: (at: number) => { camera.starts.push(at); }, end: () => { camera.stops++; return camera.track; }, abort: () => { camera.cancels++; } }) }));
// The character itself is drawn on a canvas; here it only says who it is and how the camera is doing.
vi.mock("./studio-avatar", () => ({ default: ({ characterId, state }: { characterId: string; state: string }) => <section aria-label="Your character" data-character={characterId} data-state={state} /> }));
vi.mock("./take-performance-store", () => ({ saveTakePerformance: async (key: unknown) => { camera.saved.push(key); }, deleteRecordingPerformances: async () => undefined }));

import { appendEvent, createRecording, finishTake, keptTake, planCards, startTake, type LearnerRecording, type RecordingEvent } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { TeachStudioPage } from "./teach-studio-page";
import { PRESENTER_GREETINGS } from "./presenter-greetings";

/** A recorded card's actions in play order, across its beats. */
const cardActions = (compiled: CompiledLesson | null | undefined, index: number) => compiled!.lesson.steps[index]!.beats.flatMap((beat) => beat.actions);

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
  board.inkEdits.clear();
  board.inkUndos = [];
  board.marks = [];
  screenCheck.results = [];
  board.strokes = [];
  voice.pending = null;
  assist.question = "Why did you pick that point?";
  assist.octoCalls = [];
  board.inkDocuments = [];
  voice.listening = true;
  voice.available = true;
  voice.transcripts = [];
  camera.starts = []; camera.stops = 0; camera.cancels = 0; camera.opens = 0; camera.closes = 0; camera.saved = [];
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
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  time = 1_400;
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  time = 3_100;
  addKind("Place a point");
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
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record my words" })).toBeTruthy());

  const [draft] = loadRecordingDrafts(localStorage, "learner-1");
  const take = keptTake(draft!.cards[0]!)!;
  expect(take.durationMs).toBe(8_000);
  expect(take.events.map((event) => [event.t, event.type])).toEqual([[400, "component.insert"], [2_100, "point_tool.place"], [4_000, "tool.laser"]]);
  expect(cardActions(board.compiled, 0).map((action) => action.do)).toEqual(["write", "revise", "point", "focus"]);

  fireEvent.change(screen.getByRole("textbox", { name: "What you said on this card" }), { target: { value: "Point A is at 1 comma 2." } });
  fireEvent.click(screen.getByRole("button", { name: "Save captions" }));
  expect(keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)?.text).toBe("Point A is at 1 comma 2.");
  expect(board.compiled?.lesson.steps[0]!.beats.map((beat) => beat.say).join(" ")).toBe("Point A is at 1 comma 2.");
});

it("records the learner's face movement with a take only when they turn the camera on", async () => {
  renderStudio();
  // Off by default: no camera at all.
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  time = 2_000;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record my words" })).toBeTruthy());
  expect(camera.starts).toEqual([]); expect(camera.saved).toEqual([]);
  expect(keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)?.camera).toBeUndefined();

  expect(screen.queryByRole("region", { name: "Your character" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Let my camera move my character" }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.presenter).toMatchObject({ cameraMotion: "on", mouthMotion: "basic" });
  expect(screen.getByText(/Your picture is never saved or uploaded/)).toBeTruthy();
  // Turning it on starts the camera right away, and the learner's character follows them before recording.
  expect(camera.opens).toBe(1);
  const preview = await screen.findByRole("region", { name: "Your character" });
  expect(preview.dataset.character).toBe("star-fox");
  time = 3_000;
  fireEvent.click(screen.getByRole("button", { name: "Re-record my words" }));
  expect(camera.starts).toEqual([3_000]);
  // It keeps following them while they record.
  expect(await screen.findByRole("region", { name: "Your character" })).toBeTruthy();
  time = 5_000;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(camera.saved).toHaveLength(1));
  expect(camera.saved[0]).toEqual({ profileId: "learner-1", recordingId: "rec-1", cardKey: "card-1", take: 2 });
  await waitFor(() => expect(keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)?.camera).toBe(true));

  // A discarded take keeps nothing.
  fireEvent.click(screen.getByRole("button", { name: "Re-record my words" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard this take" }));
  expect(camera.cancels).toBe(1); expect(camera.saved).toHaveLength(1);
  // Turning it off turns the camera off and the character goes away.
  fireEvent.click(screen.getByRole("checkbox", { name: "Let my camera move my character" }));
  expect(camera.closes).toBe(1);
  expect(screen.queryByRole("region", { name: "Your character" })).toBeNull();
});

it("lets the learner change the character before recording, and the character greets them", async () => {
  renderStudio();
  expect(await screen.findByText("Star Fox · curious and adventurous")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Change character" }));
  const picker = screen.getByRole("region", { name: "Who presents your lesson" });
  fireEvent.click(within(picker).getByRole("radio", { name: /^Red Panda/ }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.presenter).toMatchObject({ avatar: "red-panda" });
  expect(screen.getByText("Red Panda · warm and patient")).toBeTruthy();
  // It says one of its own lines.
  await waitFor(() => expect(PRESENTER_GREETINGS["red-panda"].en.some((line) => within(picker).queryByText(line))).toBe(true));

  // The camera preview draws the chosen character.
  fireEvent.click(screen.getByRole("checkbox", { name: "Let my camera move my character" }));
  expect((await screen.findByRole("region", { name: "Your character" })).dataset.character).toBe("red-panda");
  // While recording, the choice is locked.
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  expect(screen.queryByRole("button", { name: "Change character" })).toBeNull();
});

it("flags a card at once when its take has no recognized words, instead of marking it recorded", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  time = 9_000;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  expect(await screen.findByText("! No words recognized · add them below, or re-record your words")).toBeTruthy();
  const strip = screen.getByRole("list", { name: "Cards" });
  expect(within(strip).getAllByRole("button")[0]!.dataset.state).toBe("fix");
  expect(screen.queryByText(/^✓ Recorded/)).toBeNull();
});

it("puts what the learner just said on the board as words, or as a note of a chosen kind", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  await waitFor(() => expect(voice.onUtterance).toBeTruthy());
  voice.transcripts = ["Matter comes in three states."];
  time = 2_000;
  act(() => voice.onUtterance!(new Blob(["wav"])));
  await screen.findByText("Matter comes in three states.");
  addKind("Text");
  fireEvent.click(screen.getByRole("button", { name: /^Use what I just said: “Matter comes in three/ }));
  expect((screen.getByRole("textbox", { name: "Words to write" }) as HTMLTextAreaElement).value).toBe("Matter comes in three states.");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  addKind("Note");
  fireEvent.click(screen.getByRole("radio", { name: "Careful" }));
  fireEvent.change(screen.getByRole("textbox", { name: "What the note says" }), { target: { value: "Steam is hot." } });
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  const take = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes.at(-1)!;
  expect(take.events.map((event) => ("panel" in event ? event : null))).toMatchObject([
    { panel: "text", text: "Matter comes in three states." },
    { panel: "note", role: "warning", text: "Steam is hot." },
  ]);
});

it("keeps other cards locked while one records, and discarding a take leaves no trace", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  expect((screen.getByRole("button", { name: /Rise over run/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Discard this take" }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes).toEqual([]);
  expect((screen.getByRole("button", { name: /Rise over run/ }) as HTMLButtonElement).disabled).toBe(false);
});

it("only offers pointing while recording", () => {
  renderStudio();
  expect((screen.getByRole("button", { name: /Laser pointer/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(board.onTarget).toBeUndefined();
});

it("says so when the draft does not exist", () => {
  renderStudio("missing");
  expect(screen.getByRole("alert").textContent).toBe("This lesson draft can't be found.");
});

it("refuses a point outside the grid and says where the grid ends", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  addKind("Place a point");
  fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "4" } });
  fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: "8" } });
  expect(screen.getByRole("alert").textContent).toBe("This point is outside the grid: x goes from -5 to 5, y from -5 to 5.");
  expect((screen.getByRole("button", { name: "Put on the board" }) as HTMLButtonElement).disabled).toBe(true);
});

it("freezes the take's handwriting onto the card, as an annotation when written on a component", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  expect(board.inkDocuments).toEqual(["rec-1:card-1:take-1"]);
  fireEvent.click(screen.getByRole("button", { name: /Pen/ }));
  expect(board.pen.at(-1)).toBe("draw");
  fireEvent.click(screen.getByRole("button", { name: /Eraser/ }));
  expect(board.pen.at(-1)).toBe("erase");
  board.frozen = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L9 9\"/></svg>", width: 40, height: 30, annotates: { node: "grid-1", x: 0.3, y: 0.5, width: 0.1, height: 0.1 } };
  time = 4_000;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  voice.transcripts = ["Here is a grid.", "Point A is at one two."];
  expect(screen.getByText("Start talking. Your words will show up here.")).toBeTruthy();
  time = 1_600; voice.onSpeechStart!();
  time = 4_000; voice.onUtterance!(new Blob(["a"]));
  // The words show while the learner is still recording.
  expect(await screen.findByText("Here is a grid.")).toBeTruthy();
  time = 4_500; voice.onSpeechStart!();
  time = 7_000; voice.onUtterance!(new Blob(["b"]));
  // Each sentence has its own box.
  expect(await screen.findByText("Point A is at one two.")).toBeTruthy();
  expect(screen.getByText("Here is a grid.").tagName).toBe("LI");
  time = 8_000;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record my words" })).toBeTruthy());
  const take = keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)!;
  expect(take.text).toBe("Here is a grid. Point A is at one two.");
  expect(take.speechSpanMs).toEqual([600, 6_000]);
  expect(take.segments).toEqual([
    { startMs: 600, endMs: 3_000, text: "Here is a grid.", asrText: "Here is a grid." },
    { startMs: 3_500, endMs: 6_000, text: "Point A is at one two.", asrText: "Point A is at one two." },
  ]);
  // The words are edited in the strip under the board: one block per sentence.
  const strip = within(screen.getByRole("region", { name: "Card 1: words and actions" }));
  expect(strip.getByRole("button", { name: /^Sentence 1: Here is a grid\./ })).toBeTruthy();

  // Correcting one sentence keeps the others and the card's words in step.
  fireEvent.click(strip.getByRole("button", { name: /^Sentence 2: / }));
  // It opens in a popover above the block.
  const popover = within(screen.getByRole("dialog", { name: "Sentence 2" }));
  fireEvent.change(popover.getByRole("textbox", { name: "Sentence 2" }), { target: { value: "Point A is at 1, 2." } });
  fireEvent.click(popover.getByRole("button", { name: "Done" }));
  const corrected = keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)!;
  expect(corrected.segments!.map((segment) => segment.text)).toEqual(["Here is a grid.", "Point A is at 1, 2."]);
  expect(corrected.text).toBe("Here is a grid. Point A is at 1, 2.");
  expect(corrected.textEditedAt).toBeTruthy();
});

it("asks the learner to type the words when recognition is not connected", async () => {
  voice.available = false;
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  // Said before the learner starts talking, not only after the take.
  expect(await screen.findByText(/Speech recognition isn't connected, so your words won't turn into captions/)).toBeTruthy();
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  voice.onSpeechStart!(); voice.onUtterance!(new Blob(["a"]));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  expect(await screen.findByText("Speech recognition isn't connected yet. Please type what you said on this card below.")).toBeTruthy();
});

it("says when nothing was heard during a take", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  await act(async () => undefined);
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  expect(await screen.findByText("I didn't hear you this time. Check that your microphone is on, or type what you said below.")).toBeTruthy();
});

it("shows the microphone level and whether words are heard and being turned into text", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  fireEvent.click(screen.getByRole("button", { name: /Laser pointer/ }));
  time = 2_000;
  act(() => board.onStroke!({ x: 140, y: 80, width: 20, height: 40 }));
  expect(board.pointers.at(-1)).toEqual({ at: { x: 150, y: 100 } });
  // A second stroke that the learner then erases points at nothing.
  act(() => board.onStroke!({ x: 300, y: 300, width: 10, height: 10 }));
  board.strokes = [{ x: 150, y: 100 }];
  board.frozen = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>", x: 100, y: 60, width: 100, height: 80 } as typeof board.frozen;
  time = 5_000;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink).toHaveLength(1));
  const ink = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink![0]!;
  expect(ink.selections).toEqual(["sel-card-1-t1-m1"]);
  expect(JSON.parse(localStorage.getItem("octos-learn:learner-ink:v1:learner-1")!)[ink.snapshotId].regions).toEqual({ "sel-card-1-t1-m1": { x: 0.4, y: 0.25, width: 0.2, height: 0.5 } });
  await waitFor(() => expect(cardActions(board.compiled, 0).filter((action) => action.do === "point"))
    .toEqual([expect.objectContaining({ target: expect.stringMatching(/^ink-card-1#/) })]));
});

it("tells the learner when the microphone cannot be used", async () => {
  voice.listening = false;
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  expect(await screen.findByText("The microphone isn't available. You can still record, then type what you said below.")).toBeTruthy();
});

it("records a drag of the unit circle and a turn of the box, at the nearest named view", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Unit circle");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  addKind("Solid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  expect(board.onVariableGesture).toBeTypeOf("function");
  time = 4_000;
  act(() => board.onVariableGesture!({ variable: "theta", via: "geometry_point", from: 0, to: 1.2, durationMs: 2_000, startedAgoMs: 2_000 }));
  time = 5_000;
  act(() => board.onSceneGesture!({ node: "box-1", yaw: 0.05, pitch: 1.45 }));
  fireEvent.click(screen.getByRole("button", { name: /Pen/ }));
  expect(board.onVariableGesture).toBeUndefined();
  const actions = cardActions(board.compiled, 0);
  expect(actions.find((action) => action.do === "animate")).toMatchObject({ variable: "theta", value: 1.2, duration_intent: "normal" });
  expect(actions.find((action) => action.do === "view")).toMatchObject({ target: "box-1", preset: "top" });
  const take = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes[0]!;
  expect(take.events.map((event) => [event.type, event.t])).toEqual([["component.insert", 0], ["component.insert", 0], ["variable.drag", 1_000], ["view.rotate", 4_000]]);
});

/** Opens Add on the dock and picks what to put on the board. */
function addKind(kind: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(screen.getByRole("button", { name: kind }));
}

function placeGridWithPoints(points: Array<[string, string]>) {
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  for (const [x, y] of points) {
    addKind("Place a point");
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: x } });
    fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: y } });
    fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  }
}

it("draws the line through two placed points on their grid; an arrow joins two cards, not two parts of one", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  placeGridWithPoints([["1", "2"], ["2", "4"]]);
  addKind("Line through two points");
  expect(screen.getByText("Draws y = 2x on the grid")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Draw it on the grid" }));
  fireEvent.click(screen.getByRole("button", { name: /Arrow/ }));
  expect(screen.getByText("Tap where the arrow starts.")).toBeTruthy();
  act(() => board.onTarget!({ node: "grid-1", part: "point-a" }));
  expect(screen.getByText("Now tap where the arrow points.")).toBeTruthy();
  act(() => board.onTarget!({ node: "grid-1", part: "line-1" }));
  expect(screen.getByText("An arrow joins two different cards. Tap another card.")).toBeTruthy();
  const actions = cardActions(board.compiled, 0);
  // No new card: the grid itself shows the line, from edge to edge.
  expect(actions.filter((action) => action.do === "write").map((action) => (action as { kind?: string }).kind)).toEqual(["geometry"]);
  // The grid's last state in the card: the line is added after the points.
  const grid = [...actions].reverse().find((action) => action.do === "revise" && (action as { target?: string }).target === "grid-1") as unknown as { content: { segments: unknown[]; points: Array<{ as: string; x: number; y: number }> } };
  expect(grid.content.segments).toEqual([{ as: "line-1", from: "line-1-start", to: "line-1-end", label: "y = 2x" }]);
  expect(grid.content.points.filter((point) => point.as.startsWith("line-1")).map(({ x, y }) => [x, y])).toEqual([[-2.5, -5], [2.5, 5]]);
  expect(actions.find((action) => action.do === "connect")).toBeUndefined();
});

it("lists each grid point once while a card with points is re-recorded", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  placeGridWithPoints([["1", "2"], ["2", "4"]]);
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Re-record my words" }));
  addKind("Line through two points");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["A (1, 2)", "B (2, 4)", "A (1, 2)", "B (2, 4)"]);
  fireEvent.click(screen.getByRole("button", { name: "Place a point" }));
  expect(screen.getByText("This point is called C")).toBeTruthy();
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
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Unit circle");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record my words" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /2 · Your turn/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
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

it("sets up a Your turn question answered with a number, checked as the viewer would type it", async () => {
  localStorage.clear();
  const recording = planCards(
    createRecording({ id: "rec-1", now: "2026-10-31T12:00:00.000Z", topic: { text: "Fractions", type: "math_off_map" }, goals: ["Simplify"] }),
    "2026-10-31T12:00:00.000Z",
    [{ title: "Halves" }, { title: "Your turn", kind: "your_turn" }],
  );
  saveRecordingDraft(localStorage, "learner-1", recording);
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /2 · Your turn/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Text");
  fireEvent.change(screen.getByRole("textbox", { name: "Words to write" }), { target: { value: "Simplify 6/8" } });
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  // No unit circle: dragging is not offered; typing a number is.
  expect(screen.queryByRole("radio", { name: "Drag to the answer" })).toBeNull();
  expect(screen.getByRole("radio", { name: "Type a number" }).getAttribute("aria-checked")).toBe("true");
  const answer = screen.getByRole("textbox", { name: "Correct answer" });
  fireEvent.change(answer, { target: { value: "three quarters" } });
  expect(screen.getByText(/Write a whole number, a decimal, a fraction/)).toBeTruthy();
  fireEvent.change(answer, { target: { value: "6/8" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Must be in simplest form" }));
  expect(screen.getByText("If the answer must be in simplest form, write it in simplest form here too.")).toBeTruthy();
  fireEvent.change(answer, { target: { value: "3/4" } });
  fireEvent.click(screen.getByRole("button", { name: "Save this exercise" }));
  expect(board.compiled!.lesson.lesson.tasks?.[0]).toMatchObject({
    anchor: "text-1", allowed_operations: [{ kind: "answer_entry" }],
    completion: { kind: "numeric_answer", answer: "3/4", form: "simplest_fraction" },
  });
});

it("turns a card with nothing recorded into the lesson's Your turn exercise, and back", async () => {
  localStorage.clear();
  const recording = planCards(
    createRecording({ id: "rec-1", now: "2026-10-31T12:00:00.000Z", topic: { text: "Sine", type: "math_off_map" }, goals: ["Sine is height"] }),
    "2026-10-31T12:00:00.000Z",
    [{ title: "The circle" }, { title: "Try it" }],
  );
  saveRecordingDraft(localStorage, "learner-1", recording);
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Make this a “Your turn” exercise" }));
  fireEvent.click(screen.getByRole("button", { name: "Make it a teaching card again" }));
  fireEvent.click(screen.getByRole("button", { name: /2 · Try it/ }));
  fireEvent.click(screen.getByRole("button", { name: "Make this a “Your turn” exercise" }));
  expect(screen.getByRole("button", { name: "Make it a teaching card again" })).toBeTruthy();
  // One exercise per lesson: the first card no longer offers it.
  fireEvent.click(screen.getByRole("button", { name: /1 · The circle/ }));
  expect(screen.queryByRole("button", { name: "Make this a “Your turn” exercise" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Record card 1/ }));
  addKind("Unit circle");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Re-record my words" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /2 · Try it/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Record card 2/ }));
  expect(screen.getByRole("form", { name: "Set up the “Your turn” exercise" })).toBeTruthy();
});

it("records a back-and-forth drag as moves in order", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Unit circle");
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
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  expect(await screen.findByText("Octo couldn't think of a question this time. You can go on to the next card.")).toBeTruthy();
});

it("makes circled handwriting neat, and the formula takes its place on the board right away", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  board.inkCount = 3;
  fireEvent.click(screen.getByRole("button", { name: "Neat" }));
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
  await waitFor(() => expect(cardActions(board.compiled, 0).find((action) => action.do === "write" && action.kind === "math"))
    .toMatchObject({ content: { fragments: [{ latex: "\\dfrac{8-2}{4-1}=2" }] }, place: { relation: "replaces", anchor: "ink-card-1" }, source: { selection: "sel-card-1-t1-n1", confirmed_by: "learner" } }));
  expect(screen.getByRole("button", { name: /^Stop/ })).toBeTruthy();
  expect(board.compiled!.resourceContext.ink_snapshots?.[0]?.snapshot_id).toBe("ink-snap:rec-1-card-1-t1-n1@v1");

  board.frozen = null;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink).toHaveLength(1));
  const card = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!;
  expect(card.ink![0]).toMatchObject({ selections: ["sel-card-1-t1-n1"], annotates: { node: "grid-1" }, neat: { selection: "sel-card-1-t1-n1", latex: "\\dfrac{8-2}{4-1}=2" } });
  expect(keptTake(card)!.ink).toBeUndefined();

  // Re-recording the card keeps the neat formula in the writing's place.
  fireEvent.click(await screen.findByRole("button", { name: "Re-record my words" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await waitFor(() => expect(keptTake(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!)!.take).toBe(2));
  await waitFor(() => expect(cardActions(board.compiled, 0).map((action) => [action.do, (action as { as?: string }).as]))
    .toEqual(expect.arrayContaining([["write", "ink-card-1"], ["write", "formula-1"]])));
});

it("re-recording keeps the card's board, and starting over clears it", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Re-record my words" }));
  expect(cardActions(board.compiled, 0).some((action) => action.do === "write" && action.kind === "geometry")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Discard this take" }));
  fireEvent.click(screen.getByRole("button", { name: "Start this card over" }));
  expect(board.compiled).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: /^Stop/ })).toBeTruthy();
});

it("can make all of a card's writing neat in one go", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  board.inkCount = 1;
  fireEvent.click(screen.getByRole("button", { name: "Neat" }));
  fireEvent.click(screen.getByRole("button", { name: "Make all my writing neat" }));
  expect(await screen.findByRole("textbox", { name: "Formula (you can edit it)" })).toBeTruthy();
});

it("asks for writing first when there is no handwriting to tidy", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  fireEvent.click(screen.getByRole("button", { name: "Neat" }));
  expect(await screen.findByText("Write something first, then ask Octo to tidy it.")).toBeTruthy();
});

it("Check my lesson runs the screen check and Octo's review as one, and opens the card to fix", async () => {
  assist.review = { cards: [
    { key: "card-1", status: "good", kind: "none", message: "Clear points." },
    { key: "card-2", status: "check", kind: "slip", message: "You said one half; the board shows 2." },
  ], overall: "Fix how you read card 2." };
  screenCheck.results = [{ card: "card-1", board: "chromebook", problems: ["small_text"] }];
  renderStudio();
  for (const name of [/Pick two points/, /Rise over run/]) {
    fireEvent.click(screen.getByRole("button", { name }));
    fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
    addKind("Coordinate grid");
    fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
    fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
    await screen.findByRole("button", { name: "Re-record my words" });
  }
  fireEvent.click(screen.getAllByRole("button", { name: "Check my lesson" })[0]!);
  const dialog = await screen.findByRole("dialog", { name: "Check my lesson" });
  expect(await within(dialog).findByText("You said one half; the board shows 2.")).toBeTruthy();
  expect(within(dialog).getByText("On a small laptop: the text is too small to read.")).toBeTruthy();
  expect(within(dialog).getByText("Nearly there! Fix 2 card(s) and your lesson is ready to watch.")).toBeTruthy();
  const saved = loadRecordingDrafts(localStorage, "learner-1")[0]!.review!;
  expect(saved.overall).toBe("Fix how you read card 2.");
  expect(saved.screen).toEqual(screenCheck.results);
  // The cards that need a fix are marked in the card strip too.
  expect(screen.getByRole("button", { name: /Rise over run/ }).getAttribute("data-state")).toBe("fix");
  fireEvent.click(within(dialog).getByRole("button", { name: "Fix card 2" }));
  expect(screen.queryByRole("dialog", { name: "Check my lesson" })).toBeNull();
  expect(screen.getByRole("button", { name: /Rise over run/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("To fix on this card")).toBeTruthy();
  expect(screen.getByText("You said one half; the board shows 2.")).toBeTruthy();
  // Re-recording the card clears its findings until the next check.
  time = 99_000;
  fireEvent.click(screen.getByRole("button", { name: "Re-record my words" }));
  voice.transcripts = ["The rise is two."];
  await waitFor(() => expect(voice.onUtterance).toBeTruthy());
  time = 102_000;
  act(() => voice.onUtterance!(new Blob(["wav"])));
  time = 104_000;
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  await screen.findByRole("button", { name: "Re-record my words" });
  expect(screen.queryByText("To fix on this card")).toBeNull();
  expect(screen.getByRole("button", { name: /Rise over run/ }).getAttribute("data-state")).toBe("recorded");
});

it("puts a new graph next to a card of the current row, picked in the list or tapped on the board", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Next: card 2/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Graph");
  const choices = within(screen.getByRole("group", { name: "Put it next to…" }));
  expect((choices.getByRole("radio", { name: "On a new row below" }) as HTMLInputElement).checked).toBe(true);
  expect(choices.getByRole("radio", { name: /Coordinate grid/ })).toBeTruthy();
  // Tapping the grid on the board picks it too.
  act(() => board.onTarget!({ node: "grid-1" }));
  expect((choices.getByRole("radio", { name: /Coordinate grid/ }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  const take = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[1]!.takes.at(-1)!;
  expect(take.events.at(-1)).toMatchObject({ type: "component.insert", panel: "graph", nextTo: "grid-1" });
  expect(cardActions(board.compiled, 1)[0]).toMatchObject({ place: { relation: "right_of", anchor: "grid-1" }, role: "supporting_visual" });
});

const takeEvents = () => loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes.at(-1)!.events.map((event) => event.type);
const undoButton = () => screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;

it("undoes the take's steps newest first: a graph, writing, a grid — and only this take's", async () => {
  renderStudio();
  expect(undoButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  expect(undoButton().disabled).toBe(true);
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  // A stroke of writing, then a graph.
  act(() => { for (const listener of board.inkEdits) listener(1); });
  time = 2_000;
  addKind("Graph");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  expect(takeEvents()).toEqual(["component.insert", "component.insert"]);
  expect(cardActions(board.compiled, 0).filter((action) => action.do === "write")).toHaveLength(2);

  fireEvent.click(undoButton());
  expect(takeEvents()).toEqual(["component.insert"]);
  expect(cardActions(board.compiled, 0).filter((action) => action.do === "write")).toHaveLength(1);
  expect(board.inkUndos).toEqual([]);
  // ⌘Z / Ctrl+Z does the same: next comes the stroke, then the grid.
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(board.inkUndos).toEqual([1]));
  expect(takeEvents()).toEqual(["component.insert"]);
  fireEvent.keyDown(window, { key: "z", metaKey: true });
  expect(takeEvents()).toEqual([]);
  expect(undoButton().disabled).toBe(true);

  // A re-recorded card keeps its board from the kept take; Undo cannot take that away.
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Re-record my words" }));
  expect(takeEvents()).toEqual(["component.insert"]);
  expect(undoButton().disabled).toBe(true);
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(takeEvents()).toEqual(["component.insert"]);
});

it("undoing neat writing removes the formula and brings the handwriting back", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  board.inkCount = 2;
  fireEvent.click(screen.getByRole("button", { name: "Neat" }));
  board.selected = { svg: "<svg/>", width: 50, height: 30 };
  act(() => board.onSelect!(2));
  fireEvent.click(screen.getByRole("button", { name: "Make the circled writing neat" }));
  await screen.findByRole("textbox", { name: "Formula (you can edit it)" });
  board.cut = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>", width: 50, height: 30 };
  fireEvent.click(screen.getByRole("button", { name: "Use this" }));
  await waitFor(() => expect(takeEvents()).toEqual(["make_neat.confirmed"]));

  fireEvent.click(undoButton());
  await waitFor(() => expect(board.inkUndos).toEqual([1]));
  const take = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes.at(-1)!;
  expect(take.events).toEqual([]);
  expect(take.ink).toEqual([]);
  expect(board.compiled).toBeNull();
});

it("the highlighter's mark stays, unlike the laser's brief dot", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /^Record card \d/ }));
  addKind("Coordinate grid");
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  fireEvent.click(screen.getByRole("button", { name: /Highlighter/ }));
  expect(screen.getByText(/only that stays yellow/)).toBeTruthy();
  const pointersBefore = board.pointers.length;
  act(() => board.onTarget!({ node: "grid-1" }));
  // No laser dot: the lesson itself shows the highlight, now and in playback.
  expect(board.pointers.slice(pointersBefore).filter(Boolean)).toEqual([]);
  expect(cardActions(board.compiled, 0).find((action) => action.do === "emphasize")).toMatchObject({ target: "grid-1", emphasis: "focus" });

  // On live writing, the board marks the stroke until the writing is frozen into the lesson.
  board.strokes = [{ x: 150, y: 100 }];
  act(() => board.onStroke!({ x: 140, y: 80, width: 20, height: 40 }));
  await waitFor(() => expect(board.marks.at(-1)).toEqual([{ x: 140, y: 80, width: 20, height: 40 }]));
  fireEvent.click(undoButton());
  await waitFor(() => expect(board.marks.at(-1)).toEqual([]));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.takes.at(-1)!.inkMarks).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: /Laser pointer/ }));
  expect(screen.getByText(/flashes for a moment/)).toBeTruthy();
});

/** A lesson whose second card's graph follows the first card's unit circle. */
function linkedLesson(): LearnerRecording {
  const at = "2026-10-31T12:00:00.000Z";
  let recording = planCards(createRecording({ id: "rec-2", now: at, topic: { text: "Sine", type: "math_off_map" }, goals: ["Read sin x"] }), at,
    [{ title: "The circle" }, { title: "The wave" }]);
  const take = (key: string, events: RecordingEvent[], text: string) => {
    recording = startTake(recording, key, at);
    for (const event of events) recording = appendEvent(recording, key, event, at);
    recording = finishTake(recording, key, at, { durationMs: 3000, asrText: text, speechSpanMs: [0, 3000] });
  };
  take("card-1", [{ t: 0, type: "component.insert", panel: "unit_circle", alias: "unit-circle-1", variable: "theta" }], "The circle.");
  take("card-2", [{ t: 0, type: "component.insert", panel: "graph", alias: "graph-1", expression: "sin(x)", x: [-5, 5], y: [-2, 2], linkedVariable: "theta" }], "The wave.");
  saveRecordingDraft(localStorage, "learner-1", recording);
  return recording;
}

it("renames a card from its panel", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Rename card" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Card name" }), { target: { value: "  Two points  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.title).toBe("Two points");
  expect(screen.getByRole("heading", { name: "Two points" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /1 · Two points/ }).length).toBeGreaterThan(0);
});

it("will not start a card over when a later card builds on it, and says why", () => {
  linkedLesson();
  renderStudio("rec-2");
  const startOver = screen.getAllByRole("button", { name: "Start this card over" })[0] as HTMLButtonElement;
  expect(startOver.disabled).toBe(true);
  expect(screen.getAllByText(/A later card uses something on this card/).length).toBeGreaterThan(0);
  // The later card itself can start over.
  fireEvent.click(screen.getAllByRole("button", { name: /2 · The wave/ })[0]!);
  expect((screen.getAllByRole("button", { name: "Start this card over" })[0] as HTMLButtonElement).disabled).toBe(false);
});

it("advanced mode: edited OLL is checked, kept with the draft, and can be dropped", () => {
  linkedLesson();
  renderStudio("rec-2");
  fireEvent.click(screen.getByRole("button", { name: "Advanced: lesson data" }));
  const drawer = within(screen.getByRole("dialog", { name: "Advanced: lesson data" }));
  const editor = drawer.getByRole("textbox", { name: "Lesson (OLL)" }) as HTMLTextAreaElement;
  // The whole lesson, as made from the recording (the board shows it up to the selected card).
  const made = JSON.parse(editor.value);
  fireEvent.change(editor, { target: { value: "{ broken" } });
  fireEvent.click(drawer.getByRole("button", { name: "Check and use" }));
  expect(drawer.getByRole("alert").textContent).toMatch(/can't be used: JSON/);
  expect(loadRecordingDrafts(localStorage, "learner-1").find((draft) => draft.id === "rec-2")!.oll).toBeUndefined();

  made.steps[1].beats[0].say = "Now the wave.";
  fireEvent.change(editor, { target: { value: JSON.stringify(made) } });
  fireEvent.click(drawer.getByRole("button", { name: "Check and use" }));
  const kept = loadRecordingDrafts(localStorage, "learner-1").find((draft) => draft.id === "rec-2")!.oll;
  expect((kept?.lesson as typeof made).steps[1].beats[0].say).toBe("Now the wave.");
  expect(drawer.getByText(/use your edited OLL/)).toBeTruthy();
  fireEvent.click(drawer.getByRole("button", { name: "Back to the recording's version" }));
  expect(loadRecordingDrafts(localStorage, "learner-1").find((draft) => draft.id === "rec-2")!.oll).toBeUndefined();
  // The draft itself can be copied when something goes wrong.
  fireEvent.click(drawer.getByRole("tab", { name: "Draft (for troubleshooting)" }));
  expect((drawer.getByRole("textbox", { name: "Draft (for troubleshooting)" }) as HTMLTextAreaElement).value).toContain("\"rec-2\"");
});
