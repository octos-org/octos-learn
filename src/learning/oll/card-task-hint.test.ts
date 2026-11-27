import type { StudentTaskSnapshot } from "octos-lesson-language/web-runtime";
import { describe, expect, it } from "vitest";

import { cardTaskHintFromStart } from "./card-task-hint";

const task = (patch: Partial<StudentTaskSnapshot> = {}): StudentTaskSnapshot => ({
  task_id: "practice-1", status: "not_started", hints_revealed: 0, attempts: [], available: true, auto_submit: true,
  prompt: "Add on the chart, column by column.", hints: ["Start with any column.", "Look for a ringed ten."], ...patch,
});

describe("cardTaskHintFromStart (OLL decision 0026)", () => {
  it("offers the hint on an open card task with no done before any attempt", () => {
    expect(cardTaskHintFromStart(task())).toBe(true);
    expect(cardTaskHintFromStart(task({ status: "in_progress" }))).toBe(true);
  });

  it("keeps offering the next hint while hints are left", () => {
    expect(cardTaskHintFromStart(task({ status: "needs_hint", hints_revealed: 1 }))).toBe(true);
    expect(cardTaskHintFromStart(task({ status: "needs_hint", hints_revealed: 2 }))).toBe(false);
  });

  it("offers nothing before the task opens, once it has succeeded, or when it has no hints", () => {
    expect(cardTaskHintFromStart(task({ available: false }))).toBe(false);
    expect(cardTaskHintFromStart(task({ status: "succeeded" }))).toBe(false);
    expect(cardTaskHintFromStart(task({ hints: [] }))).toBe(false);
  });

  it("leaves every other task to its first attempt (a card task with a done, a slider task)", () => {
    const withDone = task();
    delete withDone.auto_submit;
    expect(cardTaskHintFromStart(withDone)).toBe(false);
  });
});
