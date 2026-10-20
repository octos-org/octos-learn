import type { Capability } from "./services";
/** Open settings over the board, preserving the current input and selection. */
export function openCapabilitySettings(capability: Capability | "lesson"): void {
  window.dispatchEvent(new CustomEvent("octos:configure-service", { detail: capability }));
}
