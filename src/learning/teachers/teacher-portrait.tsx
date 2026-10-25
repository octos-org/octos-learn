import type { TeacherDefinition } from "./teachers";
import { PORTRAIT_POSES, portraitAsset, type PortraitPose } from "./teacher-portrait-state";
import "./teacher-portrait.css";

/** The teacher's bust in a gilded arch. All five poses stay mounted so a
 * change of pose is a cross-fade with no loading gap; only the current
 * teacher's images are requested. A still preview shows the idle pose only. */
export function TeacherPortrait({
  teacherId,
  pose,
  still = false,
  className = "",
}: {
  teacherId: TeacherDefinition["id"];
  pose: PortraitPose;
  still?: boolean;
  className?: string;
}) {
  const poses = still ? (["idle"] as const) : PORTRAIT_POSES;
  return (
    <span className={`teacher-portrait ${className}`} data-pose={still ? "idle" : pose} data-still={still || undefined} aria-hidden="true">
      <span className="teacher-portrait-window">
        <img className="teacher-portrait-scene" src={portraitAsset(teacherId, "arch-bg")} alt="" draggable={false} decoding="async" />
        {poses.map((option) => (
          <img
            key={`${teacherId}-${option}`}
            className="teacher-portrait-pose"
            data-active={option === (still ? "idle" : pose) || undefined}
            src={portraitAsset(teacherId, `bust-${option}`)}
            alt=""
            draggable={false}
            decoding="async"
            loading={still ? "lazy" : undefined}
          />
        ))}
      </span>
      <span className="teacher-portrait-frame" />
      <span className="teacher-portrait-lamp" />
    </span>
  );
}
