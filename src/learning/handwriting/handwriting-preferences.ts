import { HANDWRITING_CAMERA_REGION, type HandwritingCameraRegion } from "./handwriting-map";

export interface HandwritingPinchThresholds { down: number; up: number }
export interface HandwritingPreferences {
  version: 1;
  pinchMetric: 2;
  pinch: HandwritingPinchThresholds;
  region: HandwritingCameraRegion;
  tutorialDone: boolean;
}
export const HANDWRITING_PREFERENCES_KEY = "octos-learn-air-gesture-preferences-v1";
export const DEFAULT_HANDWRITING_PREFERENCES: HandwritingPreferences = {
  version: 1, pinchMetric: 2, pinch: { down: 0.28, up: 0.42 }, region: { ...HANDWRITING_CAMERA_REGION }, tutorialDone: false,
};
export function validPinchThresholds(value: unknown): value is HandwritingPinchThresholds {
  const p = value as HandwritingPinchThresholds | null;
  return Boolean(p && Number.isFinite(p.down) && Number.isFinite(p.up)
    && p.down >= 0.02 && p.up <= 2 && p.up - p.down >= 0.04);
}
export function validHandwritingRegion(value: unknown): value is HandwritingCameraRegion {
  const r = value as HandwritingCameraRegion | null;
  return Boolean(r && [r.left, r.right, r.top, r.bottom].every(Number.isFinite)
    && r.left >= 0 && r.right <= 1 && r.top >= 0 && r.bottom <= 1
    && r.right - r.left >= 0.2 && r.bottom - r.top >= 0.2);
}
export function loadHandwritingPreferences(): HandwritingPreferences {
  try {
    const p = JSON.parse(localStorage.getItem(HANDWRITING_PREFERENCES_KEY) ?? "null");
    if (p?.version === 1 && validPinchThresholds(p.pinch) && validHandwritingRegion(p.region)) {
      return { version: 1, pinchMetric: 2, pinch: p.pinchMetric === 2 ? p.pinch : { ...DEFAULT_HANDWRITING_PREFERENCES.pinch }, region: p.region, tutorialDone: p.tutorialDone === true };
    }
  } catch { /* Unavailable storage or older settings use the initial configuration. */ }
  return structuredClone(DEFAULT_HANDWRITING_PREFERENCES);
}
export function saveHandwritingPreferences(value: HandwritingPreferences): boolean {
  try { localStorage.setItem(HANDWRITING_PREFERENCES_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}
