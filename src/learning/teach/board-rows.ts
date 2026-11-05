// Which cards are in the board's current row, so a learner can put a new
// graph or grid next to one of them. The playback teaching layout starts a row
// at each card that adds a figure, unless the figure was put next to a card of
// the current row; it only appends, so earlier rows are never a choice.

import { tr } from "@/i18n";
import type { CompiledLesson } from "./compile-recording";

const FIGURES = new Set(["plot", "geometry", "scene3d", "image"]);

/** A card on the board the learner can put something next to. */
export interface RowCard {
  alias: string;
  /** What the learner sees it as, in their language: the formula, "Grid", "Graph y = 2x". */
  label: string;
  /** Which recorded card made it, from 1. */
  card: number;
}

type Write = { do: string; as?: string; kind?: string; role?: string; content?: Record<string, unknown>; place?: { relation?: string; anchor?: string }; target?: string };

function label(action: Write): string {
  const content = action.content ?? {};
  if (action.kind === "math") return ((content.fragments as Array<{ latex?: string }> | undefined) ?? []).map((fragment) => fragment.latex ?? "").join(" ").trim() || tr("公式");
  if (action.kind === "plot") {
    const curve = (content.curves as Array<{ label?: string }> | undefined)?.[0]?.label;
    return curve ? `${tr("函数图")} ${curve}` : tr("函数图");
  }
  if (action.kind === "geometry") return Array.isArray(content.circles) && content.circles.length ? tr("单位圆") : tr("坐标网格");
  if (action.kind === "scene3d") return tr("长方体");
  if (action.kind === "ink") return tr("你写的字");
  return String(content.text ?? action.as ?? tr("卡片"));
}

/** The cards in the current row, in board order; empty when the board is empty. */
export function currentRowCards(compiled: CompiledLesson | null): RowCard[] {
  let row: RowCard[] = [];
  const hidden = new Set<string>();
  (compiled?.lesson.steps[0]?.beats ?? []).forEach((beat, index) => {
    for (const action of beat.actions as Write[]) {
      if (action.do === "hide" && action.target) hidden.add(action.target);
      if (action.do !== "write" || !action.as) continue;
      if (action.place?.relation === "replaces" && action.place.anchor) hidden.add(action.place.anchor);
      // Writing on a card stays part of that card.
      if (action.place?.relation === "annotates") continue;
      const joins = action.role === "supporting_visual" && action.place?.relation === "right_of";
      if (FIGURES.has(action.kind ?? "") && !joins) row = [];
      row.push({ alias: action.as, label: label(action), card: index + 1 });
    }
  });
  return row.filter((card) => !hidden.has(card.alias));
}
