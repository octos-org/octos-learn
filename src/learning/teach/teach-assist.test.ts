import { beforeEach, describe, expect, it, vi } from "vitest";

const skill = vi.hoisted(() => ({ calls: [] as Array<{ session: string; action: string; args: Record<string, unknown> }>, reply: {} as unknown }));
vi.mock("@/api/skill-actions", () => ({
  invokeSkillAction: vi.fn(async (session: string, action: string, args: Record<string, unknown>) => {
    skill.calls.push({ session, action, args });
    return skill.reply;
  }),
}));
vi.mock("@/api/chat", () => ({ uploadFiles: vi.fn(async () => ["uploads/handwriting.png"]) }));

import { compileRecording } from "./compile-recording";
import { appendEvent, createRecording, finishTake, planCards, startTake, type LearnerRecording, type RecordingEvent } from "./recording";
import { askOcto, cardSummaries, reviewLesson, teachAssistSessionId } from "./teach-assist";

const now = "2026-10-31T12:00:00.000Z";
const author = { kind: "learner" as const, learner_ref: "learner:demo", presented_by: { avatar_ref: "avatar:octo", voice_ref: "voice:learner-default" } };

function record(recording: LearnerRecording, key: string, text: string, events: RecordingEvent[]) {
  let next = startTake(recording, key, now);
  for (const event of events) next = appendEvent(next, key, event, now);
  return finishTake(next, key, now, { durationMs: 9_000, asrText: text, speechSpanMs: [0, 9_000] });
}

function slope() {
  let recording = planCards(
    createRecording({ id: "rec-1", now, topic: { text: "Finding slope", type: "math_off_map" }, goals: ["Find slope from two points"] }),
    now, [{ title: "Two points" }, { title: "The line" }],
  );
  recording = record(recording, "card-1", "A is 1, 2 and B is 4, 8.", [
    { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] },
    { t: 100, type: "point_tool.place", node: "grid-1", point: "point-a", x: 1, y: 2, label: "A (1, 2)" },
    { t: 200, type: "point_tool.place", node: "grid-1", point: "point-b", x: 4, y: 8, label: "B (4, 8)" },
  ]);
  return record(recording, "card-2", "So the slope is one half.", [
    { t: 100, type: "graph_it.confirmed", points: ["grid-1#point-a", "grid-1#point-b"], expression: "2*x", alias: "line-1", x: [-1, 6], y: [-1, 9] },
    { t: 500, type: "tool.laser", target: { node: "line-1", part: "line" } },
  ]);
}

beforeEach(() => { skill.calls = []; });

describe("teach assist", () => {
  it("describes each card by what was said and what the board shows", () => {
    const recording = slope();
    const compiled = compileRecording(recording, { author, language: "en-US" });
    expect(cardSummaries(recording, compiled)).toEqual([
      { key: "card-1", title: "Two points", said: "A is 1, 2 and B is 4, 8.", board: ["coordinate grid grid-1 with points A (1, 2), B (4, 8)"] },
      { key: "card-2", title: "The line", said: "So the slope is one half.", board: ["graph line-1: y = 2*x, A (1, 2), B (4, 8)", "points at line-1#line"] },
    ]);
  });

  it("asks Octo about the card just recorded, in the recording's own session", async () => {
    skill.reply = { action_id: "x", ok: true, results: [{ success: true, output: "", structured_metadata: { teach_octo_question: { question: "Why those two points?" } } }] };
    const recording = slope();
    expect(await askOcto(recording, compileRecording(recording, { author, language: "en-US" }), "card-1", "en-US")).toBe("Why those two points?");
    expect(skill.calls[0]).toMatchObject({ session: teachAssistSessionId(recording), action: "learning.teach.octo-question",
      args: { card_key: "card-1", lesson: { language: "en-US", topic: "Finding slope", topic_type: "math_off_map", goals: ["Find slope from two points"] } } });
  });

  it("returns the review, and surfaces a failed request instead of an empty review", async () => {
    const review = { cards: [{ key: "card-1", status: "good", kind: "none", message: "Clear." }, { key: "card-2", status: "check", kind: "slip", message: "The line goes up 2 for every 1: say 2, not one half." }], overall: "Fix card 2." };
    skill.reply = { action_id: "x", ok: true, results: [{ success: true, output: "", structured_metadata: { teach_review: review } }] };
    const recording = slope();
    expect(await reviewLesson(recording, compileRecording(recording, { author, language: "en-US" }), "en-US")).toEqual(review);
    skill.reply = { action_id: "x", ok: false, results: [{ success: false, output: "Model unavailable" }] };
    await expect(reviewLesson(recording, null, "en-US")).rejects.toThrow("Model unavailable");
  });
});
