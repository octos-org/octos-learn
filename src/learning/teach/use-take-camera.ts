// The camera behind "the camera moves my character". Once the learner turns
// it on, the face model runs on this device and the studio shows their
// character following them live, so they can see it works before recording.
// During a take, the same smoothed face and head parameters are also recorded
// on the take's own clock. Nothing is uploaded, and the camera image itself is
// never shown or kept.

import { useCallback, useEffect, useRef, useState } from "react";

import { FaceCapture, type CaptureError, type CaptureState } from "../avatar/face-capture";
import { FaceSmoother, neutralFrame, type FaceFrame } from "../avatar/face-frame";
import { PerformanceRecorder, type AvatarTrack } from "../avatar/performance-track";

export type TakeCameraState = "off" | "starting" | "tracking" | "lost" | "failed";

export function useTakeCamera(clock: () => number) {
  const video = useRef<HTMLVideoElement>(null);
  const capture = useRef<FaceCapture | null>(null);
  const smoother = useRef(new FaceSmoother());
  const recorder = useRef(new PerformanceRecorder());
  // Whether the current take is being recorded; the camera may be on without it.
  const recording = useRef(false);
  const calibrated = useRef(false);
  const latest = useRef<FaceFrame | null>(null);
  const generation = useRef(0);
  const [state, setState] = useState<TakeCameraState>("off");
  const [error, setError] = useState<CaptureError | null>(null);
  const clockRef = useRef(clock);
  useEffect(() => { clockRef.current = clock; }, [clock]);

  /** Turns the camera off. */
  const close = useCallback(() => {
    generation.current++;
    capture.current?.stop();
    capture.current = null;
    recording.current = false;
    latest.current = null;
    setState("off");
  }, []);
  useEffect(() => close, [close]);

  /** Turns the camera on, for the live character; nothing is recorded until a take begins. */
  const open = useCallback(() => {
    if (capture.current) return;
    const element = video.current;
    if (!element) return;
    const run = ++generation.current;
    smoother.current.reset();
    calibrated.current = false;
    latest.current = null;
    setError(null);
    setState("starting");
    const owner = new FaceCapture(element, {
      onState: (next: CaptureState) => {
        if (run !== generation.current) return;
        setState(next === "tracking" ? "tracking" : next === "lost" ? "lost" : next === "idle" ? "off" : "starting");
      },
      onError: (code) => {
        if (run !== generation.current) return;
        // A failed camera is released, so turning it on again can retry.
        capture.current?.stop();
        capture.current = null;
        recording.current = false;
        setError(code); setState("failed");
      },
      onFrame: (frame) => {
        if (run !== generation.current) return;
        // The pose the learner holds when the camera starts, or when a take starts, is their neutral.
        if (!calibrated.current && frame.tracked) { smoother.current.calibrate(frame); calibrated.current = true; }
        const now = clockRef.current();
        const display = smoother.current.update(frame, now);
        latest.current = display;
        // Past the longest track the recorder keeps, frames are simply not added; the live character carries on.
        if (recording.current) recorder.current.append(display, now);
      },
    });
    capture.current = owner;
    void owner.start();
  }, []);

  /** Starts recording the take that started at `takeStart` (on `clock`), turning the camera on if needed. */
  const begin = useCallback((takeStart: number) => {
    open();
    if (!capture.current) return;
    smoother.current.reset();
    calibrated.current = false;
    recorder.current.begin(takeStart);
    recording.current = true;
  }, [open]);

  /** Ends the take's recording and returns its performance, if a face was seen; the camera stays on. */
  const end = useCallback((): AvatarTrack | null => {
    const active = recording.current && recorder.current.recording;
    recording.current = false;
    if (!active) return null;
    const track = recorder.current.finish(clockRef.current());
    return track.frames.some((frame) => frame.tracked) && track.frames.length >= 2 && track.durationMs > 0 ? track : null;
  }, []);

  /** Drops the take's recording; the camera stays on. */
  const abort = useCallback(() => { recording.current = false; }, []);

  /** The learner's face as the character should show it now; neutral before a face is seen. */
  const frame = useCallback((now: number): FaceFrame => latest.current ?? neutralFrame(now, "mediapipe"), []);

  return { video, state, error, open, close, begin, end, abort, frame };
}
