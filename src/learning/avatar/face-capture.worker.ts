import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { mediaPipeFrame, neutralFrame } from "./face-frame";
import { bodyFromLandmarks, neutralBody, type BodyPose } from "./body-frame";

export type CaptureRequest = { type: "init"; assetRoot: string; body?: boolean } | { type: "frame"; image: ImageBitmap; timeMs: number };
let detector: FaceLandmarker | undefined;
let pose: PoseLandmarker | undefined, hands: HandLandmarker | undefined;
let body: BodyPose = neutralBody(), lastBody = -Infinity;
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
      if (message.body) {
        self.postMessage({ type: "body_state", state: "loading" });
        const results = await Promise.allSettled([
          PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: `${message.assetRoot}/pose_landmarker_lite.task`, delegate: "CPU" }, runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: false }),
          HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: `${message.assetRoot}/hand_landmarker.task`, delegate: "CPU" }, runningMode: "VIDEO", numHands: 2 }),
        ]);
        if (results[0].status === "fulfilled" && results[1].status === "fulfilled") {
          pose = results[0].value; hands = results[1].value; self.postMessage({ type: "body_state", state: "ready" });
        } else {
          for (const result of results) if (result.status === "fulfilled") result.value.close();
          self.postMessage({ type: "body_state", state: "failed" });
        }
      }
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
    if (pose && hands) {
      if (message.timeMs - lastBody >= 100) {
        try {
          const positions = pose.detectForVideo(message.image, message.timeMs);
          const palms = hands.detectForVideo(message.image, message.timeMs);
          const detected = palms.landmarks.flatMap((points, index) => {
            const label = palms.handedness[index]?.[0];
            return label && label.score >= .5 && ["Left", "Right"].includes(label.categoryName) ? [{ side: label.categoryName.toLowerCase() as "left" | "right", points }] : [];
          });
          body = bodyFromLandmarks(positions.landmarks[0] ?? [], detected, message.image.width, message.image.height);
        } catch {
          body = neutralBody(); pose.close(); hands.close(); pose = undefined; hands = undefined;
          self.postMessage({ type: "body_state", state: "failed" });
        }
        lastBody = message.timeMs;
      }
      frame.body = structuredClone(body);
    }
    self.postMessage({ type: "frame", frame, processingMs: performance.now() - started });
  } catch { self.postMessage({ type: "error", code: "capture_failed" }); }
  finally { message.image.close(); }
};
