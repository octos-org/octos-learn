// "Check my lesson": the screen check (every card readable on a small laptop
// and a big screen) and Octo's review, as one list a learner can act on, card
// by card. A card re-recorded after the check has no findings until the next
// check.

import { tr } from "@/i18n";

import type { CompiledLesson } from "./compile-recording";
import type { CardReadability, ReadabilityProblem } from "./readability-check";
import { keptTake, type LearnerRecording, type RecordingReview } from "./recording";

export interface CheckFinding {
  source: "octo" | "screen";
  /** Octo's kind of problem, shown as a short tag. */
  kind?: "slip" | "misconception" | "unclear";
  message: string;
}

export interface CardCheck {
  key: string;
  title: string;
  /** "fix" when something needs fixing; "redo" when the card changed since the check. */
  status: "good" | "fix" | "redo";
  findings: CheckFinding[];
  /** Octo's word on a card that is fine. */
  praise?: string;
}

const PROBLEM_TEXT = (problem: ReadabilityProblem): string => ({
  small_text: tr("字太小，看的人看不清"),
  small_diagram: tr("图太小"),
  out_of_view: tr("有一部分跑到屏幕外面了"),
  overflow: tr("有内容超出了卡片"),
  missing_ink: tr("有一段手写显示不出来"),
  no_focus: tr("卡片最后没有停在要看的地方"),
}[problem]);

/** Whether a card draws an arrow, so small text there usually means two cards far apart. */
function drawsArrow(compiled: CompiledLesson | null, key: string): boolean {
  return Boolean(compiled?.lesson.steps[0]?.beats.find((beat) => beat.key === key)?.actions.some((action) => action.do === "connect"));
}

function screenFinding(results: CardReadability[], arrow: boolean): CheckFinding | undefined {
  if (!results.length) return undefined;
  const problems = [...new Set(results.flatMap((result) => result.problems))];
  const small = problems.some((problem) => problem === "small_text" || problem === "small_diagram" || problem === "out_of_view");
  if (arrow && small) {
    return { source: "screen", message: tr("你的箭头连着两张离得很远的卡片，看的人只能看到很小的字。重录时把新的图放到它要连的卡片旁边（“放在旁边…”）。") };
  }
  const where = results.length > 1 ? tr("在小屏幕和大屏幕上") : results[0]!.board === "chromebook" ? tr("在小屏幕笔记本上") : tr("在大屏幕上");
  return { source: "screen", message: tr("{{v0}}：{{v1}}。", { v0: where, v1: problems.map(PROBLEM_TEXT).join(tr("；")) }) };
}

/** Each recorded card's findings from the last check. */
export function cardChecks(recording: LearnerRecording, compiled: CompiledLesson | null, review: RecordingReview | undefined): CardCheck[] {
  if (!review) return [];
  return recording.cards.flatMap((card): CardCheck[] => {
    const take = keptTake(card);
    if (!take) return [];
    if (take.startedAt > review.at) return [{ key: card.key, title: card.title, status: "redo", findings: [] }];
    const octo = review.cards.find((entry) => entry.key === card.key);
    const findings: CheckFinding[] = [];
    if (octo?.status === "check") findings.push({ source: "octo", ...(octo.kind !== "none" ? { kind: octo.kind } : {}), message: octo.message });
    const screen = screenFinding((review.screen ?? []).filter((result) => result.card === card.key), drawsArrow(compiled, card.key));
    if (screen) findings.push(screen);
    return [{
      key: card.key, title: card.title, status: findings.length ? "fix" : "good", findings,
      ...(!findings.length && octo?.message ? { praise: octo.message } : {}),
    }];
  });
}

/** Whether the lesson is ready to watch: checked, nothing left to fix, nothing changed since. */
export function lessonReady(checks: CardCheck[], recording: LearnerRecording): boolean {
  return checks.length === recording.cards.length && checks.every((check) => check.status === "good");
}
