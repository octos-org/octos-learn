import { localizedCatalog, tr } from "@/i18n";
import { useEffect, useState } from "react";

import type { MapState } from "../history/history-api";
import { topicLabel } from "./taxonomy-labels";

export type PromptKind = "hook" | "try" | "stretch";
export interface TopicPrompt { kind: PromptKind; label: string; text: string; recommended: boolean }
export type PromptBank = Readonly<Record<string, readonly string[]>>;

const KINDS: readonly PromptKind[] = ["hook", "try", "stretch"];
const LABEL: Record<PromptKind, string> = localizedCatalog({ hook: "从生活里问起", try: "试一道题", stretch: "挑战一下" });

// About 185 KB of question text, loaded only where questions are shown.
let loading: Promise<PromptBank> | null = null;
export function loadPromptBank(): Promise<PromptBank> {
  loading ??= import("./topic-prompts-zh.json").then((module) => module.default.prompts as PromptBank)
    // A failed download is tried again next time instead of being remembered.
    .catch((error: unknown) => { loading = null; throw error; });
  return loading;
}
/** The bank once loaded (null until then, or when `enabled` is false). */
export function usePromptBank(enabled = true): PromptBank | null {
  const [bank, setBank] = useState<PromptBank | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadPromptBank().then((loaded) => { if (live) setBank(loaded); }, () => undefined);
    return () => { live = false; };
  }, [enabled]);
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
  if (texts?.length !== 3) return [{ kind: "hook", label: LABEL.hook, text: tr("{{v0}}是什么？生活里哪里会用到它？", { v0: name }), recommended: true }];
  return [first, ...KINDS.filter((kind) => kind !== first)]
    .map((kind) => ({ kind, label: LABEL[kind], text: texts[KINDS.indexOf(kind)]!, recommended: kind === first }));
}

/** A suggestion's question: a new topic starts from its real-life question; a
 * topic to continue or revisit gets a problem to try. Topics without starter
 * questions (other subjects) keep the plain request. */
export async function topicDraft(topicId: string, name: string, kind: "hook" | "try"): Promise<string> {
  const bank = await loadPromptBank().catch(() => null);
  const label = topicLabel(topicId, name);
  const [first] = topicPrompts(bank, topicId, label, kind);
  // Without starter questions, continuing a topic keeps the plain request.
  return first!.kind === kind || kind === "hook" ? first!.text : tr("我想再学一下{{v0}}", { v0: label });
}
