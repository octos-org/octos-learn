import { Minimize2, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  plotPathData,
  samplePlotExpression,
} from "octos-lesson-language/web-runtime";
import type { InkSelectionSnapshot } from "octos-lesson-language/ink-runtime";
import type { SelectionEnhancementArtifact } from "./selection-enhancements";

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
      samplePlotExpression(expression, xRange, yRange),
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
      <code>y = {expression}</code>
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
            style={{ left, top }}
            data-source-id={artifact.source.source_id}
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
              <footer>
                系统理解：{artifact.interpretation.content || "未能可靠识别"}
              </footer>
            </div>
          </article>
        );
      })}
    </>
  );
}
