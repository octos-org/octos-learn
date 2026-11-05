// The Add panel of the recording dock: what to put on the board, its settings,
// and for a graph, grid, unit circle or box, where it goes: on a new row, or
// next to a card of the current row so it sits beside what it explains.

import { tr } from "@/i18n";
import { Box, Circle, Grid3x3, LineChart, Spline, Square } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { RowCard } from "./board-rows";
import type { ComponentInsert, LearnerRecording } from "./recording";
import { gridPoints, gridRanges, isFigure, lineLabel, nextComponentAlias, nextPointLabel, nextVariable, recordingVariables, type InsertForm } from "./studio-helpers";


function numberField(value: string): number | undefined {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : undefined;
}

export function AddPanel({ recording, grids, row, nextTo, onNextTo, form, onForm, onInsert, onPoint, onLine }: {
  recording: LearnerRecording;
  grids: string[];
  /** Cards of the current row a figure can go next to. */
  row: RowCard[];
  nextTo: string | null;
  onNextTo: (alias: string | null) => void;
  form: InsertForm | null;
  onForm: (form: InsertForm | null) => void;
  onInsert: (component: ComponentInsert) => void;
  onPoint: (point: { node: string; point: string; x: number; y: number; label: string }) => void;
  onLine: (line: { node: string; from: string; to: string; alias: string }) => void;
}) {
  const kinds: Array<[InsertForm, string, typeof LineChart]> = [
    ["graph", tr("函数图"), LineChart], ["coordinate_grid", tr("坐标网格"), Grid3x3], ["unit_circle", tr("单位圆"), Circle], ["solid_3d", tr("长方体"), Box],
    ...(grids.length ? [["point", tr("放一个点"), Square] as [InsertForm, string, typeof LineChart]] : []),
    ...([...gridPoints(recording).values()].some((points) => points.length >= 2) ? [["line", tr("过两点画直线"), Spline] as [InsertForm, string, typeof LineChart]] : []),
  ];
  const placement = (
    <fieldset className="teach-next-to">
      <legend className="teach-group-label">{tr("放在旁边…")}</legend>
      <label className="teach-place">
        <input type="radio" name="teach-next-to" checked={nextTo === null} onChange={() => onNextTo(null)} />
        <span>{tr("放在新的一行")}</span>
      </label>
      {row.map((card) => (
        <label key={card.alias} className="teach-place">
          <input type="radio" name="teach-next-to" checked={nextTo === card.alias} onChange={() => onNextTo(card.alias)} />
          <span className="teach-place-label">{card.label}</span>
          <span className="teach-place-card">{tr("第 {{v0}} 张", { v0: card.card })}</span>
        </label>
      ))}
      {row.length > 0 && <p className="academy-muted">{tr("也可以直接在白板上点那张卡片。")}</p>}
    </fieldset>
  );
  return (
    <div className="teach-add" role="dialog" aria-label={tr("放到白板上")}>
      <div className="teach-group-label">{tr("放入")}</div>
      <div className="teach-add-kinds" role="group" aria-label={tr("放入组件")}>
        {kinds.map(([value, label, Icon]) => (
          <button key={value} type="button" aria-pressed={form === value} onClick={() => onForm(form === value ? null : value)}><Icon size={18} aria-hidden="true" />{label}</button>
        ))}
      </div>
      {form && (
        <InsertPanel
          key={form}
          form={form}
          recording={recording}
          grids={grids}
          placement={placement}
          onInsert={(component) => onInsert(nextTo && isFigure(form) ? { ...component, nextTo } : component)}
          onPoint={onPoint}
          onLine={onLine}
        />
      )}
    </div>
  );
}

function InsertPanel({
  form, recording, grids, placement, onInsert, onPoint, onLine,
}: {
  form: InsertForm;
  /** "Put it next to…", shown before the button of a form that adds a figure. */
  placement: ReactNode;
  recording: LearnerRecording;
  grids: string[];
  onInsert: (component: ComponentInsert) => void;
  onPoint: (point: { node: string; point: string; x: number; y: number; label: string }) => void;
  onLine: (line: { node: string; from: string; to: string; alias: string }) => void;
}) {
  const [expression, setExpression] = useState("2*x");
  const [range, setRange] = useState({ xMin: "-5", xMax: "5", yMin: "-5", yMax: "5" });
  const [size, setSize] = useState({ x: "4", y: "3", z: "2" });
  const [point, setPoint] = useState({ node: grids.at(-1) ?? "", x: "", y: "" });
  const variables = recordingVariables(recording);
  const [linked, setLinked] = useState("");
  const axes = (): { x: [number, number]; y: [number, number] } | undefined => {
    const [xMin, xMax, yMin, yMax] = [range.xMin, range.xMax, range.yMin, range.yMax].map(numberField);
    if ([xMin, xMax, yMin, yMax].some((value) => value === undefined) || xMin! >= xMax! || yMin! >= yMax!) return undefined;
    return { x: [xMin!, xMax!], y: [yMin!, yMax!] };
  };
  const rangeFields = (
    <div className="teach-range" role="group" aria-label={tr("坐标范围")}>
      {(["xMin", "xMax", "yMin", "yMax"] as const).map((field) => (
        <label key={field}>{{ xMin: tr("x 从"), xMax: tr("x 到"), yMin: tr("y 从"), yMax: tr("y 到") }[field]}
          <input className="teach-input" inputMode="decimal" value={range[field]} onChange={(event) => setRange({ ...range, [field]: event.target.value })} />
        </label>
      ))}
    </div>
  );

  if (form === "graph") {
    const ready = axes();
    return (
      <form className="teach-step" onSubmit={(event) => {
        event.preventDefault();
        if (ready && expression.trim()) onInsert({ panel: "graph", alias: nextComponentAlias(recording, "graph"), expression: expression.trim(), ...ready, ...(linked ? { linkedVariable: linked } : {}) });
      }}>
        <label className="teach-label">{tr("函数 y =")}<input className="teach-input" value={expression} onChange={(event) => setExpression(event.target.value)} /></label>
        {rangeFields}
        {variables.length > 0 && (
          <label className="teach-label">{tr("和单位圆的角度联动")}
            <select className="teach-input" value={linked} onChange={(event) => setLinked(event.target.value)}>
              <option value="">{tr("不联动")}</option>
              {variables.map((variable) => {
                const at = recording.cards.findIndex((card) => card.takes.some((take) => take.events.some((event) => event.type === "component.insert" && event.panel === "unit_circle" && event.variable === variable)));
                return <option key={variable} value={variable}>{at < 0 ? "θ" : tr("θ（第 {{v0}} 张的单位圆）", { v0: at + 1 })}</option>;
              })}
            </select>
          </label>
        )}
        {placement}
        <button type="submit" disabled={!ready || !expression.trim()}>{tr("放到白板上")}</button>
      </form>
    );
  }
  if (form === "coordinate_grid") {
    const ready = axes();
    return (
      <form className="teach-step" onSubmit={(event) => { event.preventDefault(); if (ready) onInsert({ panel: "coordinate_grid", alias: nextComponentAlias(recording, "grid"), ...ready }); }}>
        {rangeFields}
        {placement}
        <button type="submit" disabled={!ready}>{tr("放到白板上")}</button>
      </form>
    );
  }
  if (form === "unit_circle") {
    return (
      <form className="teach-step" onSubmit={(event) => { event.preventDefault(); onInsert({ panel: "unit_circle", alias: nextComponentAlias(recording, "unit-circle"), variable: nextVariable(recording) }); }}>
        <p className="academy-muted">{tr("单位圆带一个角度滑杆，拖动圆上的点也能改角度。")}</p>
        {placement}
        <button type="submit">{tr("放到白板上")}</button>
      </form>
    );
  }
  if (form === "solid_3d") {
    const values = [size.x, size.y, size.z].map(numberField);
    const ready = values.every((value) => value !== undefined && value > 0);
    return (
      <form className="teach-step" onSubmit={(event) => {
        event.preventDefault();
        if (ready) onInsert({ panel: "solid_3d", alias: nextComponentAlias(recording, "box"), shape: "box", size: { x: values[0]!, y: values[1]!, z: values[2]! } });
      }}>
        <div className="teach-range" role="group" aria-label={tr("长方体尺寸")}>
          {(["x", "y", "z"] as const).map((axis) => (
            <label key={axis}>{{ x: tr("长"), y: tr("宽"), z: tr("高") }[axis]}
              <input className="teach-input" inputMode="decimal" value={size[axis]} onChange={(event) => setSize({ ...size, [axis]: event.target.value })} />
            </label>
          ))}
        </div>
        {placement}
        <button type="submit" disabled={!ready}>{tr("放到白板上")}</button>
      </form>
    );
  }
  if (form === "line") return <LineForm recording={recording} onLine={onLine} />;
  const [x, y] = [numberField(point.x), numberField(point.y)];
  const label = point.node ? nextPointLabel(recording, point.node) : undefined;
  const gridRange = gridRanges(recording).get(point.node);
  const outside = gridRange && x !== undefined && y !== undefined
    && (x < gridRange.x[0] || x > gridRange.x[1] || y < gridRange.y[0] || y > gridRange.y[1]);
  return (
    <form className="teach-step" onSubmit={(event) => {
      event.preventDefault();
      if (label && x !== undefined && y !== undefined && !outside) onPoint({ node: point.node, point: label.point, x, y, label: `${label.label} (${x}, ${y})` });
    }}>
      {grids.length > 1 && (
        <label className="teach-label">{tr("放在哪个网格")}
          <select className="teach-input" value={point.node} onChange={(event) => setPoint({ ...point, node: event.target.value })}>
            {grids.map((grid) => <option key={grid} value={grid}>{grid}</option>)}
          </select>
        </label>
      )}
      <div className="teach-range" role="group" aria-label={tr("点的坐标")}>
        <label>x<input className="teach-input" inputMode="decimal" value={point.x} onChange={(event) => setPoint({ ...point, x: event.target.value })} /></label>
        <label>y<input className="teach-input" inputMode="decimal" value={point.y} onChange={(event) => setPoint({ ...point, y: event.target.value })} /></label>
      </div>
      {label && <p className="academy-muted">{tr("这个点叫 {{v0}}", { v0: label.label })}</p>}
      {outside && gridRange && (
        <p role="alert">{tr("这个点在网格外面：x 从 {{v0}} 到 {{v1}}，y 从 {{v2}} 到 {{v3}}。", { v0: gridRange.x[0], v1: gridRange.x[1], v2: gridRange.y[0], v3: gridRange.y[1] })}</p>
      )}
      <button type="submit" disabled={!label || x === undefined || y === undefined || outside}>{tr("放到白板上")}</button>
    </form>
  );
}

function LineForm({ recording, onLine }: {
  recording: LearnerRecording;
  onLine: (line: { node: string; from: string; to: string; alias: string }) => void;
}) {
  const all = [...gridPoints(recording).entries()].filter(([, points]) => points.length >= 2);
  const [grid, setGrid] = useState(all.at(-1)?.[0] ?? "");
  const points = gridPoints(recording).get(grid) ?? [];
  const [first, setFirst] = useState(points[0]?.point ?? "");
  const [second, setSecond] = useState(points[1]?.point ?? "");
  const a = points.find((candidate) => candidate.point === first);
  const b = points.find((candidate) => candidate.point === second);
  const ready = Boolean(a && b && (a.x !== b.x || a.y !== b.y));
  const choose = (value: string, set: (value: string) => void) => (
    <select className="teach-input" value={value} onChange={(event) => set(event.target.value)}>
      {points.map((candidate) => <option key={candidate.point} value={candidate.point}>{candidate.label}</option>)}
    </select>
  );
  return (
    <form className="teach-step" onSubmit={(event) => {
      event.preventDefault();
      if (ready) onLine({ node: grid, from: first, to: second, alias: nextComponentAlias(recording, "line") });
    }}>
      {all.length > 1 && (
        <label className="teach-label">{tr("用哪个网格的点")}
          <select className="teach-input" value={grid} onChange={(event) => setGrid(event.target.value)}>
            {all.map(([alias]) => <option key={alias} value={alias}>{alias}</option>)}
          </select>
        </label>
      )}
      <div className="teach-range" role="group" aria-label={tr("直线经过的两点")}>
        {choose(first, setFirst)}
        {choose(second, setSecond)}
      </div>
      {ready && <p className="academy-muted">{tr("在网格上画出 {{v0}}", { v0: lineLabel(a!, b!) })}</p>}
      {a && b && !ready && <p role="alert">{tr("请选两个不同的点。")}</p>}
      <button type="submit" disabled={!ready}>{tr("画在网格上")}</button>
    </form>
  );
}

