import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { HandwritingSetup, HandwritingPractice, type HandwritingSetupSnapshot, type HandwritingPracticeSnapshot } from "./handwriting-setup";
import { loadHandwritingPreferences, saveHandwritingPreferences, DEFAULT_HANDWRITING_PREFERENCES, type HandwritingPreferences } from "./handwriting-preferences";
import type { HandwritingCaptureFrame } from "./handwriting-capture";
import type { HandwritingControllerUpdate } from "./handwriting-controller";

export function useHandwritingSetup(viewport: RefObject<HTMLDivElement | null>) {
  const [preferences, setPreferences] = useState(loadHandwritingPreferences);
  const preferencesRef = useRef(preferences);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  const calibration = useRef<HandwritingSetup | null>(null);
  const practice = useRef<HandwritingPractice | null>(null);
  const [setup, setSetup] = useState<HandwritingSetupSnapshot | null>(null);
  const [training, setTraining] = useState<HandwritingPracticeSnapshot | null>(null);
  const [saved, setSaved] = useState(true);
  const save = useCallback((value: HandwritingPreferences) => {
    setSaved(saveHandwritingPreferences(value));
    setPreferences(value);
  }, []);
  const sample = useCallback((frame: HandwritingCaptureFrame) => {
    const current = calibration.current;
    if (!current) return false;
    const previous = current.snapshot;
    current.add(frame);
    if (current.snapshot !== previous) setSetup(current.snapshot);
    return true;
  }, []);
  const gesture = useCallback((value: HandwritingControllerUpdate) => {
    const current = practice.current;
    if (!current) return false;
    const previous = current.snapshot;
    current.update(value);
    if (current.snapshot !== previous) setTraining(current.snapshot);
    return true;
  }, []);
  const cancelSetup = useCallback(() => {
    calibration.current = null; practice.current = null;
    setSetup(null); setTraining(null);
  }, []);
  const beginSetup = useCallback((kind: "pinch" | "region") => {
    cancelSetup();
    const current = new HandwritingSetup(kind, preferencesRef.current);
    calibration.current = current; setSetup(current.snapshot);
  }, [cancelSetup]);
  const nextSetup = useCallback(() => {
    const current = calibration.current;
    if (!current) return;
    if (current.snapshot.result) { save(current.snapshot.result); cancelSetup(); }
    else { current.next(); setSetup(current.snapshot); }
  }, [save, cancelSetup]);
  const beginPractice = useCallback(() => {
    cancelSetup();
    if (!viewport.current) return;
    const current = new HandwritingPractice(viewport.current.clientWidth, viewport.current.clientHeight);
    practice.current = current; setTraining(current.snapshot);
  }, [cancelSetup, viewport]);
  const finishPractice = useCallback(() => {
    save({ ...preferencesRef.current, tutorialDone: true }); cancelSetup();
  }, [save, cancelSetup]);
  const resetPreferences = useCallback(() => {
    cancelSetup(); save(structuredClone(DEFAULT_HANDWRITING_PREFERENCES));
  }, [save, cancelSetup]);
  return { preferences, preferencesRef, saved, setup, training, sample, gesture, beginSetup, nextSetup,
    cancelSetup, beginPractice, finishPractice, resetPreferences };
}
