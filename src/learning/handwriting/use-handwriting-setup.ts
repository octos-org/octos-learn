import { useCallback, useEffect, useRef, useState } from "react";
import { HandwritingSetup, type HandwritingSetupSnapshot } from "./handwriting-setup";
import { loadHandwritingPreferences, saveHandwritingPreferences, DEFAULT_HANDWRITING_PREFERENCES, type HandwritingPreferences } from "./handwriting-preferences";
import type { HandwritingCaptureFrame } from "./handwriting-capture";

export function useHandwritingSetup() {
  const [preferences, setPreferences] = useState(loadHandwritingPreferences);
  const preferencesRef = useRef(preferences);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  const calibration = useRef<HandwritingSetup | null>(null);
  const [setup, setSetup] = useState<HandwritingSetupSnapshot | null>(null);
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
  const cancelSetup = useCallback(() => {
    calibration.current = null;
    setSetup(null);
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
  const resetPreferences = useCallback(() => {
    cancelSetup(); save(structuredClone(DEFAULT_HANDWRITING_PREFERENCES));
  }, [save, cancelSetup]);
  return { preferences, preferencesRef, saved, setup, sample, beginSetup, nextSetup, cancelSetup, resetPreferences };
}
