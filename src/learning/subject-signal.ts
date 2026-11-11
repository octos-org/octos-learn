import type { ChoiceAnswer } from "@/api/typesafe-client";
import type { SkillActionDefinition } from "@/api/skill-actions";
import { subjectDescription } from "octos-lesson-language/plugin-subjects";

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

/** Probability thresholds from the P0 baseline (70 of 78 scoped correctly). */
export const SUBJECT_THRESHOLDS = { top: 0.6, second: 0.05 } as const;

const NONE = "none";
const UNCLEAR = "unclear";

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

/** Subject plugins Jev can choose: the declared plugins that have a subject line (`shared` has none). */
export function subjectChoices(pluginIds: readonly string[], language: string): Array<{ id: string; description: string }> {
  return pluginIds.flatMap((id) => {
    const description = subjectDescription(id, language);
    return description ? [{ id, description }] : [];
  });
}

/** The Jev subject question built from the plugins, with `none` and `unclear`. */
export function subjectQuestion(pluginIds: readonly string[], language: string) {
  const criteria: Record<string, string> = {};
  for (const choice of subjectChoices(pluginIds, language)) criteria[choice.id] = choice.description;
  criteria[NONE] = "不属于以上任何学科，例如历史、语言、文学、艺术或日常生活问题";
  criteria[UNCLEAR] = "无法判断属于哪个学科，例如只说'这道题'而看不到题目内容";
  return {
    type: "choice" as const,
    instructions: "判断这个学习请求属于哪个学科。请求结合图片或 state.current_lesson 才能看懂时，按它们判断",
    criteria,
  };
}

/**
 * Plugins from Jev's probabilities (§5.2): the top subject at or above T1,
 * plus the second subject at or above T2; `none` at or above T1 selects the
 * shared tools alone. Below T1, or when `unclear` wins, Jev selects nothing.
 */
export function selectSubjectPlugins(
  answer: ChoiceAnswer | undefined,
  pluginIds: readonly string[],
  thresholds: { top: number; second: number } = SUBJECT_THRESHOLDS,
): SubjectSignal | undefined {
  const probabilities = answer?.probabilities;
  if (!probabilities) return undefined;
  const ranked = Object.entries(probabilities)
    .filter(([, probability]) => typeof probability === "number" && Number.isFinite(probability))
    .sort(([, a], [, b]) => b - a);
  const [top] = ranked;
  if (!top || top[1] < thresholds.top || top[0] === UNCLEAR) return undefined;
  if (top[0] === NONE) return { plugins: ["shared"], plugin_confidence: top[1], plugin_source: "jev" };
  if (!pluginIds.includes(top[0])) return undefined;
  const second = ranked.slice(1).find(([id]) => pluginIds.includes(id) && id !== NONE && id !== UNCLEAR);
  const plugins = second && second[1] >= thresholds.second ? [top[0], second[0]] : [top[0]];
  return { plugins, plugin_confidence: top[1], plugin_source: "jev" };
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
