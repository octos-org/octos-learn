import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OllNarrationTtsOptions } from "../oll/use-oll-narration-tts";
import type { AudioPlaybackClock } from "@/home/voice/audio-playback";

const state = vi.hoisted(() => ({
  narration: null as OllNarrationTtsOptions | null,
  avatar: null as { characterId: string; mode?: string; clock: AudioPlaybackClock | null; track: unknown; playing: boolean } | null,
  archive: null as ArrayBuffer | null,
  runtime: { playing: false, completed: false, activeSpeech: "", currentBeatId: "", beatIndex: 0, play: vi.fn(), pause: vi.fn(), restart: vi.fn(), startNarration: vi.fn(), completeNarration: vi.fn(), recordNarrationEnd: vi.fn() },
}));
vi.mock("../oll/oll-lesson-runtime", () => ({ LearningWhiteboard: () => <div data-testid="lesson-board" /> }));
vi.mock("../oll/use-oll-lesson-runtime", () => ({ useOllLessonRuntime: ({ source }: { source: string | null }) => {
  if (!source) return null;
  const beat = source.split("\n").flatMap((line) => JSON.parse(line).step?.beats ?? []).find((beat: { narration?: { text?: string } }) => beat.narration?.text);
  state.runtime.currentBeatId = beat.id; state.runtime.activeSpeech = beat.narration.text;
  return state.runtime;
} }));
vi.mock("../oll/use-oll-narration-tts", () => ({ useOllNarrationTts: (options: OllNarrationTtsOptions) => { state.narration = options; return { preparing: false, error: null }; } }));
vi.mock("../avatar/lesson-avatar-preview", () => ({ default: (props: NonNullable<typeof state.avatar>) => { state.avatar = props; return <aside aria-label="讲课的形象" />; } }));
vi.mock("../academy/academy-header", () => ({ AcademyHeader: () => null }));
vi.mock("./learner-lessons-api", () => ({ fetchLessonPackage: async () => state.archive }));
vi.mock("./learner-package-store", () => ({ readStoredLearnerPackage: async () => undefined }));
import { TeachLessonPlayerPage } from "./teach-lesson-player-page";

const fixture = () => { const bytes = readFileSync("docs/avatar-animation-phase-a/calibration-mouth-course.olesson"); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); };
beforeEach(() => { state.runtime.playing = false; state.avatar = null; state.narration = null; state.archive = fixture(); });
afterEach(cleanup);
const open = () => render(<MemoryRouter initialEntries={["/teach/lessons/synthetic-mouth-calibration/play"]}>
  <Routes><Route path="/teach/lessons/:id/play" element={<TeachLessonPlayerPage />} /></Routes></MemoryRouter>);

it("presents a saved lesson with mouth motion by its animated character, following the narration's own clock", async () => {
  open();
  await screen.findByRole("complementary", { name: "讲课的形象" });
  // The fixture names the old placeholder "avatar:octo", which is shown as the default character.
  expect(state.avatar).toMatchObject({ characterId: "star-fox", mode: "player", clock: null, playing: false });
  expect(state.avatar?.track).toBeTruthy();
  expect(state.narration?.onMediaClock).toBeTypeOf("function");
  state.runtime.playing = true;
  const clock = { read: () => ({ positionMs: 1500, durationMs: 4000 }) };
  act(() => state.narration!.onMediaClock!(state.runtime.currentBeatId, clock));
  await waitFor(() => expect(state.avatar?.clock).toBe(clock));
  expect(state.avatar?.playing).toBe(true);
  // Another card's clock is never borrowed.
  act(() => state.narration!.onMediaClock!("other-card", clock));
  await waitFor(() => expect(state.avatar?.clock).toBeNull());
});
