import type { SelectionContentKind } from "./selection-enhancements";
import type { BoardTargetKind } from "octos-lesson-language/web-runtime";

export type SelectionToolId =
  | "explain"
  | "check-and-suggest"
  | "generate-plot"
  | "custom-question";

export type SelectionAnswerPresentation = "card" | "board-writing";

const BOARD_FORM_REQUEST = /(改|更改|修改|整理|转换|转成|变成|写成).{0,24}(形式|表达式|方程|可绘|可以绘)/iu;
const BOARD_EDIT_REQUEST = /(检查|建议|批改|纠错|纠正|改写|修改|更改|整理|转换|转写|誊写|抄写|板书|写在.{0,8}(白板|旁边)|check|correct|rewrite|transcribe)/iu;
const VISUAL_REQUEST = /(画|绘制|生成|展示|显示).{0,12}(图|图像|曲线|曲面)|(plot|graph|visuali[sz]e)/iu;
const SELECTION_LESSON_REQUEST = /(?:(?:请|麻烦|老师|小章鱼|结合|围绕|根据|用|给我|为我|帮我|来)?[，,。\s]*(?:结合|围绕|根据|用)?[^，,。！？!?]{0,16}(?:上|讲|生成|创建|开始|来)[^，,。！？!?]{0,8}(?:一|这|本|个)?(?:节|堂|门)?(?:课|课程)|(?:做成|变成|生成)[^，,。！？!?]{0,8}(?:课|课程))/iu;

/**
 * Speech starts before ASR has produced text, so selection voice capture can
 * only freeze the pixels at that point. Classify the requested outcome after
 * transcription, when phrases such as “结合这个公式给我上一课” are known.
 */
export function isSelectionLessonRequest(request: string): boolean {
  return SELECTION_LESSON_REQUEST.test(request.trim());
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
  if (!boardWritingAvailable) return "card";
  if (toolId === "check-and-suggest") return "board-writing";
  if (toolId === "explain" || toolId === "generate-plot") return "card";

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
  output: "annotation" | "plot";
  requiresModel: boolean;
  requiresVerifiedComputation: boolean;
  addsBoardContent: boolean;
  changesSource: false;
  action: "local-enhancement";
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
    prompt: "请解释我选中的这部分。",
    contentKinds: ["text", "math", "geometry", "data", "unknown"],
    output: "annotation",
    requiresModel: true,
    requiresVerifiedComputation: false,
    addsBoardContent: true,
    changesSource: false,
    action: "local-enhancement",
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
  return selectionToolRegistry.filter((tool): tool is SelectionToolDefinition =>
    tool.action === "local-enhancement"
      && (tool.contentKinds.includes(contentKind)
        || tool.targetKinds?.some((kind) => targetKinds.includes(kind)) === true),
  );
}

export function isSelectionToolId(value: string): value is SelectionToolId {
  return value === "explain"
    || value === "check-and-suggest"
    || value === "generate-plot"
    || value === "custom-question";
}
