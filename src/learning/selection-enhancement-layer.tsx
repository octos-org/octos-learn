import { Minimize2, Trash2 } from "lucide-react";
import {
  useEffect,
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
import type { InkSelectionSnapshot } from "octos-lesson-language/ink-runtime";
import type { SelectionEnhancementArtifact } from "./selection-enhancements";

const DEFAULT_CARD_SCALE = 1;
const MIN_CARD_SCALE = .85;
const MAX_CARD_SCALE = 2.25;
const CARD_WIDTH = 330;
const CARD_FONT_SIZE = 13;
const SCENE3D_HEIGHT = 270;

function clampedCardScale(value: number): number {
  return Math.min(MAX_CARD_SCALE, Math.max(MIN_CARD_SCALE, value));
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
  currentDocumentVersion,
  invalidTargetTurnIds = new Set(),
  onDelete,
}: {
  artifacts: SelectionEnhancementArtifact[];
  sources: InkSelectionSnapshot[];
  currentDocumentVersion: number;
  invalidTargetTurnIds?: ReadonlySet<string>;
  onDelete: (turnId: string) => void;
}) {
  const [minimizedTurnIds, setMinimizedTurnIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [cardScaleByTurnId, setCardScaleByTurnId] = useState<
    Readonly<Record<string, number>>
  >({});
  const resizingCardRef = useRef<{
    turnId: string;
    pointerId: number;
    startX: number;
    startY: number;
    startScale: number;
  } | null>(null);
  const updateCardScale = (turnId: string, scale: number) => {
    setCardScaleByTurnId((current) => ({
      ...current,
      [turnId]: clampedCardScale(scale),
    }));
  };
  const beginCardResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    turnId: string,
    startScale: number,
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
      startScale,
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
    updateCardScale(
      resize.turnId,
      resize.startScale + diagonalMovement / 220,
    );
  };
  const finishCardResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizingCardRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizingCardRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const resizeCardWithKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    turnId: string,
    currentScale: number,
  ) => {
    if (["ArrowUp", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      updateCardScale(turnId, currentScale + .1);
    } else if (["ArrowDown", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      updateCardScale(turnId, currentScale - .1);
    } else if (event.key === "Home") {
      event.preventDefault();
      updateCardScale(turnId, DEFAULT_CARD_SCALE);
    }
  };
  const sourceById = new Map(sources.map((source) => [source.source_id, source]));
  const enhancementCountBySource = new Map<string, number>();
  return (
    <>
      {artifacts.map((artifact) => {
        const source = sourceById.get(artifact.source.source_id);
        const bounds = source?.bounds ?? artifact.source.bounds;
        const stale = currentDocumentVersion > artifact.source.document_version;
        const targetInvalid = invalidTargetTurnIds.has(artifact.turn_id);
        const sourceIndex = enhancementCountBySource.get(
          artifact.source.source_id,
        ) ?? 0;
        enhancementCountBySource.set(
          artifact.source.source_id,
          sourceIndex + 1,
        );
        const left = bounds.x + bounds.width + 30 + sourceIndex * 22;
        const top = bounds.y + sourceIndex * 26;
        const minimized = minimizedTurnIds.has(artifact.turn_id);
        const cardScale = cardScaleByTurnId[artifact.turn_id]
          ?? DEFAULT_CARD_SCALE;
        if (minimized) {
          return (
            <button
              key={artifact.turn_id}
              type="button"
              className={targetInvalid
                ? "learning-selection-enhancement-pin is-invalid-target"
                : "learning-selection-enhancement-pin"}
              style={{
                left: bounds.x + bounds.width + 12 + sourceIndex * 12,
                top: bounds.y + 8 + sourceIndex * 42,
              }}
              data-source-id={artifact.source.source_id}
              onClick={() => {
                setMinimizedTurnIds((current) => {
                  const next = new Set(current);
                  next.delete(artifact.turn_id);
                  return next;
                });
              }}
              aria-label={`展开小章鱼辅助：${artifact.response.title}`}
              title={`展开：${artifact.response.title}`}
            >
              ?
            </button>
          );
        }
        return (
          <article
            key={artifact.turn_id}
            className={targetInvalid
              ? "learning-selection-enhancement is-invalid-target"
              : "learning-selection-enhancement"}
            style={{
              left,
              top,
              width: CARD_WIDTH * cardScale,
              fontSize: CARD_FONT_SIZE * cardScale,
              "--learning-selection-scene3d-height":
                `${SCENE3D_HEIGHT * cardScale}px`,
            } as CSSProperties}
            data-source-id={artifact.source.source_id}
            data-card-scale={cardScale.toFixed(2)}
          >
            <div className="learning-selection-source-link" aria-hidden="true" />
            <header>
              <div>
                <span>小章鱼辅助</span>
                <small>
                  {targetInvalid
                    ? "引用的白板对象已失效，请重新选择"
                    : stale
                      ? "基于较早版本的原稿"
                      : "来自当前选区"}
                </small>
              </div>
              <div className="learning-selection-enhancement-actions">
                <button
                  type="button"
                  onClick={() => {
                    setMinimizedTurnIds((current) => {
                      const next = new Set(current);
                      next.add(artifact.turn_id);
                      return next;
                    });
                  }}
                  aria-label="最小化这条辅助内容"
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
              <strong>{artifact.response.title}</strong>
              <p>{artifact.response.text}</p>
              {artifact.response.kind === "explanation"
                && artifact.response.items?.length ? (
                  <ul>
                    {artifact.response.items.map((item) => (
                      <li key={item}>{item}</li>
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
                        <li key={alternative}>{alternative}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <footer>
                系统理解：{artifact.interpretation.content || "未能可靠识别"}
              </footer>
            </div>
            <button
              type="button"
              className="learning-selection-enhancement-resize"
              onPointerDown={(event) => beginCardResize(
                event,
                artifact.turn_id,
                cardScale,
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
                DEFAULT_CARD_SCALE,
              )}
              onKeyDown={(event) => resizeCardWithKeyboard(
                event,
                artifact.turn_id,
                cardScale,
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
