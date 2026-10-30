import type { TeacherDefinition } from "./teachers";

export interface ClassroomTeacherInput {
  /** The teacher chosen now; new questions go to them. */
  selected: TeacherDefinition;
  /** A question is being sent right now (typed, spoken or a selection);
   * not the background generation that follows. */
  asking: boolean;
  /** Who that question was asked of, when its lesson takes a teacher. */
  askedTeacher: TeacherDefinition | null;
  /** The newest lesson still being generated, from any kind of question and
   * also after a reload, with who it was asked of (null when unknown or when
   * it does not take a teacher). */
  generating: { teacher: TeacherDefinition | null } | null;
  /** A lesson is playing on the board. */
  playing: boolean;
  /** The lesson on screen: generated lessons have a question id and the
   * teacher who taught it; a course pack's or fixture's own lesson has none. */
  onScreen: { questionId?: string; teacher: TeacherDefinition | null } | null;
}

export interface ClassroomTeacher {
  /** Whose portrait stands in the classroom. */
  portrait: TeacherDefinition;
  /** Whose lines the classroom reactions use; null keeps the neutral lines. */
  reactions: TeacherDefinition | null;
  /** The lesson on screen is a course pack's or fixture's own, with its own
   * narration and neutral lines. */
  packagedLesson: boolean;
}

/** Who the classroom shows and speaks as. A lesson on screen keeps the teacher
 * who taught it; a question being asked, or a lesson still being generated
 * while nothing plays, belongs to the teacher it was asked of, as recorded
 * when it was asked, even if the choice has changed since. */
export function classroomTeacher({ selected, asking, askedTeacher, generating, playing, onScreen }: ClassroomTeacherInput): ClassroomTeacher {
  const packagedLesson = Boolean(onScreen) && !onScreen?.questionId;
  if (generating?.teacher && (asking || !playing)) return { portrait: generating.teacher, reactions: generating.teacher, packagedLesson };
  if (asking) return { portrait: selected, reactions: askedTeacher, packagedLesson };
  if (generating && !playing) return { portrait: selected, reactions: null, packagedLesson };
  if (!onScreen || packagedLesson) return { portrait: selected, reactions: null, packagedLesson };
  return { portrait: onScreen.teacher ?? selected, reactions: onScreen.teacher, packagedLesson };
}
