import { useEffect, useState } from "react";

import type { MapState } from "../history/history-api";
import { topicLabel } from "./taxonomy-labels";

export type PromptKind = "hook" | "try" | "stretch";
export interface TopicPrompt { kind: PromptKind; label: string; text: string; recommended: boolean }
export type PromptBank = Readonly<Record<string, readonly string[]>>;

const KINDS: readonly PromptKind[] = ["hook", "try", "stretch"];
const LABEL: Record<PromptKind, string> = { hook: "从生活里问起", try: "试一道题", stretch: "挑战一下" };

// About 185 KB of question text, loaded only where questions are shown.
let loading: Promise<PromptBank> | null = null;
export function loadPromptBank(): Promise<PromptBank> {
  loading ??= import("./topic-prompts-zh.json").then((module) => module.default.prompts as PromptBank);
  return loading;
}
export function usePromptBank(): PromptBank | null {
  const [bank, setBank] = useState<PromptBank | null>(null);
  useEffect(() => {
    let live = true;
    void loadPromptBank().then((loaded) => { if (live) setBank(loaded); }, () => undefined);
    return () => { live = false; };
  }, []);
  return bank;
}

/** Where the learner is decides which question comes first: a real-life hook
 * for a topic not yet visited, a problem to try once a lesson has been heard or
 * while practising, a stretch once it has been done without hints. */
export function recommendedPrompt(state: MapState | undefined): PromptKind {
  return state === "did-it" ? "stretch" : state ? "try" : "hook";
}

/** A topic's starter questions, the recommended one first (`name` is the
 * label shown). Each is what the learner would ask the teacher; it fills a new
 * board's input box and the learner decides to send it. */
export function topicPrompts(bank: PromptBank | null, topicId: string, name: string, first: PromptKind = "hook"): TopicPrompt[] {
  const texts = bank?.[topicId];
  if (texts?.length !== 3) return [{ kind: "hook", label: LABEL.hook, text: `${name}是什么？生活里哪里会用到它？`, recommended: true }];
  return [first, ...KINDS.filter((kind) => kind !== first)]
    .map((kind) => ({ kind, label: LABEL[kind], text: texts[KINDS.indexOf(kind)]!, recommended: kind === first }));
}

/** A suggestion's question: a new topic starts from its real-life question; a
 * topic to continue or revisit gets a problem to try. Topics without starter
 * questions (other subjects) keep the plain request. */
export async function topicDraft(topicId: string, name: string, kind: "hook" | "try"): Promise<string> {
  const texts = (await loadPromptBank().catch(() => null))?.[topicId];
  const label = topicLabel(topicId, name);
  if (texts?.length !== 3) return kind === "hook" ? `${label}是什么？生活里哪里会用到它？` : `我想再学一下${label}`;
  return texts[KINDS.indexOf(kind)]!;
}
