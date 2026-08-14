import { buildApiHeaders } from "@/api/client";
import { buildFileUrl } from "@/api/files";
import type { SessionFileInfo } from "@/api/sessions";
import type { Thread } from "@/store/thread-store";
import {
  assertInkSelectionIntegrity,
  validateInkSelectionSnapshot,
  type InkSelectionBounds,
  type InkSelectionSnapshot,
} from "octos-lesson-language/ink-runtime";

const ARTIFACT_SUFFIX = ".octos-selection-enhancement.json";
const STATE_PROFILE = "octos.selection-enhancement-state";
const STATE_VERSION = "0.1";

export type SelectionContentKind =
  | "text"
  | "math"
  | "geometry"
  | "data"
  | "unknown";

export interface SelectionEnhancementSourceRef {
  source_id: string;
  document_id: string;
  document_version: number;
  bounds: InkSelectionBounds;
  checksum: { algorithm: "sha-256"; value: string };
}

export interface SelectionEnhancementArtifact {
  profile: "octos.selection-enhancement";
  version: "0.1";
  turn_id: string;
  created_at: string;
  source: SelectionEnhancementSourceRef;
  interpretation: {
    kind: SelectionContentKind;
    content: string;
    confidence: "high" | "medium" | "low";
  };
  response:
    | {
        kind: "explanation";
        title: string;
        text: string;
        items?: string[];
      }
    | {
        kind: "plot";
        title: string;
        text: string;
        expression: string;
        x_range: { min: number; max: number };
        y_range: { min: number; max: number };
      };
}

export interface SelectionEnhancementArtifactRef {
  id: string;
  filename: string;
  path: string;
  turnId: string;
}

export interface SelectionEnhancementState {
  profile: typeof STATE_PROFILE;
  version: typeof STATE_VERSION;
  session_id: string;
  sources: InkSelectionSnapshot[];
  hidden_enhancement_turn_ids: string[];
}

export interface SelectionEnhancementTurnContext {
  sessionId: string;
  turnId: string;
  mediaPath: string;
  source: InkSelectionSnapshot;
  contentKind: SelectionContentKind;
  learnerRequest?: string;
  lessonTitle?: string;
  boardSummary?: string;
}

function contextLine(name: string, value: string | number): string {
  return `${name}: ${String(value).replace(/[\r\n]+/g, " ")}`;
}

/** Explicitly routes one turn to the selection enhancer instead of asking the
 * lesson generator to replace the current board. */
export function buildSelectionEnhancementTurnContext(
  context: SelectionEnhancementTurnContext,
): string {
  const { bounds } = context.source;
  const lines = [
    "[[LEARNING_SELECTION]]",
    "lesson_artifact_policy: forbidden",
    "selection_artifact_tool: oll_enhance_selection",
    "selection_artifact_policy: tool_only",
    contextLine("session_id", context.sessionId),
    contextLine("turn_id", context.turnId),
    contextLine("selection_media", context.mediaPath),
    contextLine("source_id", context.source.source_id),
    contextLine("source_document_id", context.source.document_id),
    contextLine("source_document_version", context.source.document_version),
    contextLine("source_bounds", [bounds.x, bounds.y, bounds.width, bounds.height].join(",")),
    contextLine("source_checksum", context.source.checksum.value),
    contextLine("content_hint", context.contentKind),
  ];
  if (context.learnerRequest?.trim()) {
    lines.push(contextLine("learner_request", context.learnerRequest.trim()));
  }
  if (context.lessonTitle?.trim()) {
    lines.push(contextLine("lesson_title", context.lessonTitle.trim()));
  }
  if (context.boardSummary?.trim()) {
    lines.push(contextLine("board_summary", context.boardSummary.trim()));
  }
  lines.push("preserve_source_ink: required", "[[/LEARNING_SELECTION]]");
  return lines.join("\n");
}

/** Rasterize only the immutable selection snapshot. The rest of the board is
 * deliberately unavailable to this helper. */
export async function selectionSnapshotToPngFile(
  snapshot: InkSelectionSnapshot,
): Promise<File> {
  const source = validateInkSelectionSnapshot(snapshot);
  await assertInkSelectionIntegrity(source);
  const scale = Math.min(2, 1600 / Math.max(source.bounds.width, source.bounds.height));
  const width = Math.max(1, Math.ceil(source.bounds.width * scale));
  const height = Math.max(1, Math.ceil(source.bounds.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成选区图片");
  context.fillStyle = "#fbfaf5";
  context.fillRect(0, 0, width, height);
  const image = new Image();
  const blob = new Blob([source.svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("选区图片解析失败"));
      image.src = url;
    });
    context.drawImage(image, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("选区图片生成失败")),
      "image/png",
    );
  });
  return new File([png], `${source.source_id}.png`, { type: "image/png" });
}

function finiteRange(value: unknown): value is { min: number; max: number } {
  if (!value || typeof value !== "object") return false;
  const range = value as { min?: unknown; max?: unknown };
  return typeof range.min === "number"
    && Number.isFinite(range.min)
    && typeof range.max === "number"
    && Number.isFinite(range.max)
    && range.max > range.min;
}

function validSource(value: unknown): value is SelectionEnhancementSourceRef {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<SelectionEnhancementSourceRef>;
  const bounds = source.bounds;
  return typeof source.source_id === "string"
    && source.source_id.length > 0
    && typeof source.document_id === "string"
    && source.document_id.length > 0
    && Number.isInteger(source.document_version)
    && (source.document_version ?? -1) >= 0
    && Boolean(bounds)
    && Number.isFinite(bounds?.x)
    && Number.isFinite(bounds?.y)
    && Number.isFinite(bounds?.width)
    && (bounds?.width ?? 0) > 0
    && Number.isFinite(bounds?.height)
    && (bounds?.height ?? 0) > 0
    && source.checksum?.algorithm === "sha-256"
    && /^[a-f0-9]{64}$/.test(source.checksum.value ?? "");
}

export function validateSelectionEnhancementArtifact(
  value: unknown,
): SelectionEnhancementArtifact {
  if (!value || typeof value !== "object") {
    throw new Error("选区辅助内容必须是对象");
  }
  const artifact = value as Partial<SelectionEnhancementArtifact>;
  const interpretation = artifact.interpretation;
  const response = artifact.response;
  if (
    artifact.profile !== "octos.selection-enhancement"
    || artifact.version !== "0.1"
    || typeof artifact.turn_id !== "string"
    || !artifact.turn_id
    || typeof artifact.created_at !== "string"
    || !validSource(artifact.source)
    || !interpretation
    || !["text", "math", "geometry", "data", "unknown"].includes(
      String(interpretation.kind),
    )
    || typeof interpretation.content !== "string"
    || !["high", "medium", "low"].includes(String(interpretation.confidence))
    || !response
    || typeof response.title !== "string"
    || !response.title.trim()
    || typeof response.text !== "string"
    || !response.text.trim()
  ) {
    throw new Error("选区辅助内容的来源或说明字段无效");
  }
  if (response.kind === "explanation") {
    if (
      response.items !== undefined
      && (
        !Array.isArray(response.items)
        || response.items.some((item) => typeof item !== "string" || !item.trim())
      )
    ) {
      throw new Error("选区辅助内容的条目无效");
    }
  } else if (
    response.kind !== "plot"
    || typeof response.expression !== "string"
    || !response.expression.trim()
    || !finiteRange(response.x_range)
    || !finiteRange(response.y_range)
  ) {
    throw new Error("选区函数图内容无效");
  }
  return structuredClone(artifact as SelectionEnhancementArtifact);
}

export function selectionArtifactMatchesSource(
  artifact: SelectionEnhancementArtifact,
  source: InkSelectionSnapshot,
): boolean {
  const bounds = artifact.source.bounds;
  return artifact.source.source_id === source.source_id
    && artifact.source.document_id === source.document_id
    && artifact.source.document_version === source.document_version
    && artifact.source.checksum.algorithm === source.checksum.algorithm
    && artifact.source.checksum.value === source.checksum.value
    && bounds.x === source.bounds.x
    && bounds.y === source.bounds.y
    && bounds.width === source.bounds.width
    && bounds.height === source.bounds.height;
}

export function selectionEnhancementStorageKey(sessionId: string): string {
  return "learn:selection-enhancements:" + sessionId + ":v1";
}

export async function loadSelectionEnhancementState(
  sessionId: string,
  storage: Storage = localStorage,
): Promise<SelectionEnhancementState> {
  const empty: SelectionEnhancementState = {
    profile: STATE_PROFILE,
    version: STATE_VERSION,
    session_id: sessionId,
    sources: [],
    hidden_enhancement_turn_ids: [],
  };
  const raw = storage.getItem(selectionEnhancementStorageKey(sessionId));
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<SelectionEnhancementState>;
    if (
      parsed.profile !== STATE_PROFILE
      || parsed.version !== STATE_VERSION
      || parsed.session_id !== sessionId
      || !Array.isArray(parsed.sources)
      || !Array.isArray(parsed.hidden_enhancement_turn_ids)
      || parsed.hidden_enhancement_turn_ids.some(
        (id) => typeof id !== "string" || !id,
      )
    ) {
      throw new Error("invalid selection enhancement state");
    }
    const sources: InkSelectionSnapshot[] = [];
    const ids = new Set<string>();
    for (const candidate of parsed.sources) {
      const source = validateInkSelectionSnapshot(candidate);
      await assertInkSelectionIntegrity(source);
      if (ids.has(source.source_id)) throw new Error("duplicate selection source");
      ids.add(source.source_id);
      sources.push(source);
    }
    return {
      ...empty,
      sources,
      hidden_enhancement_turn_ids: [
        ...new Set(parsed.hidden_enhancement_turn_ids),
      ],
    };
  } catch {
    storage.removeItem(selectionEnhancementStorageKey(sessionId));
    return empty;
  }
}

export function saveSelectionEnhancementState(
  state: SelectionEnhancementState,
  storage: Storage = localStorage,
): void {
  storage.setItem(
    selectionEnhancementStorageKey(state.session_id),
    JSON.stringify(state),
  );
}

export function addSelectionSource(
  state: SelectionEnhancementState,
  source: InkSelectionSnapshot,
): SelectionEnhancementState {
  const validated = validateInkSelectionSnapshot(source);
  const existing = state.sources.find(
    (candidate) => candidate.source_id === validated.source_id,
  );
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(validated)) {
      throw new Error("同一选区来源编号不能指向不同原稿");
    }
    return state;
  }
  return { ...state, sources: [...state.sources, validated] };
}

export function hideSelectionEnhancement(
  state: SelectionEnhancementState,
  turnId: string,
): SelectionEnhancementState {
  if (state.hidden_enhancement_turn_ids.includes(turnId)) return state;
  return {
    ...state,
    hidden_enhancement_turn_ids: [
      ...state.hidden_enhancement_turn_ids,
      turnId,
    ],
  };
}

export function isSelectionEnhancementArtifact(
  file: { filename?: string; path?: string },
): boolean {
  return [file.filename, file.path].some(
    (value) =>
      typeof value === "string"
      && value.toLowerCase().endsWith(ARTIFACT_SUFFIX),
  );
}

function artifactIdentity(
  artifact: Pick<SelectionEnhancementArtifactRef, "filename">,
): string {
  const filename = artifact.filename.replaceAll("\\", "/").split("/").at(-1);
  return encodeURIComponent(filename ?? artifact.filename);
}

export function collectSelectionEnhancementArtifacts(
  threads: Thread[],
): SelectionEnhancementArtifactRef[] {
  const artifacts: SelectionEnhancementArtifactRef[] = [];
  const seen = new Set<string>();
  for (const thread of threads) {
    const messages = [
      ...thread.responses,
      ...(thread.pendingAssistant ? [thread.pendingAssistant] : []),
    ];
    for (const message of messages) {
      for (const file of message.files) {
        if (!isSelectionEnhancementArtifact(file)) continue;
        const artifact = {
          id: [message.id, file.path].join(":"),
          filename: file.filename,
          path: file.path,
          turnId: thread.turnId ?? thread.id,
        };
        const identity = artifactIdentity(artifact);
        if (seen.has(identity)) continue;
        seen.add(identity);
        artifacts.push(artifact);
      }
    }
  }
  return artifacts;
}

export function collectPersistedSelectionEnhancementArtifacts(
  files: SessionFileInfo[],
): SelectionEnhancementArtifactRef[] {
  return files
    .filter((file) => isSelectionEnhancementArtifact(file))
    .sort((left, right) => Date.parse(left.modified_at) - Date.parse(right.modified_at))
    .map((file) => ({
      id: "persisted:" + file.path,
      filename: file.filename,
      path: file.path,
      turnId: file.filename.slice(0, -ARTIFACT_SUFFIX.length),
    }));
}

export function mergeSelectionEnhancementArtifacts(
  ...groups: SelectionEnhancementArtifactRef[][]
): SelectionEnhancementArtifactRef[] {
  const result: SelectionEnhancementArtifactRef[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const artifact of group) {
      const identity = artifactIdentity(artifact);
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push(artifact);
    }
  }
  return result;
}

export async function loadSelectionEnhancementArtifact(
  artifact: SelectionEnhancementArtifactRef,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SelectionEnhancementArtifact> {
  const response = await fetch(buildFileUrl(artifact.path, { sessionId }), {
    headers: buildApiHeaders(),
    signal,
  });
  if (!response.ok) {
    throw new Error("选区辅助内容读取失败 (" + response.status + ")");
  }
  return validateSelectionEnhancementArtifact(await response.json());
}
