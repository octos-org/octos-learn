import type { TeacherDefinition } from "./teachers";
import { PORTRAIT_POSES, portraitAsset, type PortraitPose } from "./teacher-portrait-state";
import "./teacher-portrait.css";

/** How the bust is framed. `glow`: no frame, the teacher stands in a soft
 * light before a faint star orbit and fades out below, so the whiteboard
 * stays the focus (classroom). `card`: a collector's card with the window
 * scene, corner ornaments and a name plate (hall, award ceremony). */
export type PortraitFrame = "glow" | "card";

/** The teacher's bust. All five poses stay mounted so a change of pose is a
 * cross-fade with no loading gap; only the current teacher's images are
 * requested. A still preview shows the idle pose only. The light behind a
 * glow portrait, and a card's corner stars, brighten with the pose. */
export function TeacherPortrait({
  teacherId,
  pose,
  still = false,
  frame = "glow",
  name,
  className = "",
}: {
  teacherId: TeacherDefinition["id"];
  pose: PortraitPose;
  still?: boolean;
  frame?: PortraitFrame;
  /** Shown on a card's name plate. */
  name?: string;
  className?: string;
}) {
  const poses = still ? (["idle"] as const) : PORTRAIT_POSES;
  return (
    <span className={`teacher-portrait ${className}`} data-frame={frame} data-teacher={teacherId} data-pose={still ? "idle" : pose} data-still={still || undefined} aria-hidden="true">
      {frame === "glow" && <span className="teacher-portrait-glow"><i /><i /></span>}
      <span className="teacher-portrait-window">
        {frame === "card" && <img className="teacher-portrait-scene" src={portraitAsset(teacherId, "arch-bg")} alt="" draggable={false} decoding="async" />}
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
      {frame === "card" && (
        <>
          <span className="teacher-portrait-inset" />
          <span className="teacher-portrait-corners"><i /><i /><i /><i /></span>
          {name && <span className="teacher-portrait-plate">{name}</span>}
        </>
      )}
    </span>
  );
}
