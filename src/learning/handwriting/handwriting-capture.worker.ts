import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandLandmark } from "./handwriting-gesture";

export type HandwritingCaptureRequest =
  | { type: "init"; assetRoot: string }
  | { type: "frame"; image: ImageBitmap; timeMs: number };

let detector: HandLandmarker | undefined;

self.onmessage = async (event: MessageEvent<HandwritingCaptureRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      const files = await FilesetResolver.forVisionTasks(`${message.assetRoot}/wasm`);
      detector?.close();
      detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${message.assetRoot}/hand_landmarker.task`,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });
      self.postMessage({ type: "ready" });
    } catch {
      self.postMessage({ type: "error", code: "model_failed" });
    }
    return;
  }

  const started = performance.now();
  try {
    if (!detector) throw new Error("not_ready");
    const result = detector.detectForVideo(message.image, message.timeMs);
    const landmarks = result.landmarks[0]?.map((point): HandLandmark => ({
      x: point.x,
      y: point.y,
      z: point.z,
    }));
    // Handedness.score measures left/right classification, not tracking quality.
    // Detection/presence/tracking are gated by the task options above.
    self.postMessage({
      type: "frame",
      timeMs: message.timeMs,
      landmarks: landmarks ?? null,
      worldLandmarks: result.worldLandmarks[0] ?? null,
      imageWidth: message.image.width,
      imageHeight: message.image.height,
      processingMs: performance.now() - started,
    });
  } catch {
    self.postMessage({ type: "error", code: "capture_failed" });
  } finally {
    message.image.close();
  }
};
