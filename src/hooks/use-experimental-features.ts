import { useSyncExternalStore } from "react";

export const AIR_WRITING_STORAGE_KEY = "octos-learn-experiment-air-writing";
const CHANGE_EVENT = "octos-experimental-features-change";

function readAirWritingEnabled(): boolean {
  try {
    const stored = localStorage.getItem(AIR_WRITING_STORAGE_KEY);
    if (stored === "true" || stored === "false") return stored === "true";
  } catch { /* Use the launch default when browser storage is unavailable. */ }
  return import.meta.env.VITE_ENABLE_HANDWRITING === "true";
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === AIR_WRITING_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function setAirWritingEnabled(enabled: boolean): boolean {
  try {
    localStorage.setItem(AIR_WRITING_STORAGE_KEY, String(enabled));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

export function useExperimentalFeatures() {
  const airWritingEnabled = useSyncExternalStore(subscribe, readAirWritingEnabled, () => false);
  return { airWritingEnabled, setAirWritingEnabled };
}
