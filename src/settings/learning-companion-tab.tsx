import { Check, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";

import { getToken } from "@/api/client";
import { openHistoryApi } from "@/learning/history/history-api";

import { OctosSkinArt } from "@/components/octos-skin-art";
import { TEACHER_SKINS, useTeacherSkin } from "@/hooks/use-teacher-skin";
import { showWeeklyReport, weeklyReportShown } from "@/learning/report/report-week";
import { nextStepsShown, showNextSteps } from "@/learning/map/next-step-line";
import { TEACHERS, useSelectedTeacher } from "@/learning/teachers/teachers";

export function TeacherPicker() {
  const { teacher, setTeacherId } = useSelectedTeacher();
  const { setSkin } = useTeacherSkin();
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="选择老师">
      {TEACHERS.map((option) => {
        const active = teacher.id === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`teacher-${option.id}`}
            onClick={() => { setTeacherId(option.id); setSkin(option.skin); }}
            className="teacher-skin-option workbench-card flex flex-col items-start gap-3 p-4 text-left"
          >
            <span className="flex w-full items-center gap-3">
              <span className="teacher-skin-art flex shrink-0 justify-center" aria-hidden="true">
                <OctosSkinArt skin={option.skin} className="octos-skin-card-art" staticPreview />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-strong">{option.name}</span>
                <span className="mt-1 block text-xs leading-5 text-muted">{option.tagline}</span>
                <span className="mt-1 block text-xs leading-5 text-muted">朗读音色：{[...new Set(Object.values(option.voices).map((voice) => voice.name))].join(" / ")}</span>
              </span>
            </span>
            <span className={`workbench-status-pill shrink-0 ${active ? "" : "invisible"}`} data-tone="accent" aria-hidden={!active}>
              <Check size={13} />
              当前老师
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TeacherSkinPicker({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { skin: teacherSkin, setSkin: setTeacherSkin } = useTeacherSkin();

  return (
    <div
      className={compact
        ? "setup-teacher-skin-picker"
        : "mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"}
      data-compact={compact ? "true" : undefined}
    >
      {TEACHER_SKINS.map((option) => {
        const active = teacherSkin === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-label={`${option.label} Octos teacher`}
            aria-pressed={active}
            data-active={active ? "true" : undefined}
            data-testid={`teacher-skin-${option.id}`}
            onClick={() => setTeacherSkin(option.id)}
            className={`teacher-skin-option workbench-card flex min-h-44 flex-col items-start justify-between gap-3 p-4 text-left${compact ? " is-compact" : ""}`}
          >
            <span className="teacher-skin-copy w-full min-w-0">
              <span className="block text-sm font-semibold text-text-strong">
                {option.label}
              </span>
              <span className="teacher-skin-description mt-1 block text-xs leading-5 text-muted">
                {option.description}
              </span>
            </span>
            <span className="teacher-skin-art flex w-full justify-center" aria-hidden="true">
              <OctosSkinArt
                skin={option.id}
                className="octos-skin-card-art"
                staticPreview
              />
            </span>
            <span className="teacher-skin-status flex w-full items-center justify-between gap-2">
              <span className="workbench-status-pill" data-tone="neutral">
                {option.kind === "model" ? "3D · Animated" : "2D · SVG"}
              </span>
              <span
                className={`workbench-status-pill shrink-0 ${active ? "" : "invisible"}`}
                data-tone="accent"
                data-testid={`teacher-skin-active-${option.id}`}
                aria-hidden={!active}
              >
                <Check size={13} />
                Active
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WeeklyReportToggle() {
  const [shown, setShown] = useState(weeklyReportShown);
  const [steps, setSteps] = useState(nextStepsShown);
  // Account setting in the learning-history service; null until it is read.
  const [comments, setComments] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const token = getToken();
    if (token) {
      void openHistoryApi(token).then((api) => api.reportComments()).then((value) => { if (active) setComments(value.enabled); }).catch(() => undefined);
      void openHistoryApi(token).then((api) => api.analysisStatus()).then((value) => { if (active) setAnalysis(value.enabled); }).catch(() => undefined);
    }
    return () => { active = false; };
  }, []);
  const changeAnalysis = (enabled: boolean) => {
    const token = getToken();
    if (!token) return;
    void openHistoryApi(token).then(async (api) => { await api.configureAnalysis(enabled, enabled ? 10 : 0); setAnalysis(enabled); }).catch(() => undefined);
  };
  const changeComments = (enabled: boolean) => {
    const token = getToken();
    if (!token) return;
    void openHistoryApi(token).then((api) => api.setReportComments(enabled)).then((value) => setComments(value.enabled)).catch(() => undefined);
  };
  return (
    <div className="mt-5 space-y-2 text-sm text-text-strong">
      <label className="flex items-center gap-2">
        <input type="checkbox" disabled={analysis === null} checked={analysis ?? false} onChange={(event) => changeAnalysis(event.target.checked)} />
        自动分析课程涉及的知识点，用来点亮学习地图（使用你的模型 Key，约 0.06 美元一节课，每天最多 10 节，不在上课时运行）
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

export function LearningCompanionTab() {
  return (
    <section className="glass-section p-5">
      <div className="flex items-start gap-3">
        <div className="workbench-icon-tile flex h-10 w-10 shrink-0 items-center justify-center">
          <GraduationCap size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-strong">
            Learning Companion
          </h3>
          <p className="mt-1 text-sm text-muted">
            Choose the Octos teacher shown in the lower-right corner of the
            learning canvas.
          </p>
        </div>
      </div>

      <TeacherPicker />
      <p className="mt-5 text-sm text-muted">
        老师的讲课风格和朗读音色用于新开始的课程；使用自定义语音资源或账号无权使用该音色时，仍用 Voice 设置里保存的音色。下面只改变外观；选择上面的老师时会同时换成这位老师的默认外观。
      </p>
      <TeacherSkinPicker />
      <WeeklyReportToggle />
    </section>
  );
}
