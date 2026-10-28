import { expect, it } from "vitest";

import { buildCurrentLessonContext } from "./current-lesson-context";

const topic = (id: string, title: string, nodeIds: string[], steps: string[]) => ({
  id, title, nodeIds,
  steps: steps.map((stepTitle, index) => ({ id: `${id}-${index}`, title: stepTitle, event_index: index, start_cursor: index, end_cursor: index + 1, focus_targets: [], beats: [] })),
});

it("describes the latest lessons on the board, newest first, with their thinking questions and practice", () => {
  const text = buildCurrentLessonContext({
    outline: [
      topic("a", "三位数除以两位数", ["n1"], ["试商"]),
      topic("b", "用整百数估算商", ["n2"], ["把除数看作整百数", "估算再调整"]),
    ],
    reflections: [{ id: "r1", prompt: "如果除数是23，不方便看作整百数，怎样估算商？", answer: "把23看作20来估", anchor: "n2", available: true }],
    studentTasks: [{ task_id: "t1", status: "succeeded", hints_revealed: 0, attempts: [], available: true, prompt: "估算 612 ÷ 98", hints: [] }],
  })!;
  expect(text.indexOf("最近一节课：用整百数估算商")).toBeLessThan(text.indexOf("更早的课：三位数除以两位数"));
  expect(text).toContain("讲过：把除数看作整百数；估算再调整");
  expect(text).toContain("课后思考题：如果除数是23，不方便看作整百数，怎样估算商？（参考答案：把23看作20来估）");
  expect(text).toContain("估算 612 ÷ 98（已做对）");
  // The question belongs to the lesson that posed it.
  expect(text.split("更早的课")[1]).not.toContain("课后思考题");
});

it("sends nothing for an empty board and stays short", () => {
  expect(buildCurrentLessonContext({ outline: [], reflections: [], studentTasks: [] })).toBeUndefined();
  const long = buildCurrentLessonContext({ outline: [topic("a", "长课", ["n"], Array.from({ length: 200 }, (_, i) => `第${i}步的标题`))], reflections: [], studentTasks: [] })!;
  expect(long.length).toBeLessThanOrEqual(1810);
});
