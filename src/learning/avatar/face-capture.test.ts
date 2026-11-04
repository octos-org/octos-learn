import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FaceCapture } from "./face-capture";

const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { workers.push(this); }
  send(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}
function setup() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const bitmap = { close: vi.fn() };
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  const video = { play: vi.fn(async () => undefined), srcObject: null, currentTime: 1, readyState: 2 } as unknown as HTMLVideoElement;
  const callbacks = { onState: vi.fn(), onError: vi.fn(), onFrame: vi.fn(), onBodyState: vi.fn() };
  return { owner: new FaceCapture(video, callbacks), track, stream, getUserMedia, video, callbacks, bitmap };
}
beforeEach(() => { vi.useFakeTimers(); workers.length = 0; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("closes a late permission result if the learner stopped or left the page", async () => {
  const s = setup(); let grant: (value: MediaStream) => void = () => {};
  s.getUserMedia.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
  const starting = s.owner.start(); s.owner.stop(); grant(s.stream); await starting;
  expect(s.track.stop).toHaveBeenCalledOnce();
  expect(workers).toHaveLength(0);
  expect(s.video.srcObject).toBeNull();
});

it("does not request microphone audio and tears down tracks, worker and pending frames", async () => {
  const s = setup(); await s.owner.start();
  expect(s.getUserMedia.mock.calls[0]?.[0]).toMatchObject({ audio: false });
  const worker = workers[0]!; worker.send({ type: "ready" });
  await vi.advanceTimersByTimeAsync(60);
  expect(worker.postMessage.mock.calls.some(([value]) => value.type === "frame")).toBe(true);
  s.owner.stop();
  expect(s.track.stop).toHaveBeenCalledOnce(); expect(worker.terminate).toHaveBeenCalledOnce();
  worker.send({ type: "frame", frame: { tracked: true, timeMs: 0 }, processingMs: 1 });
  expect(s.callbacks.onFrame).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(50000);
  expect(s.callbacks.onError).not.toHaveBeenCalled();
});

it("closes an image bitmap that completes after capture stops", async () => {
  const s = setup(); let complete: (image: unknown) => void = () => {};
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((resolve) => { complete = resolve; })));
  await s.owner.start(); const worker = workers[0]!; worker.send({ type: "ready" });
  await vi.advanceTimersByTimeAsync(60); s.owner.stop(); complete(s.bitmap); await vi.advanceTimersByTimeAsync(0);
  expect(s.bitmap.close).toHaveBeenCalledOnce();
  expect(worker.postMessage.mock.calls.filter(([value]) => value.type === "frame")).toHaveLength(0);
});

it("releases the camera when the model fails to initialize", async () => {
  const s = setup(); await s.owner.start();
  workers[0]!.send({ type: "error", code: "model_failed" });
  expect(s.track.stop).toHaveBeenCalledOnce(); expect(s.callbacks.onError).toHaveBeenCalledWith("model_failed");
});

it("times out failed model loading and releases its camera", async () => {
  const s = setup(); await s.owner.start(); await vi.advanceTimersByTimeAsync(45001);
  expect(s.track.stop).toHaveBeenCalledOnce(); expect(s.callbacks.onError).toHaveBeenCalledWith("model_failed");
});

it("opts into local body capture and reports its fallback without stopping the camera", async () => {
  const s = setup(); await s.owner.start({ body: true });
  const worker = workers[0]!;
  expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "init", body: true }));
  worker.send({ type: "body_state", state: "failed" });
  expect(s.callbacks.onBodyState).toHaveBeenCalledWith("failed"); expect(s.callbacks.onError).not.toHaveBeenCalled(); expect(s.track.stop).not.toHaveBeenCalled();
  s.owner.stop(); expect(s.callbacks.onBodyState).toHaveBeenLastCalledWith("off");
});
