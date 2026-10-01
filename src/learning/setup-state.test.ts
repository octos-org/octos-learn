import { afterEach, expect, it, vi } from "vitest";
import { normalizeProfile } from "@/settings/settings-api";
import { hasLearningModel, learningModelIssue } from "./setup-state";
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
    const p = normalizeProfile({ id: "p", config: {
      llm: { primary: { family_id: family, model_id: "saved-model" } },
      env_vars: { GEMINI_API_KEY: "AI***xy", OPENAI_API_KEY: "sk***xy", VERTEX_SA_JSON: "***" },
    } });
    expect(hasLearningModel(p)).toBe(family === "google");
    expect(p.config.llm.primary.family_id).toBe(family);
  }
});
it("treats a saved Gemini model without its key as unavailable and says why", () => {
  vi.stubEnv("VITE_PUBLIC_DEPLOYMENT", "true");
  const missing = normalizeProfile({ id: "p", config: { llm: { primary: { family_id: "google", model_id: "gemini-3.6-flash" } } } });
  expect(hasLearningModel(missing)).toBe(false);
  expect(learningModelIssue(missing)).toBe("请在设置中填写你的 Google Gemini API Key，笔迹和已有课程仍可使用。");
  const customName = normalizeProfile({ id: "p", config: {
    llm: { primary: { family_id: "google", model_id: "gemini-3.6-flash", route: { api_key_env: "MY_GEMINI" } } },
    env_vars: { MY_GEMINI: "AI***xy" },
  } });
  expect(hasLearningModel(customName)).toBe(true);
  expect(learningModelIssue(customName)).toBeNull();
  const unsupported = normalizeProfile({ id: "p", config: { llm: { primary: { family_id: "openai", model_id: "gpt-5" } } } });
  expect(learningModelIssue(unsupported)).toBeNull();
});
