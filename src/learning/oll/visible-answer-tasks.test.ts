import type { AuthoringAnswerStudentTask } from "octos-lesson-language";
import type { StudentTaskSnapshot } from "octos-lesson-language/web-runtime";
import { describe, expect, it } from "vitest";

import type { OllLessonOutlineTopic } from "./use-oll-lesson-runtime";
import { lastAnswerMistake, visibleAnswerTasks } from "./visible-answer-tasks";

const definition: AuthoringAnswerStudentTask = {
  as: "simplify",
  anchor: "lesson:node:fraction-card",
  prompt: "把 6/8 化成最简分数",
  availability: { kind: "after_lesson" },
  allowed_operations: [{ kind: "answer_entry" }],
  completion: { kind: "numeric_answer", answer: "3/4", form: "simplest_fraction" },
  hints: ["分子分母同时除以 2。"],
};
const definitions = new Map([[definition.as, definition]]);

function topic(id: string, endCursor: number, nodeIds: string[]): OllLessonOutlineTopic {
  return { id, title: id, nodeIds, steps: [{ end_cursor: endCursor }] } as unknown as OllLessonOutlineTopic;
}

function task(patch: Partial<StudentTaskSnapshot> = {}): StudentTaskSnapshot {
  return {
    task_id: "simplify", status: "not_started", hints_revealed: 0, attempts: [],
    available: false, prompt: definition.prompt, hints: definition.hints, ...patch,
  };
}

describe("visibleAnswerTasks", () => {
  const outline = [topic("first", 10, ["lesson:node:fraction-card"]), topic("second", 20, ["other"])];

  it("shows a task by the topic that wrote its card once that topic has played", () => {
    expect(visibleAnswerTasks([task()], definitions, outline, 5, false)).toEqual([]);
    const [card] = visibleAnswerTasks([task()], definitions, outline, 10, false);
    expect(card?.topic.id).toBe("first");
    expect(card?.available).toBe(false);
    expect(visibleAnswerTasks([task({ available: true })], definitions, outline, 0, false)).toHaveLength(1);
  });

  it("waits for delivery to settle when the card belongs to the newest topic", () => {
    const newest = [topic("only", 10, ["lesson:node:fraction-card"])];
    expect(visibleAnswerTasks([task()], definitions, [...newest], 10, false)).toEqual([]);
    expect(visibleAnswerTasks([task()], definitions, newest, 10, true)).toHaveLength(1);
  });

  it("ignores tasks that are not typed answers", () => {
    expect(visibleAnswerTasks([task({ task_id: "drag" })], definitions, outline, 20, true)).toEqual([]);
  });
});

describe("lastAnswerMistake", () => {
  const card = (answer: string, succeeded: boolean) => ({
    ...task({ status: succeeded ? "succeeded" : "in_progress", available: true,
      attempts: [{ sequence: 1, operation_id: "a", actual: 0, target: .75, succeeded, answer }] }),
    definition, topic: topic("first", 10, []),
  });

  it("tells a wrong value from a right value in the wrong form", () => {
    expect(lastAnswerMistake(card("0.7", false))).toBe("value");
    expect(lastAnswerMistake(card("6/8", false))).toBe("form");
    expect(lastAnswerMistake(card("3/4", true))).toBeUndefined();
  });
});
