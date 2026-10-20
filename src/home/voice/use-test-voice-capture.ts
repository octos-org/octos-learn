import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceCapture } from "./use-voice-capture";
import { encodeWav } from "./wav-encode";
import { nativeAudioCaptureAvailable } from "./microphone";

const SAMPLE_RATE = 16000;
const MAX_SAMPLES = SAMPLE_RATE * 20;

/** Explicit settings tests can submit their recording even when speech segmentation misses it.
 * PCM exists only in this hook, is bounded to 20 seconds, and is discarded on cancellation. */
export function useTestVoiceCapture() {
  const capture = useVoiceCapture();
  const frames = useRef<Float32Array[]>([]);
  const samples = useRef(0);
  const peak = useRef(0);
  const updated = useRef(0);
  const callback = useRef<((wav: Blob) => void) | null>(null);
  const generation = useRef(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [hasFrames, setHasFrames] = useState(false);
  const [canFinish, setCanFinish] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const stopCapture = capture.stop;
  const startCapture = capture.start;
  useEffect(() => () => { generation.current++; callback.current = null; frames.current = []; samples.current = 0; peak.current = 0; }, []);
  const reset = useCallback(() => {
    frames.current = []; samples.current = 0; peak.current = 0; updated.current = 0;
    setInputLevel(0); setHasFrames(false); setCanFinish(false); setSpeechDetected(false);
  }, []);
  const stop = useCallback(() => { generation.current++; callback.current = null; reset(); return stopCapture(); }, [reset, stopCapture]);
  const submit = useCallback((wav: Blob) => {
    const send = callback.current;
    if (!send) return;
    callback.current = null;
    reset(); void stopCapture(); send(wav);
  }, [reset, stopCapture]);
  const start = useCallback(async (onUtterance: (wav: Blob) => void) => {
    const owner = ++generation.current;
    reset(); callback.current = onUtterance;
    const ok = await startCapture(submit, {
      onSpeechStart: () => setSpeechDetected(true),
      onAudioFrame: frame => {
        if (!callback.current) return;
        const remaining = MAX_SAMPLES - samples.current;
        if (remaining <= 0) return;
        const part = frame.slice(0, remaining);
        frames.current.push(part); samples.current += part.length;
        const rms = Math.sqrt(part.reduce((sum, value) => sum + value * value, 0) / Math.max(1, part.length));
        peak.current = Math.max(peak.current, rms);
        if (Date.now() - updated.current >= 100) {
          updated.current = Date.now(); setInputLevel(Math.min(1, rms * 12));
          setHasFrames(true); setCanFinish(samples.current >= SAMPLE_RATE / 2);
        }
      },
    });
    if (owner !== generation.current) return false;
    if (!ok) { callback.current = null; reset(); }
    return ok;
  }, [reset, startCapture, submit]);
  const finish = useCallback(() => {
    if (!callback.current || samples.current < SAMPLE_RATE / 2) return;
    const pcm = new Float32Array(samples.current);
    let offset = 0;
    for (const frame of frames.current) { pcm.set(frame, offset); offset += frame.length; }
    submit(encodeWav(pcm, SAMPLE_RATE));
  }, [submit]);
  return {
    ...capture, start, stop, finish, inputLevel, hasFrames, canFinish, speechDetected,
    manualAvailable: !nativeAudioCaptureAvailable(),
    getInputState: () => ({ samples: samples.current, peak: peak.current }),
  };
}
