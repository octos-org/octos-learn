import type { WhiteboardRect } from "./whiteboard-placement";

export type WhiteboardCameraRequestSource =
  | "question-loading"
  | "course-end"
  | "course-restore"
  | "student-task"
  /**
   * A card the learner works at its natural size (the place-value trade card, OLL 0026), framed when its task
   * opens. It follows the course frame instead of competing with it: the course frame still records the course's
   * footprint, then the card is brought up close.
   */
  | "card-task";

export interface WhiteboardCameraRequest {
  key: string;
  source: WhiteboardCameraRequestSource;
  courseId: string;
  rect: WhiteboardRect;
  /** Cards inside `rect`; floating UI beside its empty corners is ignored. */
  parts?: WhiteboardRect[];
  /** A card frame's card and what sits under it (its answer box), framed against the viewport when applied. */
  card?: { rect: WhiteboardRect; below: WhiteboardRect[]; align: "top" | "bottom" };
}

export interface WhiteboardCameraDecision {
  action: "queued" | "replaced" | "ignored" | "applied";
  request: WhiteboardCameraRequest;
  reason?: "duplicate" | "course-settled" | "inactive-course" | "lower-priority" | "card-held";
}

type ScheduleFrame = (callback: () => void) => number;
type CancelFrame = (frame: number) => void;

const requestPriority: Record<WhiteboardCameraRequestSource, number> = {
  "question-loading": 5,
  "course-end": 4,
  "course-restore": 4,
  // Above the task panel's framing: both answer the same task opening, and the card's is the closer one.
  "card-task": 3,
  "student-task": 2,
};

const isCourseFrame = (request: WhiteboardCameraRequest) =>
  request.source === "course-end" || request.source === "course-restore";

function validRect(rect: WhiteboardRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0;
}

/**
 * The one owner of host-requested whiteboard camera moves.
 *
 * Lesson playback still supplies its normal teaching focus to the OLL view.
 * Everything added by the /learn host (questions, loading cards, course-end
 * framing, and student-task panels) must come through this controller so two
 * React effects cannot move the camera in an undefined order.
 */
export class WhiteboardCameraController {
  private pending: WhiteboardCameraRequest | null = null;
  /** A card frame to ask for once the pending course frame is applied. */
  private followUp: WhiteboardCameraRequest | null = null;
  /**
   * The course whose card the camera holds up close since its card frame was applied: the course overview does
   * not pull back to the whole course (on every change of the task panels' size) while the learner works the card
   * and types its answer. Released by the host when that work is done.
   */
  private cardHeldCourseId: string | null = null;
  private frame: number | null = null;
  private settledCourseId: string | null = null;
  private activeCourseId: string | null = null;
  private loadingCourseId: string | null = null;
  private readonly appliedKeys = new Set<string>();
  private readonly apply: (request: WhiteboardCameraRequest) => void;
  private readonly scheduleFrame: ScheduleFrame;
  private readonly cancelFrame: CancelFrame;
  private readonly report?: (decision: WhiteboardCameraDecision) => void;

  constructor(
    apply: (request: WhiteboardCameraRequest) => void,
    scheduleFrame: ScheduleFrame,
    cancelFrame: CancelFrame,
    report?: (decision: WhiteboardCameraDecision) => void,
  ) {
    this.apply = apply;
    this.scheduleFrame = scheduleFrame;
    this.cancelFrame = cancelFrame;
    this.report = report;
  }

  markCourseActive(courseId: string, force = false): boolean {
    if (
      !force
      && this.loadingCourseId !== null
      && this.loadingCourseId !== courseId
    ) return false;
    const enteredLoadingCourse = this.loadingCourseId === courseId;
    this.activeCourseId = courseId;
    if (enteredLoadingCourse || force) this.loadingCourseId = null;
    if (this.settledCourseId === courseId) this.settledCourseId = null;
    return enteredLoadingCourse;
  }

  canActivateCourse(courseId: string): boolean {
    return this.loadingCourseId === null || this.loadingCourseId === courseId;
  }

  allowsTeachingFocus(courseId?: string): boolean {
    return this.loadingCourseId === null || this.loadingCourseId === courseId;
  }

  request(request: WhiteboardCameraRequest): boolean {
    if (!validRect(request.rect) || this.appliedKeys.has(request.key)) {
      this.report?.({ action: "ignored", request, reason: "duplicate" });
      return false;
    }

    if (request.source === "question-loading") {
      this.activeCourseId = request.courseId;
      this.loadingCourseId = request.courseId;
    } else if (
      this.activeCourseId !== null
      && request.courseId !== this.activeCourseId
    ) {
      this.report?.({ action: "ignored", request, reason: "inactive-course" });
      return false;
    }

    if ((request.source === "student-task" || request.source === "course-restore")
      && this.settledCourseId === request.courseId) {
      this.report?.({ action: "ignored", request, reason: "course-settled" });
      return false;
    }

    if (request.source === "course-end" && this.cardHeldCourseId === request.courseId) {
      this.report?.({ action: "ignored", request, reason: "card-held" });
      return false;
    }

    if (request.source === "course-end" || request.source === "course-restore") {
      // Lock immediately, not after the animation frame. A task panel often
      // appears in the same React commit as course completion.
      this.settledCourseId = request.courseId;
    }

    // A new question starts another course: a card frame waiting on the old one, or holding it, is dropped.
    if (request.source === "question-loading") {
      this.followUp = null;
      this.cardHeldCourseId = null;
    }

    const previous = this.pending;
    if (previous) {
      // A card frame comes after a course frame, whichever is asked for first: the course frame keeps its job
      // (recording the course's footprint), and the card is not lost to it.
      if (request.source === "card-task" && isCourseFrame(previous)) {
        this.followUp = request;
        this.report?.({ action: "queued", request });
        return true;
      }
      if (previous.source === "card-task" && isCourseFrame(request)) this.followUp = previous;
      const previousPriority = requestPriority[previous.source];
      const nextPriority = requestPriority[request.source];
      if (nextPriority < previousPriority) {
        this.report?.({ action: "ignored", request, reason: "lower-priority" });
        return false;
      }
      this.pending = request;
      this.report?.({ action: "replaced", request });
      return true;
    }

    this.pending = request;
    this.report?.({ action: "queued", request });
    this.frame = this.scheduleFrame(() => {
      this.frame = null;
      const next = this.pending;
      this.pending = null;
      const followUp = this.followUp;
      this.followUp = null;
      if (next && !this.appliedKeys.has(next.key)) {
        this.appliedKeys.add(next.key);
        this.apply(next);
        if (next.source === "card-task") this.cardHeldCourseId = next.courseId;
        this.report?.({ action: "applied", request: next });
      }
      // Asked again, so it passes the same checks (still the active course, not applied yet) on the next frame.
      if (followUp) this.request(followUp);
    });
    return true;
  }

  /** Whether the camera holds this course's card up close (its overview need not be measured). */
  holdsCardFrame(courseId: string): boolean {
    return this.cardHeldCourseId === courseId;
  }

  /** The learner is done with the card held up close: the course overview may frame the course again. */
  releaseCardFrame(): void {
    this.cardHeldCourseId = null;
  }

  destroy(): void {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.pending = null;
    this.followUp = null;
  }
}
