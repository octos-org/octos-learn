import type { AuthoringAnswerStudentTask, AuthoringRowStudentTask, AuthoringStudentTask } from "octos-lesson-language";
import type { StudentTaskSnapshot } from "octos-lesson-language/web-runtime";
import { describe, expect, it } from "vitest";

import type { OllLessonOutlineTopic } from "./use-oll-lesson-runtime";
import { answerWaitsOnCardTask, lastAnswerMistake, visibleAnswerTasks } from "./visible-answer-tasks";

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

describe("a row of blanks (decision 0023 amendment 1)", () => {
  const row: AuthoringRowStudentTask = {
    as: "parts", anchor: "lesson:node:mat", prompt: "Write the number by places.",
    availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "row_entry" }],
    completion: { kind: "numeric_row", parts: [{ text: "37 =" }, { blank: { as: "tens", answer: "30", label: "the tens" } }, { text: "+" }, { blank: { as: "ones", answer: "7", label: "the ones" } }] },
    hints: ["What are 3 tens worth?"],
  };
  const rows = new Map<string, AuthoringAnswerStudentTask | AuthoringRowStudentTask>([[row.as, row]]);
  const rowTask = (patch: Partial<StudentTaskSnapshot> = {}): StudentTaskSnapshot => ({
    task_id: "parts", status: "not_started", hints_revealed: 0, attempts: [], available: true, prompt: row.prompt, hints: row.hints, ...patch,
  });

  it("opens under the card it asks about, like a typed answer", () => {
    const cards = visibleAnswerTasks([rowTask()], rows, [topic("trade", 4, ["lesson:node:mat"])], 0, true);
    expect(cards.map((card) => [card.task_id, card.topic.id])).toEqual([["parts", "trade"]]);
  });

  it("never names a wrong blank: no written-form mistake for a row", () => {
    const [card] = visibleAnswerTasks([rowTask({
      status: "in_progress",
      attempts: [{ sequence: 1, operation_id: "o1", actual: 1, target: 2, succeeded: false, answers: { tens: "3", ones: "7" } }],
    })], rows, [topic("trade", 4, ["lesson:node:mat"])], 0, true);
    expect(lastAnswerMistake(card!)).toBeUndefined();
  });
});

describe("answerWaitsOnCardTask (OLL decision 0026)", () => {
  const node = "trade-add:node:sum";
  const practice = {
    as: "practice-1", prompt: "Add on the chart, column by column.", availability: { kind: "after_lesson" },
    allowed_operations: [{ kind: "card_tap", node }], completion: { kind: "card_fact", node, fact: "complete" },
    hints: ["Start with any column."],
  } as unknown as AuthoringStudentTask;
  const total: AuthoringAnswerStudentTask = {
    as: "answer-1", anchor: node, prompt: "What is the total?", availability: { kind: "after_lesson" },
    allowed_operations: [{ kind: "answer_entry" }], completion: { kind: "numeric_answer", answer: "6231" },
    hints: ["Read the answer row, one digit per column."],
  };
  const definitionsInOrder: AuthoringStudentTask[] = [practice, total];
  const snapshot = (task: AuthoringStudentTask, patch: Partial<StudentTaskSnapshot> = {}): StudentTaskSnapshot => ({
    task_id: task.as, status: "not_started", hints_revealed: 0, attempts: [], available: false,
    prompt: task.prompt, hints: task.hints, ...patch,
  });
  const open = (cardPatch: Partial<StudentTaskSnapshot> = {}) => [
    snapshot(practice, { available: true, auto_submit: true, ...cardPatch }),
    snapshot(total),
  ];

  it("waits while the card task before it is open with no done, on the card it is anchored to", () => {
    expect(answerWaitsOnCardTask("answer-1", open(), definitionsInOrder)).toBe(true);
    expect(answerWaitsOnCardTask("answer-1", open({ status: "in_progress" }), definitionsInOrder)).toBe(true);
  });

  it("opens once the completing tap has finished the card task", () => {
    expect(answerWaitsOnCardTask("answer-1", open({ status: "succeeded" }), definitionsInOrder)).toBe(false);
  });

  it("does not wait before the card task opens (the lesson is still playing)", () => {
    expect(answerWaitsOnCardTask("answer-1", open({ available: false }), definitionsInOrder)).toBe(false);
  });

  it("does not wait on a card task that has a done (the trading mat, the place-value chart)", () => {
    const withDone = { ...open()[0]! };
    delete withDone.auto_submit;
    expect(answerWaitsOnCardTask("answer-1", [withDone, snapshot(total)], definitionsInOrder)).toBe(false);
  });

  it("only for answers after the card task, anchored to that card, with nothing else between", () => {
    const elsewhere = { ...total, anchor: "trade-add:node:other" };
    expect(answerWaitsOnCardTask("answer-1", open(), [practice, elsewhere])).toBe(false);
    // An answer on another card between them: this one waits on that answer's card, not on this one.
    const between = { ...total, as: "between", anchor: "trade-add:node:other" };
    expect(answerWaitsOnCardTask("answer-1", [...open(), snapshot(between)], [practice, between, total])).toBe(false);
    // A task of another kind between them (a slider task).
    const slider = {
      as: "slider", prompt: "Move a.", availability: { kind: "after_lesson" },
      allowed_operations: [{ kind: "variable_change", variable: "a", controls: ["slider"] }],
      completion: { kind: "expression_target", expression: "a", value: 1, tolerance: 0 }, hints: [],
    } as unknown as AuthoringStudentTask;
    expect(answerWaitsOnCardTask("answer-1", [...open(), snapshot(slider)], [practice, slider, total])).toBe(false);
    // A card task on another card before them.
    const otherCard = { ...practice, completion: { ...(practice.completion as object), node: "trade-add:node:other" } } as AuthoringStudentTask;
    expect(answerWaitsOnCardTask("answer-1", open(), [otherCard, total])).toBe(false);
    expect(answerWaitsOnCardTask("practice-1", open(), definitionsInOrder)).toBe(false);
    expect(answerWaitsOnCardTask("missing", open(), definitionsInOrder)).toBe(false);
  });

  describe("a row of blanks and several answers on the same card", () => {
    const digits: AuthoringRowStudentTask = {
      as: "row-1", anchor: node, prompt: "Read the answer row.", availability: { kind: "after_lesson" },
      allowed_operations: [{ kind: "row_entry" }],
      completion: { kind: "numeric_row", parts: [{ blank: { as: "thousands", answer: "6" } }, { text: "thousands" }] },
      hints: [],
    };
    const again: AuthoringAnswerStudentTask = { ...total, as: "answer-2", prompt: "What is the total, again?" };
    const order: AuthoringStudentTask[] = [practice, digits, total, again];
    const snapshots = (cardPatch: Partial<StudentTaskSnapshot>, patches: Record<string, Partial<StudentTaskSnapshot>> = {}) => [
      snapshot(practice, { available: true, auto_submit: true, ...cardPatch }),
      ...[digits, total, again].map((task) => snapshot(task, patches[task.as])),
    ];

    it("all wait from the start while the card task is open", () => {
      for (const id of ["row-1", "answer-1", "answer-2"]) {
        expect(answerWaitsOnCardTask(id, snapshots({}), order)).toBe(true);
        expect(answerWaitsOnCardTask(id, snapshots({ status: "in_progress" }), order)).toBe(true);
      }
    });

    it("the first opens on the completing tap; the next stay greyed where they go until their turn", () => {
      const tapped = snapshots({ status: "succeeded", available: true }, { "row-1": { available: true } });
      expect(answerWaitsOnCardTask("row-1", tapped, order)).toBe(false);
      expect(answerWaitsOnCardTask("answer-1", tapped, order)).toBe(true);
      expect(answerWaitsOnCardTask("answer-2", tapped, order)).toBe(true);
      const rowDone = snapshots({ status: "succeeded", available: true }, {
        "row-1": { available: true, status: "succeeded" }, "answer-1": { available: true },
      });
      expect(answerWaitsOnCardTask("answer-1", rowDone, order)).toBe(false);
      expect(answerWaitsOnCardTask("answer-2", rowDone, order)).toBe(true);
    });

    it("none waits before the card task opens or on a card task with a done", () => {
      for (const id of ["row-1", "answer-1", "answer-2"]) {
        expect(answerWaitsOnCardTask(id, snapshots({ available: false }), order)).toBe(false);
        expect(answerWaitsOnCardTask(id, snapshots({ auto_submit: undefined }), order)).toBe(false);
      }
    });

    it("an answer on another card breaks the chain for the ones after it", () => {
      const other = { ...total, as: "other", anchor: "trade-add:node:other" };
      const withOther = [practice, digits, other, again];
      const tasks = [snapshot(practice, { available: true, auto_submit: true }), snapshot(digits), snapshot(other), snapshot(again)];
      expect(answerWaitsOnCardTask("row-1", tasks, withOther)).toBe(true);
      expect(answerWaitsOnCardTask("other", tasks, withOther)).toBe(false);
      expect(answerWaitsOnCardTask("answer-2", tasks, withOther)).toBe(false);
    });
  });
});
