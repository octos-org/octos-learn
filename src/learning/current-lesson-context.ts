import type { ReflectionSnapshot, StudentTaskSnapshot } from "octos-lesson-language/web-runtime";

import type { OllLessonOutlineTopic } from "./oll/use-oll-lesson-runtime";

const MAX_TOPICS = 3;
const MAX_CHARS = 1800;
const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

export interface CurrentLessonSources {
  outline: readonly OllLessonOutlineTopic[];
  reflections: readonly ReflectionSnapshot[];
  studentTasks: readonly StudentTaskSnapshot[];
}

/** What this board has just taught, as the learner saw it: the latest lessons
 * (newest first) with their sections, thinking questions and practice. Sent as
 * `current_lesson` and to the admission gate so that "the reflection question"
 * or "that problem" can be resolved; long-term memory never holds lesson
 * content. */
export function buildCurrentLessonContext({ outline, reflections, studentTasks }: CurrentLessonSources): string | undefined {
  if (!outline.length) return undefined;
  const topics = outline.slice(-MAX_TOPICS).reverse();
  const blocks = topics.map((topic, index) => {
    const lines = [`${index === 0 ? "最近一节课" : "更早的课"}：${clip(topic.title, 80)}`];
    const steps = topic.steps.map((step) => clip(step.title, 40)).filter(Boolean);
    if (steps.length) lines.push(`讲过：${steps.join("；")}`);
    const own = reflections.filter((reflection) => topic.nodeIds?.includes(reflection.anchor)
      || (outline.length === 1));
    own.forEach((reflection, n) => lines.push(`课后思考题${own.length > 1 ? ` ${n + 1}` : ""}：${clip(reflection.prompt, 240)}（参考答案：${clip(reflection.answer, 240)}）`));
    return lines.join("\n");
  });
  const tasks = studentTasks.filter((task) => task.available && task.prompt.trim());
  if (tasks.length) {
    blocks.push(`白板上的练习：${tasks.map((task) => `${clip(task.prompt, 120)}（${task.status === "succeeded" ? "已做对" : "未完成"}）`).join("；")}`);
  }
  const text = `本白板刚讲过的内容（学生看得到）：\n${blocks.join("\n\n")}`;
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…（已截断）` : text;
}
