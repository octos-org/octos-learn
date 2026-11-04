// The camera during a take, when the learner turned "the camera moves my
// character" on. The face model runs on this device; only the smoothed face
// and head parameters are recorded, on the take's own clock. The camera is
// on only while a take records, and nothing is uploaded.

import { useCallback, useEffect, useRef, useState } from "react";

import { FaceCapture, type CaptureError, type CaptureState } from "../avatar/face-capture";
import { FaceSmoother } from "../avatar/face-frame";
import { PerformanceRecorder, type AvatarTrack } from "../avatar/performance-track";

export type TakeCameraState = "off" | "starting" | "tracking" | "lost" | "failed";

export function useTakeCamera(clock: () => number) {
  const video = useRef<HTMLVideoElement>(null);
  const capture = useRef<FaceCapture | null>(null);
  const smoother = useRef(new FaceSmoother());
  const recorder = useRef(new PerformanceRecorder());
  const calibrated = useRef(false);
  const generation = useRef(0);
  const [state, setState] = useState<TakeCameraState>("off");
  const [error, setError] = useState<CaptureError | null>(null);
  const clockRef = useRef(clock);
  useEffect(() => { clockRef.current = clock; }, [clock]);

  const release = useCallback(() => {
    generation.current++;
    capture.current?.stop();
    capture.current = null;
    setState("off");
  }, []);
  useEffect(() => release, [release]);

  /** Starts the camera for a take that started at `takeStart` (on `clock`). */
  const start = useCallback((takeStart: number) => {
    release();
    const element = video.current;
    if (!element) return;
    const run = generation.current;
    smoother.current.reset();
    calibrated.current = false;
    recorder.current.begin(takeStart);
    setError(null);
    const owner = new FaceCapture(element, {
      onState: (next: CaptureState) => {
        if (run !== generation.current) return;
        setState(next === "tracking" ? "tracking" : next === "lost" ? "lost" : next === "idle" ? "off" : "starting");
      },
      onError: (code) => {
        if (run !== generation.current) return;
        setError(code); setState("failed");
      },
      onFrame: (frame) => {
        if (run !== generation.current) return;
        // The learner looks at the board when a take starts: that pose is their neutral.
        if (!calibrated.current && frame.tracked) { smoother.current.calibrate(frame); calibrated.current = true; }
        const now = clockRef.current();
        if (!recorder.current.append(smoother.current.update(frame, now), now)) capture.current?.stop();
      },
    });
    capture.current = owner;
    void owner.start();
  }, [release]);

  /** Ends the take: the camera turns off and the recorded performance is returned, if a face was seen. */
  const stop = useCallback((): AvatarTrack | null => {
    const active = Boolean(capture.current) && recorder.current.recording;
    release();
    if (!active) return null;
    const track = recorder.current.finish(clockRef.current());
    return track.frames.some((frame) => frame.tracked) && track.frames.length >= 2 && track.durationMs > 0 ? track : null;
  }, [release]);

  return { video, state, error, start, stop, cancel: release };
}
