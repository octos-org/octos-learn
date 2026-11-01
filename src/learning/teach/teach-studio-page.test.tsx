import { setLocale } from "@/i18n";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { CompiledLesson } from "./compile-recording";
import type { BoardTarget } from "./recording";

const board = vi.hoisted(() => ({
  compiled: null as CompiledLesson | null,
  onTarget: undefined as ((target: BoardTarget) => void) | undefined,
  onVariableGesture: undefined as ((gesture: { variable: string; via: "slider" | "geometry_point"; from: number; to: number; durationMs: number }) => void) | undefined,
  onSceneGesture: undefined as ((gesture: { node: string; yaw: number; pitch: number }) => void) | undefined,
  frozen: null as null | { svg: string; width: number; height: number; annotates?: { node: string; x: number; y: number; width: number; height: number } },
  pen: [] as boolean[],
  inkDocuments: [] as string[],
}));
vi.mock("./teach-board", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    TeachBoard: forwardRef((props: { compiled: CompiledLesson | null; onTarget?: (target: BoardTarget) => void; onVariableGesture?: typeof board.onVariableGesture; onSceneGesture?: typeof board.onSceneGesture }, ref) => {
      board.compiled = props.compiled;
      board.onTarget = props.onTarget;
      board.onVariableGesture = props.onVariableGesture;
      board.onSceneGesture = props.onSceneGesture;
      useImperativeHandle(ref, () => ({
        startInk: async (documentId: string) => { board.inkDocuments.push(documentId); },
        setPen: (on: boolean) => { board.pen.push(on); },
        freezeInk: async () => board.frozen,
        discardInk: async () => undefined,
      }));
      return <div data-testid="teach-board" />;
    }),
  };
});
const voice = vi.hoisted(() => ({
  listening: true,
  onUtterance: undefined as ((wav: Blob) => void) | undefined,
  onSpeechStart: undefined as (() => void) | undefined,
  available: true,
  transcripts: [] as string[],
}));
vi.mock("@/home/voice/use-voice-capture", () => ({
  useVoiceCapture: () => ({
    capturing: false, error: null, getError: () => null,
    start: async (onUtterance: (wav: Blob) => void, options?: { onSpeechStart?: () => void }) => {
      voice.onUtterance = onUtterance; voice.onSpeechStart = options?.onSpeechStart; return voice.listening;
    },
    stop: async () => undefined,
  }),
}));
vi.mock("@/api/cloud-asr", () => ({
  fetchCloudAsrStatus: async () => ({ available: voice.available, detail: "" }),
  transcribeCloudSpeech: async () => ({ status: "speech", transcript: voice.transcripts.shift() ?? "" }),
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
  expect(board.pen.at(-1)).toBe(true);
  board.frozen = { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L9 9\"/></svg>", width: 40, height: 30, annotates: { node: "grid-1", x: 0.3, y: 0.5, width: 0.1, height: 0.1 } };
  time = 4_000;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink).toHaveLength(1));
  const [ink] = loadRecordingDrafts(localStorage, "learner-1")[0]!.cards[0]!.ink!;
  expect(ink!.snapshotId).toBe("ink-snap:rec-1-card-1-t1@v1");
  expect(ink!.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(ink!.annotates).toEqual({ node: "grid-1", x: 0.3, y: 0.5, width: 0.1, height: 0.1 });
  expect(JSON.parse(localStorage.getItem("octos-learn:learner-ink:v1:learner-1")!)["ink-snap:rec-1-card-1-t1@v1"].width).toBe(40);
  expect(board.pen.at(-1)).toBe(false);
});

it("turns what the learner says into the card's captions, timed from the take start", async () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: "Record this card" }));
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  time = 1_600; voice.onSpeechStart!();
  time = 4_000; voice.onUtterance!(new Blob(["a"]));
  time = 4_500; voice.onSpeechStart!();
  time = 7_000; voice.onUtterance!(new Blob(["b"]));
  voice.transcripts = ["Here is a grid.", "Point A is at one two."];
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
  fireEvent.click(screen.getByRole("button", { name: "Coordinate grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Put on the board" }));
  voice.onSpeechStart!(); voice.onUtterance!(new Blob(["a"]));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByText("Speech recognition isn't connected yet. Please type what you said on this card below.")).toBeTruthy();
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
  act(() => board.onVariableGesture!({ variable: "theta", via: "geometry_point", from: 0, to: 1.2, durationMs: 2_000 }));
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
