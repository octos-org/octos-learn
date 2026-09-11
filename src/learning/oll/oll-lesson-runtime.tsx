import {
  BoxSelect,
  CheckCircle2,
  Eraser,
  Hand,
  Lightbulb,
  MessageCircle,
  Mic,
  Palette,
  PenLine,
  RotateCcw,
  Redo2,
  Undo2,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  formatVariableValue,
  mountInfiniteBoard,
  studentInputMethod,
  type BoardTargetCandidate,
  type MountedInfiniteBoard,
  type StudentInputMethod,
  type RegionLayoutConstraint,
  type ViewportInsets,
  variableControlModels,
} from "octos-lesson-language/web-runtime";
import {
  evaluateMathExpression,
  type AuthoringVariableStudentTask,
} from "octos-lesson-language";
import {
  mountInkRuntime,
  type InkSelectionSnapshot,
  type InkMode,
  type InkRuntime,
  type InkRuntimeState,
} from "./oll-ink-runtime";
import { configureAndroidInkDynamicDensity } from "./android-ink-performance";
import { SelectionEnhancementLayer } from "../selection-enhancement-layer";
import {
  WhiteboardQuestionCard,
  WHITEBOARD_QUESTION_CARD_WIDTH,
} from "../whiteboard-question-card";
import {
  isCourseWhiteboardQuestion,
  type WhiteboardQuestionRecord,
} from "../whiteboard-questions";
import type {
  SelectionBoardContext,
  SelectionClassification,
  SelectionContentKind,
  SelectionEnhancementArtifact,
  SelectionEnhancementCardLayout,
} from "../selection-enhancements";
import {
  selectionArtifactTargetsExist,
  selectionContextToPngFile,
  selectionSnapshotToPngFile,
} from "../selection-enhancements";
import {
  availableSelectionTools,
  type SelectionToolId,
} from "../selection-tools";
import type {
  OllLessonRuntimeController,
} from "./use-oll-lesson-runtime";
import { buildInteractionClusters } from "./interaction-clusters";
import {
  WhiteboardLoadingBlock,
  type WhiteboardLoadingState,
} from "../whiteboard-loading-block";
import {
  findNewTopicWhiteboardPosition,
  findOpenWhiteboardPosition,
  type WhiteboardRect,
} from "../whiteboard-placement";
import {
  WhiteboardCameraController,
  type WhiteboardCameraDecision,
} from "../whiteboard-camera-controller";
import {
  COURSE_PENDING_FOOTPRINT_HEIGHT,
  COURSE_PENDING_FOOTPRINT_WIDTH,
  COURSE_REGION_GUTTER,
  COURSE_RUNTIME_OFFSET_X,
  courseRegionOccupiedRect,
  type CourseRegionRecord,
} from "../course-regions";
import "octos-lesson-language/web-runtime/styles.css";

type LearningInkState = InkRuntimeState & {
  pen_color: string;
  selection_color: string | null;
  selection_mode: "rectangle" | "lasso";
  selection_transform_enabled?: boolean;
  content_bounds: InkSelectionSnapshot["bounds"] | null;
  content_bounds_list: InkSelectionSnapshot["bounds"][];
};

type LearningInkRuntime = InkRuntime & {
  setPenColor?: (color: string) => void;
  setPenWidth?: (width: number) => void;
  setSelectionColor?: (color: string) => void | Promise<void>;
  setSelectionMode?: (mode: "rectangle" | "lasso") => void;
  getSelectionSourceBounds?: (
    snapshot: InkSelectionSnapshot,
  ) => InkSelectionSnapshot["bounds"] | null;
  subscribeGeometry?: (listener: () => void) => () => void;
};

interface PreparedSelectionContext {
  snapshot: InkSelectionSnapshot;
  candidates: BoardTargetCandidate[];
  boardId: string;
  boardRevision: number;
  recorded: boolean;
}

export interface VoiceInkSelectionRequest {
  snapshot: InkSelectionSnapshot;
  contentKind: SelectionContentKind;
  boardContext: SelectionBoardContext;
  contextImage: File;
  recordSelection: () => void;
}

export type VoiceInkSelectionCapture = () => Promise<VoiceInkSelectionRequest>;

export interface DegradedVisualRetryRequest {
  boardId: string;
  boardRevision: number;
  nodeId: string;
  visualId: string;
  surface: string;
  purpose: string;
  title: string;
}

export interface LearningCourseRenderEvent {
  turnId: string;
  beatId?: string;
  operationType: string;
  cursor: number;
}

type DegradedVisualStatus = DegradedVisualRetryRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function degradedVisualStatuses(
  board: OllLessonRuntimeController["board"],
): DegradedVisualStatus[] {
  if (!board) return [];
  return Object.values(board.nodes).flatMap((node) => {
    if (node.role !== "system-status" || !isRecord(node.content.degradation)) {
      return [];
    }
    const degradation = node.content.degradation;
    if (degradation.kind !== "visual_component"
      || degradation.retryable !== true
      || typeof degradation.visual_id !== "string"
      || typeof degradation.surface !== "string"
      || typeof degradation.purpose !== "string") {
      return [];
    }
    return [{
      boardId: board.board_id,
      boardRevision: board.revision,
      nodeId: node.id,
      visualId: degradation.visual_id,
      surface: degradation.surface,
      purpose: degradation.purpose,
      title: typeof node.content.title === "string"
        ? node.content.title
        : "互动画面暂时不可用",
    }];
  }).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function visibleBoardTargetCandidates(
  candidates: BoardTargetCandidate[],
): BoardTargetCandidate[] {
  const seen = new Set<string>();
  const result: BoardTargetCandidate[] = [];
  const nodeIds = [...new Set(candidates.map((candidate) => candidate.node_id))];
  for (const nodeId of nodeIds) {
    const group = candidates.filter((candidate) => candidate.node_id === nodeId);
    const parent = group.find((candidate) => !candidate.element_id);
    for (const candidate of [...(parent ? [parent] : []), ...group.filter((item) => item.element_id)]) {
      if (seen.has(candidate.target_id)) continue;
      seen.add(candidate.target_id);
      result.push(candidate);
      if (result.length === 6) return result;
    }
  }
  return result;
}

const boardTargetKindLabels: Record<string, string> = {
  node: "整个内容块",
  plot: "整个函数图",
  geometry: "整个几何图",
  scene3d: "整个三维画面",
  "plot-point": "图上的点",
  "plot-curve": "函数曲线",
  "math-fragment": "公式片段",
  "geometry-point": "几何点",
  "geometry-line": "几何线",
  "scene3d-object": "三维对象",
};

const selectionContentKindLabels: Record<SelectionContentKind, string> = {
  text: "文字",
  math: "公式",
  geometry: "图形",
  data: "数据",
  unknown: "暂不确定",
};

const boardOcclusionSelector = "[data-learning-board-occlusion]";
const courseVisualNodeKinds = new Set([
  "diagram",
  "geometry",
  "image",
  "plot",
  "scene3d",
]);
const PENDING_QUESTION_FOOTPRINT_WIDTH = COURSE_PENDING_FOOTPRINT_WIDTH;
const PENDING_QUESTION_FOOTPRINT_HEIGHT = COURSE_PENDING_FOOTPRINT_HEIGHT;
const MINIMUM_COURSE_READING_WIDTH = 1_300;
const QUESTION_CARD_COLLISION_HEIGHT = 320;

function unionWhiteboardRects(rects: WhiteboardRect[]): WhiteboardRect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

function renderedWorldRect(element: HTMLElement): WhiteboardRect | null {
  const x = Number.parseFloat(element.style.left);
  const y = Number.parseFloat(element.style.top);
  const explicitWidth = Number.parseFloat(element.style.width);
  const explicitHeight = Number.parseFloat(element.style.height);
  const fallbackWidth = element.classList.contains("learning-whiteboard-loading-block")
    ? 360
    : element.classList.contains("learning-selection-enhancement-pin")
      ? 26
      : element.classList.contains("learning-selection-enhancement")
        ? 330
        : element.classList.contains("learning-whiteboard-question-card")
          ? WHITEBOARD_QUESTION_CARD_WIDTH
          : element.classList.contains("learning-variable-controls")
            ? 360
            : element.classList.contains("learning-student-tasks")
              ? 330
          : 0;
  const fallbackHeight = element.classList.contains("learning-whiteboard-loading-block")
    ? 194
    : element.classList.contains("learning-selection-enhancement-pin")
      ? 26
      : element.classList.contains("learning-selection-enhancement")
        ? 360
        : element.classList.contains("learning-whiteboard-question-card")
          ? 130
          : element.classList.contains("learning-variable-controls")
            ? 96
            : element.classList.contains("learning-student-tasks")
              ? 240
          : 0;
  const width = Number.isFinite(explicitWidth)
    ? explicitWidth
    : element.offsetWidth || fallbackWidth;
  const height = Number.isFinite(explicitHeight)
    ? explicitHeight
    : element.offsetHeight || fallbackHeight;
  return Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0
    ? { x, y, width, height }
    : null;
}

function measureVisualRegionBounds(
  board: OllLessonRuntimeController["board"],
  nodeLayer: HTMLElement,
): Record<string, WhiteboardRect> {
  if (!board) return {};
  const rectsByRegion = new Map<string, WhiteboardRect[]>();
  for (const element of nodeLayer.querySelectorAll<HTMLElement>(
    ".board-node[data-id]",
  )) {
    const nodeId = element.dataset.id;
    const node = nodeId ? board.nodes[nodeId] : undefined;
    if (!node || !courseVisualNodeKinds.has(String(node.kind ?? "text"))) {
      continue;
    }
    const bounds = renderedWorldRect(element);
    if (!bounds) continue;
    const regionId = typeof node.region_id === "string" && node.region_id
      ? node.region_id
      : "__legacy__";
    const rects = rectsByRegion.get(regionId) ?? [];
    rects.push(bounds);
    rectsByRegion.set(regionId, rects);
  }
  return Object.fromEntries([...rectsByRegion].flatMap(([regionId, rects]) => {
    const bounds = unionWhiteboardRects(rects);
    return bounds ? [[regionId, bounds]] : [];
  }));
}

function measureBoardNodeBounds(nodeLayer: HTMLElement): WhiteboardRect[] {
  return [...nodeLayer.querySelectorAll<HTMLElement>(".board-node[data-id]")]
    .flatMap((element) => {
      const bounds = renderedWorldRect(element);
      return bounds ? [bounds] : [];
    });
}

export function courseHasRenderedBoardNode(
  board: OllLessonRuntimeController["board"],
  explicitNodeIds: readonly string[] | undefined,
  regionId: string,
  renderedNodeIds: ReadonlySet<string>,
): boolean {
  if (!board) return false;
  const ownedNodeIds = explicitNodeIds && explicitNodeIds.length > 0
    ? explicitNodeIds.filter((nodeId) => Boolean(board.nodes[nodeId]))
    : Object.values(board.nodes)
        .filter((node) => (node.region_id ?? "__legacy__") === regionId)
        .map((node) => node.id);
  return ownedNodeIds.some((nodeId) => renderedNodeIds.has(nodeId));
}

const emptyInkState: LearningInkState = {
  mode: "navigate",
  component_count: 0,
  selected_count: 0,
  pen_color: "#176b62",
  selection_color: null,
  selection_input: "unknown",
  selection_mode: "rectangle",
  selection_transform_enabled: false,
  selection_revision: 0,
  content_bounds: null,
  content_bounds_list: [],
  document_version: 0,
  saved: true,
};

function normalizeInkState(state: InkRuntimeState): LearningInkState {
  const enhanced = state as Partial<LearningInkState>;
  return {
    ...state,
    pen_color: enhanced.pen_color ?? "#176b62",
    selection_color: enhanced.selection_color ?? null,
    selection_mode: enhanced.selection_mode ?? "rectangle",
    selection_transform_enabled: enhanced.selection_transform_enabled ?? false,
    selection_revision: enhanced.selection_revision ?? 0,
    content_bounds: enhanced.content_bounds ?? null,
    content_bounds_list: enhanced.content_bounds_list ?? (
      enhanced.content_bounds ? [enhanced.content_bounds] : []
    ),
  };
}

const inkColorPresets = [
  { color: "#176b62", label: "深青" },
  { color: "#1769aa", label: "蓝色" },
  { color: "#7a5aa3", label: "紫色" },
  { color: "#c75445", label: "红色" },
  { color: "#202b2a", label: "黑色" },
];

const INK_PEN_WIDTH_KEY = "octos-learning-pen-width:v1";
const inkWidthPresets = [
  { width: 1.25, label: "极细" },
  { width: 2, label: "细" },
  { width: 3.25, label: "标准" },
  { width: 5, label: "粗" },
];

function initialInkPenWidth(): number {
  const stored = Number(localStorage.getItem(INK_PEN_WIDTH_KEY));
  if (Number.isFinite(stored) && stored >= 1 && stored <= 16) return stored;
  return import.meta.env.MODE === "android" ? 2 : 3.25;
}

function InkColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="learning-ink-colors" aria-label={label}>
      {inkColorPresets.map((preset) => (
        <button
          key={preset.color}
          type="button"
          className="learning-ink-color-swatch"
          style={{ "--ink-swatch": preset.color } as CSSProperties}
          onClick={() => onChange(preset.color)}
          aria-label={`${label}：${preset.label}`}
          aria-pressed={value.toLowerCase() === preset.color}
        />
      ))}
    </div>
  );
}

function learningBoardInsets(viewport: HTMLElement): ViewportInsets & {
  occlusions: Array<{ x: number; y: number; width: number; height: number }>;
} {
  const compact = viewport.clientWidth <= 900;
  const viewportRect = viewport.getBoundingClientRect();
  const occlusions = [
    ...viewport.ownerDocument.querySelectorAll<HTMLElement>(boardOcclusionSelector),
  ].flatMap((element) => {
    if (element.hidden) return [];
    const rect = element.getBoundingClientRect();
    const left = Math.max(viewportRect.left, rect.left);
    const top = Math.max(viewportRect.top, rect.top);
    const right = Math.min(viewportRect.right, rect.right);
    const bottom = Math.min(viewportRect.bottom, rect.bottom);
    return right > left && bottom > top
      ? [{ x: left - viewportRect.left, y: top - viewportRect.top, width: right - left, height: bottom - top }]
      : [];
  });
  return {
    top: compact ? 78 : 92,
    right: compact ? 18 : 28,
    bottom: compact ? 180 : 190,
    left: compact ? 18 : 28,
    occlusions,
  };
}

function ensureScene3dInteractionHints(viewport: HTMLElement): void {
  const scenes = viewport.querySelectorAll<HTMLElement>(".scene3d-runtime");
  scenes.forEach((scene, index) => {
    if (scene.querySelector(".learning-scene3d-interaction-hint")) return;
    const hint = viewport.ownerDocument.createElement("div");
    hint.className = "learning-scene3d-interaction-hint";
    hint.id = `learning-scene3d-interaction-hint-${index}`;
    hint.textContent = "拖动画面旋转 · 滚动缩放";
    const image = scene.querySelector<SVGElement>("svg[role='img']");
    image?.setAttribute("aria-describedby", hint.id);
    scene.append(hint);
  });
}

const TASK_SNAP_RADIUS_PX = 12;
const MAX_TASK_SNAP_RANGE_RATIO = 0.04;
const MAX_TASK_SNAP_SAMPLES = 20_000;

function snapValueToActiveTask(
  runtime: OllLessonRuntimeController | null,
  alias: string,
  value: number,
  snapDistance: number,
  control: "slider" | "geometry_point",
): number {
  if (!runtime?.board || !Number.isFinite(snapDistance) || snapDistance <= 0) {
    return value;
  }
  const task = runtime.studentTasks
    .filter((progress) => progress.available && progress.status !== "succeeded")
    .map((progress) => runtime.studentTaskDefinitions.find((definition) =>
      definition.as === progress.task_id))
    .filter((definition): definition is AuthoringVariableStudentTask =>
      definition?.completion.kind === "expression_target")
    .find((definition) =>
      definition.allowed_operations.some((operation) =>
        operation.variable === alias && operation.controls.includes(control)));
  if (!task) return value;
  const allowed = task.allowed_operations.find((operation) =>
    operation.variable === alias && operation.controls.includes(control));
  const variable = runtime.board.variables?.[alias];
  if (!allowed || !variable) return value;
  const range = variable.max - variable.min;
  const step = variable.control?.step ?? range / 100;
  if (!Number.isFinite(step) || step <= 0 || range <= 0) return value;
  const values = Object.fromEntries(Object.entries(runtime.board.variables ?? {})
    .map(([variableAlias, model]) => [variableAlias, model.value]));
  const succeeds = (candidate: number): boolean => {
    try {
      const actual = evaluateMathExpression(task.completion.expression, {
        ...values,
        [alias]: candidate,
      });
      return Number.isFinite(actual)
        && Math.abs(actual - task.completion.value) <= task.completion.tolerance;
    } catch {
      return false;
    }
  };
  if (succeeds(value)) return value;

  const firstStep = Math.max(
    0,
    Math.floor((value - snapDistance - variable.min) / step),
  );
  const lastStep = Math.min(
    Math.floor(range / step + 1e-12),
    Math.ceil((value + snapDistance - variable.min) / step),
  );
  if (lastStep < firstStep) return value;
  const candidateSteps: number[] = [];
  const stepCount = lastStep - firstStep + 1;
  if (stepCount <= MAX_TASK_SNAP_SAMPLES) {
    for (let index = firstStep; index <= lastStep; index += 1) {
      candidateSteps.push(index);
    }
  } else {
    for (let sample = 0; sample < MAX_TASK_SNAP_SAMPLES; sample += 1) {
      candidateSteps.push(Math.round(
        firstStep + (lastStep - firstStep) * sample
          / (MAX_TASK_SNAP_SAMPLES - 1),
      ));
    }
    candidateSteps.push(Math.round((value - variable.min) / step));
  }
  let snapped = value;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const index of new Set(candidateSteps)) {
    const candidate = Number((variable.min + index * step).toPrecision(15));
    const distance = Math.abs(candidate - value);
    if (
      candidate < variable.min
      || candidate > variable.max
      || distance > snapDistance
      || distance >= nearestDistance
      || !succeeds(candidate)
    ) continue;
    snapped = candidate;
    nearestDistance = distance;
  }
  return snapped;
}

function sliderTaskSnapDistance(
  runtime: OllLessonRuntimeController | null,
  alias: string,
  trackWidth: number,
): number {
  const variable = runtime?.board?.variables?.[alias];
  if (!variable || !Number.isFinite(trackWidth) || trackWidth <= 0) return 0;
  const range = variable.max - variable.min;
  return Math.min(
    range * TASK_SNAP_RADIUS_PX / trackWidth,
    range * MAX_TASK_SNAP_RANGE_RATIO,
  );
}

function geometryTaskSnapDistance(
  viewport: HTMLElement,
  runtime: OllLessonRuntimeController | null,
  alias: string,
): number {
  const variable = runtime?.board?.variables?.[alias];
  if (!variable) return 0;
  const control = [...viewport.querySelectorAll<SVGCircleElement>(
    "circle[data-oll-variable-control]",
  )].find((candidate) => candidate.dataset.ollVariableControl === alias);
  const svg = control?.closest<SVGSVGElement>("svg");
  const viewBox = svg?.viewBox?.baseVal;
  const rect = svg?.getBoundingClientRect();
  const centerX = Number(control?.dataset.angleCenterX);
  const centerY = Number(control?.dataset.angleCenterY);
  const pointX = Number(control?.getAttribute("cx"));
  const pointY = Number(control?.getAttribute("cy"));
  if (
    !control
    || !viewBox
    || !rect
    || viewBox.width <= 0
    || viewBox.height <= 0
    || rect.width <= 0
    || rect.height <= 0
    || ![centerX, centerY, pointX, pointY].every(Number.isFinite)
  ) return 0;
  const radiusPx = Math.hypot(
    (pointX - centerX) * rect.width / viewBox.width,
    (pointY - centerY) * rect.height / viewBox.height,
  );
  if (!Number.isFinite(radiusPx) || radiusPx <= 0) return 0;
  const normalizedUnit = variable.unit?.trim().toLowerCase() ?? "";
  const usesDegrees = !/弧度|radian|rad/u.test(normalizedUnit)
    && /角度|度|°|degree|deg/u.test(normalizedUnit);
  const turn = usesDegrees ? 360 : Math.PI * 2;
  return Math.min(
    TASK_SNAP_RADIUS_PX * turn / (Math.PI * 2 * radiusPx),
    (variable.max - variable.min) * MAX_TASK_SNAP_RANGE_RATIO,
  );
}

export function LearningWhiteboard({
  runtime,
  inkSessionId,
  inkMergeSourceSessionId,
  onInkMergeComplete,
  loadingState,
  questions = [],
  courseRegions = [],
  playbackCourseTarget,
  onPlaceQuestion,
  onUpdateCourseRegion,
  onInkActivity,
  onCourseRendered,
  selectionEnhancements = [],
  selectionSources = [],
  selectionCardLayouts = {},
  onClassifyInkSelection,
  onAskInkSelection,
  onVoiceInkSelection,
  onVoiceInkSelectionCaptureChange,
  onBoardWritingReady,
  onDeleteSelectionEnhancement,
  onDeleteSelectionSources,
  onSelectionCardLayoutChange,
  onRetryDegradedVisual,
}: {
  runtime?: OllLessonRuntimeController | null;
  inkSessionId?: string;
  inkMergeSourceSessionId?: string;
  onInkMergeComplete?: (
    sourceSessionId: string,
    targetSessionId: string,
  ) => void;
  loadingState?: WhiteboardLoadingState | null;
  questions?: WhiteboardQuestionRecord[];
  courseRegions?: CourseRegionRecord[];
  playbackCourseTarget?: {
    courseId: string;
    sequence: number;
  } | null;
  onPlaceQuestion?: (
    questionId: string,
    position: { x: number; y: number },
  ) => void;
  onUpdateCourseRegion?: (
    courseRegionId: string,
    patch: Partial<Pick<
      CourseRegionRecord,
      "runtimeRegionId" | "bounds" | "reservedWidth"
    >>,
  ) => void;
  onInkActivity?: () => void;
  onCourseRendered?: (event: LearningCourseRenderEvent) => void;
  selectionEnhancements?: SelectionEnhancementArtifact[];
  onBoardWritingReady?: (ready: boolean) => void;
  selectionSources?: InkSelectionSnapshot[];
  selectionCardLayouts?: Readonly<Record<string, SelectionEnhancementCardLayout>>;
  onClassifyInkSelection?: (request: {
    snapshot: InkSelectionSnapshot;
    boardContext: SelectionBoardContext;
    selectionImage: File;
  }) => Promise<SelectionClassification>;
  onAskInkSelection?: (request: {
    snapshot: InkSelectionSnapshot;
    question: string;
    contentKind: SelectionContentKind;
    recognizedContent?: string;
    recognitionConfidence?: "high" | "medium" | "low";
    toolId: SelectionToolId;
    boardContext: SelectionBoardContext;
    contextImage: File;
  }) => Promise<void> | void;
  onVoiceInkSelection?: (request: {
    snapshot: InkSelectionSnapshot;
    contentKind: SelectionContentKind;
    boardContext: SelectionBoardContext;
    contextImage: File;
  }) => Promise<void> | void;
  onVoiceInkSelectionCaptureChange?: (
    capture: VoiceInkSelectionCapture | null,
  ) => void;
  onReferenceInkSelection?: (request: {
    snapshot: InkSelectionSnapshot;
    contentKind: SelectionContentKind;
    boardContext: SelectionBoardContext;
    contextImage: File;
    label: string;
  }) => Promise<void> | void;
  onDeleteSelectionEnhancement?: (turnId: string) => void;
  onDeleteSelectionSources?: (sourceIds: string[]) => void;
  onSelectionCardLayoutChange?: (
    turnId: string,
    layout: SelectionEnhancementCardLayout,
  ) => void;
  onRetryDegradedVisual?: (
    request: DegradedVisualRetryRequest,
  ) => Promise<void> | void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<OllLessonRuntimeController | null>(runtime ?? null);
  const mountedRef = useRef<MountedInfiniteBoard | null>(null);
  const cameraControllerRef = useRef<WhiteboardCameraController | null>(null);
  const focusedLoadingTurnRef = useRef<string | null>(null);
  const availableTaskKeysRef = useRef(new Set<string>());
  const availableTaskKeysSeededRef = useRef(false);
  const coursesObservedInProgressRef = useRef(new Set<string>());
  const restoredCourseFocusRef = useRef<string | null>(null);
  const measuredCourseBoundsKeyRef = useRef("");
  const renderedAttentionRef = useRef("");
  const renderedFocusRef = useRef<string[]>([]);
  const renderedCompositionRef = useRef("");
  const renderedCompositionCursorRef = useRef(-1);
  const inkRuntimeRef = useRef<LearningInkRuntime | null>(null);
  const inkMergeAttemptRef = useRef<string | null>(null);
  const inkReplayObservedSourceRef = useRef<string | null>(null);
  const inkActivityReportedRef = useRef(false);
  const onInkActivityRef = useRef(onInkActivity);
  const onUpdateCourseRegionRef = useRef(onUpdateCourseRegion);
  const inkSelectionVersionRef = useRef({
    documentVersion: 0,
    selectedCount: 0,
    selectionRevision: 0,
  });
  const missingInkSelectionSourcesRef = useRef(new Set<string>());
  const selectionSourceCheckVersionRef = useRef<number | null>(null);
  const selectionClassificationRequestRef = useRef(0);
  const unsubscribeInkRef = useRef<(() => void) | null>(null);
  const sliderOperationsRef = useRef(new Map<string, {
    input: StudentInputMethod;
    value: number;
    operationId?: string;
  }>());
  const pendingSliderUpdatesRef = useRef(new Map<string, number>());
  const sliderUpdateFrameRef = useRef<number | null>(null);
  const pendingBoardVariableUpdatesRef = useRef(new Map<string, {
    value: number;
    event: Parameters<
      OllLessonRuntimeController["handleStudentVariableInput"]
    >[2];
  }>());
  const boardVariableUpdateFrameRef = useRef<number | null>(null);
  const [inkState, setInkState] = useState<LearningInkState>(emptyInkState);
  const [inkPenWidth, setInkPenWidthState] = useState(initialInkPenWidth);
  const inkPenWidthRef = useRef(inkPenWidth);
  const [inkWidthMenuOpen, setInkWidthMenuOpen] = useState(false);
  const [inkAvailable, setInkAvailable] = useState(false);
  const [inkError, setInkError] = useState("");
  const [writingRetry, setWritingRetry] = useState(0);
  const [writingError, setWritingError] = useState("");
  const writingInFlightRef = useRef(new Set<string>());
  const writingQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    const ink = inkRuntimeRef.current as (InkRuntime & {
      writeAiPaths?: (id: string, paths: string[]) => Promise<boolean>;
    }) | null;
    if (import.meta.env.VITE_ENABLE_BOARD_WRITING !== "true") {
      onBoardWritingReady?.(false);
      return;
    }
    if (!inkAvailable) return;
    if (!ink?.writeAiPaths) {
      onBoardWritingReady?.(false);
      return;
    }
    // Advertise the negotiated ink API immediately. The artifact writer
    // already waits for the worker-owned font preparation below, so model
    // routing never needs to degrade to a card while the font is warming.
    onBoardWritingReady?.(true);
    void import("../board-writing").then(({ prepareBoardWritingFont }) =>
      prepareBoardWritingFont()).catch(() => {
      if (active) {
        onBoardWritingReady?.(false);
        setWritingError("手写字体加载失败，请重试。");
      }
    });
    return () => { active = false; onBoardWritingReady?.(false); };
  }, [inkAvailable, onBoardWritingReady, writingRetry]);
  useEffect(() => {
    const ink = inkRuntimeRef.current as (InkRuntime & {
      writeAiPaths?: (id: string, paths: string[]) => Promise<boolean>;
      getSelectionSourceBounds?: (
        snapshot: InkSelectionSnapshot,
      ) => InkSelectionSnapshot["bounds"] | null;
    }) | null;
    if (!inkAvailable || inkMergeSourceSessionId) return;
    if (!ink?.writeAiPaths) {
      if (selectionEnhancements.some((artifact) => artifact.response.kind === "board_writing")) {
        const timer = window.setTimeout(() => {
          setWritingError("当前笔迹组件不支持恢复这份板书，请更新客户端。");
        }, 0);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    for (const artifact of selectionEnhancements) {
      if (artifact.response.kind !== "board_writing") continue;
      const id = `${inkSessionId}:${artifact.turn_id}`;
      if (writingInFlightRef.current.has(id)) continue;
      writingInFlightRef.current.add(id);
      const lines = artifact.response.lines;
      const sourceSnapshot = selectionSources.find(
        (source) => source.source_id === artifact.source.source_id,
      );
      writingQueueRef.current = writingQueueRef.current.then(async () => {
        const { layoutBoardWriting, prepareBoardWritingFont } = await import("../board-writing");
        await prepareBoardWritingFont();
        if (inkRuntimeRef.current !== ink) { writingInFlightRef.current.delete(id); return; }
        const occupiedSpace = (): WhiteboardRect[] => {
          const viewport = viewportRef.current;
          const view = mountedRef.current?.view;
          const occupied = [...ink.state.content_bounds_list ?? []];
          if (!viewport || !view) return occupied;
          for (const element of viewport.querySelectorAll<HTMLElement>(".board-node[data-id], [data-question-id], [data-enhancement-id]")) {
            const bounds = renderedWorldRect(element);
            if (bounds) occupied.push(bounds);
          }
          const frame = viewport.getBoundingClientRect();
          for (const element of viewport.parentElement?.querySelectorAll<HTMLElement>("[data-learning-board-occlusion]") ?? []) {
            const box = element.getBoundingClientRect();
            const topLeft = view.viewportToBoard({ x: box.left - frame.left, y: box.top - frame.top });
            const bottomRight = view.viewportToBoard({ x: box.right - frame.left, y: box.bottom - frame.top });
            occupied.push({ x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y });
          }
          return occupied;
        };
        const currentSourceBounds = () => sourceSnapshot
          ? ink.getSelectionSourceBounds?.(sourceSnapshot) ?? artifact.source.bounds
          : artifact.source.bounds;
        for (let attempt = 0; attempt < 4; attempt++) {
          const occupied = occupiedSpace();
          const sourceBounds = currentSourceBounds();
          const { paths } = await layoutBoardWriting(lines, sourceBounds, occupied);
          if (inkRuntimeRef.current !== ink) { writingInFlightRef.current.delete(id); return; }
          // Worker layout yields. Recheck space before committing if the learner
          // drew or moved strokes while outlines were being prepared.
          if (
            JSON.stringify(occupied) !== JSON.stringify(occupiedSpace())
            || JSON.stringify(sourceBounds) !== JSON.stringify(currentSourceBounds())
          ) continue;
          await ink.writeAiPaths!(artifact.turn_id, paths);
          return;
        }
        throw new Error("白板内容正在变化，请稍后重试板书。");
      }).catch((cause: unknown) => {
        writingInFlightRef.current.delete(id);
        if (inkRuntimeRef.current === ink) setWritingError(cause instanceof Error ? cause.message : "板书写入失败");
      });
    }
  }, [inkAvailable, inkMergeSourceSessionId, inkSessionId, selectionEnhancements, selectionSources, writingRetry]);
  const [inkSupportsColors, setInkSupportsColors] = useState(false);
  const [currentSelectionSourceBoundsById, setCurrentSelectionSourceBoundsById] =
    useState<ReadonlyMap<string, InkSelectionSnapshot["bounds"]>>(() => new Map());
  const [inkColorPaletteOpen, setInkColorPaletteOpen] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [enhancementLayer, setEnhancementLayer] =
    useState<HTMLDivElement | null>(null);
  const [visibleBoardBounds, setVisibleBoardBounds] =
    useState<WhiteboardRect | undefined>();
  const [lessonLoadingPosition, setLessonLoadingPosition] = useState({
    left: 120,
    top: 120,
  });
  const [runtimeRegionBounds, setRuntimeRegionBounds] = useState<
    Record<string, WhiteboardRect>
  >({});
  const [runtimeVisualRegionBounds, setRuntimeVisualRegionBounds] = useState<
    Record<string, WhiteboardRect>
  >({});
  const [runtimeNodeBounds, setRuntimeNodeBounds] =
    useState<WhiteboardRect[]>([]);
  const [runtimeAttachmentBounds, setRuntimeAttachmentBounds] = useState<
    Record<string, WhiteboardRect>
  >({});
  const [interactionMeasuredSizes, setInteractionMeasuredSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [selectionQuestionOpen, setSelectionQuestionOpen] = useState(false);
  const [selectionQuestion, setSelectionQuestion] = useState("");
  const [selectionContentKind, setSelectionContentKind] =
    useState<SelectionContentKind>("unknown");
  const [selectionRequestPending, setSelectionRequestPending] = useState(false);
  const [preparedSelection, setPreparedSelection] =
    useState<PreparedSelectionContext | null>(null);
  const [selectedBoardTargetIds, setSelectedBoardTargetIds] =
    useState<string[]>([]);
  const [selectionClassification, setSelectionClassification] =
    useState<SelectionClassification | null>(null);
  const [selectionClassificationStatus, setSelectionClassificationStatus] =
    useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retryingDegradedNodeId, setRetryingDegradedNodeId] =
    useState<string | null>(null);
  const [requestedDegradedNodeIds, setRequestedDegradedNodeIds] =
    useState<Set<string>>(() => new Set());
  const inkColorPaletteAvailable = inkSupportsColors && (
    inkState.mode === "draw"
    || (inkState.mode === "select" && inkState.selected_count > 0)
  );

  useEffect(() => {
    onUpdateCourseRegionRef.current = onUpdateCourseRegion;
  }, [onUpdateCourseRegion]);

  useEffect(() => {
    const ink = inkRuntimeRef.current;
    if (!inkAvailable) return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setCurrentSelectionSourceBoundsById(new Map(selectionSources.flatMap((source) => {
          const bounds = ink?.getSelectionSourceBounds?.(source);
          return bounds ? [[source.source_id, bounds]] : [];
        })));
      });
    };
    update();
    const unsubscribe = ink?.subscribeGeometry?.(update);
    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe?.();
    };
  }, [inkAvailable, inkSessionId, selectionSources]);

  const selectionPlacementRequestKey = [
    ...questions.map((question) => `${question.id}:${question.status}`),
    ...selectionEnhancements.map((artifact) =>
      `${artifact.turn_id}:${artifact.response.kind}`),
  ].join("|");
  useEffect(() => {
    if (!enhancementLayer) return;
    const viewport = viewportRef.current;
    const view = mountedRef.current?.view;
    if (!viewport || !view) return;
    const topLeft = view.viewportToBoard({ x: 0, y: 0 });
    const bottomRight = view.viewportToBoard({
      x: viewport.clientWidth,
      y: viewport.clientHeight,
    });
    const next = {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
    if (!Object.values(next).every(Number.isFinite)) return;
    setVisibleBoardBounds((current) =>
      current
      && current.x === next.x
      && current.y === next.y
      && current.width === next.width
      && current.height === next.height
        ? current
        : next);
    // Existing cards must not move just because the learner pans or zooms.
    // Capture the viewport only when a card is added or changes phase.
  }, [enhancementLayer, selectionPlacementRequestKey]);

  useEffect(() => {
    if (!playbackCourseTarget) return;
    coursesObservedInProgressRef.current.add(playbackCourseTarget.courseId);
    cameraControllerRef.current?.markCourseActive(
      playbackCourseTarget.courseId,
      true,
    );
    mountedRef.current?.view.releaseHostCamera();
  }, [playbackCourseTarget]);
  const variableControls = runtime ? variableControlModels(runtime.board) : [];
  const studentTasks = runtime?.studentTasks ?? [];
  const availableStudentTasks = runtime
    ? studentTasks.filter((task) => task.available)
    : [];
  const degradedVisuals = runtime ? degradedVisualStatuses(runtime.board) : [];
  const quickSelectionTools = selectionClassificationStatus === "ready"
    && selectionClassification
    && selectionClassification.confidence !== "low"
    && selectionClassification.kind !== "unknown"
    ? availableSelectionTools(selectionClassification.kind)
    : [];
  const loadingStateId = loadingState?.id;
  const courseQuestions = questions.filter(isCourseWhiteboardQuestion);
  const pendingCourseQuestion = [...courseQuestions].reverse().find(
    (question) => question.status === "pending",
  );
  const courseRegionByQuestion = useMemo(() => new Map(
    courseRegions.map((region) => [region.questionId, region]),
  ), [courseRegions]);
  const runtimeRegionIdForTopic = useCallback((topicId: string) => {
    const nodeRegionIds = new Set(Object.values(runtime?.board?.nodes ?? {})
      .flatMap((node) => node.region_id ? [node.region_id] : []));
    if (nodeRegionIds.has(topicId)) return topicId;
    if (
      (runtime?.outline.length ?? 0) === 1
      && Object.keys(runtime?.board?.nodes ?? {}).length > 0
      && nodeRegionIds.size === 0
    ) return "__legacy__";
    return topicId;
  }, [runtime?.board?.nodes, runtime?.outline]);
  const presentationTopics = (() => {
    const topics = runtime?.outline ?? [];
    if (!runtime || topics.length === 0) return [];
    const explicitVariableAliases = new Set(
      topics.flatMap((topic) => topic.variableAliases ?? []),
    );
    const explicitTaskAliases = new Set(
      topics.flatMap((topic) => topic.taskAliases ?? []),
    );
    const unassignedVariableAliases = variableControls
      .map((control) => control.alias)
      .filter((alias) => !explicitVariableAliases.has(alias));
    const unassignedTaskAliases = studentTasks
      .map((task) => task.task_id)
      .filter((alias) => !explicitTaskAliases.has(alias));
    return topics.map((topic, index) => ({
      ...topic,
      // Sessions created before per-course ownership was persisted have one
      // ungrouped topic. Keep their controls and tasks visible without using
      // a display label to guess ownership. New sessions always carry the
      // explicit aliases assembled from their canonical lesson artifact.
      variableAliases: topic.variableAliases
        ?? (topics.length === 1 || index === topics.length - 1
          ? unassignedVariableAliases
          : []),
      taskAliases: topic.taskAliases
        ?? (topics.length === 1 || index === topics.length - 1
          ? unassignedTaskAliases
          : []),
    }));
  })();

  const interactionPlans = presentationTopics.flatMap((topic) => {
    const topicControls = variableControls.filter((control) =>
      topic.variableAliases?.includes(control.alias));
    const reservedTopicTasks = studentTasks.filter((task) =>
      topic.taskAliases?.includes(task.task_id));
    const topicTasks = availableStudentTasks.filter((task) =>
      topic.taskAliases?.includes(task.task_id));
    const clusters = buildInteractionClusters(
      runtime?.board ?? null,
      {
        ...topic,
        id: runtimeRegionIdForTopic(topic.id),
      },
      topicControls.map((control) => control.alias),
      reservedTopicTasks.map((task) => task.task_id),
    );
    return clusters.map((cluster) => {
      const controls = topicControls.filter((control) =>
        cluster.variableAliases.includes(control.alias));
      const tasks = topicTasks.filter((task) =>
        cluster.taskIds.includes(task.task_id));
      const controlsWidth = controls.length > 0 ? 360 : 0;
      const tasksWidth = cluster.taskIds.length > 0 ? 330 : 0;
      const controlsHeight = controls.length > 0
        ? Math.max(112, 58 + controls.length * 52)
        : 0;
      const tasksHeight = cluster.taskIds.length > 0
        ? 60 + cluster.taskIds.length * 220
        : 0;
      const estimatedWidth = Math.max(controlsWidth, tasksWidth);
      const estimatedHeight = controlsHeight + tasksHeight
        + (controlsHeight > 0 && tasksHeight > 0 ? 28 : 0);
      const measured = interactionMeasuredSizes[cluster.id];
      return {
        id: cluster.id,
        topic,
        anchorNodeId: cluster.anchorNodeId,
        anchorNodeIds: cluster.nodeIds,
        controls,
        tasks,
        controlsHeight,
        width: measured?.width ?? estimatedWidth,
        height: measured?.height ?? estimatedHeight,
      };
    });
  });

  const regionLayoutConstraints = useMemo(() => Object.fromEntries(
    (runtime?.outline ?? []).flatMap((topic) => {
      const region = topic.questionId
        ? courseRegionByQuestion.get(topic.questionId)
        : undefined;
      if (!region) return [];
      const attachments = interactionPlans
        .filter((plan) =>
          plan.topic.id === topic.id && Boolean(plan.anchorNodeId))
        .map((plan) => ({
          id: plan.id,
          anchorNodeId: plan.anchorNodeId,
          anchorNodeIds: plan.anchorNodeIds,
          width: plan.width,
          height: plan.height,
          gap: 42,
        }));
      const obstacles = questions.flatMap((question) => {
        const rects: WhiteboardRect[] = [];
        if (question.position) {
          rects.push({
            x: question.position.x,
            y: question.position.y,
            width: WHITEBOARD_QUESTION_CARD_WIDTH,
            height: QUESTION_CARD_COLLISION_HEIGHT,
          });
        }
        if (question.source) rects.push(question.source.bounds);
        return rects;
      });
      return [[runtimeRegionIdForTopic(topic.id), {
        x: region.origin.x + COURSE_RUNTIME_OFFSET_X,
        y: region.origin.y,
        flow: "reading",
        reservedWidth: Math.max(
          MINIMUM_COURSE_READING_WIDTH,
          region.reservedWidth - COURSE_RUNTIME_OFFSET_X,
        ),
        ...(obstacles.length > 0 ? { obstacles } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      } satisfies RegionLayoutConstraint]];
    }),
  ), [
    courseRegionByQuestion,
    interactionPlans,
    questions,
    runtime?.outline,
    runtimeRegionIdForTopic,
  ]);

  const coursePresentations = interactionPlans.flatMap((plan) => {
    const { topic } = plan;
    const region = topic.questionId
      ? courseRegionByQuestion.get(topic.questionId)
      : undefined;
    const boardBounds = runtimeRegionBounds[runtimeRegionIdForTopic(topic.id)]
      ?? (presentationTopics.length === 1
        ? runtimeRegionBounds.__legacy__
        : undefined);
    if (
      !region
      && !boardBounds
      && (courseRegions.length > 0 || presentationTopics.length > 1)
    ) return [];
    const { controls, tasks } = plan;
    const base = boardBounds ?? {
      x: (region?.origin.x ?? 100) + COURSE_RUNTIME_OFFSET_X,
      y: region?.origin.y ?? 90,
      width: 760,
      height: 300,
    };
    const attachmentBounds = runtimeAttachmentBounds[plan.id];
    const visualBounds = runtimeVisualRegionBounds[
      runtimeRegionIdForTopic(topic.id)
    ] ?? (presentationTopics.length === 1
      ? runtimeVisualRegionBounds.__legacy__
      : undefined);
    const fallback = visualBounds
      ? {
          x: visualBounds.x,
          y: visualBounds.y + visualBounds.height + 42,
        }
      : {
          x: base.x,
          y: base.y + base.height + 42,
        };
    const interactionPosition = attachmentBounds ?? {
      ...fallback,
      width: plan.width,
      height: plan.height,
    };
    return [{
      id: plan.id,
      topic,
      controls,
      tasks,
      width: plan.width,
      height: plan.height,
      controlsPosition: {
        x: interactionPosition.x,
        y: interactionPosition.y,
      },
      tasksPosition: {
        x: interactionPosition.x,
        y: interactionPosition.y
          + (controls.length > 0 ? plan.controlsHeight + 28 : 0),
      },
    }];
  });

  useLayoutEffect(() => {
    if (!enhancementLayer || coursePresentations.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const controlsElements = [...enhancementLayer.querySelectorAll<HTMLElement>(
        "[data-interaction-controls-id]",
      )];
      const taskElements = [...enhancementLayer.querySelectorAll<HTMLElement>(
        "[data-interaction-tasks-id]",
      )];
      const next = Object.fromEntries(coursePresentations.flatMap((presentation) => {
        const controlsElement = controlsElements.find((element) =>
          element.dataset.interactionControlsId === presentation.id);
        const tasksElement = taskElements.find((element) =>
          element.dataset.interactionTasksId === presentation.id);
        if (!controlsElement && !tasksElement) return [];
        const controlsWidth = controlsElement
          ? controlsElement.offsetWidth || 360
          : 0;
        const tasksWidth = tasksElement ? tasksElement.offsetWidth || 330 : 0;
        const controlsHeight = controlsElement?.offsetHeight || 0;
        const tasksHeight = tasksElement?.offsetHeight || 0;
        return [[presentation.id, {
          width: Math.max(controlsWidth, tasksWidth, presentation.width),
          height: Math.max(presentation.height, controlsHeight + tasksHeight
            + (controlsHeight > 0 && tasksHeight > 0 ? 28 : 0)),
        }]];
      }));
      setInteractionMeasuredSizes((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [coursePresentations, enhancementLayer]);

  const occupiedRectsForQuestion = useCallback((questionId: string) => {
    const elements: HTMLElement[] = [];
    const mounted = mountedRef.current;
    if (mounted) {
      elements.push(...mounted.elements.nodes.querySelectorAll<HTMLElement>(
        ".board-node",
      ));
    }
    if (enhancementLayer) {
      elements.push(...enhancementLayer.querySelectorAll<HTMLElement>([
        "[data-question-id]",
        "[data-loading-id]",
        "[data-course-controls-id]",
        "[data-course-tasks-id]",
        ".learning-selection-enhancement",
        ".learning-selection-enhancement-pin",
      ].join(",")));
    }
    const occupied = elements.flatMap((element) => {
      if (element.dataset.questionId === questionId) return [];
      if (loadingStateId && element.dataset.loadingId === loadingStateId) return [];
      const bounds = renderedWorldRect(element);
      return bounds ? [bounds] : [];
    });
    occupied.push(...courseRegions
      .filter((region) => region.questionId !== questionId)
      .map(courseRegionOccupiedRect));
    occupied.push(...inkState.content_bounds_list);
    return occupied;
  }, [
    courseRegions,
    enhancementLayer,
    inkState.content_bounds_list,
    loadingStateId,
  ]);

  const selectionCardOccupiedRects = useMemo<WhiteboardRect[]>(() => {
    const rects: WhiteboardRect[] = [
      ...inkState.content_bounds_list,
      ...(runtimeNodeBounds.length > 0
        ? runtimeNodeBounds
        : Object.values(runtimeRegionBounds)),
      ...Object.values(runtimeAttachmentBounds),
    ];
    for (const question of questions) {
      if (question.origin !== "composer" || !question.position) continue;
      rects.push({
        x: question.position.x,
        y: question.position.y,
        width: WHITEBOARD_QUESTION_CARD_WIDTH,
        height: 210,
      });
    }
    return rects;
  }, [
    inkState.content_bounds_list,
    questions,
    runtimeAttachmentBounds,
    runtimeNodeBounds,
    runtimeRegionBounds,
  ]);

  useEffect(() => {
    onInkActivityRef.current = onInkActivity;
  }, [onInkActivity]);

  useEffect(() => {
    if (!loadingStateId || !enhancementLayer) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const view = mountedRef.current?.view;
      if (!viewport || !view) return;
      const center = view.viewportToBoard({
        x: viewport.clientWidth / 2,
        y: viewport.clientHeight / 2,
      });
      setLessonLoadingPosition({
        left: center.x - 180,
        top: center.y - 105,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [enhancementLayer, loadingStateId]);

  useEffect(() => {
    if (!enhancementLayer || !onPlaceQuestion) return;
    if (inkSessionId && !inkAvailable) return;
    const unplaced = courseQuestions.filter((question) => !question.position);
    if (unplaced.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const view = mountedRef.current?.view;
      if (!viewport || !view) return;
      const center = view.viewportToBoard({
        x: viewport.clientWidth / 2,
        y: viewport.clientHeight / 2,
      });
      const reserved: WhiteboardRect[] = [];
      unplaced.forEach((question) => {
        const candidateExistingTopic = question.status === "answered"
          ? runtime?.outline.find((topic) => topic.questionId === question.id)
          : undefined;
        const candidateRegionId = candidateExistingTopic
          ? runtimeRegionIdForTopic(candidateExistingTopic.id)
          : undefined;
        const candidateHasBoardContent = Boolean(
          candidateExistingTopic
          && runtime?.board
          && (
            candidateExistingTopic.nodeIds?.some((nodeId) =>
              Boolean(runtime.board?.nodes[nodeId]))
            || Object.values(runtime.board.nodes).some((node) =>
              (node.region_id ?? "__legacy__") === candidateRegionId)
          ),
        );
        const existingTopic = candidateHasBoardContent
          ? candidateExistingTopic
          : undefined;
        const existingRuntimeBounds = existingTopic
          ? runtimeRegionBounds[runtimeRegionIdForTopic(existingTopic.id)]
            ?? (runtime?.outline.length === 1
              ? runtimeRegionBounds.__legacy__
              : undefined)
          : undefined;
        // A restored voice/direct lesson can predate persisted question cards.
        // Wait until its already-rendered course footprint is measurable, then
        // put the recovered question immediately to its left. The resulting
        // logical region keeps the existing lesson in place instead of
        // misclassifying it as a brand-new course after the old board.
        if (existingTopic && !existingRuntimeBounds) return;
        const preferred = {
          x: center.x - 180 - WHITEBOARD_QUESTION_CARD_WIDTH - 24,
          y: center.y - 105,
        };
        // Every composer question starts a complete lesson. Its placement must
        // not depend on whether React has already rendered the asynchronous
        // loading state for that turn.
        const width = PENDING_QUESTION_FOOTPRINT_WIDTH;
        const height = PENDING_QUESTION_FOOTPRINT_HEIGHT;
        const occupied = [...occupiedRectsForQuestion(question.id), ...reserved];
        const startsNewTopic = occupied.length > 0
          || courseRegions.some((region) => region.questionId !== question.id)
          || Boolean(runtime?.board && Object.keys(runtime.board.nodes).length > 0);
        const position = existingRuntimeBounds
          ? {
              x: existingRuntimeBounds.x - COURSE_RUNTIME_OFFSET_X,
              y: existingRuntimeBounds.y,
            }
          : startsNewTopic
            ? findNewTopicWhiteboardPosition({
                width,
                height,
                occupied,
                gutter: COURSE_REGION_GUTTER,
              })
            : findOpenWhiteboardPosition({ preferred, width, height, occupied });
        reserved.push({ ...position, width, height });
        onPlaceQuestion(question.id, position);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    courseQuestions,
    courseRegions,
    enhancementLayer,
    inkAvailable,
    inkSessionId,
    occupiedRectsForQuestion,
    onPlaceQuestion,
    runtime?.board,
    runtime?.outline,
    runtimeRegionBounds,
    runtimeRegionIdForTopic,
  ]);

  useEffect(() => {
    const ink = inkRuntimeRef.current;
    if (
      !ink
      || !inkAvailable
      || typeof ink.hasSelectionSource !== "function"
    ) return;
    // Restoring js-draw from its saved SVG can recreate internal component
    // identities. The initial readiness transition therefore cannot prove
    // that the learner erased a source. Only check after a subsequent ink
    // document change observed during this mounted page.
    const lastCheckedVersion = selectionSourceCheckVersionRef.current;
    if (lastCheckedVersion === null) {
      selectionSourceCheckVersionRef.current = inkState.document_version;
      return;
    }
    if (inkState.document_version <= lastCheckedVersion) return;
    selectionSourceCheckVersionRef.current = inkState.document_version;
    if (selectionSources.length === 0) return;
    const currentSourceIds = new Set(selectionSources.map((source) => source.source_id));
    for (const sourceId of missingInkSelectionSourcesRef.current) {
      if (!currentSourceIds.has(sourceId)) {
        missingInkSelectionSourcesRef.current.delete(sourceId);
      }
    }
    const missing = selectionSources
      .filter((source) => (
        !missingInkSelectionSourcesRef.current.has(source.source_id)
        && ink.hasSelectionSource(source) === false
      ))
      .map((source) => source.source_id);
    if (missing.length === 0) return;
    missing.forEach((sourceId) => missingInkSelectionSourcesRef.current.add(sourceId));
    onDeleteSelectionSources?.(missing);
  }, [
    inkAvailable,
    inkState.document_version,
    onDeleteSelectionSources,
    selectionSources,
  ]);

  useEffect(() => {
    const position = pendingCourseQuestion?.position;
    if (
      !pendingCourseQuestion
      || !position
      || focusedLoadingTurnRef.current === pendingCourseQuestion.id
    ) return;
    const frame = window.requestAnimationFrame(() => {
      const controller = cameraControllerRef.current;
      const layer = enhancementLayer;
      if (!controller || !layer) return;
      const elements = [...layer.querySelectorAll<HTMLElement>(
        "[data-question-id], [data-loading-id]",
      )].filter((element) =>
        element.dataset.questionId === pendingCourseQuestion.id
        || (loadingStateId === pendingCourseQuestion.id
          && element.dataset.loadingId === loadingStateId));
      const currentLoadingIsRendered = loadingStateId === pendingCourseQuestion.id
        && elements.some((element) =>
          element.dataset.loadingId === loadingStateId);
      const actualBounds = unionWhiteboardRects(elements.flatMap((element) => {
        const bounds = renderedWorldRect(element);
        return bounds ? [bounds] : [];
      }));
      controller.request({
        source: "question-loading",
        key: `question-loading:${pendingCourseQuestion.id}`,
        courseId: pendingCourseQuestion.id,
        rect: currentLoadingIsRendered && actualBounds ? actualBounds : {
          x: position.x,
          y: position.y,
          width: PENDING_QUESTION_FOOTPRINT_WIDTH,
          height: PENDING_QUESTION_FOOTPRINT_HEIGHT,
        },
      });
      focusedLoadingTurnRef.current = pendingCourseQuestion.id;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    enhancementLayer,
    loadingStateId,
    pendingCourseQuestion,
    pendingCourseQuestion?.id,
    pendingCourseQuestion?.position,
  ]);

  const retryDegradedVisual = useCallback(async (
    degraded: DegradedVisualStatus,
  ) => {
    if (!onRetryDegradedVisual || retryingDegradedNodeId) return;
    setRetryingDegradedNodeId(degraded.nodeId);
    try {
      await onRetryDegradedVisual({
        boardId: degraded.boardId,
        boardRevision: degraded.boardRevision,
        nodeId: degraded.nodeId,
        visualId: degraded.visualId,
        surface: degraded.surface,
        purpose: degraded.purpose,
        title: degraded.title,
      });
      setRequestedDegradedNodeIds((current) => new Set(current).add(degraded.nodeId));
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "暂时无法重试这个画面");
    } finally {
      setRetryingDegradedNodeId(null);
    }
  }, [onRetryDegradedVisual, retryingDegradedNodeId]);

  const requestTaskHint = useCallback((taskId: string) => {
    try {
      runtimeRef.current?.requestStudentTaskHint(taskId);
      setTaskError("");
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "暂时无法显示提示");
    }
  }, []);

  const retryTask = useCallback((taskId: string) => {
    try {
      runtimeRef.current?.retryStudentTask(taskId);
      setTaskError("");
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "暂时无法重新开始任务");
    }
  }, []);

  const startSliderOperation = useCallback((
    alias: string,
    value: number,
    input: StudentInputMethod,
  ) => {
    if (sliderOperationsRef.current.has(alias)) return;
    const operationId = runtimeRef.current?.handleStudentVariableInput(alias, value, {
      phase: "start",
      control: "slider",
      input,
    });
    sliderOperationsRef.current.set(alias, {
      input,
      value,
      ...(typeof operationId === "string" ? { operationId } : {}),
    });
  }, []);

  const flushSliderUpdates = useCallback(() => {
    sliderUpdateFrameRef.current = null;
    const updates = [...pendingSliderUpdatesRef.current];
    pendingSliderUpdatesRef.current.clear();
    for (const [alias, value] of updates) {
      const active = sliderOperationsRef.current.get(alias);
      if (!active) continue;
      runtimeRef.current?.handleStudentVariableInput(alias, value, {
        phase: "update",
        control: "slider",
        input: active.input,
        ...(active.operationId ? { operation_id: active.operationId } : {}),
      });
    }
  }, []);

  const updateSliderOperation = useCallback((alias: string, value: number) => {
    if (!sliderOperationsRef.current.has(alias)) {
      startSliderOperation(alias, value, "unknown");
    }
    const active = sliderOperationsRef.current.get(alias);
    if (!active) return;
    active.value = value;
    pendingSliderUpdatesRef.current.set(alias, value);
    if (sliderUpdateFrameRef.current === null) {
      sliderUpdateFrameRef.current = window.requestAnimationFrame(
        flushSliderUpdates,
      );
    }
  }, [flushSliderUpdates, startSliderOperation]);

  const commitSliderOperation = useCallback((
    alias: string,
    value: number,
    trackWidth = 0,
  ) => {
    const active = sliderOperationsRef.current.get(alias);
    if (!active) return;
    const pendingValue = pendingSliderUpdatesRef.current.get(alias)
      ?? active.value
      ?? value;
    const committedValue = active.input === "keyboard"
      ? pendingValue
      : snapValueToActiveTask(
          runtimeRef.current,
          alias,
          pendingValue,
          sliderTaskSnapDistance(runtimeRef.current, alias, trackWidth),
          "slider",
        );
    active.value = committedValue;
    pendingSliderUpdatesRef.current.delete(alias);
    if (
      pendingSliderUpdatesRef.current.size === 0
      && sliderUpdateFrameRef.current !== null
    ) {
      window.cancelAnimationFrame(sliderUpdateFrameRef.current);
      sliderUpdateFrameRef.current = null;
    }
    sliderOperationsRef.current.delete(alias);
    runtimeRef.current?.handleStudentVariableInput(alias, committedValue, {
      phase: "commit",
      control: "slider",
      input: active.input,
      ...(active.operationId ? { operation_id: active.operationId } : {}),
    });
  }, []);

  const flushBoardVariableUpdates = useCallback(() => {
    boardVariableUpdateFrameRef.current = null;
    const updates = [...pendingBoardVariableUpdatesRef.current];
    pendingBoardVariableUpdatesRef.current.clear();
    for (const [alias, update] of updates) {
      runtimeRef.current?.handleStudentVariableInput(
        alias,
        update.value,
        update.event,
      );
    }
  }, []);

  useEffect(() => {
    runtimeRef.current = runtime ?? null;
  }, [runtime]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.dataset.androidInkMode = inkState.mode;
    return () => {
      delete viewport.dataset.androidInkMode;
    };
  }, [inkState.mode]);

  const setInkMode = useCallback((mode: InkMode) => {
    try {
      inkRuntimeRef.current?.setMode(mode);
      if (mode !== "draw") setInkWidthMenuOpen(false);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法切换书写工具");
    }
  }, [setInkError]);

  const runInkHistory = useCallback((action: "undo" | "redo") => {
    const ink = inkRuntimeRef.current;
    if (!ink) return;
    void Promise.resolve(action === "undo" ? ink.undo() : ink.redo()).catch(
      (cause) => setInkError(cause instanceof Error ? cause.message : "笔迹历史操作失败"),
    );
  }, [setInkError]);

  const selectAllInk = useCallback(() => {
    try {
      const ink = inkRuntimeRef.current;
      if (!ink) return;
      ink.setMode("select");
      ink.selectAll();
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法选择笔迹");
    }
  }, [setInkError]);

  const inkModeRef = useRef(inkState.mode);
  useEffect(() => {
    inkModeRef.current = inkState.mode;
  }, [inkState.mode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.isContentEditable)
      ) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        runInkHistory(event.shiftKey ? "redo" : "undo");
      } else if (key === "y" && !event.metaKey) {
        event.preventDefault();
        runInkHistory("redo");
      } else if (key === "a" && !event.shiftKey && inkModeRef.current === "select") {
        event.preventDefault();
        selectAllInk();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runInkHistory, selectAllInk]);

  const setPenColor = useCallback((color: string) => {
    try {
      const ink = inkRuntimeRef.current;
      if (!ink?.setPenColor) {
        throw new Error("当前 Ink Runtime 不支持笔迹颜色");
      }
      ink.setPenColor(color);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法设置笔迹颜色");
    }
  }, [setInkError]);

  const setPenWidth = useCallback((width: number) => {
    try {
      const ink = inkRuntimeRef.current;
      if (!ink?.setPenWidth) {
        throw new Error("当前 Ink Runtime 不支持笔触粗细");
      }
      ink.setPenWidth(width);
      inkPenWidthRef.current = width;
      setInkPenWidthState(width);
      localStorage.setItem(INK_PEN_WIDTH_KEY, String(width));
      setInkWidthMenuOpen(false);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法设置笔触粗细");
    }
  }, [setInkError]);

  const setSelectionColor = useCallback((color: string) => {
    const ink = inkRuntimeRef.current;
    if (!ink) return;
    if (!ink.setSelectionColor) {
      setInkError("当前 Ink Runtime 不支持选区改色");
      return;
    }
    void Promise.resolve(ink.setSelectionColor(color)).then(
      () => setInkError(""),
      (cause) => setInkError(cause instanceof Error ? cause.message : "无法修改选中笔迹的颜色"),
    );
  }, [setInkError]);

  const setSelectionMode = useCallback((mode: "rectangle" | "lasso") => {
    inkRuntimeRef.current?.setSelectionMode?.(mode);
  }, []);

  const readSelectionContext = useCallback(async (): Promise<PreparedSelectionContext> => {
    const ink = inkRuntimeRef.current;
    if (!ink) throw new Error("笔迹功能尚未就绪");
    if (!inkAvailable) await ink.ready;
    let captured: { candidates: BoardTargetCandidate[]; boardId: string; boardRevision: number } | undefined;
    const captureContext = (selection: Pick<InkSelectionSnapshot, "bounds" | "region">) => {
      const mounted = mountedRef.current;
      captured = {
        candidates: mounted ? structuredClone(visibleBoardTargetCandidates(mounted.view.queryBoardTargets({
          bounds: selection.bounds,
          ...(selection.region?.points ? { path: selection.region.points } : {}),
          limit: 12,
        }))) : [],
        boardId: runtimeRef.current?.board?.board_id ?? `learning-whiteboard:${inkSessionId ?? "unsaved"}`,
        boardRevision: runtimeRef.current?.board?.revision ?? 0,
      };
    };
    const capture = ink.captureSelectionSnapshot.bind(ink) as (
      onCaptured: typeof captureContext,
    ) => Promise<InkSelectionSnapshot>;
    const snapshot = await capture(captureContext);
    if (inkRuntimeRef.current !== ink) throw new Error("本次选区所属白板已关闭。");
    // Compatibility with the previous Runtime, before the synchronous callback.
    if (!captured) captureContext(snapshot);
    return { snapshot, ...captured!, recorded: false };
  }, [inkSessionId, inkAvailable]);

  const recordSelectionContext = useCallback((
    prepared: PreparedSelectionContext,
  ): PreparedSelectionContext => {
    if (prepared.recorded) return prepared;
    const { snapshot } = prepared;
    // AI and mixed selections remain usable for assistance, but their complete
    // SVG must not be submitted as evidence of the student's own work.
    const origins = (snapshot as InkSelectionSnapshot & { component_origins?: string[] }).component_origins;
    if (origins?.some((origin) => origin !== "student")) return { ...prepared, recorded: true };
    runtimeRef.current?.recordStudentInkSelection({
      source_id: snapshot.source_id,
      document_id: snapshot.document_id,
      document_version: snapshot.document_version,
      bounds: snapshot.bounds,
      checksum: snapshot.checksum,
    }, inkState.selection_input);
    return { ...prepared, recorded: true };
  }, [inkState.selection_input]);

  const captureSelection = useCallback(async (): Promise<PreparedSelectionContext> => {
    const prepared = await readSelectionContext();
    return recordSelectionContext(prepared);
  }, [readSelectionContext, recordSelectionContext]);

  const captureActiveVoiceSelection = useCallback(
    async (): Promise<VoiceInkSelectionRequest> => {
      const prepared = await readSelectionContext();
      const mounted = mountedRef.current;
      if (!mounted) throw new Error("白板尚未就绪");
      const contextImage = await selectionContextToPngFile(
        prepared.snapshot,
        mounted,
        prepared.candidates,
      );
      return {
        snapshot: prepared.snapshot,
        // Voice already states the learner's intent. Classification may keep
        // running for toolbar suggestions, but it must not gate this path.
        contentKind: "unknown",
        boardContext: {
          boardId: prepared.boardId,
          boardRevision: prepared.boardRevision,
          targets: prepared.candidates,
        },
        contextImage,
        recordSelection: () => {
          recordSelectionContext(prepared);
        },
      };
    },
    [readSelectionContext, recordSelectionContext],
  );

  useEffect(() => {
    if (!onVoiceInkSelectionCaptureChange) return;
    const active = inkState.mode === "select" && inkState.selected_count > 0;
    onVoiceInkSelectionCaptureChange(
      active ? captureActiveVoiceSelection : null,
    );
  }, [
    captureActiveVoiceSelection,
    inkState.mode,
    inkState.selected_count,
    inkState.selection_revision,
    onVoiceInkSelectionCaptureChange,
  ]);

  useEffect(() => () => {
    onVoiceInkSelectionCaptureChange?.(null);
  }, [onVoiceInkSelectionCaptureChange]);

  useEffect(() => {
    const requestId = ++selectionClassificationRequestRef.current;
    if (
      inkState.mode !== "select"
      || inkState.selected_count === 0
      || !onClassifyInkSelection
    ) {
      const resetTimeout = window.setTimeout(() => {
        if (requestId !== selectionClassificationRequestRef.current) return;
        setSelectionClassification(null);
        setSelectionClassificationStatus("idle");
        if (inkState.mode !== "select" || inkState.selected_count === 0) {
          setPreparedSelection(null);
          setSelectedBoardTargetIds([]);
        }
      }, 0);
      return () => window.clearTimeout(resetTimeout);
    }
    let active = true;
    const loadingTimeout = window.setTimeout(() => {
      if (!active || requestId !== selectionClassificationRequestRef.current) return;
      setSelectionClassification(null);
      setSelectionClassificationStatus("loading");
    }, 0);
    const timeout = window.setTimeout(() => void (async () => {
      try {
        const prepared = await readSelectionContext();
        const selectionImage = await selectionSnapshotToPngFile(prepared.snapshot);
        const classification = await onClassifyInkSelection({
          snapshot: prepared.snapshot,
          boardContext: {
            boardId: prepared.boardId,
            boardRevision: prepared.boardRevision,
            targets: prepared.candidates,
          },
          selectionImage,
        });
        if (!active || requestId !== selectionClassificationRequestRef.current) return;
        setPreparedSelection(prepared);
        setSelectionClassification(classification);
        setSelectionContentKind(
          classification.confidence === "low" ? "unknown" : classification.kind,
        );
        setSelectionClassificationStatus("ready");
      } catch {
        if (!active || requestId !== selectionClassificationRequestRef.current) return;
        setSelectionClassification(null);
        setSelectionContentKind("unknown");
        setSelectionClassificationStatus("error");
      }
    })(), 250);
    return () => {
      active = false;
      window.clearTimeout(loadingTimeout);
      window.clearTimeout(timeout);
    };
  }, [
    inkState.mode,
    inkState.selected_count,
    inkState.selection_revision,
    onClassifyInkSelection,
    readSelectionContext,
  ]);

  const openSelectionQuestion = useCallback(async () => {
    if (selectionQuestionOpen) {
      setSelectionQuestionOpen(false);
      return;
    }
    setSelectionQuestionOpen(true);
    setSelectionRequestPending(true);
    try {
      const candidate = preparedSelection ?? await captureSelection();
      const prepared = recordSelectionContext(candidate);
      setPreparedSelection(prepared);
      setSelectedBoardTargetIds(
        prepared.candidates.length === 1
          ? [prepared.candidates[0]!.target_id]
          : [],
      );
      setInkError("");
    } catch (cause) {
      setSelectionQuestionOpen(false);
      setInkError(cause instanceof Error ? cause.message : "无法读取当前选区");
    } finally {
      setSelectionRequestPending(false);
    }
  }, [setInkError,
    captureSelection,
    preparedSelection,
    recordSelectionContext,
    selectionQuestionOpen,
  ]);

  const askSelection = useCallback(async (
    question: string,
    toolId: SelectionToolId = "custom-question",
    requestContentKind?: SelectionContentKind,
    boardTargetIds?: string[],
  ) => {
    const value = question.trim();
    if (!value || !onAskInkSelection || selectionRequestPending) return;
    setSelectionRequestPending(true);
    try {
      const candidate = preparedSelection ?? await captureSelection();
      const prepared = recordSelectionContext(candidate);
      const requestedBoardTargetIds = boardTargetIds ?? selectedBoardTargetIds;
      const targets = prepared.candidates.filter((candidate) =>
        requestedBoardTargetIds.includes(candidate.target_id),
      );
      const mounted = mountedRef.current;
      if (!mounted) throw new Error("白板尚未就绪");
      const contextImage = await selectionContextToPngFile(
        prepared.snapshot,
        mounted,
        targets,
      );
      await onAskInkSelection({
        snapshot: prepared.snapshot,
        question: value,
        contentKind: requestContentKind ?? selectionContentKind,
        recognizedContent: selectionClassification?.content,
        recognitionConfidence: selectionClassification?.confidence,
        toolId,
        boardContext: {
          boardId: prepared.boardId,
          boardRevision: prepared.boardRevision,
          targets,
        },
        contextImage,
      });
      setSelectionQuestion("");
      setSelectionQuestionOpen(false);
      setPreparedSelection(null);
      setSelectedBoardTargetIds([]);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法发送当前选区");
    } finally {
      setSelectionRequestPending(false);
    }
  }, [setInkError,
    captureSelection,
    onAskInkSelection,
    preparedSelection,
    recordSelectionContext,
    selectedBoardTargetIds,
    selectionContentKind,
    selectionClassification,
    selectionRequestPending,
  ]);

  const askSelectionByVoice = useCallback(async () => {
    if (!onVoiceInkSelection || selectionRequestPending) return;
    setSelectionRequestPending(true);
    try {
      const candidate = preparedSelection ?? await captureSelection();
      const prepared = recordSelectionContext(candidate);
      const targets = prepared.candidates.filter((candidate) =>
        selectedBoardTargetIds.includes(candidate.target_id),
      );
      const mounted = mountedRef.current;
      if (!mounted) throw new Error("白板尚未就绪");
      const contextImage = await selectionContextToPngFile(
        prepared.snapshot,
        mounted,
        targets,
      );
      await onVoiceInkSelection({
        snapshot: prepared.snapshot,
        contentKind: selectionContentKind,
        boardContext: {
          boardId: prepared.boardId,
          boardRevision: prepared.boardRevision,
          targets,
        },
        contextImage,
      });
      setSelectionQuestionOpen(false);
      setPreparedSelection(null);
      setSelectedBoardTargetIds([]);
      setInkError("");
    } catch (cause) {
      setInkError(cause instanceof Error ? cause.message : "无法针对当前选区开始语音提问");
    } finally {
      setSelectionRequestPending(false);
    }
  }, [setInkError,
    captureSelection,
    onVoiceInkSelection,
    preparedSelection,
    recordSelectionContext,
    selectedBoardTargetIds,
    selectionContentKind,
    selectionRequestPending,
  ]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const mounted = mountInfiniteBoard(viewport);
    if (document.documentElement.dataset.runtimePlatform === "android") {
      // Meeting displays are viewed from much farther away than laptops.
      // Large compositions may be cropped, but automatic framing must not
      // reduce teaching cards to an unreadable whole-course thumbnail.
      mounted.view.setAutomaticCameraMinimumScale(.55);
    }
    mountedRef.current = mounted;
    const reportCameraDecision = (decision: WhiteboardCameraDecision) => {
      if (!import.meta.env.DEV || import.meta.env.MODE === "test") return;
      console.debug("[learn-camera]", {
        action: decision.action,
        source: decision.request.source,
        key: decision.request.key,
        courseId: decision.request.courseId,
        rect: decision.request.rect,
        reason: decision.reason,
      });
    };
    const cameraController = new WhiteboardCameraController(
      (request) => {
        const courseFrame = request.source === "course-end"
          || request.source === "course-restore";
        const focusedViewport = mounted.view.focusWorldRect(request.rect, {
          exclusive: true,
          framing: courseFrame ? "course" : "content",
        });
        // A course region's persisted bounds are a placement footprint, not a
        // camera target. Remember the complete world area exposed by the final
        // course frame so the next course starts beyond that view instead of
        // appearing inside it. The completion effect still derives its camera
        // target from course-owned cards, so this footprint cannot zoom a
        // completed course back out later.
        if (courseFrame && focusedViewport) {
          onUpdateCourseRegionRef.current?.(request.courseId, {
            bounds: focusedViewport,
          });
        }
      },
      (callback) => window.requestAnimationFrame(callback),
      (frame) => window.cancelAnimationFrame(frame),
      reportCameraDecision,
    );
    cameraControllerRef.current = cameraController;
    const enhancementHost = viewport.ownerDocument.createElement("div");
    enhancementHost.className = "learning-selection-enhancement-layer";
    enhancementHost.dataset.ollInkInput = "ignore";
    enhancementHost.dataset.ollBoardWheel = "pass";
    const unmountEnhancementLayer =
      mounted.view.mountWorldLayer(enhancementHost);
    setEnhancementLayer(enhancementHost);
    const sliderOperations = sliderOperationsRef.current;
    const pendingSliderUpdates = pendingSliderUpdatesRef.current;
    const pendingBoardVariableUpdates = pendingBoardVariableUpdatesRef.current;
    inkActivityReportedRef.current = false;
    setInkAvailable(false);
    setInkSupportsColors(false);
    setInkState(emptyInkState);
    inkSelectionVersionRef.current = {
      documentVersion: 0,
      selectedCount: 0,
      selectionRevision: 0,
    };
    selectionSourceCheckVersionRef.current = null;
    let active = true;
    let ink: LearningInkRuntime | null = null;
    let inkDestroyed = false;
    let destroyAndroidInkDensity: (() => void) | null = null;
    const destroyInk = (): Promise<void> | undefined => {
      if (!ink || inkDestroyed) return undefined;
      inkDestroyed = true;
      destroyAndroidInkDensity?.();
      destroyAndroidInkDensity = null;
      unsubscribeInkRef.current?.();
      unsubscribeInkRef.current = null;
      if (inkRuntimeRef.current === ink) inkRuntimeRef.current = null;
      return ink.destroy();
    };
    try {
      mounted.view.setViewportInsets(learningBoardInsets(viewport));
      mounted.view.setVariableInputHandler((alias, value, event) => {
        if (event.phase === "start") {
          return runtimeRef.current?.handleStudentVariableInput(alias, value, event);
        }
        if (event.phase === "update") {
          pendingBoardVariableUpdatesRef.current.set(alias, { value, event });
          if (boardVariableUpdateFrameRef.current === null) {
            boardVariableUpdateFrameRef.current = window.requestAnimationFrame(
              flushBoardVariableUpdates,
            );
          }
          return;
        }
        const pending = pendingBoardVariableUpdatesRef.current.get(alias);
        pendingBoardVariableUpdatesRef.current.delete(alias);
        if (
          pendingBoardVariableUpdatesRef.current.size === 0
          && boardVariableUpdateFrameRef.current !== null
        ) {
          window.cancelAnimationFrame(boardVariableUpdateFrameRef.current);
          boardVariableUpdateFrameRef.current = null;
        }
        return runtimeRef.current?.handleStudentVariableInput(
          alias,
          snapValueToActiveTask(
            runtimeRef.current,
            alias,
            pending?.value ?? value,
            geometryTaskSnapDistance(
              viewport,
              runtimeRef.current,
              alias,
            ),
            "geometry_point",
          ),
          event,
        );
      });
      mounted.view.setScene3dInputHandler((nodeId, view, event) => {
        const result = runtimeRef.current?.handleStudentScene3dInput(
          nodeId,
          view,
          event,
        );
        return typeof result === "string" ? result : undefined;
      });
      if (inkSessionId) {
        ink = mountInkRuntime({
          board: mounted.view,
          viewport,
          storageKey: `octos-learning-ink:v1:${inkSessionId}`,
          documentId: `learning-session:${inkSessionId}:student-ink`,
          locale: "zh-CN",
        }) as LearningInkRuntime;
        if (import.meta.env.MODE === "android") {
          destroyAndroidInkDensity = configureAndroidInkDynamicDensity(
            ink,
            viewport,
            mounted.view,
          );
        }
        inkRuntimeRef.current = ink;
        ink.setPenWidth?.(inkPenWidthRef.current);
        ink.setMode("navigate");
        setInkSupportsColors(
          typeof ink.setPenColor === "function" &&
          typeof ink.setSelectionColor === "function",
        );
        unsubscribeInkRef.current = ink.subscribe((state) => {
          if (!active) return;
          const next = normalizeInkState(state);
          const previous = inkSelectionVersionRef.current;
          if (
            previous.documentVersion !== next.document_version
            || previous.selectedCount !== next.selected_count
            || previous.selectionRevision !== next.selection_revision
          ) {
            setSelectionQuestionOpen(false);
            setPreparedSelection(null);
            setSelectedBoardTargetIds([]);
          }
          inkSelectionVersionRef.current = {
            documentVersion: next.document_version,
            selectedCount: next.selected_count,
            selectionRevision: next.selection_revision,
          };
          setInkState(next);
          if (
            next.component_count > 0
            && next.saved
            && !inkActivityReportedRef.current
          ) {
            inkActivityReportedRef.current = true;
            onInkActivityRef.current?.();
          }
        });
        setInkError("");
        void ink.ready.then(
          () => {
            if (!active) return;
            // The subscription can observe both the empty editor and the
            // restored SVG while `ready` is pending. Treat the final restored
            // version as the baseline: hydration is not a learner erase.
            selectionSourceCheckVersionRef.current =
              inkSelectionVersionRef.current.documentVersion;
            setInkAvailable(true);
          },
          (cause) => {
            if (!active) return;
            setInkAvailable(false);
            setInkSupportsColors(false);
            setInkError(cause instanceof Error ? cause.message : "笔迹功能加载失败");
            const destruction = destroyInk();
            if (destruction) void destruction.catch(() => undefined);
          },
        );
      }
    } catch (cause) {
      setInkAvailable(false);
      setInkSupportsColors(false);
      setInkError(cause instanceof Error ? cause.message : "笔迹功能加载失败");
      const destruction = destroyInk();
      if (destruction) void destruction.catch(() => undefined);
    }
    return () => {
      active = false;
      cameraController.destroy();
      if (cameraControllerRef.current === cameraController) {
        cameraControllerRef.current = null;
      }
      setEnhancementLayer(null);
      unmountEnhancementLayer();
      mountedRef.current = null;
      if (sliderUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(sliderUpdateFrameRef.current);
        sliderUpdateFrameRef.current = null;
      }
      pendingSliderUpdates.clear();
      if (boardVariableUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(boardVariableUpdateFrameRef.current);
        boardVariableUpdateFrameRef.current = null;
      }
      pendingBoardVariableUpdates.clear();
      for (const [alias, operation] of sliderOperations) {
        runtimeRef.current?.handleStudentVariableInput(alias, operation.value, {
          phase: "commit",
          control: "slider",
          input: operation.input,
          ...(operation.operationId ? { operation_id: operation.operationId } : {}),
        });
      }
      sliderOperations.clear();
      const destruction = destroyInk();
      mounted.destroy();
      if (destruction) void destruction.catch(() => undefined);
    };
  }, [flushBoardVariableUpdates, inkSessionId]);

  useEffect(() => {
    const mounted = mountedRef.current;
    if (!mounted) return;
    const { view } = mounted;
    view.setRegionLayouts(regionLayoutConstraints);
    const nextRegionBounds = view.getRegionBoundsMap();
    setRuntimeRegionBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextRegionBounds)
        ? current
        : nextRegionBounds);
    const nextAttachmentBounds = view.getAttachmentBoundsMap();
    setRuntimeAttachmentBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextAttachmentBounds)
        ? current
        : nextAttachmentBounds);
    const nextVisualBounds = measureVisualRegionBounds(
      runtimeRef.current?.board ?? null,
      mounted.elements.nodes,
    );
    setRuntimeVisualRegionBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextVisualBounds)
        ? current
        : nextVisualBounds);
    const nextNodeBounds = measureBoardNodeBounds(mounted.elements.nodes);
    setRuntimeNodeBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextNodeBounds)
        ? current
        : nextNodeBounds);
  }, [enhancementLayer, regionLayoutConstraints]);

  useEffect(() => {
    if (!inkMergeSourceSessionId) {
      inkReplayObservedSourceRef.current = null;
      return;
    }
    // A restored lesson is already settled before the learner presses Replay.
    // Do not interpret that initial state as this replay having finished. Only
    // arm restoration after the Runtime has actually entered playback (or an
    // equivalent unsettled transition) for this source document.
    if (runtime?.playing || runtime?.deliverySettled === false) {
      inkReplayObservedSourceRef.current = inkMergeSourceSessionId;
    }
  }, [
    inkMergeSourceSessionId,
    runtime?.deliverySettled,
    runtime?.playing,
  ]);

  useEffect(() => {
    const ink = inkRuntimeRef.current;
    if (
      !ink ||
      !inkAvailable ||
      !inkSessionId ||
      !inkMergeSourceSessionId ||
      inkReplayObservedSourceRef.current !== inkMergeSourceSessionId ||
      !runtime?.deliverySettled ||
      runtime.playing
    ) return;
    const mergeKey = `${inkSessionId}\u0000${inkMergeSourceSessionId}`;
    if (inkMergeAttemptRef.current === mergeKey) return;
    inkMergeAttemptRef.current = mergeKey;
    void ink.mergeSavedDocument(
      `octos-learning-ink:v1:${inkMergeSourceSessionId}`,
      `learning-session:${inkMergeSourceSessionId}:student-ink`,
    ).then(
      () => {
        setInkError("");
        onInkMergeComplete?.(inkMergeSourceSessionId, inkSessionId);
      },
      (cause) => {
        setInkError(cause instanceof Error
          ? cause.message
          : "上一遍笔迹暂时无法恢复");
      },
    );
  }, [
    inkAvailable,
    inkMergeSourceSessionId,
    inkSessionId,
    onInkMergeComplete,
    runtime?.deliverySettled,
    runtime?.playing,
  ]);

  useEffect(() => {
    const activeRuntime = runtimeRef.current;
    if (!activeRuntime) return;
    const mounted = mountedRef.current;
    const view = mounted?.view;
    const attentionTargets = activeRuntime.attentionTargets;
    const attentionKey = attentionTargets.length > 0
      ? `${activeRuntime.currentOperation?.operation_id ?? activeRuntime.cursor}\u0000${attentionTargets.join("\u0000")}`
      : "";
    const attentionChanged = attentionKey !== renderedAttentionRef.current;
    const boardFocus = activeRuntime.board?.focus ?? [];
    const renderedFocus = renderedFocusRef.current;
    const focusChanged =
      boardFocus.length !== renderedFocus.length ||
      boardFocus.some((target, index) => target !== renderedFocus[index]);
    const atPlaybackBoundary =
      activeRuntime.currentOperation?.type === "beat.end" ||
      activeRuntime.currentOperation?.type === "step.commit";
    const actionOperation = activeRuntime.currentOperation?.action?.op;
    const compositionKey = `${activeRuntime.currentBeatId ?? ""}\u0000${activeRuntime.compositionTargets.join("\u0000")}`;
    const compositionChanged = compositionKey !== renderedCompositionRef.current;
    const compositionContentChanged =
      actionOperation === "board.create" ||
      actionOperation === "board.revise" ||
      actionOperation === "board.emphasize" ||
      actionOperation === "board.group" ||
      actionOperation === "board.connect";
    const compositionOperationChanged =
      compositionContentChanged &&
      activeRuntime.cursor !== renderedCompositionCursorRef.current;
    const teachingTopic = activeRuntime.outline.find((candidate) =>
      candidate.steps.some((step) => step.id === activeRuntime.currentStepId));
    const teachingCourseId = teachingTopic
      ? teachingTopic.questionId ?? teachingTopic.id
      : undefined;
    const teachingRegionId = teachingTopic
      ? runtimeRegionIdForTopic(teachingTopic.id)
      : undefined;
    const teachingFocusAllowed = cameraControllerRef.current
      ?.allowsTeachingFocus(teachingCourseId) ?? true;
    view?.setScene3dViews(activeRuntime.scene3dViews);
    view?.setActiveRegion(teachingRegionId);
    view?.render(activeRuntime.board, activeRuntime.currentOperation);
    const renderedCourseNodeIds = new Set(Array.from(
      mounted?.elements.nodes.querySelectorAll<HTMLElement>(
        ".board-node[data-id]",
      ) ?? [],
    ).flatMap((element) => element.dataset.id ? [element.dataset.id] : []));
    if (
      teachingTopic?.questionId
      && courseHasRenderedBoardNode(
        activeRuntime.board,
        teachingTopic.nodeIds,
        teachingRegionId ?? "__legacy__",
        renderedCourseNodeIds,
      )
    ) {
      onCourseRendered?.({
        turnId: teachingTopic.questionId,
        ...(activeRuntime.currentBeatId
          ? { beatId: activeRuntime.currentBeatId }
          : {}),
        operationType: activeRuntime.currentOperation?.type ?? "projection",
        cursor: activeRuntime.cursor,
      });
    }
    const nextRegionBounds = view?.getRegionBoundsMap() ?? {};
    setRuntimeRegionBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextRegionBounds)
        ? current
        : nextRegionBounds);
    const nextAttachmentBounds = view?.getAttachmentBoundsMap() ?? {};
    setRuntimeAttachmentBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextAttachmentBounds)
        ? current
        : nextAttachmentBounds);
    const nextVisualBounds = mounted
      ? measureVisualRegionBounds(activeRuntime.board, mounted.elements.nodes)
      : {};
    setRuntimeVisualRegionBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextVisualBounds)
        ? current
        : nextVisualBounds);
    const nextNodeBounds = mounted
      ? measureBoardNodeBounds(mounted.elements.nodes)
      : [];
    setRuntimeNodeBounds((current) =>
      JSON.stringify(current) === JSON.stringify(nextNodeBounds)
        ? current
        : nextNodeBounds);
    const viewport = viewportRef.current;
    if (viewport) ensureScene3dInteractionHints(viewport);
    if (
      teachingFocusAllowed
      && attentionTargets.length > 0
      && attentionChanged
    ) {
      view?.focusTargets(attentionTargets);
    } else if (
      teachingFocusAllowed &&
      activeRuntime.compositionTargets.length > 0 &&
      (compositionChanged || compositionOperationChanged)
    ) {
      // A Beat's declared focus describes the visual composition needed for
      // its narration. Apply it while the Beat is unfolding so a newly written
      // formula does not replace the diagram it is explaining. This reuses the
      // existing focus action and does not add a playback delay.
      view?.focusTargets(activeRuntime.compositionTargets);
    } else if (teachingFocusAllowed && atPlaybackBoundary && focusChanged) {
      // React can batch every operation produced by advanceBeat() into the
      // boundary render. In that case the board already contains the new Beat
      // focus, but the view never observed the intermediate board.focus frame.
      view?.focusTargets(boardFocus);
    }
    renderedAttentionRef.current = attentionKey;
    renderedFocusRef.current = [...boardFocus];
    renderedCompositionRef.current = compositionKey;
    renderedCompositionCursorRef.current = activeRuntime.cursor;
  }, [
    runtime?.attentionTargets,
    runtime?.board,
    runtime?.compositionTargets,
    runtime?.currentOperation,
    runtime?.currentBeatId,
    runtime?.cursor,
    runtime?.scene3dViews,
    onCourseRendered,
    runtimeRegionIdForTopic,
  ]);

  useEffect(() => {
    if (!enhancementLayer || !onUpdateCourseRegion || courseRegions.length === 0) {
      return;
    }
    const measurementKey = JSON.stringify({
      courses: courseRegions.map((region) => ({
        id: region.id,
        origin: region.origin,
      })),
      topics: runtime?.outline.map((topic) => ({
        id: topic.id,
        questionId: topic.questionId,
      })),
      runtimeRegionBounds,
      presentations: coursePresentations.map((presentation) => ({
        topicId: presentation.topic.id,
        controls: presentation.controls.map((control) => control.alias),
        tasks: presentation.tasks.map((task) => ({
          id: task.task_id,
          status: task.status,
          attempts: task.attempts.length,
          hint: task.current_hint,
        })),
        controlsPosition: presentation.controlsPosition,
        tasksPosition: presentation.tasksPosition,
      })),
    });
    if (measuredCourseBoundsKeyRef.current === measurementKey) return;
    measuredCourseBoundsKeyRef.current = measurementKey;
    const frame = window.requestAnimationFrame(() => {
      const worldElements = [
        ...enhancementLayer.querySelectorAll<HTMLElement>([
          "[data-question-id]",
          "[data-loading-id]",
          "[data-course-controls-id]",
          "[data-course-tasks-id]",
        ].join(",")),
      ];
      for (const region of courseRegions) {
        const topic = runtime?.outline.find((candidate) =>
          candidate.questionId === region.questionId);
        const rects: WhiteboardRect[] = [];
        const runtimeRegionId = topic
          ? runtimeRegionIdForTopic(topic.id)
          : undefined;
        if (runtimeRegionId && runtimeRegionBounds[runtimeRegionId]) {
          rects.push(runtimeRegionBounds[runtimeRegionId]!);
        }
        for (const element of worldElements) {
          const belongs = element.dataset.questionId === region.questionId
            || element.dataset.loadingId === region.questionId
            || element.dataset.courseControlsId === region.id
            || element.dataset.courseTasksId === region.id;
          if (!belongs) continue;
          const bounds = renderedWorldRect(element);
          if (bounds) rects.push(bounds);
        }
        const bounds = unionWhiteboardRects(rects);
        onUpdateCourseRegion(region.id, {
          ...(runtimeRegionId ? { runtimeRegionId } : {}),
          ...(bounds ? { bounds } : {}),
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    courseRegions,
    enhancementLayer,
    onUpdateCourseRegion,
    runtime?.outline,
    runtimeRegionBounds,
    runtimeRegionIdForTopic,
    coursePresentations,
  ]);

  useEffect(() => {
    const pendingCourseId = pendingCourseQuestion?.id
      ?? (loadingState?.kind === "lesson" ? loadingStateId : undefined);
    if (pendingCourseId) {
      coursesObservedInProgressRef.current.add(pendingCourseId);
    }

    const inferredTopic = presentationTopics.find((candidate) =>
      candidate.steps.some((step) => step.id === runtime?.currentStepId))
      ?? presentationTopics.at(-1);
    const requestedTopic = playbackCourseTarget
      ? presentationTopics.find((candidate) =>
          (candidate.questionId ?? candidate.id)
            === playbackCourseTarget.courseId)
      : undefined;
    const requestedTopicIsCurrent = requestedTopic
      ? !runtime?.currentStepId
        || requestedTopic.steps.some((step) => step.id === runtime.currentStepId)
      : false;
    const topic = requestedTopicIsCurrent ? requestedTopic : inferredTopic;
    if (!runtime || !topic) return;
    const courseId = topic.questionId ?? topic.id;
    // While a new composer turn is being prepared, the Runtime still ends in
    // the previous topic. Do not mistake that restored predecessor for the
    // course that is currently in progress.
    if (pendingCourseId && pendingCourseId !== courseId) return;
    const reachedCourseEnd = runtime.deliverySettled
      && (runtime.waiting || runtime.completed);
    if (!reachedCourseEnd) {
      const currentStepBelongsToCourse = Boolean(
        runtime.currentStepId
        && topic.steps.some((step) => step.id === runtime.currentStepId),
      );
      // Appending a new course briefly publishes its outline before the
      // player has entered that course's first Step. Keep the camera on the
      // new question/loading area during that hand-off; otherwise the last
      // focus operation from the previous course becomes visible for one
      // frame before the new course starts.
      if (!currentStepBelongsToCourse) return;
      // A restored lesson can briefly report delivery as unsettled while the
      // host hydrates it. Wait for hydration before choosing the last course;
      // otherwise the initial partial board can produce the wrong footprint.
      if (!runtime.completed) {
        const runtimeRegionId = runtimeRegionIdForTopic(topic.id);
        const renderedNodeIds = new Set(Array.from(
          viewportRef.current?.querySelectorAll<HTMLElement>(
            ".board-node[data-id]",
          ) ?? [],
        ).flatMap((element) => element.dataset.id ? [element.dataset.id] : []));
        if (!courseHasRenderedBoardNode(
          runtime.board,
          topic.nodeIds,
          runtimeRegionId,
          renderedNodeIds,
        )) return;
        const cameraController = cameraControllerRef.current;
        if (cameraController && !cameraController.canActivateCourse(courseId)) {
          return;
        }
        const enteredLoadingCourse = cameraController
          ?.markCourseActive(courseId) ?? false;
        if (
          enteredLoadingCourse
          || !coursesObservedInProgressRef.current.has(courseId)
        ) {
          mountedRef.current?.view.releaseHostCamera();
        }
        coursesObservedInProgressRef.current.add(courseId);
      }
      return;
    }
    const observedInProgress = coursesObservedInProgressRef.current.has(courseId);
    const restoringLastCourse = runtime.completed
      && !observedInProgress
      && restoredCourseFocusRef.current !== courseId
      && !pendingCourseId;
    if (!observedInProgress && !restoringLastCourse) return;

    const frame = window.requestAnimationFrame(() => {
      const view = mountedRef.current?.view;
      const viewport = viewportRef.current;
      if (!view || !viewport) return;
      const region = topic.questionId
        ? courseRegionByQuestion.get(topic.questionId)
        : undefined;
      const runtimeRegionId = runtimeRegionIdForTopic(topic.id);
      const rects: WhiteboardRect[] = [];
      const explicitlyOwnedNodeIds = topic.nodeIds ?? [];
      const currentCourseNodeIds = new Set(explicitlyOwnedNodeIds.length > 0
        ? explicitlyOwnedNodeIds
        : Object.values(runtime.board?.nodes ?? {})
            .filter((node) => node.region_id === runtimeRegionId)
            .map((node) => node.id));
      for (const element of viewport.querySelectorAll<HTMLElement>(
        ".board-node[data-id]",
      )) {
        if (!element.dataset.id || !currentCourseNodeIds.has(element.dataset.id)) {
          continue;
        }
        const bounds = renderedWorldRect(element);
        if (bounds) rects.push(bounds);
      }
      const latestRegionBounds = view.getRegionBoundsMap();
      const latestRuntimeBounds = latestRegionBounds[runtimeRegionId]
        ?? (presentationTopics.length === 1
          ? latestRegionBounds.__legacy__
          : undefined);
      // New multi-course sessions have explicit region ownership on every
      // lesson node. Prefer those currently rendered nodes over the persisted
      // monotonically-growing placement footprint: the latter is useful for
      // keeping future courses apart, but it is not a camera target and may
      // contain space reserved earlier in the session.
      if (currentCourseNodeIds.size === 0 && latestRuntimeBounds) {
        rects.push(latestRuntimeBounds);
      }

      if (enhancementLayer) {
        for (const element of enhancementLayer.querySelectorAll<HTMLElement>([
          "[data-question-id]",
          "[data-loading-id]",
          "[data-course-controls-id]",
          "[data-course-tasks-id]",
        ].join(","))) {
          const belongsToCourse = element.dataset.questionId === topic.questionId
            || element.dataset.loadingId === topic.questionId
            || element.dataset.courseControlsId === courseId
            || element.dataset.courseTasksId === courseId;
          if (!belongsToCourse) continue;
          const bounds = renderedWorldRect(element);
          if (bounds) rects.push(bounds);
        }
      }

      if (rects.length === 0 && region?.bounds) rects.push(region.bounds);

      const bounds = unionWhiteboardRects(rects);
      if (!bounds) return;
      cameraControllerRef.current?.request({
        source: restoringLastCourse ? "course-restore" : "course-end",
        key: restoringLastCourse
          ? `course-restore:${courseId}`
          : `course-end:${courseId}:${playbackCourseTarget?.sequence
            ?? runtime.cursor}`,
        courseId,
        rect: bounds,
      });
      if (restoringLastCourse) restoredCourseFocusRef.current = courseId;
      coursesObservedInProgressRef.current.delete(courseId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    courseRegionByQuestion,
    enhancementLayer,
    loadingState?.kind,
    loadingStateId,
    pendingCourseQuestion?.id,
    playbackCourseTarget,
    presentationTopics,
    runtime,
    runtimeRegionIdForTopic,
  ]);

  useLayoutEffect(() => {
    if (availableTaskKeysSeededRef.current) return;
    availableTaskKeysRef.current = new Set(coursePresentations.flatMap((presentation) =>
      presentation.tasks.map((task) =>
        `${presentation.topic.id}\u0000${task.task_id}`)));
    availableTaskKeysSeededRef.current = true;
  }, [coursePresentations]);

  useEffect(() => {
    const currentKeys = new Set(coursePresentations.flatMap((presentation) =>
      presentation.tasks.map((task) =>
        `${presentation.topic.id}\u0000${task.task_id}`)));
    const previousKeys = availableTaskKeysRef.current;
    availableTaskKeysRef.current = currentKeys;
    // Restoring an existing whiteboard must not move its camera. Only a task
    // that becomes available while this board is mounted is a new teaching
    // event and may adjust the view once.
    const newlyAvailable = coursePresentations.filter((presentation) =>
      presentation.tasks.some((task) =>
        !previousKeys.has(`${presentation.topic.id}\u0000${task.task_id}`)));
    if (newlyAvailable.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const view = mountedRef.current?.view;
      const viewport = viewportRef.current;
      const layer = enhancementLayer;
      const presentation = newlyAvailable.at(-1);
      if (!view || !viewport || !layer || !presentation) return;
      const courseId = presentation.topic.questionId ?? presentation.topic.id;
      const rects: WhiteboardRect[] = [];
      const focusIds = new Set(runtime?.board?.focus ?? []);
      for (const element of viewport.querySelectorAll<HTMLElement>(
        ".board-node[data-id], .board-group[data-id]",
      )) {
        if (!element.dataset.id || !focusIds.has(element.dataset.id)) continue;
        const bounds = renderedWorldRect(element);
        if (bounds) rects.push(bounds);
      }
      for (const element of layer.querySelectorAll<HTMLElement>(
        "[data-course-controls-id], [data-course-tasks-id]",
      )) {
        if (
          element.dataset.courseControlsId !== courseId
          && element.dataset.courseTasksId !== courseId
        ) continue;
        const bounds = renderedWorldRect(element);
        if (bounds) rects.push(bounds);
      }
      if (rects.length === 0) {
        const regionBounds = runtimeRegionBounds[
          runtimeRegionIdForTopic(presentation.topic.id)
        ] ?? (presentationTopics.length === 1
          ? runtimeRegionBounds.__legacy__
          : undefined);
        if (regionBounds) rects.push(regionBounds);
      }
      if (rects.length === 0) {
        rects.push({
          x: Math.min(
            presentation.controlsPosition.x,
            presentation.tasksPosition.x,
          ),
          y: Math.min(
            presentation.controlsPosition.y,
            presentation.tasksPosition.y,
          ),
          width: presentation.controls.length > 0 && presentation.tasks.length > 0
            ? 760
            : 372,
          height: 220,
        });
      }
      const bounds = unionWhiteboardRects(rects);
      if (bounds) {
        cameraControllerRef.current?.request({
          source: "student-task",
          key: `student-task:${courseId}:${presentation.tasks
            .map((task) => task.task_id).join(",")}`,
          courseId,
          rect: bounds,
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    coursePresentations,
    enhancementLayer,
    presentationTopics.length,
    runtime?.board?.focus,
    runtime?.completed,
    runtime?.deliverySettled,
    runtime?.waiting,
    runtimeRegionBounds,
    runtimeRegionIdForTopic,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    let animationFrame = 0;
    let lastInsets = "";
    const update = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        const mounted = mountedRef.current;
        if (!mounted) return;
        const insets = learningBoardInsets(viewport);
        const signature = JSON.stringify(insets);
        if (signature === lastInsets) return;
        lastInsets = signature;
        mounted.view.setViewportInsets(insets);
      });
    };
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(viewport);
    let observedOcclusions = new Set<Element>();
    const syncOcclusions = () => {
      const next = new Set(
        viewport.ownerDocument.querySelectorAll<Element>(boardOcclusionSelector),
      );
      let changed = next.size !== observedOcclusions.size;
      for (const element of observedOcclusions) {
        if (next.has(element)) continue;
        observer.unobserve(element);
        changed = true;
      }
      for (const element of next) {
        if (observedOcclusions.has(element)) continue;
        observer.observe(element);
        changed = true;
      }
      observedOcclusions = next;
      if (changed) update();
    };
    const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      syncOcclusions();
    });
    const root = viewport.closest(".learning-workspace") ?? viewport.parentElement;
    if (root) mutation?.observe(root, { childList: true, subtree: true });
    syncOcclusions();
    update();
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      mutation?.disconnect();
      observer.disconnect();
    };
  }, []);

  return (
    <div className="learning-oll-board-shell">
      <div
        ref={viewportRef}
        className="learning-oll-board"
        data-testid="oll-lesson-board"
        aria-label="OLL 无限白板"
      />
      {!runtime
        && inkState.component_count === 0
        && courseQuestions.length === 0
        && !loadingState ? (
        <div className="learning-whiteboard-empty" aria-live="polite">
          <span>这块白板会保存我们的思考过程</span>
          <strong>向 Octos 提问，我们从这里开始</strong>
        </div>
      ) : null}
      {degradedVisuals.length > 0 ? (
        <aside
          className="learning-degraded-visuals"
          data-learning-board-occlusion=""
          aria-label="未完成的互动画面"
        >
          {degradedVisuals.map((degraded) => {
            const requested = requestedDegradedNodeIds.has(degraded.nodeId);
            const retrying = retryingDegradedNodeId === degraded.nodeId;
            return (
              <div key={degraded.nodeId} className="learning-degraded-visual">
                <div>
                  <strong>{degraded.title}</strong>
                  <span>{degraded.purpose}</span>
                </div>
                {onRetryDegradedVisual ? (
                  <button
                    type="button"
                    onClick={() => void retryDegradedVisual(degraded)}
                    disabled={retrying || requested}
                  >
                    <RotateCcw size={14} />
                    {retrying ? "正在重试" : requested ? "已发起重试" : "只重试这个画面"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </aside>
      ) : null}
      {inkSessionId && inkAvailable ? (
        <div className="learning-ink-toolbar" data-learning-board-occlusion="" aria-label="白板书写工具">
          <button
            type="button"
            className={inkState.mode === "navigate" ? "is-active" : ""}
            onClick={() => setInkMode("navigate")}
            aria-label="浏览白板"
            aria-pressed={inkState.mode === "navigate"}
          >
            <Hand size={17} />
          </button>
          <button
            type="button"
            className={inkState.mode === "draw" ? "is-active" : ""}
            onClick={() => {
              if (inkState.mode === "draw") {
                setInkColorPaletteOpen(false);
                setInkWidthMenuOpen((current) => !current);
              } else {
                setInkMode("draw");
                setInkWidthMenuOpen(false);
              }
            }}
            aria-label="书写笔迹"
            aria-pressed={inkState.mode === "draw"}
            aria-expanded={inkState.mode === "draw" ? inkWidthMenuOpen : false}
            title={inkState.mode === "draw" ? "再次点击选择笔触粗细" : "书写笔迹"}
          >
            <PenLine size={17} />
          </button>
          <button
            type="button"
            className={inkState.mode === "erase" ? "is-active" : ""}
            onClick={() => setInkMode("erase")}
            aria-label="擦除笔迹"
            aria-pressed={inkState.mode === "erase"}
          >
            <Eraser size={17} />
          </button>
          <button
            type="button"
            className={inkState.mode === "select" && inkState.selection_mode === "rectangle" ? "is-active" : ""}
            onClick={() => {
              setSelectionMode("rectangle");
              setInkMode("select");
            }}
            aria-label="框选多个笔迹"
            aria-pressed={inkState.mode === "select" && inkState.selection_mode === "rectangle"}
            title="拖动矩形，可一次选中一条或多条笔迹"
          >
            <BoxSelect size={17} />
          </button>
          {inkColorPaletteAvailable ? (
            <>
              <button
                type="button"
                className={inkColorPaletteOpen ? "is-active" : ""}
                onClick={() => {
                  setInkWidthMenuOpen(false);
                  setInkColorPaletteOpen((current) => !current);
                }}
                aria-label={inkColorPaletteOpen ? "隐藏调色板" : "显示调色板"}
                aria-expanded={inkColorPaletteOpen}
              >
                <Palette size={17} />
              </button>
              {inkColorPaletteOpen ? (
                <InkColorControl
                  label={inkState.mode === "draw" ? "笔色" : "选区颜色"}
                  value={inkState.mode === "draw"
                    ? inkState.pen_color
                    : inkState.selection_color ?? inkState.pen_color}
                  onChange={inkState.mode === "draw"
                    ? setPenColor
                    : setSelectionColor}
                />
              ) : null}
            </>
          ) : null}
          {inkState.mode === "select"
            && inkState.selected_count > 0
            && onAskInkSelection ? (
              <>
                {selectionClassificationStatus === "loading" ? (
                  <span className="learning-ink-classification-status" role="status">
                    正在识别选区…
                  </span>
                ) : null}
                {quickSelectionTools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className="learning-ink-quick-action"
                    onClick={() => void askSelection(
                      tool.prompt,
                      tool.id,
                      tool.requestContentKind,
                      [],
                    )}
                    disabled={selectionRequestPending}
                  >
                    {tool.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="learning-ink-ask"
                  onClick={() => void openSelectionQuestion()}
                  aria-expanded={selectionQuestionOpen}
                  title={selectionClassificationStatus === "error"
                    ? "未能自动识别选区，可在提问面板中手动选择内容类型"
                    : undefined}
                  disabled={selectionRequestPending}
                >
                  <MessageCircle size={16} />
                  问小章鱼
                </button>
              </>
            ) : null}
          <button
            type="button"
            className="learning-ink-select-all"
            onClick={selectAllInk}
            aria-label="选择全部笔迹"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => runInkHistory("undo")}
            aria-label="撤销笔迹"
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            onClick={() => runInkHistory("redo")}
            aria-label="重做笔迹"
          >
            <Redo2 size={17} />
          </button>
          <span className="learning-ink-status" role="status">
            {inkState.component_count} 项笔迹
            {inkState.selected_count > 0
              ? ` · 已选 ${inkState.selected_count}`
              : ""}
            {inkState.saved ? " · 已保存" : " · 保存中"}
          </span>
        </div>
      ) : null}
      {inkWidthMenuOpen && inkState.mode === "draw" ? (
        <div
          className="learning-ink-width-menu"
          data-learning-board-occlusion=""
          aria-label="笔触粗细"
        >
          {inkWidthPresets.map((preset) => (
            <button
              key={preset.width}
              type="button"
              className={inkPenWidth === preset.width ? "is-active" : ""}
              onClick={() => setPenWidth(preset.width)}
              aria-label={`笔触粗细：${preset.label}`}
              aria-pressed={inkPenWidth === preset.width}
            >
              <span className="learning-ink-width-preview" aria-hidden="true">
                <i style={{ width: preset.width * 3, height: preset.width * 3 }} />
                <b style={{ height: Math.max(1, preset.width * .8) }} />
              </span>
              <small>
                {preset.width.toFixed(preset.width % 1 === 0 ? 0 : 1)} px
              </small>
            </button>
          ))}
        </div>
      ) : null}
      {selectionQuestionOpen && inkState.selected_count > 0 ? (
        <form
          className="learning-selection-question"
          data-learning-board-occlusion=""
          onSubmit={(event) => {
            event.preventDefault();
            void askSelection(selectionQuestion);
          }}
        >
          <header>
            <strong>针对当前选区提问</strong>
            <span>
              将发送 {inkState.selected_count} 项选中笔迹，以及你在下面明确选择的局部白板内容；不会发送整块白板。
            </span>
          </header>
          {preparedSelection?.candidates.length ? (
            <fieldset className="learning-selection-targets">
              <legend>这段笔迹是在问哪部分白板内容？</legend>
              <label>
                <input
                  type="radio"
                  name="selection-board-target"
                  checked={selectedBoardTargetIds.length === 0}
                  onChange={() => setSelectedBoardTargetIds([])}
                />
                只看我的笔迹
              </label>
              {preparedSelection.candidates.map((candidate) => (
                <label
                  key={candidate.target_id}
                  className={selectedBoardTargetIds.includes(candidate.target_id) ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="selection-board-target"
                    checked={selectedBoardTargetIds.includes(candidate.target_id)}
                    onChange={() => setSelectedBoardTargetIds([candidate.target_id])}
                  />
                  <span>{candidate.label ?? candidate.target_id}</span>
                  <small>{boardTargetKindLabels[candidate.kind] ?? "局部内容"}</small>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="learning-selection-no-target">
              当前框选没有覆盖课程对象，本次只参考你的原始笔迹。
            </p>
          )}
          <label>
            我写的内容更像
            <select
              value={selectionContentKind}
              onChange={(event) =>
                setSelectionContentKind(
                  event.target.value as SelectionContentKind,
                )}
            >
              <option value="unknown">暂不确定</option>
              <option value="text">文字</option>
              <option value="math">公式</option>
              <option value="geometry">图形</option>
              <option value="data">数据</option>
            </select>
          </label>
          {selectionClassification ? (
            <p className="learning-selection-classification">
              自动识别为：{selectionContentKindLabels[selectionClassification.kind]}
              {selectionClassification.content
                ? `（${selectionClassification.content}）`
                : ""}
              {selectionClassification.confidence === "low"
                ? "；把握较低，请手动确认"
                : ""}
            </p>
          ) : selectionClassificationStatus === "error" ? (
            <p className="learning-selection-classification">
              没有可靠识别出内容，请手动选择类型。
            </p>
          ) : null}
          <p className="learning-selection-action-label">
            <strong>接下来让小章鱼做什么？</strong>
            <small>下面是操作，不会改变上面已经确认的选区。</small>
          </p>
          <div className="learning-selection-suggestions">
            {availableSelectionTools(
              selectionContentKind,
              preparedSelection?.candidates
                .filter((candidate) => selectedBoardTargetIds.includes(candidate.target_id))
                .map((candidate) => candidate.kind),
            ).map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => void askSelection(
                  tool.prompt,
                  tool.id,
                  tool.requestContentKind,
                )}
                disabled={selectionRequestPending}
              >
                {tool.label}
              </button>
            ))}
          </div>
          <div className="learning-selection-question-input">
            <input
              value={selectionQuestion}
              onChange={(event) => setSelectionQuestion(event.target.value)}
              placeholder="例如：这一步为什么不对？"
              aria-label="针对选区的问题"
              disabled={selectionRequestPending}
            />
            {onVoiceInkSelection ? (
              <button
                type="button"
                onClick={() => void askSelectionByVoice()}
                disabled={selectionRequestPending}
                aria-label="针对当前选区语音提问"
              >
                <Mic size={16} />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={
                selectionRequestPending || !selectionQuestion.trim()
              }
            >
              发送
            </button>
          </div>
        </form>
      ) : null}
      {writingError ? (
        <div className="learning-ink-error" role="alert">
          {writingError}
          <button type="button" onClick={() => { setWritingError(""); setWritingRetry((value) => value + 1); }}>重试板书</button>
        </div>
      ) : null}
      {inkError ? (
        <div className="learning-ink-error" role="alert">
          笔迹功能：{inkError}
        </div>
      ) : null}
      {enhancementLayer
        ? createPortal(
            <>
              {courseQuestions.map((question, index) => (
                <WhiteboardQuestionCard
                  key={question.id}
                  question={question}
                  left={question.position?.x
                    ?? lessonLoadingPosition.left
                      - WHITEBOARD_QUESTION_CARD_WIDTH - 24}
                  top={question.position?.y
                    ?? lessonLoadingPosition.top + index * 150}
                />
              ))}
              {loadingState ? (
                <WhiteboardLoadingBlock
                  state={loadingState}
                  left={pendingCourseQuestion?.position
                    ? pendingCourseQuestion.position.x
                      + WHITEBOARD_QUESTION_CARD_WIDTH + 24
                    : lessonLoadingPosition.left}
                  top={pendingCourseQuestion?.position?.y
                    ?? lessonLoadingPosition.top}
                />
              ) : null}
              {coursePresentations.map((presentation) => {
                const courseId = presentation.topic.questionId
                  ?? presentation.topic.id;
                return (
                  <div key={`course-ui:${presentation.id}`}>
                    {presentation.controls.length > 0 ? (
                      <div
                        className="learning-variable-controls is-world"
                        style={{
                          left: presentation.controlsPosition.x,
                          top: presentation.controlsPosition.y,
                          width: 360,
                        }}
                        data-course-controls-id={courseId}
                        data-interaction-controls-id={presentation.id}
                        data-oll-ink-input="ignore"
                        aria-label={`${presentation.topic.title}的课程变量控制`}
                        data-testid="oll-variable-controls"
                      >
                        {presentation.controls.map((control) => {
                          const inputId = `oll-variable-${control.alias}`;
                          return (
                            <div
                              className={runtime?.activeVariableAnimation?.variable === control.alias
                                ? "learning-variable-control is-animating"
                                : "learning-variable-control"}
                              key={control.alias}
                            >
                              <label htmlFor={inputId}>{control.label}</label>
                              <input
                                id={inputId}
                                type="range"
                                min={control.min}
                                max={control.max}
                                step={control.step}
                                value={control.value}
                                onPointerDown={(event) => {
                                  startSliderOperation(
                                    control.alias,
                                    control.value,
                                    studentInputMethod(event.pointerType),
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if ([
                                    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
                                    "Home", "End", "PageUp", "PageDown",
                                  ].includes(event.key)) {
                                    startSliderOperation(
                                      control.alias,
                                      control.value,
                                      "keyboard",
                                    );
                                  }
                                }}
                                onChange={(event) => {
                                  updateSliderOperation(
                                    control.alias,
                                    Number(event.target.value),
                                  );
                                }}
                                onPointerUp={(event) => {
                                  commitSliderOperation(
                                    control.alias,
                                    Number(event.currentTarget.value),
                                    event.currentTarget.getBoundingClientRect().width,
                                  );
                                }}
                                onPointerCancel={(event) => {
                                  commitSliderOperation(
                                    control.alias,
                                    Number(event.currentTarget.value),
                                    event.currentTarget.getBoundingClientRect().width,
                                  );
                                }}
                                onKeyUp={(event) => {
                                  commitSliderOperation(
                                    control.alias,
                                    Number(event.currentTarget.value),
                                    event.currentTarget.getBoundingClientRect().width,
                                  );
                                }}
                                onBlur={(event) => {
                                  commitSliderOperation(
                                    control.alias,
                                    Number(event.currentTarget.value),
                                    event.currentTarget.getBoundingClientRect().width,
                                  );
                                }}
                                aria-label={control.label}
                              />
                              <output>
                                {formatVariableValue(control.value, control.unit)}
                              </output>
                              <div className="learning-variable-control-actions">
                                {([-1, 1] as const).map((direction) => (
                                  <button
                                    key={direction}
                                    type="button"
                                    onClick={() => {
                                      if (!runtime) return;
                                      const stepIndex = Math.round(
                                        (control.value - control.min) / control.step,
                                      ) + direction;
                                      const nextValue = Math.min(
                                        control.max,
                                        Math.max(
                                          control.min,
                                          control.min + stepIndex * control.step,
                                        ),
                                      );
                                      const operationId = runtime.handleStudentVariableInput(
                                        control.alias,
                                        control.value,
                                        {
                                          phase: "start",
                                          control: "slider",
                                          input: "keyboard",
                                        },
                                      );
                                      runtime.handleStudentVariableInput(
                                        control.alias,
                                        Number(nextValue.toPrecision(15)),
                                        {
                                          phase: "commit",
                                          control: "slider",
                                          input: "keyboard",
                                          ...(typeof operationId === "string"
                                            ? { operation_id: operationId }
                                            : {}),
                                        },
                                      );
                                    }}
                                    aria-label={`${direction < 0 ? "减小" : "增大"}${control.label}`}
                                  >
                                    {direction < 0 ? "−" : "+"}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const initial = runtime?.board
                                      ?.variables?.[control.alias]?.initial;
                                    if (runtime && typeof initial === "number") {
                                      const operationId = runtime.handleStudentVariableInput(
                                        control.alias,
                                        control.value,
                                        {
                                          phase: "start",
                                          control: "reset",
                                          input: "unknown",
                                        },
                                      );
                                      runtime.handleStudentVariableInput(
                                        control.alias,
                                        initial,
                                        {
                                          phase: "commit",
                                          control: "reset",
                                          input: "unknown",
                                          ...(typeof operationId === "string"
                                            ? { operation_id: operationId }
                                            : {}),
                                        },
                                      );
                                    }
                                  }}
                                  aria-label={`复位${control.label}`}
                                >
                                  复位
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <small>
                          {runtime?.activeVariableAnimation
                            ? "老师正在演示这个变量，结束后即可继续拖动"
                            : "可拖动滑块，也可用 −、+ 或方向键精细调整"}
                        </small>
                      </div>
                    ) : null}
                    {presentation.tasks.length > 0 ? (
                      <section
                        className="learning-student-tasks is-world"
                        style={{
                          left: presentation.tasksPosition.x,
                          top: presentation.tasksPosition.y,
                          width: 330,
                        }}
                        data-course-tasks-id={courseId}
                        data-interaction-tasks-id={presentation.id}
                        data-oll-ink-input="ignore"
                        aria-label={`${presentation.topic.title}的动手任务`}
                        data-testid="oll-student-tasks"
                      >
                        <header>
                          <span>动手试一试</span>
                          <small>直接操作白板上的图形、视角或控制器</small>
                        </header>
                        {presentation.tasks.map((task) => {
                          const lastAttempt = task.attempts.at(-1);
                          const attempts = task.attempts.length;
                          return (
                            <article
                              key={task.task_id}
                              className={`learning-student-task is-${task.status}`}
                              aria-live="polite"
                            >
                              <p>{task.prompt}</p>
                              {task.status === "succeeded" ? (
                                <div className="learning-student-task-feedback is-success">
                                  <CheckCircle2 size={17} />
                                  <span>
                                    {task.success_message
                                      ?? "完成得很好，已经达到目标。"}
                                  </span>
                                </div>
                              ) : lastAttempt ? (
                                <div className="learning-student-task-feedback">
                                  <span>
                                    {task.status === "needs_hint"
                                      ? "还没达到目标，可以查看提示后再试。"
                                      : "已经记录这次操作，再调整一下试试。"}
                                  </span>
                                  <small>已尝试 {attempts} 次</small>
                                </div>
                              ) : (
                                <div className="learning-student-task-feedback">
                                  <span>轮到你操作了，完成后这里会立即反馈。</span>
                                </div>
                              )}
                              {task.current_hint ? (
                                <div
                                  className="learning-student-task-hint"
                                  role="status"
                                >
                                  <Lightbulb size={16} />
                                  <span>{task.current_hint}</span>
                                </div>
                              ) : null}
                              {task.status !== "succeeded" && attempts > 0 ? (
                                <div className="learning-student-task-actions">
                                  {task.hints_revealed < task.hints.length ? (
                                    <button
                                      type="button"
                                      onClick={() => requestTaskHint(task.task_id)}
                                    >
                                      <Lightbulb size={15} />
                                      {task.current_hint ? "下一个提示" : "给我提示"}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => retryTask(task.task_id)}
                                  >
                                    <RotateCcw size={15} />
                                    重新开始
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                        {taskError ? (
                          <div
                            className="learning-student-task-error"
                            role="alert"
                          >
                            {taskError}
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                );
              })}
              {selectionQuestionOpen
                ? preparedSelection?.candidates.map((candidate, index) => (
                    <div
                      key={candidate.target_id}
                      className={selectedBoardTargetIds.includes(candidate.target_id)
                        ? "learning-selection-target-highlight is-selected"
                        : "learning-selection-target-highlight"}
                      style={{
                        left: candidate.world_bounds.x,
                        top: candidate.world_bounds.y,
                        width: candidate.world_bounds.width,
                        height: candidate.world_bounds.height,
                      }}
                      aria-hidden="true"
                    >
                      <span>{index + 1}</span>
                    </div>
                  ))
                : null}
              <SelectionEnhancementLayer
                artifacts={selectionEnhancements.filter((artifact) => artifact.response.kind !== "board_writing")}
                sources={selectionSources}
                questions={questions.filter((question) => !selectionEnhancements.some((artifact) =>
                  artifact.turn_id === question.id && artifact.response.kind === "board_writing"))}
                currentDocumentVersion={inkState.document_version}
                cardLayouts={selectionCardLayouts}
                occupiedRects={selectionCardOccupiedRects}
                visibleBoardBounds={visibleBoardBounds}
                currentSourceBoundsById={currentSelectionSourceBoundsById}
                clientToBoardPoint={(point) => {
                  const viewport = viewportRef.current;
                  const view = mountedRef.current?.view;
                  if (!viewport || !view) return point;
                  const rect = viewport.getBoundingClientRect();
                  return view.viewportToBoard({
                    x: point.x - rect.left,
                    y: point.y - rect.top,
                  });
                }}
                invalidTargetTurnIds={new Set(selectionEnhancements
                  .filter((artifact) =>
                    Boolean(artifact.board?.targets.length)
                    && !selectionArtifactTargetsExist(
                      artifact,
                      runtime?.board ?? null,
                    ),
                  )
                  .map((artifact) => artifact.turn_id))}
                onDelete={(turnId) =>
                  onDeleteSelectionEnhancement?.(turnId)}
                onCardLayoutChange={onSelectionCardLayoutChange}
              />
            </>,
            enhancementLayer,
          )
        : null}
    </div>
  );
}

/** @deprecated Use LearningWhiteboard. Kept for callers that still name the
 * shared whiteboard after its optional OLL course layer. */
export const OllLessonBoard = LearningWhiteboard;
