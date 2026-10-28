const VISIBILITY_KEY = "octos-learn-next-steps";

/** Learners can hide suggestions on this device; nothing is requested while hidden. */
export function nextStepsShown(): boolean {
  try { return localStorage.getItem(VISIBILITY_KEY) !== "hidden"; } catch { return true; }
}
export function showNextSteps(shown: boolean) {
  try { if (shown) localStorage.removeItem(VISIBILITY_KEY); else localStorage.setItem(VISIBILITY_KEY, "hidden"); } catch { /* applies to this page */ }
}
