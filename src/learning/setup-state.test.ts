import { afterEach, expect, it, vi } from "vitest";
import { normalizeProfile } from "@/settings/settings-api";
import { hasLearningModel } from "./setup-state";
import { findProvider, isLessonCapable } from "@/settings/llm-providers";

afterEach(() => vi.unstubAllEnvs());
it("permits Gemini and limits Vertex to local deployments", () => {
  for (const family of ["google", "gemini"]) expect(isLessonCapable(family, true)).toBe(true);
  expect(isLessonCapable("vertex", true)).toBe(false);
  expect(isLessonCapable("vertex", false)).toBe(true);
  for (const family of ["ark", "openai", "", "unknown"]) expect(isLessonCapable(family, false)).toBe(false);
  expect(findProvider("google")?.models[0].id).toBe("gemini-3.6-flash");
});
it("requires a course-capable saved model without rewriting unsupported profiles", () => {
  vi.stubEnv("VITE_PUBLIC_DEPLOYMENT", "true");
  for (const family of ["google", "openai", "vertex", "ark"]) {
    const p = normalizeProfile({ id: "p", config: { llm: { primary: { family_id: family, model_id: "saved-model" } } } });
    expect(hasLearningModel(p)).toBe(family === "google");
    expect(p.config.llm.primary.family_id).toBe(family);
  }
});
