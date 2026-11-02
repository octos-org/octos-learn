import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FaceFrame } from "./face-frame";
import { envelopeLipSync } from "./lip-sync";

const state = vi.hoisted(() => ({ frame: null as (() => FaceFrame) | null, signals: [] as AbortSignal[] }));
const track = envelopeLipSync([new Float32Array(16000).fill(.2)], 16000, "a".repeat(64));
vi.mock("./avatar-stage", () => ({ AvatarStage: ({ frame }: { frame: () => FaceFrame }) => { state.frame = frame; return <div />; } }));
vi.mock("./prepare-preview-audio", () => ({ preparePreviewAudio: vi.fn(async (_bytes: ArrayBuffer, signal: AbortSignal) => { state.signals.push(signal); return track; }) }));
import { AvatarAudioPreview } from "./avatar-audio-preview";

beforeEach(() => {
  state.signals = [];
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
