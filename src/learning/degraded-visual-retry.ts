import { tr } from "@/i18n";
import type { DegradedVisualRetryRequest } from "./oll/oll-lesson-runtime";

export function buildDegradedVisualRetryPrompt(
  degraded: DegradedVisualRetryRequest,
): string {
  const surfaceNames: Record<string, string> = {
    geometry: tr("二维几何"),
    plot: tr("函数图像"),
    scene3d: tr("三维场景"),
    diagram: tr("关系图"),
    image: tr("图片"),
    table: tr("表格"),
  };
  const surface = surfaceNames[degraded.surface] ?? degraded.surface;
  return tr("请重新生成没有成功展示的{{v0}}“{{v1}}”。只补充这个画面，不要重做整堂课。", { v0: surface, v1: degraded.purpose });
}

function line(name: string, value: string | number): string {
  return `${name}: ${String(value).replace(/[\r\n]+/g, " ")}`;
}

/**
 * Application-owned retry contract. The stable board target is supplied by
 * the Runtime; the model is not asked to rediscover the failed node from text.
 */
export function buildDegradedVisualRetryContext(
  degraded: DegradedVisualRetryRequest,
): string {
  return [
    "[[LEARNING_DEGRADED_VISUAL_RETRY]]",
    "request_source: explicit_board_follow_up",
    "retry_scope: one_visual_component",
    "preserve_existing_board: required",
    line("board_id", degraded.boardId),
    line("board_revision", degraded.boardRevision),
    line("visual_id", degraded.visualId),
    line("surface", degraded.surface),
    line("purpose", degraded.purpose),
    line("board_summary", tr("一个{{v0}}画面生成失败；只补充该画面", { v0: degraded.surface })),
    line("board_targets", JSON.stringify([{
      as: "failed-visual",
      type: "node",
      target_id: degraded.nodeId,
      label: degraded.title,
      fragments: [],
    }])),
    "[[/LEARNING_DEGRADED_VISUAL_RETRY]]",
  ].join("\n");
}
