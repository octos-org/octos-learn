import { describe, expect, it } from "vitest";
import type { AuthoringLesson } from "octos-lesson-language";
import {
  assertOllMaterializationParity,
  materializeOllLesson,
  type OllLessonMaterializationOptions,
} from "./oll-materialization";

const authoring: AuthoringLesson = {
  dsl: "octos.lesson",
  version: "0.1",
  profile: "authoring",
  lesson: {
    mode: "explain",
    language: "zh-CN",
    title: "物化一致性测试",
    goals: ["保持实时与预制课程一致"],
  },
  steps: [{
    key: "explain",
    purpose: "展示结论",
    beats: [{
      key: "show",
      say: "观察结论。",
      actions: [{
        do: "write",
        as: "conclusion",
        kind: "note",
        role: "conclusion",
        content: { text: "面积等于长乘宽" },
        place: { relation: "new_region", region_role: "lesson_origin" },
      }],
    }],
  }],
  close: { summary: "完成", focus: ["conclusion"] },
};

const options: OllLessonMaterializationOptions = {
  lessonId: "portable-lesson",
  boardId: "portable-board",
  baseRevision: 0,
  regionIntent: "new_topic",
  regionId: "portable-region",
};

describe("OLL materialization parity", () => {
  it("rebuilds an exported lesson byte-for-byte through the live pipeline", () => {
    const events = materializeOllLesson(authoring, options);

    expect(assertOllMaterializationParity(authoring, events)).toEqual(events);
  });

  it("rejects a pack whose Canonical lesson was changed after materialization", () => {
    const events = materializeOllLesson(authoring, options);
    const changed = structuredClone(events);
    const step = changed.find((event) => event.event === "lesson.step");
    step!.step!.beats[0]!.narration!.text = "被单独修改过的旁白";

    expect(() => assertOllMaterializationParity(authoring, changed)).toThrow(
      "differs from the live materialization pipeline",
    );
  });
});
