import { createRequestId } from "../../lib/request-id";
import type { BrowserLessonSession } from 'octos-lesson-language/web-runtime';
import { PlaybackEvidenceTracker } from './playback-evidence';
import type { HistoryDraft, LearningHistoryRecorder } from './recorder';

export type PlaybackHistoryContext = Pick<HistoryDraft, 'runKey' | 'questionId' | 'course'>;
export interface PlaybackHistoryBinding {
  recorder: LearningHistoryRecorder;
  forStep(stepId: string): PlaybackHistoryContext | undefined;
  forTask(taskId: string): PlaybackHistoryContext | undefined;
}

/** Samples inside the synchronous Runtime store callback. Every checkpoint
 * and task-log write in one call stack is coalesced with its observed facts
 * by the recorder, before any IndexedDB transaction can commit.
 */
export class PlaybackHistoryCapture {
  private session?: BrowserLessonSession;
  private evidence?: PlaybackEvidenceTracker;
  private attempts = new Set<string>();
  private hints = new Map<string, number>();
  private started = new Set<string>();
  private log = createRequestId();
  private binding?: PlaybackHistoryBinding;
  private readonly storageKey: string;
  private reason?: "play" | "view" | "seek" | "skip" | "restore";
  private position?: HistoryDraft;
  private checkpoint?: { cursor: number; epoch: number };
  constructor(storageKey: string, binding?: PlaybackHistoryBinding) { this.storageKey = storageKey; this.binding = binding; }
  updateBinding(binding?: PlaybackHistoryBinding) { this.binding = binding; }
  withReason<T>(reason: "play" | "view" | "seek" | "skip" | "restore", apply: () => T): T {
    const previous = this.reason; this.reason = reason;
    try { return apply(); } finally {
      this.reason = previous;
      if (!previous && this.position) {
        const position = this.position; this.position = undefined;
        this.binding?.recorder.record(position);
      }
    }
  }
  bind(session: BrowserLessonSession) {
    this.session = session;
    this.log = createRequestId(); this.attempts.clear(); this.hints.clear(); this.started.clear();
    this.evidence = new PlaybackEvidenceTracker({ cursor: session.projection.cursor, epoch: session.playbackEpoch });
    this.checkpoint = { cursor: session.projection.cursor, epoch: session.playbackEpoch };
    this.position = undefined;
    // Restored attempts are existing state, not newly observed answers.
    for (const task of session.studentTasks) {
      task.attempts.forEach(attempt => this.attempts.add(`${task.task_id}:${attempt.operation_id}`));
      this.hints.set(task.task_id, task.hints_revealed);
    }
  }
  write = (key: string, value: unknown) => {
    const binding = this.binding;
    if (!binding) return;
    const drafts: HistoryDraft[] = [];
    const session = this.session;
    if (session && key === this.storageKey) {
      const cursor = session.projection.cursor;
      const moved = this.checkpoint?.cursor !== cursor || this.checkpoint?.epoch !== session.playbackEpoch;
      this.checkpoint = { cursor, epoch: session.playbackEpoch };
      const op = session.currentOperation;
      const stepId = op?.step_id ?? session.projection.current_step_id;
      const context = stepId ? binding.forStep(stepId) : undefined;
      const completed = this.evidence?.observe({ cursor, epoch: session.playbackEpoch, playing: session.isPlaying && (!this.reason || this.reason === "play"), operation: op });
      if (completed) {
        const owned = binding.forStep(completed.stepId);
        if (owned) {
          if (!this.started.has(owned.runKey)) {
            drafts.push({ ...owned, kind: 'run_started', stableKey: `run-started:${owned.runKey}`, data: { mode: 'start' } }); this.started.add(owned.runKey);
          }
          drafts.push({ ...owned, kind: 'beat_completed', logKey: this.log, data: { step_id: completed.stepId, beat_id: completed.beatId, presentation: completed.presentation } });
        }
      }
      // Restoring a review board is reconstruction, not a new visit to each
      // intermediate position. A navigation action records only its final
      // position; task-only checkpoint writes do not add another position.
      if (context && moved && this.reason !== 'restore' && (op?.type === 'beat.end' || !session.isPlaying)) {
        const position: HistoryDraft = { ...context, kind: 'playback_position', logKey: this.log,
          data: { cursor, reason: this.reason ?? (session.isPlaying ? 'play' : 'view'), ...(stepId ? { step_id: stepId } : {}), ...(op?.beat_id ? { beat_id: op.beat_id } : {}) } };
        if (this.reason) this.position = position;
        else drafts.push(position);
      }
    }
    if (session && key.endsWith(':student-task-progress:v1')) {
      for (const task of session.studentTasks) {
        const context = binding.forTask(task.task_id);
        if (!context) continue;
        for (const attempt of task.attempts) {
          const id = `${task.task_id}:${attempt.operation_id}`;
          if (this.attempts.has(id)) continue;
          this.attempts.add(id);
          drafts.push({ ...context, kind: 'task_attempt', logKey: this.log, data: { task_id: task.task_id, operation_id: attempt.operation_id,
            result: attempt.succeeded ? 'succeeded' : 'failed', hints_used: task.hints_revealed, value: attempt.actual } });
        }
        const before = this.hints.get(task.task_id) ?? 0;
        for (let hint = before + 1; hint <= task.hints_revealed; hint++) drafts.push({ ...context, kind: 'task_hint', logKey: this.log, data: { task_id: task.task_id, hint_index: hint } });
        this.hints.set(task.task_id, task.hints_revealed);
      }
    }
    binding.recorder.stage({ key, value }, drafts);
  };
  narrationEnded(beatId: string, reason: 'ended' | 'disabled' | 'failed' | 'cancelled') {
    this.evidence?.narrationEnded(beatId, reason);
    const step = this.session?.outline.find(step => step.beats.some(beat => beat.id === beatId));
    const context = step && this.binding?.forStep(step.id);
    if (context) this.binding?.recorder.record({ ...context, kind: 'narration_ended', logKey: this.log, data: { beat_id: beatId, reason } });
  }
}
