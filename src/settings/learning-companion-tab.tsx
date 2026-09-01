import { Check, GraduationCap } from "lucide-react";

import { OctosSkinArt } from "@/components/octos-skin-art";
import { TEACHER_SKINS, useTeacherSkin } from "@/hooks/use-teacher-skin";

export function LearningCompanionTab() {
  const { skin: teacherSkin, setSkin: setTeacherSkin } = useTeacherSkin();

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

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              className="workbench-card flex min-h-44 flex-col items-start justify-between gap-3 p-4 text-left"
            >
              <span className="w-full min-w-0">
                <span className="block text-sm font-semibold text-text-strong">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted">
                  {option.description}
                </span>
              </span>
              <span className="flex w-full justify-center" aria-hidden="true">
                <OctosSkinArt
                  skin={option.id}
                  className="octos-skin-card-art"
                />
              </span>
              <span className="flex w-full items-center justify-between gap-2">
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
    </section>
  );
}
