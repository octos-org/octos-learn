import type { CanonicalEvent } from "octos-lesson-language";

import { tr } from "@/i18n";
import type { OllLessonRuntimeController } from "../oll/use-oll-lesson-runtime";

/** One card of a learner lesson, as the contents list names it. */
export interface ContentsEntry { beatId: string; label: string }

const SNIPPET = 28;

/**
 * The lesson's cards in order. A card is named by its title when the page
 * knows it (the learner's own draft), else by the first words said on it.
 */
export function lessonContents(events: CanonicalEvent[], titleOf?: (cardKey: string) => string | undefined): ContentsEntry[] {
  return events.flatMap((event) => event.step?.beats ?? []).map((beat, index) => {
    const key = beat.id.split(":beat:").at(-1) ?? "";
    const said = beat.narration?.text.trim() ?? "";
    const label = titleOf?.(key) || (said.length > SNIPPET ? `${said.slice(0, SNIPPET)}…` : said) || tr("卡片 {{v0}}", { v0: index + 1 });
    return { beatId: beat.id, label };
  });
}

/**
 * Where the lesson is: a bar with one part per card, and the cards to jump
 * to. Jumping plays the lesson from the start of that card.
 */
export function LessonContents({ runtime, entries, onJump }: {
  runtime: OllLessonRuntimeController | null;
  entries: ContentsEntry[];
  /** Before playing from a card, e.g. so narration may start on this tap. */
  onJump?: () => void;
}) {
  if (!runtime || entries.length < 2) return null;
  const at = runtime.completed ? entries.length : Math.max(0, runtime.beatIndex);
  const stateOf = (index: number) => (index < at ? "done" : index === at && !runtime.completed ? "current" : "next");
  return (
    <nav className="teach-contents" aria-label={tr("课程目录")}>
      <div className="teach-contents-bar" role="progressbar" aria-label={tr("播放进度")} aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={at}
        aria-valuetext={tr("第 {{v0}} 张，共 {{v1}} 张", { v0: Math.min(entries.length, at + 1), v1: entries.length })}>
        {entries.map((entry, index) => <span key={entry.beatId} data-state={stateOf(index)} />)}
      </div>
      <ol>
        {entries.map((entry, index) => (
          <li key={entry.beatId}>
            <button type="button" data-state={stateOf(index)} aria-current={stateOf(index) === "current" ? "step" : undefined}
              onClick={() => { onJump?.(); runtime.playBeat(entry.beatId); }}>
              <span className="teach-contents-number">{index + 1}</span>{entry.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
