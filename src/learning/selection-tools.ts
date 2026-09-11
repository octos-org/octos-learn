import type { SelectionContentKind } from "./selection-enhancements";
import type { BoardTargetKind } from "octos-lesson-language/web-runtime";

export type SelectionToolId =
  | "explain"
  | "check-and-suggest"
  | "generate-plot"
  | "custom-question";

export type SelectionAnswerPresentation = "card" | "board-writing" | "lesson";

const BOARD_FORM_REQUEST = /(改|更改|修改|整理|转换|转成|变成|写成).{0,24}(形式|表达式|方程|可绘|可以绘)/iu;
const BOARD_EDIT_REQUEST = /(检查|建议|批改|纠错|纠正|改写|修改|更改|整理|转换|转写|誊写|抄写|板书|写在.{0,8}(白板|旁边)|check|correct|rewrite|transcribe)/iu;
const VISUAL_REQUEST = /(画|绘制|生成|展示|显示).{0,12}(图|图像|曲线|曲面)|(plot|graph|visuali[sz]e)/iu;
const SELECTION_LESSON_REQUEST = /(?:(?:讲|上|来|开始|安排|准备|生成|创建|设计).{0,8}(?:一|这|本|个)?(?:节|堂|门)?课程?|(?:做|变|整理|扩展)成.{0,8}(?:一|这|本|个)?(?:节|堂|门)?课程?|(?:系统|完整|从头|一步一步)(?:地)?(?:讲解|讲|教)|(?:teach|create|make).{0,16}(?:lesson|course))/iu;

function normalizeSelectionLessonRequest(request: string): string {
  return request
    .normalize("NFKC")
    .toLowerCase()
    .replace(/課程/gu, "课程")
    .replace(/課/gu, "课")
    .replace(/[\s，。！？、；：,.!?;:"'“”‘’（）()【】\[\]…—–-]+/gu, "");
}

/**
 * Speech starts before ASR has produced text, so selection voice capture can
 * only freeze the pixels at that point. Classify the requested outcome after
 * transcription, when phrases such as “结合这个公式给我上一课” are known.
 */
export function isSelectionLessonRequest(request: string): boolean {
  return SELECTION_LESSON_REQUEST.test(normalizeSelectionLessonRequest(request));
}

/**
 * Decide the answer surface before generation starts. The same value is sent
 * to the skill as a contract, so the pending UI cannot predict one surface
 * and receive another one after the model finishes.
 */
export function selectionAnswerPresentation(
  toolId: SelectionToolId,
  learnerRequest: string,
  boardWritingAvailable: boolean,
): SelectionAnswerPresentation {
  if (toolId === "explain") return "lesson";
  if (!boardWritingAvailable) return "card";
  if (toolId === "check-and-suggest") return "board-writing";
  if (toolId === "generate-plot") return "card";

  const request = learnerRequest.trim();
  if (BOARD_FORM_REQUEST.test(request)) return "board-writing";
  if (VISUAL_REQUEST.test(request)) return "card";
  return BOARD_EDIT_REQUEST.test(request) ? "board-writing" : "card";
}

export interface SelectionToolDefinition {
  id: SelectionToolId;
  label: string;
  prompt: string;
  contentKinds: SelectionContentKind[];
  requestContentKind?: SelectionContentKind;
  targetKinds?: BoardTargetKind[];
  output: "annotation" | "plot" | "lesson";
  requiresModel: boolean;
  requiresVerifiedComputation: boolean;
  addsBoardContent: boolean;
  changesSource: false;
  action: "local-enhancement" | "lesson";
}

/**
 * The model does not invent selection tools. The UI exposes this finite list,
 * and the learning-coach validates the selected id before producing an
 * enhancement artifact.
 */
export const selectionToolRegistry: SelectionToolDefinition[] = [
  {
    id: "explain",
    label: "解释这部分",
    prompt: "请结合这部分内容给我上一节课。请先判断它是公式、题目、解题过程还是其他学习内容，再围绕其含义、关键知识和解题或应用方法进行讲解，目标是让我理解并会用。",
    contentKinds: ["text", "math", "geometry", "data", "unknown"],
    output: "lesson",
    requiresModel: true,
    requiresVerifiedComputation: false,
    addsBoardContent: true,
    changesSource: false,
    action: "lesson",
  },
  {
    id: "check-and-suggest",
    label: "检查并建议",
    prompt: "请检查我选中的内容，并在旁边给出建议。",
    contentKinds: ["text", "math", "geometry", "data", "unknown"],
    output: "annotation",
    requiresModel: true,
    requiresVerifiedComputation: false,
    addsBoardContent: true,
    changesSource: false,
    action: "local-enhancement",
  },
  {
    id: "generate-plot",
    label: "生成函数图像",
    prompt: "请按我选中的公式生成函数图像。",
    contentKinds: ["math"],
    requestContentKind: "math",
    targetKinds: ["math-fragment"],
    output: "plot",
    requiresModel: true,
    requiresVerifiedComputation: true,
    addsBoardContent: true,
    changesSource: false,
    action: "local-enhancement",
  },
];

export function availableSelectionTools(
  contentKind: SelectionContentKind,
  targetKinds: BoardTargetKind[] = [],
): SelectionToolDefinition[] {
  return selectionToolRegistry.filter(
    (tool): tool is SelectionToolDefinition =>
      tool.contentKinds.includes(contentKind)
      || tool.targetKinds?.some((kind) => targetKinds.includes(kind)) === true,
  );
}

export function isSelectionToolId(value: string): value is SelectionToolId {
  return value === "explain"
    || value === "check-and-suggest"
    || value === "generate-plot"
    || value === "custom-question";
}
