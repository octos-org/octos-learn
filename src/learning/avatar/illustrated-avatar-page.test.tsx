import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { envelopeLipSync } from "./lip-sync";
import type { FaceFrame } from "./face-frame";

const stage = vi.hoisted(() => ({ frame: null as ((now: number) => FaceFrame) | null, active: false }));
const signals: AbortSignal[] = [];
vi.mock("./illustrated-avatar-stage", () => ({ IllustratedAvatarStage: (props: { frame: (now: number) => FaceFrame; active: boolean }) => { stage.frame = props.frame; stage.active = props.active; return <div />; } }));
vi.mock("./prepare-preview-audio", () => ({ preparePreviewAudio: vi.fn(async (_bytes: ArrayBuffer, signal: AbortSignal) => {
  signals.push(signal); return envelopeLipSync([new Float32Array(16000 * 4).fill(.2)], 16000, "a".repeat(64));
}) }));
import IllustratedAvatarPage from "./illustrated-avatar-page";

beforeEach(() => {
  signals.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fox-preview"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function () { this.dispatchEvent(new Event("play")); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function () { this.dispatchEvent(new Event("pause")); });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const open = () => render(<MemoryRouter><IllustratedAvatarPage /></MemoryRouter>);

it("does not fetch or play on entry; demo motion and expressions work without capture", () => {
  open(); expect(fetch).not.toHaveBeenCalled(); expect(stage.active).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "只看动作" })); expect(stage.active).toBe(true);
  expect(stage.frame!(performance.now()).source).toBe("demo");
  fireEvent.click(screen.getByRole("button", { name: "想一想" })); expect(stage.frame!(performance.now()).rotation[2]).toBe(-.065);
  fireEvent.click(screen.getByRole("button", { name: "暂停", exact: true })); expect(stage.active).toBe(false);
  expect(stage.frame!(performance.now()).channels.jawOpen).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

it("plays only the local sample, reads actual audio time and releases it on exit", async () => {
  const page = open(); fireEvent.click(screen.getByRole("button", { name: "听星狐讲一讲" }));
  await screen.findByText("跟随真实配音播放");
  expect(vi.mocked(fetch).mock.calls[0]![0]).toContain("illustrated-v0.1/demo-lesson.wav");
  const audio = screen.getByLabelText("星狐示例配音") as HTMLAudioElement;
  Object.defineProperty(audio, "paused", { configurable: true, value: false });
  audio.currentTime = 1.5; expect(stage.frame!(0).channels.jawOpen).toBeGreaterThan(.5);
  audio.currentTime = 4; expect(stage.frame!(0).channels.jawOpen).toBeUndefined();
  page.unmount(); expect(signals[0]!.aborted).toBe(true); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fox-preview");
});

it("cancels late audio preparation when hidden and never starts a fallback voice", async () => {
  let release!: (value: unknown) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  open(); fireEvent.click(screen.getByRole("button", { name: "听星狐讲一讲" }));
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => release({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(stage.active).toBe(false); expect(fetch).toHaveBeenCalledOnce();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

it("keeps the animation usable when the fixed audio cannot load", async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
  open(); fireEvent.click(screen.getByRole("button", { name: "听星狐讲一讲" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("只看动作"));
  fireEvent.click(screen.getByRole("button", { name: "只看动作" })); expect(stage.active).toBe(true);
});
