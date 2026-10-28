import { ChevronRight, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";

import { getToken } from "@/api/client";
import { openHistoryApi } from "@/learning/history/history-api";
import { showWeeklyReport, weeklyReportShown } from "@/learning/report/report-week";
import { nextStepsShown, showNextSteps } from "@/learning/map/next-steps-visibility";
import { TeacherRoster } from "@/learning/teachers/teacher-roster";

const DEFAULT_ANALYSIS_LIMIT = 10;
const ANALYSIS_LIMITS = [5, 10, 20];

function AdvancedOptions() {
  const [shown, setShown] = useState(weeklyReportShown);
  const [steps, setSteps] = useState(nextStepsShown);
  // Account setting in the learning-history service; null until it is read.
  const [comments, setComments] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<{ enabled: boolean; max: number } | null>(null);
  useEffect(() => {
    let active = true;
    const token = getToken();
    if (token) {
      void openHistoryApi(token).then((api) => api.reportComments()).then((value) => { if (active) setComments(value.enabled); }).catch(() => undefined);
      void openHistoryApi(token).then((api) => api.analysisStatus()).then((value) => { if (active) setAnalysis({ enabled: value.enabled, max: value.max_daily_tasks || DEFAULT_ANALYSIS_LIMIT }); }).catch(() => undefined);
    }
    return () => { active = false; };
  }, []);
  // Turning analysis off keeps the chosen daily limit for when it is back on.
  const changeAnalysis = (enabled: boolean, max = analysis?.max ?? DEFAULT_ANALYSIS_LIMIT) => {
    const token = getToken();
    if (!token) return;
    void openHistoryApi(token).then(async (api) => { await api.configureAnalysis(enabled, max); setAnalysis({ enabled, max }); }).catch(() => undefined);
  };
  const changeComments = (enabled: boolean) => {
    const token = getToken();
    if (!token) return;
    void openHistoryApi(token).then((api) => api.setReportComments(enabled)).then((value) => setComments(value.enabled)).catch(() => undefined);
  };
  return (
    <div className="mt-3 space-y-2 text-sm text-text-strong">
      <label className="flex items-center gap-2">
        <input type="checkbox" disabled={analysis === null} checked={analysis?.enabled ?? false} onChange={(event) => changeAnalysis(event.target.checked)} />
        自动分析课程涉及的知识点，用来点亮学习地图（使用你的模型 Key，约 0.06 美元一节课；讲解播完后在后台运行，关掉页面也会完成）
      </label>
      <label className="ml-6 flex items-center gap-2 text-muted">
        每天最多分析
        <select aria-label="每天最多分析几次" disabled={!analysis?.enabled} value={analysis?.max ?? DEFAULT_ANALYSIS_LIMIT}
          onChange={(event) => changeAnalysis(true, Number(event.target.value))} className="rounded border border-border bg-transparent px-1">
          {[...new Set([...ANALYSIS_LIMITS, analysis?.max ?? DEFAULT_ANALYSIS_LIMIT])].sort((a, b) => a - b).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        次（一节课的提问和内容各算一次）
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={shown} onChange={(event) => { showWeeklyReport(event.target.checked); setShown(event.target.checked); }} />
        在“学习记录”中显示学习周报
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" disabled={comments === null} checked={comments ?? false} onChange={(event) => changeComments(event.target.checked)} />
        周报里由老师写一句评语（每周最多一次模型请求，只根据周报中的记录）
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={steps} onChange={(event) => { showNextSteps(event.target.checked); setSteps(event.target.checked); }} />
        在学习地图和周报里显示“下一步可以做什么”（按学习记录和知识点前置关系，不调用模型）
      </label>
    </div>
  );
}

export function TeachersTab() {
  return (
    <section className="glass-section p-5">
      <div className="flex items-start gap-3">
        <div className="workbench-icon-tile flex h-10 w-10 shrink-0 items-center justify-center">
          <GraduationCap size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-strong">我的老师</h3>
          <p className="mt-1 text-sm text-muted">
            星图学院的三位老师。选一位陪你上课，讲课风格和朗读音色从下一节新课开始生效；使用自定义语音资源或账号无权使用该音色时，仍用 Voice 设置里保存的音色。
          </p>
        </div>
      </div>

      <TeacherRoster />

      <details className="teachers-tab-advanced group mt-6 border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-text-strong">
          <ChevronRight size={16} className="transition-transform group-open:rotate-90" aria-hidden="true" />
          高级选项
        </summary>
        <AdvancedOptions />
      </details>
    </section>
  );
}
