import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { mediaPipeFrame, neutralFrame } from "./face-frame";

export type CaptureRequest = { type: "init"; assetRoot: string } | { type: "frame"; image: ImageBitmap; timeMs: number };
let detector: FaceLandmarker | undefined;
// Vite emits this module as a separate worker bundle. No frame leaves the device.
self.onmessage = async (event: MessageEvent<CaptureRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      const files = await FilesetResolver.forVisionTasks(`${message.assetRoot}/wasm`);
      detector = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${message.assetRoot}/face_landmarker.task`, delegate: "CPU" },
        runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      self.postMessage({ type: "ready" });
    } catch { self.postMessage({ type: "error", code: "model_failed" }); }
    return;
  }
  const started = performance.now();
  try {
    if (!detector) throw new Error("not_ready");
    const result = detector.detectForVideo(message.image, message.timeMs);
    const frame = result.faceBlendshapes[0]?.categories.length
      ? mediaPipeFrame(message.timeMs, result.faceBlendshapes[0].categories, result.facialTransformationMatrixes[0]?.data)
      : neutralFrame(message.timeMs, "mediapipe");
    self.postMessage({ type: "frame", frame, processingMs: performance.now() - started });
  } catch { self.postMessage({ type: "error", code: "capture_failed" }); }
  finally { message.image.close(); }
};
