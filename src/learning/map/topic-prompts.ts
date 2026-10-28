import type { MapState } from "../history/history-api";
import bank from "./topic-prompts-zh.json";
import { topicLabel } from "./taxonomy-labels";

export type PromptKind = "hook" | "try" | "stretch";
export interface TopicPrompt { kind: PromptKind; label: string; text: string; recommended: boolean }

const KINDS: readonly PromptKind[] = ["hook", "try", "stretch"];
const LABEL: Record<PromptKind, string> = { hook: "从生活里问起", try: "试一道题", stretch: "挑战一下" };
// Every entry has three questions (checked by topic-prompts.test.ts).
const PROMPTS = bank.prompts as unknown as Readonly<Record<string, readonly [string, string, string]>>;

/** Where the learner is decides which question comes first: a real-life hook
 * for a topic not yet visited, a problem to try while practising, a stretch
 * once it has been done without hints. */
export function recommendedPrompt(state: MapState | undefined): PromptKind {
  return state === "did-it" ? "stretch" : state === "practising" ? "try" : "hook";
}

/** A topic's starter questions, the recommended one first. Each is what the
 * learner would ask the teacher; it fills a new board's input box and the
 * learner decides to send it. */
export function topicPrompts(topicId: string, name: string, state?: MapState): TopicPrompt[] {
  const texts = PROMPTS[topicId];
  const first = recommendedPrompt(state);
  if (!texts) return [{ kind: "hook", label: LABEL.hook, text: `${topicLabel(topicId, name)}是什么？生活里哪里会用到它？`, recommended: true }];
  return [first, ...KINDS.filter((kind) => kind !== first)]
    .map((kind) => ({ kind, label: LABEL[kind], text: texts[KINDS.indexOf(kind)], recommended: kind === first }));
}

/** The one question for a suggestion: the recommended starter. */
export function topicDraft(topicId: string, name: string, state?: MapState): string {
  return topicPrompts(topicId, name, state)[0].text;
}
