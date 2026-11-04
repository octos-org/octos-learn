import { cameraSource, CameraConflictError, type CameraLease } from "@/media/camera-source";
import type { HandLandmark, HandwritingInputFrame } from "./handwriting-gesture";

export type HandwritingCaptureState = "idle" | "starting" | "loading" | "tracking" | "lost";
export type HandwritingCaptureError = "camera_unavailable" | "permission_denied" | "model_failed" | "capture_failed" | "worker_unavailable" | "camera_busy";

export interface HandwritingCaptureFrame extends HandwritingInputFrame {
  landmarks?: HandLandmark[];
  confidence: number;
  processingMs: number;
  pipelineMs: number;
}

export interface HandwritingCaptureCallbacks {
  onState(state: HandwritingCaptureState): void;
  onError(error: HandwritingCaptureError): void;
  onFrame(frame: HandwritingCaptureFrame): void;
}

function assetRoot(): string {
  return new URL(`${import.meta.env.BASE_URL}handwriting-runtime`, window.location.origin).href.replace(/\/$/, "");
}

export class HandwritingCapture {
  private generation = 0;
  private lease: CameraLease | null = null;
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private initializationTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private busy = false;
  private lastVideoTime = -1;

  private readonly video: HTMLVideoElement;
  private readonly callbacks: HandwritingCaptureCallbacks;

  constructor(video: HTMLVideoElement, callbacks: HandwritingCaptureCallbacks) {
    this.video = video;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.callbacks.onError("camera_unavailable");
      return;
    }
    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
      this.callbacks.onError("worker_unavailable");
      return;
    }
    this.callbacks.onState("starting");
    try {
      const lease = await cameraSource.acquire("handwriting-local");
      if (generation !== this.generation) {
        lease.release();
        return;
      }
      this.lease = lease;
      const stream = lease.stream;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener("ended", () => {
          if (generation === this.generation) this.fail("camera_unavailable");
        }, { once: true });
      }
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.callbacks.onState("loading");
      const worker = new Worker(`${assetRoot()}/handwriting-capture.worker.js`);
      this.worker = worker;
      worker.onmessage = (event: MessageEvent) => {
        if (generation !== this.generation) return;
        if (event.data.type === "ready") {
          if (this.initializationTimer) clearTimeout(this.initializationTimer);
          this.initializationTimer = null;
          this.ready = true;
          this.schedule(generation);
        } else if (event.data.type === "frame") {
          this.busy = false;
          const landmarks = event.data.landmarks ?? undefined;
          this.callbacks.onState(landmarks ? "tracking" : "lost");
          this.callbacks.onFrame({
            timeMs: event.data.timeMs,
            tracked: Boolean(landmarks),
            landmarks,
            worldLandmarks: event.data.worldLandmarks ?? undefined,
            imageWidth: event.data.imageWidth,
            imageHeight: event.data.imageHeight,
            confidence: landmarks ? 1 : 0,
            processingMs: event.data.processingMs ?? 0,
            pipelineMs: performance.now() - event.data.timeMs,
          });
        } else {
          this.fail(event.data.code === "capture_failed" ? "capture_failed" : "model_failed");
        }
      };
      worker.onerror = () => {
        if (generation === this.generation) this.fail("model_failed");
      };
      worker.postMessage({ type: "init", assetRoot: assetRoot() });
      this.initializationTimer = setTimeout(() => {
        if (generation === this.generation) this.fail("model_failed");
      }, 45_000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error instanceof CameraConflictError ? "camera_busy" : error instanceof DOMException && error.name === "NotAllowedError"
        ? "permission_denied"
        : "camera_unavailable");
    }
  }

  private schedule(generation: number): void {
    this.timer = setTimeout(() => {
      if (generation !== this.generation || !this.ready) return;
      if (!this.busy && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        this.busy = true;
        const timeMs = performance.now();
        const width = this.video.videoWidth || 640;
        const height = this.video.videoHeight || 480;
        const scale = Math.min(1, 640 / Math.max(width, height));
        void createImageBitmap(this.video, { resizeWidth: Math.round(width * scale), resizeHeight: Math.round(height * scale) }).then((image) => {
          if (generation !== this.generation || !this.worker) {
            image.close();
            return;
          }
          this.worker.postMessage({ type: "frame", image, timeMs }, [image]);
        }).catch(() => {
          if (generation === this.generation) this.fail("capture_failed");
        });
      }
      this.schedule(generation);
    }, 1000 / 30);
  }

  private fail(error: HandwritingCaptureError): void {
    this.stop();
    this.callbacks.onError(error);
  }

  stop(): void {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    if (this.initializationTimer) clearTimeout(this.initializationTimer);
    this.timer = null;
    this.initializationTimer = null;
    this.worker?.terminate();
    this.worker = null;
    this.lease?.release();
    this.lease = null;
    this.video.srcObject = null;
    this.ready = false;
    this.busy = false;
    this.lastVideoTime = -1;
    this.callbacks.onState("idle");
  }
}
