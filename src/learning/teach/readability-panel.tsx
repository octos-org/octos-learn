import { tr } from "@/i18n";
import { useState } from "react";
import type { ImageAssetResolver } from "octos-lesson-language/web-runtime";

import type { CompiledLesson } from "./compile-recording";
import { checkReadability, type CardReadability, type CheckedBoard, type ReadabilityProblem } from "./readability-check";
import type { RecordingCard } from "./recording";

function problemText(problem: ReadabilityProblem): string {
  return {
    small_text: tr("字太小，看不清"),
    small_diagram: tr("图太小"),
    out_of_view: tr("有一部分跑到屏幕外面了"),
    overflow: tr("有内容超出了卡片"),
    missing_ink: tr("有一段手写显示不出来"),
    no_focus: tr("这张卡片最后没有停在要看的地方"),
  }[problem];
}

function boardText(board: CheckedBoard): string {
  return board === "chromebook" ? tr("小屏幕笔记本") : tr("大屏幕");
}

/** Checks, before submitting, that every card end is readable on small laptops and big screens. */
export function ReadabilityPanel({ compiled, cards, resolveAsset, onOpenCard }: {
  compiled: CompiledLesson;
  cards: RecordingCard[];
  resolveAsset: ImageAssetResolver;
  onOpenCard: (key: string) => void;
}) {
  const [state, setState] = useState<{ status: "idle" | "checking" | "done" | "failed"; results: CardReadability[]; checked?: CompiledLesson }>({ status: "idle", results: [] });
  const stale = state.status === "done" && state.checked !== compiled;
  const run = async () => {
    setState({ status: "checking", results: [] });
    try {
      setState({ status: "done", results: await checkReadability(compiled, resolveAsset), checked: compiled });
    } catch {
      setState({ status: "failed", results: [] });
    }
  };
  const byCard = cards.flatMap((card) => {
    const found = state.results.filter((result) => result.card === card.key);
    return found.length ? [{ card, found }] : [];
  });
  return (
    <section className="teach-step teach-readability" aria-labelledby="teach-readability-title">
      <h2 id="teach-readability-title">{tr("检查这节课")}</h2>
      <p className="academy-muted">{tr("在小屏幕笔记本和大屏幕上各播放一遍，看看每张卡片结束时是不是都看得清。")}</p>
      <button type="button" onClick={() => void run()} disabled={state.status === "checking"}>
        {state.status === "checking" ? tr("正在检查…") : stale || state.status === "done" ? tr("再检查一遍") : tr("检查我的课")}
      </button>
      {state.status === "failed" && <p role="alert">{tr("这次没能检查完，请再试一次。")}</p>}
      {state.status === "done" && !stale && !byCard.length && <p role="status">{tr("每张卡片在小屏幕和大屏幕上都看得清。")}</p>}
      {state.status === "done" && stale && <p className="academy-muted">{tr("课改过了，请再检查一遍。")}</p>}
      {state.status === "done" && !stale && byCard.length > 0 && (
        <ul className="teach-readability-list">
          {byCard.map(({ card, found }) => (
            <li key={card.key}>
              <strong>{card.title}</strong>
              <ul>
                {found.map((result) => (
                  <li key={result.board}>{tr("{{v0}}：{{v1}}", { v0: boardText(result.board), v1: result.problems.map(problemText).join(tr("；")) })}</li>
                ))}
              </ul>
              <button type="button" className="teach-secondary" onClick={() => onOpenCard(card.key)}>{tr("去改这张卡片")}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
