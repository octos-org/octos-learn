import { describe, expect, it } from "vitest";
import type { SkillActionDefinition } from "@/api/skill-actions";
import { resolveSubjectSignal, selectSubjectPlugins, subjectPluginSupport, subjectQuestion, subjectSignalFields } from "./subject-signal";

const installed = ["math", "physics", "chemistry", "biology", "earth_space", "shared"];
const answer = (probabilities: Record<string, number>) => {
  const [choice] = Object.entries(probabilities).sort(([, a], [, b]) => b - a)[0]!;
  return { choice, probabilities, confidence: 0.9 };
};

describe("subject signal (subject plan P2)", () => {
  it("reads the subject plugins each lesson action declares", () => {
    const actions = [
      { id: "learning.lesson.generate", input_schema: { properties: { plugins: { items: { enum: installed } } } } },
      { id: "learning.lesson.generate-from-camera", input_schema: { properties: {} } },
    ] as unknown as SkillActionDefinition[];
    const support = subjectPluginSupport(actions);
    expect(support.get("learning.lesson.generate")).toEqual(installed);
    expect(support.has("learning.lesson.generate-from-camera")).toBe(false);
  });

  it("builds the Jev question from the plugins' subject lines, with none and unclear", () => {
    const question = subjectQuestion(installed, "en-US");
    expect(Object.keys(question.criteria)).toEqual(["math", "physics", "chemistry", "biology", "earth_space", "none", "unclear"]);
    expect(question.criteria.earth_space).toMatch(/water cycle/);
    expect(subjectQuestion(["math", "shared"], "zh-CN").criteria.math).toMatch(/^数学/);
  });

  it("selects plugins from Jev's probabilities with T1 0.6 and T2 0.05", () => {
    expect(selectSubjectPlugins(answer({ math: 0.9, physics: 0.04, none: 0.06 }), installed)).toEqual(
      { plugins: ["math"], plugin_confidence: 0.9, plugin_source: "jev" });
    expect(selectSubjectPlugins(answer({ physics: 0.7, math: 0.25, unclear: 0.05 }), installed)?.plugins).toEqual(["physics", "math"]);
    expect(selectSubjectPlugins(answer({ none: 0.8, math: 0.1 }), installed)?.plugins).toEqual(["shared"]);
    expect(selectSubjectPlugins(answer({ math: 0.5, physics: 0.4 }), installed)).toBeUndefined();
    expect(selectSubjectPlugins(answer({ unclear: 0.7, math: 0.2 }), installed)).toBeUndefined();
    // A subject the installed Coach does not declare is not selected.
    expect(selectSubjectPlugins(answer({ biology: 0.9 }), ["math", "physics", "shared"])).toBeUndefined();
  });

  it("falls back to the board's latest lesson, adding Jev's leading subject, then to none", () => {
    expect(resolveSubjectSignal({ answer: answer({ math: 0.95 }) }, ["physics"], installed).plugin_source).toBe("jev");
    expect(resolveSubjectSignal({ answer: answer({ unclear: 0.7, math: 0.2 }) }, ["physics", "shared"], installed))
      .toEqual({ plugins: ["physics", "math"], plugin_source: "context" });
    expect(resolveSubjectSignal(undefined, ["math"], installed)).toEqual({ plugins: ["math"], plugin_source: "context" });
    expect(resolveSubjectSignal(undefined, [], installed)).toEqual({ plugins: [], plugin_source: "none" });
    expect(subjectSignalFields({ plugins: ["math"], plugin_confidence: 0.912345, plugin_source: "jev" }))
      .toEqual({ plugins: ["math"], plugin_confidence: 0.9123, plugin_source: "jev" });
  });
});
