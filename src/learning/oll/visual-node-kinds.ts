import { OLL_PLUGIN_NODE_KINDS } from "octos-lesson-language";

/**
 * Board node kinds that plugins draw as visuals (today the math plugin's number line). Lists of
 * visual kinds in the player include them, so a plugin visual gets its sliders and practice tasks,
 * its course region and its place in the lesson's counts like a core visual. Taken from OLL, so a
 * new plugin card needs no change here (the number line once had no slider panel: its practice task
 * never appeared and every later task stayed locked).
 */
export const PLUGIN_VISUAL_NODE_KINDS: readonly string[] = OLL_PLUGIN_NODE_KINDS;

/** Core visual kinds plus the plugins' visual kinds. */
export function withPluginVisualKinds(core: readonly string[]): ReadonlySet<string> {
  return new Set([...core, ...PLUGIN_VISUAL_NODE_KINDS]);
}
