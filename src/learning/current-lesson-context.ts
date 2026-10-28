import type { ReflectionSnapshot, StudentTaskSnapshot } from "octos-lesson-language/web-runtime";

import type { OllLessonOutlineTopic } from "./oll/use-oll-lesson-runtime";
import { visibleReflections } from "./oll/visible-reflections";

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
  cursor: number;
}

/** What this board has just taught, as the learner saw it: the latest lessons
 * (newest first) with their sections, the thinking questions already shown and
 * their practice. Sent as `current_lesson` and to the admission gate so that
 * "the reflection question" or "that problem" can be resolved; long-term memory
 * never holds lesson content. Whole lessons are left out, oldest first, to stay
 * within the limit. */
export function buildCurrentLessonContext({ outline, reflections, studentTasks, cursor }: CurrentLessonSources): string | undefined {
  if (!outline.length) return undefined;
  const shown = visibleReflections(reflections, outline, cursor);
  const header = "本白板刚讲过的内容（学生看得到）：";
  let text = header;
  for (const [index, topic] of outline.slice(-MAX_TOPICS).reverse().entries()) {
    const lines = [`${index === 0 ? "最近一节课" : "更早的课"}：${clip(topic.title, 80)}`];
    const steps = topic.steps.map((step) => clip(step.title, 40)).filter(Boolean);
    if (steps.length) lines.push(`讲过：${steps.join("；")}`);
    const own = shown.filter((reflection) => reflection.topic.id === topic.id);
    own.forEach((reflection, n) => lines.push(`课后思考题${own.length > 1 ? ` ${n + 1}` : ""}：${clip(reflection.prompt, 240)}（参考答案：${clip(reflection.answer, 240)}）`));
    // A board with one lesson owns every task; otherwise a task belongs to the lesson that declared it.
    const tasks = studentTasks.filter((task) => task.available && task.prompt.trim()
      && (outline.length === 1 || topic.taskAliases?.includes(task.task_id)));
    if (tasks.length) lines.push(`练习：${tasks.map((task) => `${clip(task.prompt, 120)}（${task.status === "succeeded" ? "已做对" : "未完成"}）`).join("；")}`);
    const block = `\n${index === 0 ? "" : "\n"}${lines.join("\n")}`;
    if (index > 0 && text.length + block.length > MAX_CHARS) break;
    text += block;
  }
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}
