import { tr } from "@/i18n";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo, useState } from "react";

import type { RecordingCard, RecordingReview } from "./recording";

/** Octo's question after a card, with a private place for the learner's answer. */
export function OctoQuestionPanel({ card, pending, failed, onAnswer }: {
  card: RecordingCard;
  pending: boolean;
  failed: boolean;
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState(card.octo?.answer ?? "");
  if (pending) return <p role="status" className="teach-octo">{tr("小章鱼在想问题…")}</p>;
  if (failed) return <p className="academy-muted">{tr("小章鱼这次没想出问题。可以接着录下一张。")}</p>;
  if (!card.octo) return null;
  return (
    <form className="teach-step teach-octo" onSubmit={(event) => { event.preventDefault(); if (answer.trim()) onAnswer(answer); }}>
      <p><strong>{tr("小章鱼问：")}</strong> {card.octo.question}</p>
      <label className="teach-label">{tr("你的回答（只有你自己能看到）")}
        <textarea className="teach-input" value={answer} onChange={(event) => setAnswer(event.target.value)} />
      </label>
      <button type="submit" disabled={!answer.trim() || answer.trim() === card.octo.answer}>{card.octo.answer ? tr("改好了") : tr("回答小章鱼")}</button>
    </form>
  );
}

/** The recognised formula, which the learner checks and may edit before it replaces their handwriting. */
export function NeatFormulaPanel({ latex, confidence, onUse, onCancel }: {
  latex: string;
  confidence: "high" | "medium" | "low";
  onUse: (latex: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(latex);
  const preview = useMemo(() => {
    try {
      return katex.renderToString(value, { throwOnError: true, displayMode: true, trust: false });
    } catch {
      return null;
    }
  }, [value]);
  return (
    <form className="teach-step teach-neat" aria-label={tr("整理一下")} onSubmit={(event) => { event.preventDefault(); if (preview && value.trim()) onUse(value.trim()); }}>
      <p className="academy-muted">{confidence === "high" ? tr("小章鱼把你的手写整理成了这样。和你写的一样吗？") : tr("小章鱼不太确定看清了。请对一对，不对就改一改。")}</p>
      {preview
        ? <div className="teach-neat-preview" dangerouslySetInnerHTML={{ __html: preview }} />
        : <p role="alert">{tr("这个公式写法有误，请改一改。")}</p>}
      <label className="teach-label">{tr("公式（可以改）")}<input className="teach-input" value={value} onChange={(event) => setValue(event.target.value)} /></label>
      <div className="teach-actions">
        <button type="submit" disabled={!preview || !value.trim()}>{tr("就用这个")}</button>
        <button type="button" className="teach-secondary" onClick={onCancel}>{tr("不用了")}</button>
      </div>
    </form>
  );
}

/** Octo's card-by-card review of the recorded lesson. */
export function ReviewPanel({ cards, review, pending, failed, stale, onReview, onOpenCard }: {
  cards: RecordingCard[];
  review: RecordingReview | undefined;
  pending: boolean;
  failed: boolean;
  stale: boolean;
  onReview: () => void;
  onOpenCard: (key: string) => void;
}) {
  const title = (key: string) => cards.find((card) => card.key === key)?.title ?? key;
  return (
    <section className="teach-step teach-review" aria-labelledby="teach-review-title">
      <h2 id="teach-review-title">{tr("请小章鱼看一遍")}</h2>
      <p className="academy-muted">{tr("小章鱼会一张一张看，告诉你哪里讲得好、哪里可以再改改。")}</p>
      <button type="button" disabled={pending} onClick={onReview}>
        {pending ? tr("小章鱼在看…") : review ? tr("再请小章鱼看一遍") : tr("请小章鱼看看")}
      </button>
      {failed && <p role="alert">{tr("小章鱼这次没看完，请再试一次。")}</p>}
      {review && stale && <p className="academy-muted">{tr("课改过了，可以再请小章鱼看一遍。")}</p>}
      {review && (
        <>
          <p>{review.overall}</p>
          <ul className="teach-readability-list">
            {review.cards.map((card) => (
              <li key={card.key} className={card.status === "check" ? "teach-review-check" : "teach-review-good"}>
                <strong>{title(card.key)}</strong>
                <span>{card.message}</span>
                {card.status === "check" && <button type="button" className="teach-secondary" onClick={() => onOpenCard(card.key)}>{tr("去改这张卡片")}</button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
