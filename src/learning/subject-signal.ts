import type { ChoiceAnswer } from "@/api/typesafe-client";
import type { SkillActionDefinition } from "@/api/skill-actions";
import {
  SUBJECT_THRESHOLDS,
  selectSubjectPlugins as selectFromProbabilities,
  subjectQuestion,
} from "octos-lesson-language/plugin-subjects";

export { subjectQuestion };

/**
 * The subject signal sent with a lesson request (subject plan §5.2, P2 shadow
 * mode). Jev chooses among the subject plugins the installed Learning Coach
 * declares; the board's earlier lessons are the fallback. Coach only logs the
 * signal for now and keeps sending the broad request.
 */
export interface SubjectSignal {
  plugins: string[];
  plugin_confidence?: number;
  plugin_source: "jev" | "context" | "none";
}

/**
 * The subject plugin IDs each lesson action accepts, from its `plugins` enum.
 * An action without the field gets no signal: lesson actions reject
 * undeclared fields, and an older Coach does not know them.
 */
export function subjectPluginSupport(actions: readonly SkillActionDefinition[]): Map<string, string[]> {
  const support = new Map<string, string[]>();
  for (const action of actions) {
    const properties = (action.input_schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
    const plugins = properties.plugins as { items?: { enum?: unknown[] } } | undefined;
    const ids = plugins?.items?.enum;
    if (Array.isArray(ids)) support.set(action.id, ids.filter((id): id is string => typeof id === "string"));
  }
  return support;
}

/** Jev's selection (OLL plugin-subjects: T1 0.6, T2 0.05, `none` selects shared alone). */
export function selectSubjectPlugins(answer: ChoiceAnswer | undefined, pluginIds: readonly string[]): SubjectSignal | undefined {
  const selection = selectFromProbabilities(answer?.probabilities, pluginIds);
  return selection ? { plugins: selection.plugins, plugin_confidence: selection.confidence, plugin_source: "jev" } : undefined;
}

/**
 * The signal for a request: a confident Jev answer wins; otherwise the
 * subjects of the board's latest lesson, together with Jev's leading subject
 * when it reaches T2 ("use both"); otherwise none, which keeps the broad request.
 */
export function resolveSubjectSignal(
  jev: { answer?: ChoiceAnswer } | undefined,
  contextPlugins: readonly string[],
  pluginIds: readonly string[],
): SubjectSignal {
  const fromJev = selectSubjectPlugins(jev?.answer, pluginIds);
  if (fromJev) return fromJev;
  const context = contextPlugins.filter((id) => pluginIds.includes(id) && id !== "shared");
  if (context.length) {
    const leading = Object.entries(jev?.answer?.probabilities ?? {})
      .filter(([id, probability]) => pluginIds.includes(id) && typeof probability === "number" && probability >= SUBJECT_THRESHOLDS.second)
      .sort(([, a], [, b]) => b - a)[0]?.[0];
    const plugins = [...new Set([...context, ...(leading ? [leading] : [])])].slice(0, 2);
    return { plugins, plugin_source: "context" };
  }
  return { plugins: [], plugin_source: "none" };
}

/** The lesson request fields for a signal. */
export function subjectSignalFields(signal: SubjectSignal): Record<string, unknown> {
  return {
    plugins: signal.plugins,
    ...(signal.plugin_confidence !== undefined ? { plugin_confidence: Number(signal.plugin_confidence.toFixed(4)) } : {}),
    plugin_source: signal.plugin_source,
  };
}
