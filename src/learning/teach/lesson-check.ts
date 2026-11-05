// "Check my lesson": the screen check (every card readable on a small laptop
// and a big screen) and Octo's review, as one list a learner can act on, card
// by card. A card re-recorded after the check has no findings until the next
// check.

import { tr } from "@/i18n";

import type { CompiledLesson } from "./compile-recording";
import type { CardReadability, ReadabilityProblem } from "./readability-check";
import { findPersonalDetails } from "./privacy";
import { keptTake, type LearnerRecording, type RecordingReview } from "./recording";

export interface CheckFinding {
  source: "octo" | "screen" | "privacy" | "words";
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

const DETAIL_TEXT: Record<string, () => string> = {
  name: () => tr("一个名字"), school: () => tr("一所学校"), address: () => tr("你住的地方"), home: () => tr("你住的地方"), place: () => tr("一个真实的地方"),
  age: () => tr("你的年龄或年级"), birthday: () => tr("你的生日"), email: () => tr("联系方式"), phone: () => tr("联系方式"), link: () => tr("联系方式"),
  contact: () => tr("联系方式"), other: () => tr("你的个人信息"),
};

/**
 * Personal details in a card's words as they are now: the rules' findings and
 * Octo's, while the quoted words are still there. Changing the words clears them.
 */
export function privacyFindings(text: string, octo: Array<{ quote: string; kind: string }> = []): CheckFinding[] {
  const lower = text.toLowerCase();
  const details = [...findPersonalDetails(text), ...octo.filter((detail) => lower.includes(detail.quote.toLowerCase()))];
  const seen = new Set<string>();
  return details.flatMap((detail) => {
    const key = detail.quote.toLowerCase();
    if ([...seen].some((quote) => quote.includes(key) || key.includes(quote))) return [];
    seen.add(key);
    return [{ source: "privacy" as const, message: tr("你说了“{{v0}}”，这是{{v1}}。分享前把它从你的话里删掉。", { v0: detail.quote, v1: (DETAIL_TEXT[detail.kind] ?? DETAIL_TEXT.other!)() }) }];
  });
}

/** Each recorded card's findings from the last check. */
export function cardChecks(recording: LearnerRecording, compiled: CompiledLesson | null, review: RecordingReview | undefined): CardCheck[] {
  if (!review) return [];
  return recording.cards.flatMap((card): CardCheck[] => {
    const take = keptTake(card);
    if (!take) return [];
    if (take.startedAt > review.at) return [{ key: card.key, title: card.title, status: "redo", findings: [] }];
    const octo = review.cards.find((entry) => entry.key === card.key);
    const findings: CheckFinding[] = privacyFindings(take.text ?? "", (review.personal ?? []).filter((detail) => detail.card === card.key));
    // Without words the card plays in silence, with no captions.
    if (!take.text?.trim()) findings.push({ source: "words", message: tr("这张卡片没有你说的话，看的人听不到讲解，也看不到字幕。在“你在这张卡片说的话”里写下你讲的内容，或者点“重录我的话”再讲一遍。") });
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
