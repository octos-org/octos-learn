import { Check, GraduationCap } from "lucide-react";
import { useState } from "react";

import { OctosSkinArt } from "@/components/octos-skin-art";
import { TEACHER_SKINS, useTeacherSkin } from "@/hooks/use-teacher-skin";
import { showWeeklyReport, weeklyReportShown } from "@/learning/report/report-week";
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
  return (
    <label className="mt-5 flex items-center gap-2 text-sm text-text-strong">
      <input type="checkbox" checked={shown} onChange={(event) => { showWeeklyReport(event.target.checked); setShown(event.target.checked); }} />
      在“学习记录”中显示学习周报
    </label>
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
