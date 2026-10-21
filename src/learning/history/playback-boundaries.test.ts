import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserLessonSession, parseCanonicalJsonl, type PlaybackStore } from "octos-lesson-language/web-runtime";
import source from "../oll/fixtures/unit-circle-sine.canonical.jsonl?raw";
import { PlaybackEvidenceTracker, type CompletedBeatEvidence } from "./playback-evidence";

function store() {
  const values = new Map<string, unknown>();
  const adapter: PlaybackStore = {
    load: key => structuredClone(values.get(key)) as ReturnType<PlaybackStore["load"]>,
    save: (key, value) => { values.set(key, structuredClone(value)); },
    remove: key => { values.delete(key); },
    loadStudentOperations: key => structuredClone(values.get(`${key}:ops`)) as ReturnType<NonNullable<PlaybackStore["loadStudentOperations"]>>,
    saveStudentOperations: (key, value) => { values.set(`${key}:ops`, structuredClone(value)); },
    loadStudentTaskProgress: key => structuredClone(values.get(`${key}:tasks`)) as ReturnType<NonNullable<PlaybackStore["loadStudentTaskProgress"]>>,
    saveStudentTaskProgress: (key, value) => { values.set(`${key}:tasks`, structuredClone(value)); },
  };
  return { values, adapter };
}
afterEach(() => { vi.useRealTimers(); });

describe("installed Runtime boundary probes (not a learning recorder)", () => {
  it("viewing the last step persists its end position without any play call", () => {
    const { adapter, values } = store();
    const runtime = new BrowserLessonSession(parseCanonicalJsonl(source), adapter, "seek");
    runtime.seekToStep(runtime.outline.at(-1)!.id, "end");
    expect(runtime.projection.status).toBe("paused");
    expect(runtime.projection.cursor).toBe(runtime.outline.at(-1)!.end_cursor);
    expect(values.has("seek")).toBe(true);
    const restored = new BrowserLessonSession(parseCanonicalJsonl(source), adapter, "seek");
    expect(restored.projection.status).toBe("paused");
    expect(restored.projection.cursor).toBe(runtime.projection.cursor);
  });

  it("normal timed playback and seeking yield indistinguishable final positions", () => {
    vi.useFakeTimers();
    const events = parseCanonicalJsonl(source);
    const played = new BrowserLessonSession(events, store().adapter, "play", { reducedMotion: true });
    played.play();
    vi.runAllTimers();
    expect(played.projection.status).toBe("completed");
    const viewed = new BrowserLessonSession(events, store().adapter, "view", { reducedMotion: true });
    viewed.seek(played.projection.cursor);
    expect(viewed.projection).toEqual(played.projection);
    played.pause();
  });

  it("reset preserves task hints, whereas a new storage scope starts fresh", () => {
    const { adapter } = store();
    const events = parseCanonicalJsonl(source);
    const runtime = new BrowserLessonSession(events, adapter, "first-run");
    runtime.seek(runtime.projection.total_operations);
    const task = runtime.studentTasks[0]!;
    expect(task.available).toBe(true);
    runtime.requestStudentTaskHint(task.task_id);
    const before = runtime.studentTasks[0]!.hints_revealed;
    expect(before).toBeGreaterThan(0);
    runtime.reset();
    expect(runtime.studentTasks[0]!.hints_revealed).toBe(before);
    const fresh = new BrowserLessonSession(events, adapter, "second-run");
    expect(fresh.studentTasks[0]!.hints_revealed).toBe(0);
  });
});

describe("playback evidence against the installed Runtime", () => {
  function observe(runtime: BrowserLessonSession) {
    const tracker = new PlaybackEvidenceTracker({ cursor: runtime.cursor, epoch: runtime.playbackEpoch });
    const beats: CompletedBeatEvidence[] = [];
    const unsubscribe = runtime.subscribe(() => {
      const beat = tracker.observe({ cursor: runtime.cursor, epoch: runtime.playbackEpoch,
        playing: runtime.isPlaying, operation: runtime.currentOperation });
      if (beat) beats.push(beat);
    });
    return { tracker, beats, unsubscribe };
  }
  it("records normally played beats but ignores seeking, restored positions and manual skip", () => {
    vi.useFakeTimers();
    const { adapter } = store();
    const events = parseCanonicalJsonl(source);
    const played = new BrowserLessonSession(events, adapter, "played", { reducedMotion: true });
    const normal = observe(played);
    played.play(); vi.runAllTimers();
    expect(normal.beats.length).toBeGreaterThan(0);
    const viewed = new BrowserLessonSession(events, adapter, "viewed");
    const staticView = observe(viewed);
    viewed.seek(viewed.projection.total_operations);
    expect(staticView.beats).toEqual([]);
    const restored = new BrowserLessonSession(events, adapter, "played");
    const resume = observe(restored);
    restored.play(); vi.runAllTimers();
    expect(resume.beats).toEqual([]);
    const skipped = new BrowserLessonSession(events, adapter, "skipped");
    const manual = observe(skipped);
    skipped.advanceBeat();
    expect(manual.beats).toEqual([]);
    for (const observation of [normal, staticView, resume, manual]) observation.unsubscribe();
  });
  it("does not turn failed audio fallback into a completed beat", () => {
    vi.useFakeTimers();
    const runtime = new BrowserLessonSession(parseCanonicalJsonl(source), store().adapter, "audio", { narrationTiming: "external", reducedMotion: true });
    const observed = observe(runtime);
    runtime.play(); vi.runAllTimers();
    const beat = runtime.projection.current_beat_id!;
    expect(beat).toBeTruthy();
    observed.tracker.narrationEnded(beat, "failed");
    runtime.completeNarration(beat, runtime.playbackEpoch);
    vi.runAllTimers();
    expect(observed.beats).toEqual([]);
    runtime.pause(); observed.unsubscribe();
  });
});
