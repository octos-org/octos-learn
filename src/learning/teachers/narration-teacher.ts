import type { TeacherDefinition } from "./teachers";

type Voices = TeacherDefinition["voices"];

export interface NarrationTeacherInput {
  /** The beat the Runtime is narrating, the next one, and the first sentence
   * of the newest lesson that has not started yet (prewarmed ahead). */
  currentBeatId?: string;
  upcomingBeatId?: string;
  startup?: { beatId: string; turnId?: string } | null;
  /** The question of the lesson a beat belongs to, once the Runtime outline
   * knows the beat (undefined before then, or for a course pack's own beat). */
  questionOfBeat: (beatId: string) => string | undefined;
  teacherOf: (questionId: string | undefined) => TeacherDefinition | null;
  /** The history service has answered (or failed) for this board. */
  settled: boolean;
}

export interface NarrationVoice { voices: Voices | null; pending: boolean }

export interface NarrationTeacher {
  current: NarrationVoice;
  upcoming: NarrationVoice;
  prewarm: NarrationVoice;
}

/** Which teacher's voice each narration speaks in, and whether that is still
 * unknown. A beat's lesson comes from the Runtime outline, or, before the
 * outline lists it, from the startup narration it is. A lesson asked on this
 * device is known at once; otherwise the voice is pending until the history
 * service has answered. */
export function narrationTeacher({ currentBeatId, upcomingBeatId, startup, questionOfBeat, teacherOf, settled }: NarrationTeacherInput): NarrationTeacher {
  const questionOf = (beatId: string | undefined) => !beatId ? undefined
    : questionOfBeat(beatId) ?? (startup?.beatId === beatId ? startup.turnId : undefined);
  const voice = (questionId: string | undefined): NarrationVoice => {
    const teacher = teacherOf(questionId);
    return { voices: teacher?.voices ?? null, pending: Boolean(questionId) && !teacher && !settled };
  };
  return {
    current: voice(questionOf(currentBeatId ?? startup?.beatId)),
    upcoming: voice(questionOf(upcomingBeatId)),
    prewarm: voice(startup?.turnId),
  };
}
