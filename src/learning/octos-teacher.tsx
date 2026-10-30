import { useLocale } from "@/i18n/use-locale";
import { localizedCatalog, tr } from "@/i18n";
import { useState } from "react";

import type { VoiceState } from "@/home/voice/use-voice-conversation";
import { OctosSkinArt } from "@/components/octos-skin-art";
import { MarkdownContent } from "@/components/markdown-renderer";
import { useTeacherSkin } from "@/hooks/use-teacher-skin";
import { useTeacherApproval } from "@/learning/teachers/teacher-portrait-state";
import type { TeacherDefinition } from "@/learning/teachers/teachers";

const STATE_LABEL: Record<VoiceState, string> = localizedCatalog({
  idle: "轻触开始",
  starting: "语音准备中",
  listening: "我在听",
  thinking: "正在想",
  speaking: "正在讲",
  error: "轻触重试",
});

export function teacherArtUsesStaticPreview(mode: string): boolean {
  return mode === "android";
}

export function OctosTeacher({
  state,
  speech,
  preparing = false,
  stateLabel,
  onClick,
  disabled = false,
  teacherId,
  recordedVoice = false,
}: {
  state: VoiceState;
  speech: string;
  preparing?: boolean;
  stateLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  teacherId?: TeacherDefinition["id"];
  /** A course pack plays its own recorded narration, not the teacher's
   * voice; the caption says so instead of implying the teacher is speaking. */
  recordedVoice?: boolean;
}) {
  useLocale();
  const { skin } = useTeacherSkin();
  const taskApproved = useTeacherApproval();
  // A tap has no decoration of its own: the pose and caption already answer
  // it. The 3D companion skins still play their model's reaction clip.
  const [reactionKey, setReactionKey] = useState(0);

  const handleClick = () => {
    if (disabled) return;
    setReactionKey((current) => current + 1);
    onClick();
  };

  return (
    // All captions are transient, including the completion prompt. Their
    // appearance and dismissal must not change board layout or camera framing.
    <div className="octos-teacher">
      {speech && (
        <div className="octos-teacher-caption" aria-live="polite">
          {recordedVoice && (
            <span className="octos-teacher-voice-note" title={tr("这节精品课的旁白是课程录制的原声，不是老师的声音")}>{tr("课程原声")}</span>
          )}
          <MarkdownContent
            text={speech}
            className="octos-teacher-caption-content"
          />
        </div>
      )}
      <button
        type="button"
        className="octos-teacher-avatar"
        data-learning-board-occlusion=""
        data-state={state}
        data-portrait={skin === "portrait" ? "true" : undefined}
        data-preparing={preparing ? "true" : undefined}
        onClick={handleClick}
        disabled={disabled}
        aria-busy={preparing}
        aria-label={
          disabled
            ? tr("课程预览")
            : preparing
            ? tr("Octos 正在准备下一步")
            : state === "speaking" || state === "thinking"
            ? tr("打断 Octos")
            : tr("和 Octos 说话")
        }
      >
        <span className="octos-teacher-halo" />
        {preparing && (
          <span className="octos-teacher-preparing" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        <OctosSkinArt
          skin={skin}
          className="octos-teacher-avatar-art"
          eager
          // Portrait poses are plain images, cheap enough on every platform.
          staticPreview={skin !== "portrait" && teacherArtUsesStaticPreview(import.meta.env.MODE)}
          activity={
            preparing ? "thinking" : state === "starting" ? "idle" : state
          }
          reactionKey={reactionKey}
          teacherId={teacherId}
          approving={taskApproved}
        />
        <span className="octos-teacher-state">
          {preparing ? tr("稍等一下") : stateLabel ?? STATE_LABEL[state]}
        </span>
      </button>
    </div>
  );
}
