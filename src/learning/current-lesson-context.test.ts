import { expect, it } from "vitest";

import { buildCurrentLessonContext } from "./current-lesson-context";

const topic = (id: string, title: string, nodeIds: string[], steps: string[], start: number, taskAliases: string[] = []) => ({
  id, title, nodeIds, taskAliases,
  steps: steps.map((stepTitle, index) => ({ id: `${id}-${index}`, title: stepTitle, event_index: index, start_cursor: start + index, end_cursor: start + index + 1, focus_targets: [], beats: [] })),
});
const task = (task_id: string, prompt: string, succeeded = false) => ({ task_id, status: succeeded ? "succeeded" as const : "in_progress" as const, hints_revealed: 0, attempts: [], available: true, prompt, hints: [] });
const outline = [topic("a", "三位数除以两位数", ["n1"], ["试商"], 0, ["ta"]), topic("b", "用整百数估算商", ["n2"], ["把除数看作整百数", "估算再调整"], 1, ["tb"])];

it("describes the latest lessons on the board, newest first, with the thinking questions shown and each lesson's own practice", () => {
  const text = buildCurrentLessonContext({
    outline,
    reflections: [
      { id: "r1", prompt: "如果除数是23，不方便看作整百数，怎样估算商？", answer: "把23看作20来估", anchor: "n2", available: true },
      { id: "r0", prompt: "试商时商太大怎么办？", answer: "调小一", anchor: "n1", available: false },
    ],
    studentTasks: [task("tb", "估算 612 ÷ 98", true), task("ta", "计算 756 ÷ 27")],
    cursor: 2,
  })!;
  expect(text.indexOf("最近一节课：用整百数估算商")).toBeLessThan(text.indexOf("更早的课：三位数除以两位数"));
  expect(text).toContain("讲过：把除数看作整百数；估算再调整");
  expect(text).toContain("课后思考题：如果除数是23，不方便看作整百数，怎样估算商？（参考答案：把23看作20来估）");
  const [latest, earlier] = text.split("更早的课");
  expect(latest).toContain("练习：估算 612 ÷ 98（已做对）");
  expect(earlier).toContain("练习：计算 756 ÷ 27（未完成）");
  // The earlier lesson has played to its end, so its question is open too.
  expect(earlier).toContain("试商时商太大怎么办？");
});

it("leaves out a thinking question the learner has not been shown yet", () => {
  const text = buildCurrentLessonContext({
    outline,
    reflections: [{ id: "r1", prompt: "如果除数是23，怎样估算商？", answer: "把23看作20", anchor: "n2", available: false }],
    studentTasks: [],
    cursor: 2,
  })!;
  expect(text).not.toContain("除数是23");
});

it("sends nothing for an empty board, and drops whole older lessons to stay short", () => {
  expect(buildCurrentLessonContext({ outline: [], reflections: [], studentTasks: [], cursor: 0 })).toBeUndefined();
  const long = (id: string) => topic(id, `课${id}`, [id], Array.from({ length: 90 }, (_, i) => `第${i}步的标题`), 0);
  const text = buildCurrentLessonContext({ outline: [long("x"), long("y"), long("z")], reflections: [], studentTasks: [], cursor: 0 })!;
  expect(text.length).toBeLessThanOrEqual(1800);
  expect(text).toContain("最近一节课：课z");
  expect(text).not.toContain("课x");
});
