import { getLocale, tr } from "@/i18n";
import type { InkRuntime } from "../oll/oll-ink-runtime";
import { recognizeInkMath } from "../teach/teach-assist";
import { neatMathPaths } from "./neat-math-paths";

export const SNAP_SOUND_THRESHOLD = 0.079;
export const SNAP_HAND_THRESHOLD = 0.35;

export async function neatenSelectedInk(ink: InkRuntime, sessionId: string, isCurrent: () => boolean,
  dependencies = { recognize: recognizeInkMath, layout: neatMathPaths }): Promise<void> {
  const { content_revision: contentRevision, selection_revision: selectionRevision } = ink.state;
  const check = () => {
    if (!isCurrent() || ink.state.mode !== "select" || !ink.state.selected_count
      || ink.state.content_revision !== contentRevision || ink.state.selection_revision !== selectionRevision) {
      throw new Error(tr("选区已变化，这次没有替换笔迹。"));
    }
  };
  check();
  if (typeof ink.replaceSelectionWithAiPaths !== "function") {
    throw new Error(tr("白板组件已更新，请刷新页面后重试响指整理。"));
  }
  const source = await ink.captureSelectionSnapshot();
  check();
  if (!source.component_ids?.length || source.component_origins?.some(origin => origin !== "student")) {
    throw new Error(tr("请选择你手写的公式，再试响指整理。"));
  }
  const result = await dependencies.recognize(sessionId, {
    svg: source.svg, width: source.bounds.width, height: source.bounds.height,
  }, getLocale());
  check();
  if (!result.readable || result.confidence !== "high" || !result.latex.trim()) {
    throw new Error(tr("这段公式没看清，原手写已保留。可以写清楚一点再试。"));
  }
  const paths = await dependencies.layout(result.latex, source.bounds);
  check();
  await ink.replaceSelectionWithAiPaths(`snap-neat-${crypto.randomUUID()}`, paths, {
    source, contentRevision, selectionRevision,
  }, ink.state.selection_color ?? ink.state.pen_color);
}
