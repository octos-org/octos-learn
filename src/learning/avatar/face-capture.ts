import type { FaceFrame } from "./face-frame";

export type CaptureState = "idle" | "starting" | "loading" | "tracking" | "lost";
export type CaptureError = "camera_unavailable" | "permission_denied" | "model_failed" | "capture_failed" | "worker_unavailable";
export interface CaptureCallbacks {
  onState(state: CaptureState): void;
  onError(error: CaptureError): void;
  onFrame(frame: FaceFrame, processingMs: number, pipelineMs: number): void;
  onBodyState?(state: "off" | "loading" | "ready" | "failed"): void;
}

function assetRoot(): string {
  return new URL(`${import.meta.env.BASE_URL}avatar-runtime`, window.location.origin).href.replace(/\/$/, "");
}

/** Runs the real local model on an empty frame, without asking for camera access. */
export function selfTestFaceModel(signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`${assetRoot()}/face-capture.worker.js`);
    let closed = false;
    const finish = (error?: Error, duration = 0) => {
      if (closed) return;
      closed = true; clearTimeout(timer); worker.terminate(); signal.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve(duration);
    };
    const aborted = () => finish(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => finish(new Error("model_failed")), 45_000);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    worker.onerror = () => finish(new Error("model_failed"));
    worker.onmessage = (event) => {
      if (closed) return;
      if (event.data.type === "ready") {
        const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
        const context = canvas.getContext("2d");
        if (!context) { finish(new Error("model_failed")); return; }
        context.fillStyle = "#444"; context.fillRect(0, 0, 320, 240);
        void createImageBitmap(canvas).then((image) => {
          if (closed) { image.close(); return; }
          worker.postMessage({ type: "frame", image, timeMs: performance.now() }, [image]);
        }).catch(() => finish(new Error("model_failed")));
      } else if (event.data.type === "frame") {
        if (event.data.frame.tracked) finish(new Error("unexpected_face"));
        else finish(undefined, event.data.processingMs);
      } else finish(new Error("model_failed"));
    };
    worker.postMessage({ type: "init", assetRoot: assetRoot() });
  });
}

/** Owns all capture resources, including pending permission/bitmap promises. */
export class FaceCapture {
  private generation = 0;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private busy = false;
  private lastVideoTime = -1;
  private initializationTimer: ReturnType<typeof setTimeout> | null = null;
  private video: HTMLVideoElement;
  private callbacks: CaptureCallbacks;
  constructor(video: HTMLVideoElement, callbacks: CaptureCallbacks) { this.video = video; this.callbacks = callbacks; }

  async start(options: { body?: boolean } = {}): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) { this.callbacks.onError("camera_unavailable"); return; }
    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") { this.callbacks.onError("worker_unavailable"); return; }
    this.callbacks.onState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 },
      } });
      if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      for (const track of stream.getVideoTracks()) track.addEventListener("ended", () => {
        if (generation === this.generation) this.fail("camera_unavailable");
      }, { once: true });
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.callbacks.onState("loading");
      // MediaPipe's WASM loader uses importScripts: serve a bundled classic worker.
      const worker = new Worker(`${assetRoot()}/face-capture.worker.js`);
      this.worker = worker;
      worker.onmessage = (event: MessageEvent) => {
        if (generation !== this.generation) return;
        if (event.data.type === "ready") {
          if (this.initializationTimer) clearTimeout(this.initializationTimer);
          this.initializationTimer = null; this.ready = true; this.schedule(generation);
        } else if (event.data.type === "body_state") {
          this.callbacks.onBodyState?.(event.data.state);
        } else if (event.data.type === "frame") {
          this.busy = false;
          this.callbacks.onState(event.data.frame.tracked ? "tracking" : "lost");
          this.callbacks.onFrame(event.data.frame, event.data.processingMs, performance.now() - event.data.frame.timeMs);
        } else this.fail("model_failed");
      };
      worker.onerror = () => { if (generation === this.generation) this.fail("model_failed"); };
      worker.postMessage({ type: "init", assetRoot: assetRoot(), ...(options.body ? { body: true } : {}) });
      this.initializationTimer = setTimeout(() => { if (generation === this.generation) this.fail("model_failed"); }, 45_000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error instanceof DOMException && error.name === "NotAllowedError" ? "permission_denied" : "camera_unavailable");
    }
  }

  private schedule(generation: number): void {
    this.timer = setTimeout(() => {
      if (generation !== this.generation || !this.ready) return;
      if (!this.busy && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        this.busy = true;
        const timeMs = performance.now();
        void createImageBitmap(this.video).then((image) => {
          if (generation !== this.generation || !this.worker) { image.close(); return; }
          this.worker.postMessage({ type: "frame", image, timeMs }, [image]);
        }).catch(() => { if (generation === this.generation) this.fail("capture_failed"); });
      }
      this.schedule(generation);
    }, 1000 / 20);
  }

  private fail(error: CaptureError): void { this.stop(); this.callbacks.onError(error); }
  stop(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    if (this.initializationTimer) clearTimeout(this.initializationTimer);
    this.timer = this.initializationTimer = null;
    this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    this.video.srcObject = null;
    this.ready = this.busy = false; this.lastVideoTime = -1;
    this.callbacks.onState("idle");
    this.callbacks.onBodyState?.("off");
  }
}
