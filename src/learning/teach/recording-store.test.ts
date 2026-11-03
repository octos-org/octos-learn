import { beforeEach, describe, expect, it } from "vitest";
import { isRecoverableStorageLocked } from "../recoverable-storage";
import { createRecording, finishTake, planCards, startTake } from "./recording";
import {
  decodeRecording,
  deleteRecordingDraft,
  loadRecordingDrafts,
  recordingDraftsKey,
  saveRecordingDraft,
} from "./recording-store";

const now = "2026-10-31T12:00:00.000Z";

function draft(id: string) {
  const recording = planCards(
    createRecording({ id, now, topic: { text: "slope", type: "on_map_lit" }, goals: ["Find slope"] }),
    now,
    [{ title: "What is slope?" }],
  );
  return finishTake(startTake(recording, "card-1", now), "card-1", now, { durationMs: 1000, asrText: "Slope is steepness." });
}

describe("recording drafts", () => {
  beforeEach(() => localStorage.clear());

  it("saves, replaces and deletes drafts per profile", () => {
    expect(saveRecordingDraft(localStorage, "learner-a", draft("one"))).toBe(true);
    expect(saveRecordingDraft(localStorage, "learner-a", draft("two"))).toBe(true);
    expect(saveRecordingDraft(localStorage, "learner-a", { ...draft("one"), goals: ["Changed"] })).toBe(true);
    const drafts = loadRecordingDrafts(localStorage, "learner-a");
    expect(drafts.map((item) => item.id)).toEqual(["two", "one"]);
    expect(drafts[1]!.goals).toEqual(["Changed"]);
    expect(loadRecordingDrafts(localStorage, "learner-b")).toEqual([]);
    expect(deleteRecordingDraft(localStorage, "learner-a", "two")).toBe(true);
    expect(loadRecordingDrafts(localStorage, "learner-a").map((item) => item.id)).toEqual(["one"]);
  });

  it("locks a damaged draft list instead of overwriting it", () => {
    const key = recordingDraftsKey("learner-a");
    localStorage.setItem(key, JSON.stringify([{ schema: "something-else" }]));
    expect(loadRecordingDrafts(localStorage, "learner-a")).toEqual([]);
    expect(isRecoverableStorageLocked(localStorage, key)).toBe(true);
    expect(saveRecordingDraft(localStorage, "learner-a", draft("one"))).toBe(false);
    expect(localStorage.getItem(key)).toContain("something-else");
  });

  it("rejects recordings with unknown topic types or take states", () => {
    expect(() => decodeRecording({ ...draft("one"), topic: { text: "x", type: "anything" } })).toThrow();
    const broken = draft("one");
    broken.cards[0]!.takes[0]!.status = "lost" as never;
    expect(() => decodeRecording(broken)).toThrow();
  });
});
