import { useCallback, useEffect, useMemo, useState } from "react";
import { deriveFactStates, type FactState } from "../core/fact-states";
import { loadProgress, totalInkDrops, type DeviceProgress } from "../store/device-progress";

export interface ArcadeProgress {
  loading: boolean;
  error: boolean;
  progress: DeviceProgress;
  states: Map<string, FactState>;
  inkDrops: number;
  reload: () => void;
}

const EMPTY: DeviceProgress = { answers: [], rounds: [] };

/** Device progress (plan §7.13), with fact states derived from it. */
export function useArcadeProgress(): ArcadeProgress {
  const [progress, setProgress] = useState<DeviceProgress>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    loadProgress()
      .then(value => { if (active) { setProgress(value); setError(false); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  const reload = useCallback(() => setVersion(value => value + 1), []);
  const states = useMemo(() => deriveFactStates(progress.answers), [progress]);
  return { loading, error, progress, states, inkDrops: totalInkDrops(progress.rounds), reload };
}

export type InputChoice = "keypad" | "tap";
const INPUT_KEY = "octos-arcade-input";

export function savedInput(): InputChoice {
  try {
    return localStorage.getItem(INPUT_KEY) === "tap" ? "tap" : "keypad";
  } catch {
    return "keypad";
  }
}

export function saveInput(choice: InputChoice): void {
  try { localStorage.setItem(INPUT_KEY, choice); } catch { /* Keep the default. */ }
}
