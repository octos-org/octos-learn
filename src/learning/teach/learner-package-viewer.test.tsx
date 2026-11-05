import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OllNarrationTtsOptions } from "../oll/use-oll-narration-tts";
import type { AudioPlaybackClock } from "@/home/voice/audio-playback";

const state = vi.hoisted(() => ({
  narration: null as OllNarrationTtsOptions | null,
  avatar: null as { clock: AudioPlaybackClock | null; track: unknown } | null,
  source: null as string | null,
  runtime: { playing: false, completed: false, activeSpeech: "", currentBeatId: "", play: vi.fn(), pause: vi.fn(), restart: vi.fn(), startNarration: vi.fn(), completeNarration: vi.fn(), recordNarrationEnd: vi.fn() },
}));
vi.mock("../oll/oll-lesson-runtime", () => ({ LearningWhiteboard: ({ overlay }: { overlay?: import("react").ReactNode }) => <div data-testid="lesson-board">{overlay}</div> }));
vi.mock("../oll/use-oll-lesson-runtime", () => ({ useOllLessonRuntime: ({ source }: { source: string | null }) => {
  state.source = source;
  if (!source) return null;
  const beat = source.split("\n").flatMap((line) => JSON.parse(line).step?.beats ?? []).find((beat: { narration?: { text?: string } }) => beat.narration?.text);
  state.runtime.currentBeatId = beat.id; state.runtime.activeSpeech = beat.narration.text;
  return state.runtime;
} }));
vi.mock("../oll/use-oll-narration-tts", () => ({ useOllNarrationTts: (options: OllNarrationTtsOptions) => { state.narration = options; return { preparing: false, error: null }; } }));
vi.mock("../avatar/lesson-avatar-preview", () => ({ default: (props: { clock: AudioPlaybackClock | null; track: unknown }) => { state.avatar = props; return <aside aria-label="课程动态头像预览" />; } }));
vi.mock("@/home/voice/audio-playback", () => ({ unlockAudio: vi.fn() }));
import LearnerPackageViewer from "./learner-package-viewer";

beforeEach(() => { state.runtime.playing = false; state.avatar = null; state.narration = null; state.runtime.play.mockReset(); });
afterEach(cleanup);
const open = () => render(<MemoryRouter><LearnerPackageViewer /></MemoryRouter>);
const importFixture = () => fireEvent.change(screen.getByLabelText("选择课程包"), { target: { files: [new File([readFileSync("docs/avatar-animation-phase-a/calibration-mouth-course.olesson")], "calibration.olesson")] } });

it("opens an actual package as a full board with narration and an optional animated avatar", async () => {
  open(); importFixture();
  await screen.findByRole("heading", { name: "嘴型课包校准（无真人数据）" });
  expect(screen.getByTestId("lesson-board")).toBeTruthy();
  await screen.findByRole("complementary", { name: "课程动态头像预览" });
  expect(state.avatar?.track).toBeTruthy();
  const audio = await state.narration!.resolveAudio!(state.runtime.currentBeatId, state.runtime.activeSpeech, new AbortController().signal);
  expect(audio?.type).toBe("audio/wav");
  await expect(state.narration!.resolveAudio!(state.runtime.currentBeatId, "Wrong words", new AbortController().signal)).rejects.toThrow("Missing verified packaged narration");
  fireEvent.click(screen.getByRole("button", { name: "播放课程" }));
  expect(state.runtime.play).toHaveBeenCalledOnce();
  state.runtime.playing = true;
  const clock = { read: () => ({ positionMs: 1500, durationMs: 4000 }) };
  act(() => state.narration!.onMediaClock!(state.runtime.currentBeatId, clock));
  await waitFor(() => expect(state.avatar?.clock).toBe(clock));
  act(() => state.narration!.onMediaClock!("other-card", clock));
  await waitFor(() => expect(state.avatar?.clock).toBeNull());
  fireEvent.click(screen.getByRole("checkbox", { name: "显示动态头像预览" }));
  expect(screen.queryByRole("complementary", { name: "课程动态头像预览" })).toBeNull();
});

it("rejects a damaged package and does not start playback", async () => {
  open();
  fireEvent.change(screen.getByLabelText("选择课程包"), { target: { files: [new File(["broken"], "broken.olesson")] } });
  expect((await screen.findByRole("alert")).textContent).toContain("课程包未能读取");
  expect(state.runtime.play).not.toHaveBeenCalled();
  expect(state.narration?.enabled).toBe(false);
});
