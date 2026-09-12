import { Minimize2, Trash2 } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  plotPathData,
  renderScene3d,
  sampleImplicitPlotExpression,
  samplePlotExpression,
} from "octos-lesson-language/web-runtime";
import type {
  InkSelectionBounds,
  InkSelectionSnapshot,
} from "octos-lesson-language/ink-runtime";
import { MarkdownContent } from "@/components/markdown-renderer";
import type {
  SelectionEnhancementArtifact,
  SelectionEnhancementCardLayout,
} from "./selection-enhancements";
import type { WhiteboardQuestionRecord } from "./whiteboard-questions";
import { WhiteboardQuestionImage } from "./whiteboard-question-image";
import {
  findOpenWhiteboardPosition,
  type WhiteboardRect,
} from "./whiteboard-placement";

const DEFAULT_CARD_SCALE = 1;
const PREVIOUS_ANDROID_DEFAULT_CARD_SCALE = .76;
const ANDROID_DEFAULT_CARD_SCALE = 1;
const MIN_CARD_SCALE = .68;
const MAX_CARD_SCALE = 2.25;
const CARD_WIDTH = 330;
const CARD_FONT_SIZE = 13;
const SCENE3D_HEIGHT = 270;
const CARD_GAP = 24;
const RESTORED_SOURCE_OVERLAP_THRESHOLD = .8;

type LinkSide = "left" | "right" | "top" | "bottom";

function clampToEdge(value: number, start: number, length: number): number {
  const inset = Math.min(14, length / 2);
  return Math.min(start + length - inset, Math.max(start + inset, value));
}

function selectionLinkAnchors(
  source: InkSelectionBounds,
  card: InkSelectionBounds,
): {
  source: { x: number; y: number; side: LinkSide };
  card: { x: number; y: number; side: LinkSide };
  axis: "horizontal" | "vertical";
} {
  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  };
  const cardCenter = {
    x: card.x + card.width / 2,
    y: card.y + card.height / 2,
  };
  const cardIsRight = cardCenter.x >= sourceCenter.x;
  const cardIsBelow = cardCenter.y >= sourceCenter.y;
  const horizontal = {
    source: {
      x: cardIsRight ? source.x + source.width : source.x,
      y: clampToEdge(cardCenter.y, source.y, source.height),
      side: (cardIsRight ? "right" : "left") as LinkSide,
    },
    card: {
      x: cardIsRight ? card.x : card.x + card.width,
      y: clampToEdge(sourceCenter.y, card.y, card.height),
      side: (cardIsRight ? "left" : "right") as LinkSide,
    },
    axis: "horizontal" as const,
  };
  const vertical = {
    source: {
      x: clampToEdge(cardCenter.x, source.x, source.width),
      y: cardIsBelow ? source.y + source.height : source.y,
      side: (cardIsBelow ? "bottom" : "top") as LinkSide,
    },
    card: {
      x: clampToEdge(sourceCenter.x, card.x, card.width),
      y: cardIsBelow ? card.y : card.y + card.height,
      side: (cardIsBelow ? "top" : "bottom") as LinkSide,
    },
    axis: "vertical" as const,
  };
  const distanceSquared = (candidate: typeof horizontal | typeof vertical) =>
    (candidate.card.x - candidate.source.x) ** 2
      + (candidate.card.y - candidate.source.y) ** 2;
  return distanceSquared(horizontal) <= distanceSquared(vertical)
    ? horizontal
    : vertical;
}

function roundedOrthogonalPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  axis: "horizontal" | "vertical",
): string {
  if (axis === "horizontal") {
    const directionX = Math.sign(end.x - start.x) || 1;
    const directionY = Math.sign(end.y - start.y);
    const middleX = start.x + (end.x - start.x) / 2;
    const radius = Math.min(10, Math.abs(end.x - start.x) / 4, Math.abs(end.y - start.y) / 2);
    if (directionY === 0 || radius === 0) return `M ${start.x} ${start.y} H ${end.x}`;
    return [
      `M ${start.x} ${start.y}`,
      `H ${middleX - directionX * radius}`,
      `Q ${middleX} ${start.y} ${middleX} ${start.y + directionY * radius}`,
      `V ${end.y - directionY * radius}`,
      `Q ${middleX} ${end.y} ${middleX + directionX * radius} ${end.y}`,
      `H ${end.x}`,
    ].join(" ");
  }
  const directionX = Math.sign(end.x - start.x);
  const directionY = Math.sign(end.y - start.y) || 1;
  const middleY = start.y + (end.y - start.y) / 2;
  const radius = Math.min(10, Math.abs(end.y - start.y) / 4, Math.abs(end.x - start.x) / 2);
  if (directionX === 0 || radius === 0) return `M ${start.x} ${start.y} V ${end.y}`;
  return [
    `M ${start.x} ${start.y}`,
    `V ${middleY - directionY * radius}`,
    `Q ${start.x} ${middleY} ${start.x + directionX * radius} ${middleY}`,
    `H ${end.x - directionX * radius}`,
    `Q ${end.x} ${middleY} ${end.x} ${middleY + directionY * radius}`,
    `V ${end.y}`,
  ].join(" ");
}

function SelectionSourceLink({
  sourceId,
  sourceBounds,
  cardLeft,
  cardTop,
  cardWidth,
  cardHeight,
}: {
  sourceId: string;
  sourceBounds: InkSelectionBounds;
  cardLeft: number;
  cardTop: number;
  cardWidth: number;
  cardHeight: number;
}) {
  const markerId = `selection-source-arrow-${useId().replaceAll(":", "")}`;
  const anchors = selectionLinkAnchors(sourceBounds, {
    x: cardLeft,
    y: cardTop,
    width: cardWidth,
    height: cardHeight,
  });
  const path = roundedOrthogonalPath(anchors.source, anchors.card, anchors.axis);
  const padding = 20;
  const left = Math.min(anchors.source.x, anchors.card.x) - padding;
  const top = Math.min(anchors.source.y, anchors.card.y) - padding;
  const width = Math.max(1, Math.abs(anchors.card.x - anchors.source.x) + padding * 2);
  const height = Math.max(1, Math.abs(anchors.card.y - anchors.source.y) + padding * 2);
  return (
    <svg
      className="learning-selection-source-link"
      style={{
        left: left - cardLeft,
        top: top - cardTop,
        width,
        height,
      }}
      viewBox={`0 0 ${width} ${height}`}
      data-source-id={sourceId}
      data-source-x={anchors.source.x}
      data-source-y={anchors.source.y}
      data-card-x={anchors.card.x}
      data-card-y={anchors.card.y}
      data-source-side={anchors.source.side}
      data-card-side={anchors.card.side}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 12 10"
          refX="10"
          refY="5"
          markerWidth="12"
          markerHeight="10"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <polyline points="2,1 10,5 2,9" />
        </marker>
      </defs>
      <path
        className="learning-selection-source-path"
        d={path}
        transform={`translate(${-left} ${-top})`}
        strokeWidth="3"
        markerEnd={`url(#${markerId})`}
      />
    </svg>
  );
}

function clampedCardScale(value: number): number {
  return Math.min(MAX_CARD_SCALE, Math.max(MIN_CARD_SCALE, value));
}

function boundsOverlapRatio(
  left: InkSelectionSnapshot["bounds"],
  right: InkSelectionSnapshot["bounds"],
): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width)
      - Math.max(left.x, right.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height)
      - Math.max(left.y, right.y),
  );
  const smallerArea = Math.min(
    left.width * left.height,
    right.width * right.height,
  );
  if (smallerArea <= 0) return 0;
  return intersectionWidth * intersectionHeight / smallerArea;
}

function cardRectsOverlap(
  left: WhiteboardRect,
  right: WhiteboardRect,
  gap = CARD_GAP,
): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

function SelectionQuestionSection({
  question,
  onDelete,
}: {
  question: WhiteboardQuestionRecord;
  onDelete?: () => void;
}) {
  return (
    <section className="learning-selection-enhancement-question">
      <div>
        <strong>我的问题</strong>
        <span>{question.status === "answered"
          ? "已回答"
          : question.status === "pending"
            ? "正在准备回答"
            : "没有生成成功"}</span>
        {onDelete ? (
          <button
            type="button"
            className="learning-selection-enhancement-question-delete"
            onClick={onDelete}
            aria-label="删除这条辅助内容"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      <MarkdownContent
        text={question.text}
        className="learning-selection-markdown learning-selection-question-text"
      />
      <WhiteboardQuestionImage question={question} />
    </section>
  );
}

function SelectionPlot({
  artifact,
}: {
  artifact: SelectionEnhancementArtifact & {
    response: Extract<
      SelectionEnhancementArtifact["response"],
      { kind: "plot" }
    >;
  };
}) {
  const { expression, x_range: xRange, y_range: yRange } = artifact.response;
  const left = 24;
  const top = 12;
  const right = 276;
  const bottom = 150;
  const mapX = (value: number) =>
    left + (value - xRange.min) / (xRange.max - xRange.min) * (right - left);
  const mapY = (value: number) =>
    bottom - (value - yRange.min) / (yRange.max - yRange.min) * (bottom - top);
  let path = "";
  let error = "";
  try {
    path = plotPathData(
      artifact.response.plot_kind === "implicit"
        ? sampleImplicitPlotExpression(expression, xRange, yRange, {
            level: artifact.response.level,
            samples: artifact.response.samples,
          })
        : samplePlotExpression(expression, xRange, yRange),
      mapX,
      mapY,
    );
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "函数表达式无法绘制";
  }
  const xAxis = Math.min(bottom, Math.max(top, mapY(0)));
  const yAxis = Math.min(right, Math.max(left, mapX(0)));
  return (
    <div className="learning-selection-plot">
      {error ? (
        <span role="alert">{error}</span>
      ) : (
        <svg viewBox="0 0 300 164" aria-label={artifact.response.title}>
          <line x1={left} y1={xAxis} x2={right} y2={xAxis} />
          <line x1={yAxis} y1={top} x2={yAxis} y2={bottom} />
          <path d={path} />
        </svg>
      )}
      <code>
        {artifact.response.plot_kind === "implicit"
          ? `${expression} = ${artifact.response.level ?? 0}`
          : `y = ${expression}`}
      </code>
    </div>
  );
}

function SelectionScene3d({
  artifact,
}: {
  artifact: SelectionEnhancementArtifact & {
    response: Extract<
      SelectionEnhancementArtifact["response"],
      { kind: "scene3d" }
    >;
  };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    try {
      renderScene3d(
        container,
        {
          id: `selection-scene3d:${artifact.turn_id}`,
          kind: "scene3d",
          content: artifact.response.content,
        },
        undefined,
        {},
      );
    } catch (cause) {
      const message = container.ownerDocument.createElement("span");
      message.setAttribute("role", "alert");
      message.textContent = cause instanceof Error
        ? cause.message
        : "三维函数图无法显示";
      container.replaceChildren(message);
    }
    return () => container.replaceChildren();
  }, [artifact]);
  return (
    <div className="learning-selection-scene3d">
      <div ref={containerRef} />
    </div>
  );
}

export function SelectionEnhancementLayer({
  artifacts,
  sources,
  questions = [],
  currentDocumentVersion,
  cardLayouts = {},
  occupiedRects = [],
  visibleBoardBounds,
  currentSourceBoundsById,
  clientToBoardPoint,
  invalidTargetTurnIds = new Set(),
  onCardLayoutChange,
  onDelete,
}: {
  artifacts: SelectionEnhancementArtifact[];
  sources: InkSelectionSnapshot[];
  questions?: WhiteboardQuestionRecord[];
  currentDocumentVersion: number;
  cardLayouts?: Readonly<Record<string, SelectionEnhancementCardLayout>>;
  occupiedRects?: readonly WhiteboardRect[];
  visibleBoardBounds?: WhiteboardRect;
  currentSourceBoundsById?: ReadonlyMap<string, InkSelectionBounds>;
  clientToBoardPoint?: (point: { x: number; y: number }) => { x: number; y: number };
  invalidTargetTurnIds?: ReadonlySet<string>;
  onCardLayoutChange?: (
    turnId: string,
    layout: SelectionEnhancementCardLayout,
  ) => void;
  onDelete: (turnId: string) => void;
}) {
  const androidRuntime = document.documentElement.dataset.runtimePlatform === "android";
  const defaultCardScale = androidRuntime
    ? ANDROID_DEFAULT_CARD_SCALE
    : DEFAULT_CARD_SCALE;
  const [transientPositions, setTransientPositions] = useState<
    Readonly<Record<string, { x: number; y: number }>>
  >({});
  const [transientScales, setTransientScales] = useState<
    Readonly<Record<string, number>>
  >({});
  const [localLayouts, setLocalLayouts] = useState<
    Readonly<Record<string, SelectionEnhancementCardLayout>>
  >({});
  const [measuredCardHeights, setMeasuredCardHeights] = useState<
    Readonly<Record<string, number>>
  >({});
  const [draggingTurnId, setDraggingTurnId] = useState<string | null>(null);
  const cardElementsRef = useRef(new Map<string, HTMLElement>());
  const draggingCardRef = useRef<{
    turnId: string;
    pointerId: number;
    startPointer: { x: number; y: number };
    startPosition: { x: number; y: number };
    currentPosition: { x: number; y: number };
    layout: SelectionEnhancementCardLayout;
  } | null>(null);
  const resizingCardRef = useRef<{
    turnId: string;
    pointerId: number;
    startX: number;
    startY: number;
    startScale: number;
    layout: SelectionEnhancementCardLayout;
  } | null>(null);
  const persistLayout = (turnId: string, layout: SelectionEnhancementCardLayout) => {
    const next = {
      ...layout,
      scale: clampedCardScale(layout.scale),
    };
    setLocalLayouts((current) => ({ ...current, [turnId]: next }));
    onCardLayoutChange?.(turnId, next);
  };
  const updateCardScale = (
    turnId: string,
    layout: SelectionEnhancementCardLayout,
    scale: number,
  ) => {
    const nextScale = clampedCardScale(scale);
    setTransientScales((current) => ({ ...current, [turnId]: nextScale }));
    persistLayout(turnId, { ...layout, scale: nextScale });
  };
  const beginCardResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    turnId: string,
    layout: SelectionEnhancementCardLayout,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    resizingCardRef.current = {
      turnId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScale: layout.scale,
      layout,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const continueCardResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizingCardRef.current;
    if (
      !resize
      || resize.pointerId !== event.pointerId
      || !Number.isFinite(event.clientX)
      || !Number.isFinite(event.clientY)
    ) return;
    event.preventDefault();
    const diagonalMovement = (
      event.clientX - resize.startX + event.clientY - resize.startY
    ) / 2;
    const nextScale = clampedCardScale(
      resize.startScale + diagonalMovement / 220,
    );
    setTransientScales((current) => ({
      ...current,
      [resize.turnId]: nextScale,
    }));
  };
  const finishCardResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizingCardRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const scale = transientScales[resize.turnId] ?? resize.startScale;
    persistLayout(resize.turnId, { ...resize.layout, scale });
    resizingCardRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const resizeCardWithKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    turnId: string,
    layout: SelectionEnhancementCardLayout,
  ) => {
    if (["ArrowUp", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      updateCardScale(turnId, layout, layout.scale + .1);
    } else if (["ArrowDown", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      updateCardScale(turnId, layout, layout.scale - .1);
    } else if (event.key === "Home") {
      event.preventDefault();
      updateCardScale(turnId, layout, defaultCardScale);
    }
  };
  const beginCardDrag = (
    event: ReactPointerEvent<HTMLElement>,
    turnId: string,
    layout: SelectionEnhancementCardLayout,
  ) => {
    if (!clientToBoardPoint || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest([
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "model-viewer",
      ".learning-selection-markdown",
    ].join(","))) return;
    event.preventDefault();
    event.stopPropagation();
    draggingCardRef.current = {
      turnId,
      pointerId: event.pointerId,
      startPointer: clientToBoardPoint({ x: event.clientX, y: event.clientY }),
      startPosition: { x: layout.x, y: layout.y },
      currentPosition: { x: layout.x, y: layout.y },
      layout,
    };
    setDraggingTurnId(turnId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const continueCardDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = draggingCardRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !clientToBoardPoint) return;
    event.preventDefault();
    event.stopPropagation();
    const point = clientToBoardPoint({ x: event.clientX, y: event.clientY });
    const nextPosition = {
      x: drag.startPosition.x + point.x - drag.startPointer.x,
      y: drag.startPosition.y + point.y - drag.startPointer.y,
    };
    drag.currentPosition = nextPosition;
    setTransientPositions((current) => ({
      ...current,
      [drag.turnId]: nextPosition,
    }));
  };
  const finishCardDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = draggingCardRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (
      event.type === "pointerup"
      && clientToBoardPoint
      && Number.isFinite(event.clientX)
      && Number.isFinite(event.clientY)
    ) {
      const point = clientToBoardPoint({ x: event.clientX, y: event.clientY });
      drag.currentPosition = {
        x: drag.startPosition.x + point.x - drag.startPointer.x,
        y: drag.startPosition.y + point.y - drag.startPointer.y,
      };
    }
    persistLayout(drag.turnId, {
      ...drag.layout,
      ...drag.currentPosition,
      manually_positioned: true,
    });
    draggingCardRef.current = null;
    setDraggingTurnId(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  type LayoutItem =
    | { kind: "question"; key: string; question: WhiteboardQuestionRecord }
    | {
        kind: "artifact";
        key: string;
        artifact: SelectionEnhancementArtifact;
        question?: WhiteboardQuestionRecord;
      };
  const sourceById = new Map(sources.map((source) => [source.source_id, source]));
  const sourceBoundsFor = (sourceId: string | undefined) => sourceId
    ? currentSourceBoundsById?.get(sourceId) ?? sourceById.get(sourceId)?.bounds
    : undefined;
  const selectionQuestions = questions.filter((question) =>
    question.origin === "selection"
    && question.answerPresentation !== "lesson"
    && question.source
    && (
      question.status !== "pending"
      || question.answerPresentation === "card"
    ));
  const sourceIds = new Set([
    ...artifacts.map((artifact) => artifact.source.source_id),
    ...selectionQuestions.map((question) => question.source!.sourceId),
  ]);
  const artifactSourceById = new Map(artifacts.map((candidate) => [
    candidate.source.source_id,
    candidate.source,
  ]));
  const questionSourceById = new Map(selectionQuestions.map((question) => [
    question.source!.sourceId,
    question.source!.bounds,
  ]));
  const sourceGroups: Array<{
    sourceIds: Set<string>;
    identity?: string;
    documentId?: string;
    bounds: InkSelectionSnapshot["bounds"][];
    hasLocalSnapshot: boolean;
  }> = [];
  for (const sourceId of sourceIds) {
    const source = sourceById.get(sourceId);
    // A fresh rectangle/lasso capture receives a new source_id even when it
    // contains the same immutable strokes. Version 3 snapshots carry their
    // stable component IDs; older snapshots fall back to their captured SVG.
    // The gesture region is deliberately excluded so drawing a slightly
    // different rectangle around the same writing does not restart the card
    // stack at the same coordinates.
    const sourceIdentity = source?.component_ids?.length
      ? [...source.component_ids].sort().join("\u0000")
      : source?.svg;
    const artifactSource = artifactSourceById.get(sourceId);
    const documentId = source?.document_id ?? artifactSource?.document_id;
    const bounds = source?.bounds
      ?? questionSourceById.get(sourceId)
      ?? artifactSource?.bounds;
    const identity = source
      ? `${source.document_id}\u0000${sourceIdentity}`
      : undefined;
    const group = sourceGroups.find((candidate) => {
      if (identity && candidate.identity) return identity === candidate.identity;
      // Durable artifacts intentionally remain visible even when their
      // browser-local snapshots are unavailable after refresh. In that case,
      // recover their former stack from the document id and substantially
      // overlapping persisted bounds instead of treating every source_id as a
      // new lane at the same coordinates.
      if (source && candidate.hasLocalSnapshot) return false;
      if (
        documentId
        && candidate.documentId
        && documentId !== candidate.documentId
      ) return false;
      return Boolean(bounds && candidate.bounds.some((candidateBounds) =>
        boundsOverlapRatio(bounds, candidateBounds)
          >= RESTORED_SOURCE_OVERLAP_THRESHOLD));
    });
    if (group) {
      group.sourceIds.add(sourceId);
      if (bounds) group.bounds.push(bounds);
      group.hasLocalSnapshot ||= Boolean(source);
      group.identity ??= identity;
      group.documentId ??= documentId;
    } else {
      sourceGroups.push({
        sourceIds: new Set([sourceId]),
        identity,
        documentId,
        bounds: bounds ? [bounds] : [],
        hasLocalSnapshot: Boolean(source),
      });
    }
  }
  const layoutItems: Array<LayoutItem & {
    turnId: string;
    sourceId: string;
    sourceBounds: InkSelectionBounds;
    sourceConnected: boolean;
    layout: SelectionEnhancementCardLayout;
    width: number;
    estimatedHeight: number;
    needsPersistence: boolean;
  }> = [];
  const reserved: WhiteboardRect[] = [...occupiedRects];
  const placedCards: Array<WhiteboardRect & { automatic: boolean }> = [];
  const cardDragActive = draggingTurnId !== null;
  for (const { sourceIds: groupedSourceIds } of sourceGroups) {
    const sourceQuestions = selectionQuestions
      .filter((question) => groupedSourceIds.has(question.source!.sourceId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const sourceArtifacts = artifacts
      .filter((artifact) => groupedSourceIds.has(artifact.source.source_id))
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    const artifactByTurnId = new Map(sourceArtifacts.map((artifact) => [
      artifact.turn_id,
      artifact,
    ]));
    const ordered: LayoutItem[] = [];
    for (const question of sourceQuestions) {
      const matchingArtifact = artifactByTurnId.get(question.id);
      if (matchingArtifact) {
        ordered.push({
          kind: "artifact",
          key: `artifact:${matchingArtifact.turn_id}`,
          artifact: matchingArtifact,
          question,
        });
        artifactByTurnId.delete(question.id);
      } else {
        ordered.push({
          kind: "question",
          key: `question:${question.id}`,
          question,
        });
      }
    }
    for (const artifact of sourceArtifacts) {
      if (!artifactByTurnId.has(artifact.turn_id)) continue;
      ordered.push({
        kind: "artifact",
        key: `artifact:${artifact.turn_id}`,
        artifact,
      });
    }
    const fallbackBounds = [...groupedSourceIds]
      .flatMap((sourceId) => sourceById.get(sourceId)?.bounds ?? [])[0]
      ?? sourceQuestions[0]?.source?.bounds
      ?? sourceArtifacts[0]?.source.bounds;
    if (!fallbackBounds) continue;
    for (const item of ordered) {
      const turnId = item.kind === "question"
        ? item.question.id
        : item.artifact.turn_id;
      const sourceId = item.kind === "question"
        ? item.question.source!.sourceId
        : item.artifact.source.source_id;
      const currentSourceBounds = sourceBoundsFor(sourceId);
      const sourceBounds = currentSourceBounds ?? fallbackBounds;
      const persisted = localLayouts[turnId] ?? cardLayouts[turnId];
      const compactLegacyDefault = androidRuntime
        && persisted?.scale === PREVIOUS_ANDROID_DEFAULT_CARD_SCALE
        && !persisted.manually_positioned;
      const scale = transientScales[turnId]
        ?? (compactLegacyDefault ? defaultCardScale : persisted?.scale)
        ?? defaultCardScale;
      const minimized = persisted?.minimized ?? false;
      const width = minimized ? 26 : CARD_WIDTH * scale;
      const fallbackHeight = minimized
        ? 26
        : item.kind === "question"
          ? 210 * scale
          : (item.question ? 116 : 0) + (
              item.artifact.response.kind === "scene3d"
                ? 520
                : item.artifact.response.kind === "plot"
                  ? 410
                  : 300
            ) * scale;
      const estimatedHeight = minimized
        ? 26
        : measuredCardHeights[turnId] ?? fallbackHeight;
      const preferred = {
        x: sourceBounds.x + sourceBounds.width + 30,
        y: sourceBounds.y,
      };
      const transientPosition = transientPositions[turnId];
      const persistedRect = persisted ? {
        x: persisted.x,
        y: persisted.y,
        width,
        height: estimatedHeight,
      } : undefined;
      const repairAutomaticOverlap = Boolean(
        persistedRect
        && !transientPosition
        && !cardDragActive
        && !persisted?.manually_positioned
        && placedCards.some((card) =>
          card.automatic && cardRectsOverlap(persistedRect, card)),
      );
      const initialPosition = transientPosition
        ?? (persisted && !repairAutomaticOverlap
          ? { x: persisted.x, y: persisted.y }
          : findOpenWhiteboardPosition({
              preferred,
              width,
              height: estimatedHeight,
              occupied: reserved,
              gap: CARD_GAP,
              visibleBounds: visibleBoardBounds,
            }));
      const layout: SelectionEnhancementCardLayout = {
        x: initialPosition.x,
        y: initialPosition.y,
        scale,
        minimized,
        manually_positioned: persisted?.manually_positioned ?? false,
      };
      layoutItems.push({
        ...item,
        turnId,
        sourceId,
        sourceBounds,
        sourceConnected: Boolean(currentSourceBounds),
        layout,
        width,
        estimatedHeight,
        needsPersistence: !persisted || repairAutomaticOverlap || compactLegacyDefault,
      });
      const cardRect = {
        x: layout.x,
        y: layout.y,
        width,
        height: estimatedHeight,
      };
      reserved.push(cardRect);
      placedCards.push({
        ...cardRect,
        automatic: !layout.manually_positioned,
      });
    }
  }
  const measurementTargetsKey = layoutItems
    .map((item) => `${item.kind}:${item.turnId}:${item.layout.minimized}`)
    .join("|");
  useLayoutEffect(() => {
    const measure = () => {
      const heights: Record<string, number> = {};
      for (const item of layoutItems) {
        if (item.layout.minimized) continue;
        const height = cardElementsRef.current.get(item.turnId)?.offsetHeight ?? 0;
        if (height > 0 && Number.isFinite(height)) heights[item.turnId] = height;
      }
      if (Object.keys(heights).length === 0) return;
      setMeasuredCardHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const [turnId, height] of Object.entries(heights)) {
          if (current[turnId] === height) continue;
          next[turnId] = height;
          changed = true;
        }
        return changed ? next : current;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const item of layoutItems) {
      const element = cardElementsRef.current.get(item.turnId);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
    // Rebind only when a question card is replaced by its result card or a
    // card is minimized/restored. ResizeObserver handles content growth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementTargetsKey]);
  const initializationKey = layoutItems
    .filter((item) => item.needsPersistence)
    .map((item) => `${item.turnId}:${item.layout.x}:${item.layout.y}`)
    .join("|");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const item of layoutItems) {
        if (!item.needsPersistence) continue;
        persistLayout(item.turnId, item.layout);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // The compact key changes only when a card needs its first saved position
    // or an old automatic overlap needs one saved repair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializationKey, localLayouts, cardLayouts, onCardLayoutChange]);

  return (
    <>
      {layoutItems.map((item) => {
        if (item.kind === "question") {
          const failed = item.question.status === "failed";
          return (
            <article
              key={item.key}
              ref={(element) => {
                if (element) cardElementsRef.current.set(item.turnId, element);
                else cardElementsRef.current.delete(item.turnId);
              }}
              className={failed
                ? "learning-selection-enhancement is-failed"
                : "learning-selection-enhancement is-question-only"}
              style={{
                left: item.layout.x,
                top: item.layout.y,
                width: CARD_WIDTH * item.layout.scale,
                fontSize: CARD_FONT_SIZE * item.layout.scale,
              }}
              onPointerDown={(event) => beginCardDrag(
                event,
                item.turnId,
                item.layout,
              )}
              onPointerMove={continueCardDrag}
              onPointerUp={finishCardDrag}
              onPointerCancel={finishCardDrag}
              data-source-id={item.question.source?.sourceId}
              data-question-id={item.question.id}
              data-card-x={item.layout.x}
              data-card-y={item.layout.y}
            >
              {item.sourceConnected ? (
                <SelectionSourceLink
                  sourceId={item.sourceId}
                  sourceBounds={item.sourceBounds}
                  cardLeft={item.layout.x}
                  cardTop={item.layout.y}
                  cardWidth={CARD_WIDTH * item.layout.scale}
                  cardHeight={item.estimatedHeight}
                />
              ) : null}
              <SelectionQuestionSection
                question={item.question}
                onDelete={() => onDelete(item.turnId)}
              />
              {failed || item.question.status === "pending" ? (
                <>
                  <header>
                    <div>
                      <span>小章鱼辅助</span>
                      <small>来自当前选区</small>
                    </div>
                  </header>
                  <div
                    className="learning-selection-enhancement-content learning-selection-enhancement-placeholder"
                    role={failed ? "alert" : "status"}
                    aria-live="polite"
                  >
                    <strong>{failed
                      ? "回答生成失败"
                      : "正在生成小章鱼辅助"}</strong>
                    <p>{failed
                      ? item.question.error ?? "选区辅助内容生成失败，请重试"
                      : "正在理解这部分内容，完成后会在这里展示。"}</p>
                    {!failed ? <span aria-hidden="true" /> : null}
                  </div>
                </>
              ) : null}
            </article>
          );
        }
        const artifact = item.artifact;
        const question = item.question;
        const sourceMissing = !sourceById.has(artifact.source.source_id);
        const stale = currentDocumentVersion > artifact.source.document_version;
        const targetInvalid = invalidTargetTurnIds.has(artifact.turn_id);
        const minimized = item.layout.minimized;
        const cardScale = item.layout.scale;
        if (minimized) {
          return (
            <button
              key={artifact.turn_id}
              type="button"
              className={targetInvalid
                ? "learning-selection-enhancement-pin is-invalid-target"
                : "learning-selection-enhancement-pin"}
              style={{
                left: item.layout.x,
                top: item.layout.y + 8,
              }}
              data-source-id={artifact.source.source_id}
              data-enhancement-id={artifact.turn_id}
              data-card-x={item.layout.x}
              data-card-y={item.layout.y}
              onClick={() => {
                persistLayout(artifact.turn_id, {
                  ...item.layout,
                  minimized: false,
                });
              }}
              aria-label={question
                ? `展开问题和小章鱼辅助：${artifact.response.title}`
                : `展开小章鱼辅助：${artifact.response.title}`}
              title={`展开：${artifact.response.title}`}
            >
              {item.sourceConnected ? (
                <SelectionSourceLink
                  sourceId={item.sourceId}
                  sourceBounds={item.sourceBounds}
                  cardLeft={item.layout.x}
                  cardTop={item.layout.y + 8}
                  cardWidth={26}
                  cardHeight={26}
                />
              ) : null}
              ?
            </button>
          );
        }
        return (
          <article
            key={artifact.turn_id}
            ref={(element) => {
              if (element) cardElementsRef.current.set(item.turnId, element);
              else cardElementsRef.current.delete(item.turnId);
            }}
            className={targetInvalid
              ? "learning-selection-enhancement is-invalid-target"
              : "learning-selection-enhancement"}
            style={{
              left: item.layout.x,
              top: item.layout.y,
              width: CARD_WIDTH * cardScale,
              fontSize: CARD_FONT_SIZE * cardScale,
              "--learning-selection-scene3d-height":
                `${SCENE3D_HEIGHT * cardScale}px`,
            } as CSSProperties}
            data-source-id={artifact.source.source_id}
            data-question-id={question?.id}
            data-enhancement-id={artifact.turn_id}
            data-card-scale={cardScale.toFixed(2)}
            data-card-x={item.layout.x}
            data-card-y={item.layout.y}
            onPointerDown={(event) => beginCardDrag(
              event,
              item.turnId,
              item.layout,
            )}
            onPointerMove={continueCardDrag}
            onPointerUp={finishCardDrag}
            onPointerCancel={finishCardDrag}
          >
            {item.sourceConnected ? (
              <SelectionSourceLink
                sourceId={item.sourceId}
                sourceBounds={item.sourceBounds}
                cardLeft={item.layout.x}
                cardTop={item.layout.y}
                cardWidth={CARD_WIDTH * cardScale}
                cardHeight={item.estimatedHeight}
              />
            ) : null}
            {question ? <SelectionQuestionSection question={question} /> : null}
            <header>
              <div>
                <span>小章鱼辅助</span>
                <small>
                  {targetInvalid
                    ? "引用的白板对象已失效，请重新选择"
                    : sourceMissing
                      ? "原选区快照已不在本浏览器，保留生成结果"
                    : stale
                      ? "基于较早版本的原稿"
                      : "来自当前选区"}
                </small>
              </div>
              <div className="learning-selection-enhancement-actions">
                <button
                  type="button"
                  onClick={() => {
                    persistLayout(artifact.turn_id, {
                      ...item.layout,
                      minimized: true,
                    });
                  }}
                  aria-label={question
                    ? "最小化问题和辅助内容"
                    : "最小化这条辅助内容"}
                  title="最小化"
                >
                  <Minimize2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(artifact.turn_id)}
                  aria-label="删除这条辅助内容"
                  title="删除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </header>
            <div className="learning-selection-enhancement-content">
              <MarkdownContent
                text={artifact.response.title}
                className="learning-selection-markdown learning-selection-result-title"
              />
              <MarkdownContent
                text={artifact.response.text}
                className="learning-selection-markdown learning-selection-result-text"
              />
              {artifact.response.kind === "explanation"
                && artifact.response.items?.length ? (
                  <ul>
                    {artifact.response.items.map((item) => (
                      <li key={item}>
                        <MarkdownContent
                          text={item}
                          className="learning-selection-markdown"
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              {artifact.response.kind === "plot" ? (
                <SelectionPlot
                  artifact={artifact as SelectionEnhancementArtifact & {
                    response: Extract<
                      SelectionEnhancementArtifact["response"],
                      { kind: "plot" }
                    >;
                  }}
                />
              ) : null}
              {artifact.response.kind === "scene3d" ? (
                <SelectionScene3d
                  artifact={artifact as SelectionEnhancementArtifact & {
                    response: Extract<
                      SelectionEnhancementArtifact["response"],
                      { kind: "scene3d" }
                    >;
                  }}
                />
              ) : null}
              {artifact.response.kind === "unsupported" ? (
                <div
                  className="learning-selection-unsupported"
                  role="alert"
                >
                  <strong>当前无法生成这个图像</strong>
                  {artifact.response.alternatives?.length ? (
                    <ul>
                      {artifact.response.alternatives.map((alternative) => (
                        <li key={alternative}>
                          <MarkdownContent
                            text={alternative}
                            className="learning-selection-markdown"
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <footer>
                <span>系统理解：</span>
                <MarkdownContent
                  text={artifact.interpretation.content || "未能可靠识别"}
                  className="learning-selection-markdown"
                />
              </footer>
            </div>
            <button
              type="button"
              className="learning-selection-enhancement-resize"
              onPointerDown={(event) => beginCardResize(
                event,
                artifact.turn_id,
                item.layout,
              )}
              onPointerMove={continueCardResize}
              onPointerUp={finishCardResize}
              onPointerCancel={finishCardResize}
              onLostPointerCapture={() => {
                if (resizingCardRef.current?.turnId === artifact.turn_id) {
                  resizingCardRef.current = null;
                }
              }}
              onDoubleClick={() => updateCardScale(
                artifact.turn_id,
                item.layout,
                defaultCardScale,
              )}
              onKeyDown={(event) => resizeCardWithKeyboard(
                event,
                artifact.turn_id,
                item.layout,
              )}
              aria-label={`调整辅助卡片大小，当前 ${Math.round(cardScale * 100)}%`}
              title="拖动放大或缩小；双击恢复原始大小"
            >
              <span aria-hidden="true" />
            </button>
          </article>
        );
      })}
    </>
  );
}
