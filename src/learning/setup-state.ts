import { isLessonCapable } from "@/settings/llm-providers";
import { createContext } from "react";
import type { Profile } from "@/settings/settings-api";

export const LearningModelContext = createContext(true);
export const setupSkipKey = (id: string) => `octos-learn:setup-skipped:${id}`;
export function hasLearningModel(profile: Profile): boolean {
  return Boolean(
    isLessonCapable(profile.config.llm.primary.family_id, import.meta.env.VITE_PUBLIC_DEPLOYMENT === "true") &&
      profile.config.llm.primary.model_id.trim(),
  );
}
export function needsLearningSetup(profile: Profile): boolean {
  try {
    return localStorage.getItem(setupSkipKey(profile.id)) !== "yes";
  } catch {
    return true;
  }
}
