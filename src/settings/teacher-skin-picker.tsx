import { useLocale } from "@/i18n/use-locale";
import { tr } from "@/i18n";
import { Check } from "lucide-react";

import { OctosSkinArt } from "@/components/octos-skin-art";
import { TEACHER_SKINS, useTeacherSkin } from "@/hooks/use-teacher-skin";

/** The Octos avatar looks. Only the first-run setup offers them; Settings →
 * 我的老师 sets the look together with the chosen teacher. */
export function TeacherSkinPicker({
  compact = false,
}: {
  compact?: boolean;
}) {
  useLocale();
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
                {option.kind === "model" ? "3D · Animated" : option.kind === "portrait" ? tr("Illustrated") : "2D · SVG"}
              </span>
              <span
                className={`workbench-status-pill shrink-0 ${active ? "" : "invisible"}`}
                data-tone="accent"
                data-testid={`teacher-skin-active-${option.id}`}
                aria-hidden={!active}
              >
                <Check size={13} />
                {tr("Active")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
