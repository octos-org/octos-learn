import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FaceFrame } from "./face-frame";
import { envelopeLipSync } from "./lip-sync";
import { calibrationWav, audioDigest } from "./lip-sync";
import { preparePreviewAudio } from "./prepare-preview-audio";
import { buildLearnerPackage } from "../teach/learner-package";
import { appendEvent, createRecording, finishTake, planCards, startTake } from "../teach/recording";
import { compileRecording } from "../teach/compile-recording";
import { learnerAuthor } from "../teach/studio-helpers";
import { normalizeAuthoringLesson } from "octos-lesson-language";
import { lessonNarration } from "../teach/learner-package";

const state = vi.hoisted(() => ({ frame: null as (() => FaceFrame) | null, signals: [] as AbortSignal[] }));
const track = envelopeLipSync([new Float32Array(16000).fill(.2)], 16000, "a".repeat(64));
vi.mock("./avatar-stage", () => ({ AvatarStage: ({ frame }: { frame: () => FaceFrame }) => { state.frame = frame; return <div />; } }));
vi.mock("./prepare-preview-audio", () => ({ preparePreviewAudio: vi.fn(async (_bytes: ArrayBuffer, signal: AbortSignal) => { state.signals.push(signal); return track; }) }));
import { AvatarAudioPreview } from "./avatar-audio-preview";

beforeEach(() => {
  state.signals = [];
  vi.mocked(preparePreviewAudio).mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test-audio"), revokeObjectURL: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const load = async () => {
  fireEvent.click(screen.getByRole("button", { name: "载入校准音" }));
  await screen.findByText("基础开合：根据音量变化生成，尚不能区分发音嘴型。");
  return screen.getByLabelText("配音播放控制") as HTMLAudioElement;
};
it("does no audio work on entry; samples the actual paused/seeked media position and playback rate", async () => {
  render(<AvatarAudioPreview />); expect(state.signals).toHaveLength(0);
  const audio = await load();
  audio.currentTime = .5; fireEvent.timeUpdate(audio); fireEvent.pause(audio);
  const paused = state.frame!(); expect(paused.channels.jawOpen).toBeGreaterThan(.5);
  expect(state.frame!()).toEqual(paused);
  fireEvent.change(screen.getByRole("slider", { name: "配音进度" }), { target: { value: "0" } });
  expect(audio.currentTime).toBe(0); expect(state.frame!().timeMs).toBe(0);
  fireEvent.change(screen.getByRole("combobox", { name: "配音播放速度" }), { target: { value: "1.5" } });
  expect(audio.playbackRate).toBe(1.5);
  audio.currentTime = 1; fireEvent.ended(audio); expect(state.frame!().channels).toEqual({});
});
it("rejects a mouth track for other audio and keeps the usable existing track", async () => {
  render(<AvatarAudioPreview />); await load();
  const file = new File(["{}"], "wrong.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => JSON.stringify({ ...track, audioSha256: "b".repeat(64) }) });
  fireEvent.change(screen.getByLabelText("导入发音嘴型轨"), { target: { files: [file] } });
  expect((await screen.findByRole("alert")).textContent).toContain("嘴型文件与当前音频不匹配");
  expect(screen.getByText("基础开合：根据音量变化生成，尚不能区分发音嘴型。")).toBeTruthy();
});
it("cancels pending work, pauses and revokes the object URL on leaving", async () => {
  const page = render(<AvatarAudioPreview />); await load();
  page.unmount();
  await waitFor(() => expect(state.signals[0]!.aborted).toBe(true));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-audio");
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

it("opens a real packaged audio/mouth pair and changes cards without regenerating motion", async () => {
  const now = "2026-11-02T12:00:00.000Z";
  let recording = planCards(createRecording({ id: "packaged-preview", now, topic: { text: "Calibration", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }, { title: "Two" }]);
  for (const key of ["card-1", "card-2"]) recording = finishTake(appendEvent(startTake(recording, key, now), key, { t: 0, type: "component.insert", panel: "coordinate_grid", alias: `grid-${key}`, x: [-1, 6], y: [-1, 9] }, now), key, now, { durationMs: 4000, asrText: key });
  const compiled = compileRecording(recording, { author: learnerAuthor("local"), language: "en-US" });
  const events = normalizeAuthoringLesson(compiled.lesson, { lessonId: "packaged-preview", boardId: "board", baseRevision: 0, resourceContext: compiled.resourceContext });
  const wav = calibrationWav(), hash = await audioDigest(wav);
  const narration = lessonNarration(events).map((entry, index) => ({ ...entry, audio: new Uint8Array(wav), durationMs: 4000, mediaType: "audio/wav" as const,
    lipSync: { ...envelopeLipSync([new Float32Array(64000)], 16000, hash), method: "aligned-visemes-v1" as const,
      keys: [{ timeMs: 0, channels: {} }, { timeMs: 500, channels: { mouthPucker: index ? .8 : .3 } }, { timeMs: 4000, channels: {} }] } }));
  const { archive } = await buildLearnerPackage({ lessonId: recording.id, title: "Calibration", language: "en-US", createdAt: now, events, snapshots: {}, narration });
  render(<AvatarAudioPreview />);
  fireEvent.change(screen.getByLabelText("导入带嘴型的课程包"), { target: { files: [new File([archive], "calibration.olesson")] } });
  expect(await screen.findByText("已载入外部发音嘴型轨，准确度仍需单独验收。")).toBeTruthy();
  expect(preparePreviewAudio).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("slider", { name: "配音进度" }), { target: { value: "500" } });
  expect(state.frame!().channels.mouthPucker).toBe(.3);
  fireEvent.change(screen.getByRole("combobox", { name: "课包卡片" }), { target: { value: narration[1]!.beatId } });
  await screen.findByText("第 2 张卡片 · Calibration");
  fireEvent.change(screen.getByRole("slider", { name: "配音进度" }), { target: { value: "500" } });
  expect(state.frame!().channels.mouthPucker).toBe(.8);
  expect(preparePreviewAudio).not.toHaveBeenCalled();
});
