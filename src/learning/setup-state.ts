import { findProvider, isLessonCapable } from "@/settings/llm-providers";
import { createContext } from "react";
import type { Profile } from "@/settings/settings-api";

export const LearningModelContext = createContext(true);
/** Why lessons are unavailable, shown instead of the generic hint. */
export const LearningModelIssueContext = createContext<string | null>(null);
export const setupSkipKey = (id: string) => `octos-learn:setup-skipped:${id}`;
/**
 * A saved model whose credential is absent cannot even start the profile
 * runtime, so the lesson tool never runs to report it. `env_vars` values come
 * back masked; a non-empty entry means the credential is set.
 */
export function learningModelCredentialMissing(profile: Profile): boolean {
  const primary = profile.config.llm.primary;
  const envName = primary.route?.api_key_env?.trim() || findProvider(primary.family_id)?.envKey;
  return Boolean(envName && !profile.config.env_vars?.[envName]?.trim());
}
export function hasLearningModel(profile: Profile): boolean {
  return Boolean(
    isLessonCapable(profile.config.llm.primary.family_id, import.meta.env.VITE_PUBLIC_DEPLOYMENT === "true") &&
      profile.config.llm.primary.model_id.trim() &&
      !learningModelCredentialMissing(profile),
  );
}
export function learningModelIssue(profile: Profile): string | null {
  if (hasLearningModel(profile)) return null;
  const primary = profile.config.llm.primary;
  const capable = isLessonCapable(primary.family_id, import.meta.env.VITE_PUBLIC_DEPLOYMENT === "true");
  if (capable && primary.model_id.trim() && learningModelCredentialMissing(profile)) {
    const provider = findProvider(primary.family_id);
    const credential = provider?.credentialKind === "json" ? "凭据" : "API Key";
    return `请在设置中填写你的 ${provider?.name ?? primary.family_id} ${credential}，笔迹和已有课程仍可使用。`;
  }
  return null;
}
export function needsLearningSetup(profile: Profile): boolean {
  try {
    return localStorage.getItem(setupSkipKey(profile.id)) !== "yes";
  } catch {
    return true;
  }
}
