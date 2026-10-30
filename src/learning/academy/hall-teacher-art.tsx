import { portraitAsset } from "../teachers/teacher-portrait-state";
import type { TeacherDefinition } from "../teachers/teachers";

/** The hall has its own wide composition; phones use the matching cut-out. */
export function HallTeacherArt({ teacherId }: { teacherId: TeacherDefinition["id"] }) {
  return (
    <picture className="academy-greeting-art" aria-hidden="true">
      <source media="(max-width: 640px)" srcSet={portraitAsset(teacherId, "card-figure")} />
      <img
        src={portraitAsset(teacherId, "hall-wide")}
        alt=""
        width={1760}
        height={800}
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />
    </picture>
  );
}
