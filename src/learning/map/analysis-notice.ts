import { tr } from "@/i18n";
import type { AnalysisStatus } from "../history/history-api";

/** Why recent lessons may not be on the map yet: still being analyzed, or
 * today's analysis limit is used up (they are analyzed on a later day). */
export function analysisNotice(status: AnalysisStatus | undefined): string | null {
  if (!status?.enabled) return null;
  const waiting = status.states.filter((row) => ["pending", "leased", "uncertain"].includes(row.state)).reduce((sum, row) => sum + row.count, 0);
  if (!waiting) return null;
  return status.quota_used >= status.max_daily_tasks
    ? tr("今天的 {{v0}} 次知识点分析已经用完，还有 {{v1}} 项学习内容没分析。之后打开应用时会自动补上，星图到时再点亮；也可以在设置里调高每天的次数。", { v0: status.max_daily_tasks, v1: waiting })
    : tr("还有 {{v0}} 项学习内容正在分析，星图稍后更新。", { v0: waiting });
}
