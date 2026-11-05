import { beforeEach, describe, expect, it } from "vitest";

import { recordingInk, syncLessonDrafts, type LessonsApi } from "./draft-sync";
import { loadInkSnapshots, saveInkSnapshot } from "./ink-snapshot-store";
import type { SavedLesson, SavedLessonSummary } from "./learner-lessons-api";
import { createRecording, planCards, type LearnerRecording } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";

const at = (minute: number) => `2026-11-02T10:${String(minute).padStart(2, "0")}:00.000Z`;
const draft = (id: string, minute = 0, goal = "Find slope"): LearnerRecording =>
  ({ ...planCards(createRecording({ id, now: at(0), topic: { text: "slope", type: "on_map_lit" }, goals: [goal] }), at(0), [{ title: "What is slope?" }]), updatedAt: at(minute) });

/** An in-memory stand-in for the service, with its revision rule. */
function fakeService() {
  const lessons = new Map<string, { revision: number; updated_at: string; recording: LearnerRecording; ink: SavedLesson["ink"] }>();
  const summary = (id: string): SavedLessonSummary => {
    const lesson = lessons.get(id)!;
    return { lesson_id: id, state: "draft", title: lesson.recording.topic.text, star_topic_id: null, revision: lesson.revision, created_at: at(0),
      updated_at: lesson.updated_at, saved_at: null, changed_since_saved: false, saved: null };
  };
  const api: LessonsApi = {
    listLessons: async () => [...lessons.keys()].map(summary),
    readLesson: async (id) => ({ ...summary(id), recording: lessons.get(id)!.recording, ink: lessons.get(id)!.ink }),
    putLessonDraft: async (recording, ink, base) => {
      const current = lessons.get(recording.id);
      if ((current?.revision ?? null) !== base) return { status: "conflict", revision: current?.revision ?? null };
      lessons.set(recording.id, { revision: (current?.revision ?? 0) + 1, updated_at: recording.updatedAt, recording, ink });
      return { status: "saved", revision: (current?.revision ?? 0) + 1 };
    },
  };
  return { api, lessons };
}

describe("draft sync", () => {
  beforeEach(() => localStorage.clear());

  it("sends a new draft with its handwriting, then only what changed", async () => {
    const service = fakeService();
    const recording = { ...draft("one"), cards: [{ ...draft("one").cards[0]!, ink: [{ snapshotId: "ink-1", sha256: "x", selections: [] }] }] };
    saveInkSnapshot(localStorage, "p", "ink-1", { svg: "<svg/>", width: 10, height: 10 });
    saveInkSnapshot(localStorage, "p", "ink-unused", { svg: "<svg/>", width: 10, height: 10 });
    saveRecordingDraft(localStorage, "p", recording);
    expect((await syncLessonDrafts(localStorage, "p", service.api)).pushed).toEqual(["one"]);
    expect(Object.keys(service.lessons.get("one")!.ink)).toEqual(["ink-1"]);
    expect((await syncLessonDrafts(localStorage, "p", service.api)).pushed).toEqual([]);
    saveRecordingDraft(localStorage, "p", { ...recording, updatedAt: at(5) });
    expect((await syncLessonDrafts(localStorage, "p", service.api)).pushed).toEqual(["one"]);
    expect(service.lessons.get("one")!.revision).toBe(2);
  });

  it("brings a draft from another device, with its handwriting", async () => {
    const service = fakeService();
    await service.api.putLessonDraft(draft("elsewhere"), { "ink-9": { svg: "<svg/>", width: 1, height: 1 } }, null);
    expect((await syncLessonDrafts(localStorage, "p", service.api)).pulled).toEqual(["elsewhere"]);
    expect(loadRecordingDrafts(localStorage, "p").map((item) => item.id)).toEqual(["elsewhere"]);
    expect(loadInkSnapshots(localStorage, "p")["ink-9"]).toBeTruthy();
  });

  it("takes the other side's change, keeps the newer edit when both changed, and follows a deletion", async () => {
    const service = fakeService();
    saveRecordingDraft(localStorage, "p", draft("one"));
    await syncLessonDrafts(localStorage, "p", service.api);
    await service.api.putLessonDraft(draft("one", 3, "From the tablet"), {}, 1);
    expect((await syncLessonDrafts(localStorage, "p", service.api)).pulled).toEqual(["one"]);
    expect(loadRecordingDrafts(localStorage, "p")[0]!.goals).toEqual(["From the tablet"]);

    await service.api.putLessonDraft(draft("one", 4, "Tablet again"), {}, 2);
    saveRecordingDraft(localStorage, "p", draft("one", 9, "Newer here"));
    expect((await syncLessonDrafts(localStorage, "p", service.api)).pushed).toEqual(["one"]);
    expect(service.lessons.get("one")!.recording.goals).toEqual(["Newer here"]);

    service.lessons.delete("one");
    expect((await syncLessonDrafts(localStorage, "p", service.api)).removed).toEqual(["one"]);
    expect(loadRecordingDrafts(localStorage, "p")).toEqual([]);
  });

  it("keeps syncing the other drafts when the service refuses one, and says why", async () => {
    const service = fakeService();
    const put = service.api.putLessonDraft;
    service.api.putLessonDraft = async (recording, ink, base) => {
      if (recording.id === "bad") throw new Error("My lessons didn’t accept this lesson (Invalid handwriting).");
      return put(recording, ink, base);
    };
    saveRecordingDraft(localStorage, "p", draft("bad"));
    saveRecordingDraft(localStorage, "p", draft("good"));
    const result = await syncLessonDrafts(localStorage, "p", service.api);
    expect(result.pushed).toEqual(["good"]);
    expect(result.failed).toEqual({ bad: "My lessons didn’t accept this lesson (Invalid handwriting)." });
  });

  it("finds handwriting anywhere in the recording", () => {
    const recording = { ...draft("one"), cards: [{ ...draft("one").cards[0]!, takes: [{ take: 1, status: "kept" as const, startedAt: at(0), events: [], ink: [{ snapshotId: "take-ink", sha256: "x", selections: [] }] }] }] };
    expect(Object.keys(recordingInk(recording, { "take-ink": { svg: "", width: 1, height: 1 }, other: { svg: "", width: 1, height: 1 } }))).toEqual(["take-ink"]);
  });
});
