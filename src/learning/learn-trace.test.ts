import { describe, expect, it, vi } from "vitest";
import {
  LEARN_TRACE_SCHEMA,
  LearnTraceRecorder,
  parseLearningCoachTraceMessage,
} from "./learn-trace";

describe("LearnTraceRecorder", () => {
  it("keeps a bounded, session-owned timeline", () => {
    const now = vi.fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(1_200);
    const recorder = new LearnTraceRecorder("learn-session", {
      maxEvents: 2,
      now,
    });

    recorder.record({ turnId: "turn-1", source: "octos-web", stage: "submitted" });
    recorder.record({ turnId: "turn-1", source: "octos-web", stage: "admitted" });
    recorder.record({ turnId: "turn-1", source: "octos-web", stage: "visible" });

    expect(recorder.getEvents()).toEqual([
      expect.objectContaining({ sequence: 2, stage: "admitted" }),
      expect.objectContaining({
        schema: LEARN_TRACE_SCHEMA,
        sequence: 3,
        trace_id: "turn-1",
        session_id: "learn-session",
        stage: "visible",
        recorded_at_epoch_ms: 1_200,
      }),
    ]);
  });

  it("records one-shot milestones only once", () => {
    const recorder = new LearnTraceRecorder("learn-session");
    const input = {
      turnId: "turn-1",
      source: "octos-web" as const,
      stage: "lesson-first-render",
    };

    expect(recorder.recordOnce("turn-1:first-render", input)).not.toBeNull();
    expect(recorder.recordOnce("turn-1:first-render", input)).toBeNull();
    expect(recorder.getEvents()).toHaveLength(1);
  });

  it("ingests structured learning-coach progress without learner content", () => {
    const recorder = new LearnTraceRecorder("learn-session", { now: () => 9_999 });
    const event = recorder.ingestLearningCoachMessage(
      'learning-coach: {"schema":"octos.learn.trace.v1","trace_id":"turn-9","turn_id":"turn-9","source":"learning-coach","stage":"model-route","status":"completed","recorded_at_epoch_ms":9000,"winner_provider":"gemini","hedge_started":true,"elapsed_ms":1200}',
    );

    expect(event).toEqual(expect.objectContaining({
      trace_id: "turn-9",
      source: "learning-coach",
      stage: "model-route",
      status: "completed",
      recorded_at_epoch_ms: 9_000,
      elapsed_ms: 1_200,
      data: {
        winner_provider: "gemini",
        hedge_started: true,
      },
    }));
  });

  it("ignores ordinary stderr and malformed trace messages", () => {
    expect(parseLearningCoachTraceMessage("lesson generation completed")).toBeNull();
    expect(parseLearningCoachTraceMessage("learning-coach: not-json")).toBeNull();
    expect(parseLearningCoachTraceMessage(
      'learning-coach: {"stage":"model-call"}',
    )).toBeNull();
    expect(parseLearningCoachTraceMessage(
      'learning-coach: {"schema":"legacy","source":"learning-coach","trace_id":"turn-1","stage":"model-call"}',
    )).toBeNull();
  });
});
