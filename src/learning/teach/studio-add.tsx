// The Add panel of the recording dock: what to put on the board, its settings,
// and for a graph, grid, unit circle or box, where it goes: on a new row, or
// next to a card of the current row so it sits beside what it explains.

import { tr } from "@/i18n";
import { BookOpen, Box, Check, MoveHorizontal, ChevronLeft, Circle, CircleAlert, CircleDot, Gauge, Grid3x3, Hexagon, LineChart, ListChecks, Minus, MessageSquareText, Plus, Repeat, Spline, Square, StickyNote, Table2, Workflow, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEventHandler, type ReactNode } from "react";
import { niceAxisMax } from "octos-lesson-language/plugin-physics";
import { MAX_MOTION_SPEED, MAX_MOTION_TIME, NUMBER_LINE_SUBDIVISIONS, numberLinePanelProblem } from "./compile-recording";

import type { RowCard } from "./board-rows";
import { entryLetters, parseGraphEntry } from "./graph-entry";
import { baseCorners, solidUnfolds, type ComponentInsert, type GraphParameter, type LearnerRecording, type NoteRole, type Solid, type SolidBase, type SolidShape } from "./recording";
import { SolidThumbnail, type SolidChoice } from "./solid-thumbnail";
import { graphParameterLetters, gridPoints, gridRanges, isFigure, lineLabel, nextComponentAlias, nextParameterVariable, nextPointLabel, nextVariable, recordingVariableInfo, solidName, compositeName, type InsertForm } from "./studio-helpers";


function numberField(value: string): number | undefined {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : undefined;
}

/** A circle or a segment drawn on a coordinate grid. */
export type GridShape = { type: "geometry.circle"; node: string; center: string; radius: number; alias: string }
  | { type: "geometry.segment"; node: string; from: string; to: string; alias: string };

export function AddPanel({ recording, grids, row, nextTo, onNextTo, form, onForm, onClose, onInsert, onPoint, onLine, onShape, said }: {
  onShape: (shape: GridShape) => void;
  recording: LearnerRecording;
  /** The last sentence the learner said in this take, to put on the board as words. */
  said?: string;
  grids: string[];
  /** Cards of the current row a figure can go next to. */
  row: RowCard[];
  nextTo: string | null;
  onNextTo: (alias: string | null) => void;
  form: InsertForm | null;
  onForm: (form: InsertForm | null) => void;
  onClose: () => void;
  onInsert: (component: ComponentInsert) => void;
  onPoint: (point: { node: string; point: string; x: number; y: number; label: string }) => void;
  onLine: (line: { node: string; from: string; to: string; alias: string }) => void;
}) {
  const entryButtons = useRef(new Map<InsertForm, HTMLButtonElement>());
  const back = useRef<HTMLButtonElement>(null);
  const previous = useRef<InsertForm | null>(null);
  useEffect(() => {
    if (form) back.current?.focus({ preventScroll: true });
    else entryButtons.current.get(previous.current ?? "text")?.focus();
    previous.current = form;
  }, [form]);

  type Entry = [InsertForm, string, typeof LineChart];
  const pointsByGrid = [...gridPoints(recording).values()];
  const hasPoint = pointsByGrid.some((points) => points.length > 0);
  const hasTwoPoints = pointsByGrid.some((points) => points.length >= 2);
  const groups: Array<[string, Entry[]]> = [
    [tr("文字与图示"), [["text", tr("文字"), MessageSquareText], ["note", tr("提示"), StickyNote], ["table", tr("表格"), Table2], ["diagram", tr("图示"), Workflow]]],
    [tr("数学图形"), [["graph", tr("函数图"), LineChart], ["coordinate_grid", tr("坐标网格"), Grid3x3], ["unit_circle", tr("单位圆"), Circle], ["polygon", tr("正多边形"), Hexagon], ["solid_3d", tr("立体"), Box], ["number_line", tr("数轴"), MoveHorizontal]]],
    [tr("物理"), [["constant_speed", tr("匀速运动"), Gauge]]],
    [tr("在网格上绘制"), [
      ...(grids.length ? [["point", tr("放一个点"), Square] as Entry] : []),
      ...(hasTwoPoints ? [["line", tr("过两点画直线"), Spline] as Entry, ["segment", tr("连线段"), Minus] as Entry] : []),
      ...(hasPoint ? [["circle", tr("画圆"), CircleDot] as Entry] : []),
    ]],
  ];
  const selected = groups.flatMap(([, entries]) => entries).find(([value]) => value === form);
  const title = selected?.[1] ?? tr("放入");
  const Icon = selected?.[2] ?? Plus;
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
    <div className={`teach-add teach-insert${form === "solid_3d" ? " teach-add-solid" : ""}`} role="dialog" aria-label={title}>
      <header className="teach-insert-header">
        {form && <button ref={back} type="button" aria-label={tr("返回放入列表")} onClick={() => onForm(null)}><ChevronLeft size={17} aria-hidden="true" />{tr("放入")}</button>}
        <h2><Icon size={19} aria-hidden="true" />{title}</h2>
        <button type="button" aria-label={tr("关闭")} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      {form === "solid_3d" ? (
        <SolidForm recording={recording} placement={placement} onInsert={(component) => onInsert(nextTo ? { ...component, nextTo } : component)} />
      ) : form ? (
        <InsertPanel
          key={form}
          form={form}
          recording={recording}
          grids={grids}
          placement={placement}
          onInsert={(component) => onInsert(nextTo && isFigure(form) ? { ...component, nextTo } : component)}
          onPoint={onPoint}
          onLine={onLine}
          onShape={onShape}
          {...(said ? { said } : {})}
        />
      ) : (
        <div className="teach-insert-body teach-insert-library">
          {groups.filter(([, entries]) => entries.length > 0).map(([name, entries]) => (
            <section key={name} aria-label={name}>
              <h3>{name}</h3>
              <div className="teach-add-kinds">
                {entries.map(([value, label, EntryIcon]) => (
                  <button ref={(button) => {
                    if (button) entryButtons.current.set(value, button);
                    else entryButtons.current.delete(value);
                  }} key={value} type="button" onClick={() => onForm(value)}><EntryIcon size={20} aria-hidden="true" />{label}</button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function InsertSheet({ onSubmit, disabled, action = tr("放到白板上"), summary, columns = false, children }: {
  onSubmit: FormEventHandler<HTMLFormElement>;
  disabled?: boolean;
  action?: string;
  summary?: ReactNode;
  columns?: boolean;
  children: ReactNode;
}) {
  return (
    <form className="teach-step teach-insert-form" onSubmit={onSubmit}>
      <div className={`teach-insert-body${columns ? " teach-solid-body" : ""}`}>{children}</div>
      <footer className="teach-insert-footer">
        {summary}
        <button type="submit" disabled={disabled}><Plus size={16} aria-hidden="true" />{action}</button>
      </footer>
    </form>
  );
}

function InsertPanel({
  form, recording, grids, placement, onInsert, onPoint, onLine, onShape, said,
}: {
  form: Exclude<InsertForm, "solid_3d">;
  said?: string;
  onShape: (shape: GridShape) => void;
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

  const [point, setPoint] = useState({ node: grids.at(-1) ?? "", x: "", y: "" });
  // A graph can follow a unit circle's angle (not another graph's slider).
  const variables = recordingVariableInfo(recording).filter((variable) => variable.angle).map((variable) => variable.variable);
  const [linked, setLinked] = useState("");
  // Each letter of the graph's expression is a slider, with where it starts and its range.
  const [sliders, setSliders] = useState<Record<string, { initial: string; min: string; max: string }>>({});
  const axes = ((): { x: [number, number]; y: [number, number] } | undefined => {
    const [xMin, xMax, yMin, yMax] = [range.xMin, range.xMax, range.yMin, range.yMax].map(numberField);
    if (xMin === undefined || xMax === undefined || yMin === undefined || yMax === undefined || xMin >= xMax || yMin >= yMax) return undefined;
    return { x: [xMin, xMax], y: [yMin, yMax] };
  })();
  const rangeFields = (
    <fieldset className="teach-insert-section">
      <legend>{tr("坐标范围")}</legend>
      <div className="teach-axis-ranges">
        {(["x", "y"] as const).map((axis) => (
          <div className="teach-axis-range" key={axis}>
            <span className="teach-math-badge" aria-hidden="true">{axis}</span>
            {(["Min", "Max"] as const).map((limit) => {
              const field = `${axis}${limit}` as const;
              return (
                <label className="teach-label" key={field}>
                  {limit === "Min" ? tr("从") : tr("到")}
                  <input className="teach-input" aria-label={{ xMin: tr("x 从"), xMax: tr("x 到"), yMin: tr("y 从"), yMax: tr("y 到") }[field]} inputMode="decimal" value={range[field]} onChange={(event) => setRange({ ...range, [field]: event.target.value })} />
                </label>
              );
            })}
          </div>
        ))}
      </div>
      {!axes && <p className="teach-notice" role="status">{tr("坐标范围需要两个数，起点要小于终点。")}</p>}
    </fieldset>
  );

  if (form === "graph") {
    const { letters, unknown } = graphParameterLetters(expression);
    const taken: string[] = [];
    const parameters: Array<GraphParameter | undefined> = letters.map((letter) => {
      const values = sliders[letter] ?? { initial: "1", min: "-5", max: "5" };
      const [initial, min, max] = [values.initial, values.min, values.max].map(numberField);
      if (initial === undefined || min === undefined || max === undefined || !(min < max) || initial < min || initial > max) return undefined;
      const variable = nextParameterVariable(recording, letter, taken);
      taken.push(variable);
      return { letter, variable, initial, min, max };
    });
    const slidersReady = parameters.every(Boolean);
    const canInsert = Boolean(axes && expression.trim() && !unknown.length && slidersReady);
    return (
      <InsertSheet disabled={!canInsert} onSubmit={(event) => {
        event.preventDefault();
        if (canInsert && axes) onInsert({ panel: "graph", alias: nextComponentAlias(recording, "graph"), expression: expression.trim(), ...axes, ...(linked ? { linkedVariable: linked } : {}),
          ...(parameters.length ? { parameters: parameters as GraphParameter[] } : {}) });
      }}>
        <label className="teach-label teach-expression">
          <span>{tr("函数表达式")}</span>
          <span><i aria-hidden="true">y =</i><input className="teach-input" value={expression} onChange={(event) => setExpression(event.target.value)} /></span>
        </label>
        {unknown.length > 0 && <p role="status" className="teach-notice">{tr("不认识：{{v0}}。字母只用一个，比如 a、k、m。", { v0: unknown.join("、") })}</p>}
        {letters.length > 0 && (
          <fieldset className="teach-insert-section teach-sliders-form">
            <legend>{tr("参数滑块")}</legend>
            {letters.map((letter, index) => {
              const values = sliders[letter] ?? { initial: "1", min: "-5", max: "5" };
              const set = (field: "initial" | "min" | "max", value: string) => setSliders({ ...sliders, [letter]: { ...values, [field]: value } });
              return (
                <div key={letter} className="teach-range teach-parameter-range" role="group" aria-label={tr("滑块 {{v0}}", { v0: letter })}>
                  <strong className="teach-math-badge">{letter}</strong>
                  <label>{tr("开始是")}<input className="teach-input" inputMode="decimal" value={values.initial} onChange={(event) => set("initial", event.target.value)} /></label>
                  <label>{tr("从")}<input className="teach-input" inputMode="decimal" value={values.min} onChange={(event) => set("min", event.target.value)} /></label>
                  <label>{tr("到")}<input className="teach-input" inputMode="decimal" value={values.max} onChange={(event) => set("max", event.target.value)} /></label>
                  {!parameters[index] && <p className="teach-notice" role="status">{tr("开始的数要在范围里，“从”要比“到”小。")}</p>}
                </div>
              );
            })}
          </fieldset>
        )}
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
      </InsertSheet>
    );
  }
  if (form === "coordinate_grid") {
    return (
      <InsertSheet disabled={!axes} onSubmit={(event) => { event.preventDefault(); if (axes) onInsert({ panel: "coordinate_grid", alias: nextComponentAlias(recording, "grid"), ...axes }); }}>
        {rangeFields}
        {placement}
      </InsertSheet>
    );
  }
  if (form === "unit_circle") {
    return (
      <InsertSheet onSubmit={(event) => { event.preventDefault(); onInsert({ panel: "unit_circle", alias: nextComponentAlias(recording, "unit-circle"), variable: nextVariable(recording) }); }}>
        <div className="teach-insert-figure">
          <CircleSketch />
          <p>{tr("单位圆带一个角度滑杆，拖动圆上的点也能改角度。")}</p>
        </div>
        {placement}
      </InsertSheet>
    );
  }
  if (form === "line") return <LineForm recording={recording} onLine={onLine} />;
  if (form === "segment") return <LineForm recording={recording} segment onLine={(line) => onShape({ type: "geometry.segment", node: line.node, from: line.from, to: line.to, alias: nextComponentAlias(recording, "segment") })} />;
  if (form === "circle") return <CircleForm recording={recording} onShape={onShape} />;
  if (form === "polygon") return <PolygonForm recording={recording} placement={placement} onInsert={onInsert} />;
  if (form === "number_line") return <NumberLineForm recording={recording} placement={placement} onInsert={onInsert} />;
  if (form === "constant_speed") return <ConstantSpeedForm recording={recording} placement={placement} onInsert={onInsert} />;
  if (form === "text" || form === "note") return <WordsForm kind={form} recording={recording} onInsert={onInsert} {...(said ? { said } : {})} />;
  if (form === "table") return <TableForm recording={recording} onInsert={onInsert} />;
  if (form === "diagram") return <DiagramForm recording={recording} onInsert={onInsert} {...(said ? { said } : {})} />;
  const [x, y] = [numberField(point.x), numberField(point.y)];
  const label = point.node ? nextPointLabel(recording, point.node) : undefined;
  const gridRange = gridRanges(recording).get(point.node);
  const outside = gridRange && x !== undefined && y !== undefined
    && (x < gridRange.x[0] || x > gridRange.x[1] || y < gridRange.y[0] || y > gridRange.y[1]);
  return (
    <InsertSheet action={tr("放到网格上")} disabled={!label || x === undefined || y === undefined || outside} onSubmit={(event) => {
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
      <fieldset className="teach-insert-section">
        <legend>{tr("点的坐标")}</legend>
        <div className="teach-range">
          <label>x<input className="teach-input" inputMode="decimal" value={point.x} onChange={(event) => setPoint({ ...point, x: event.target.value })} /></label>
          <label>y<input className="teach-input" inputMode="decimal" value={point.y} onChange={(event) => setPoint({ ...point, y: event.target.value })} /></label>
        </div>
      </fieldset>
      {label && <p className="teach-insert-hint">{tr("这个点叫 {{v0}}", { v0: label.label })}</p>}
      {outside && gridRange && (
        <p className="teach-notice" role="alert">{tr("这个点在网格外面：x 从 {{v0}} 到 {{v1}}，y 从 {{v2}} 到 {{v3}}。", { v0: gridRange.x[0], v1: gridRange.x[1], v2: gridRange.y[0], v3: gridRange.y[1] })}</p>
      )}
    </InsertSheet>
  );
}

function LineForm({ recording, onLine, segment = false }: {
  recording: LearnerRecording;
  /** Join the two points with a segment instead of a line across the grid. */
  segment?: boolean;
  onLine: (line: { node: string; from: string; to: string; alias: string }) => void;
}) {
  const byGrid = gridPoints(recording);
  const all = [...byGrid].filter(([, points]) => points.length >= 2);
  const [grid, setGrid] = useState(all.at(-1)?.[0] ?? "");
  const points = byGrid.get(grid) ?? [];
  const [first, setFirst] = useState(points[0]?.point ?? "");
  const [second, setSecond] = useState(points[1]?.point ?? "");
  const a = points.find((candidate) => candidate.point === first);
  const b = points.find((candidate) => candidate.point === second);
  const ready = Boolean(a && b && (a.x !== b.x || a.y !== b.y));
  const choose = (label: string, value: string, set: (value: string) => void) => (
    <label>{label}
      <select className="teach-input" value={value} onChange={(event) => set(event.target.value)}>
        {points.map((candidate) => <option key={candidate.point} value={candidate.point}>{candidate.label}</option>)}
      </select>
    </label>
  );
  return (
    <InsertSheet action={tr("画在网格上")} disabled={!ready} onSubmit={(event) => {
      event.preventDefault();
      if (ready) onLine({ node: grid, from: first, to: second, alias: nextComponentAlias(recording, "line") });
    }}>
      {all.length > 1 && (
        <label className="teach-label">{tr("用哪个网格的点")}
          <select className="teach-input" value={grid} onChange={(event) => {
            const next = event.target.value;
            const candidates = byGrid.get(next) ?? [];
            setGrid(next);
            setFirst(candidates[0]?.point ?? "");
            setSecond(candidates[1]?.point ?? "");
          }}>
            {all.map(([alias]) => <option key={alias} value={alias}>{alias}</option>)}
          </select>
        </label>
      )}
      <fieldset className="teach-insert-section">
        <legend>{segment ? tr("线段的两个端点") : tr("直线经过的两点")}</legend>
        <div className="teach-range">
          {choose(tr("第一个点"), first, setFirst)}
          {choose(tr("第二个点"), second, setSecond)}
        </div>
      </fieldset>
      {ready && !segment && <p className="teach-insert-hint">{tr("在网格上画出 {{v0}}", { v0: lineLabel(a!, b!) })}</p>}
      {a && b && !ready && <p className="teach-notice" role="alert">{tr("请选两个不同的点。")}</p>}
    </InsertSheet>
  );
}


const NOTE_ROLES: Array<[NoteRole, () => string, typeof Check]> = [
  ["conclusion", () => tr("结论"), Check], ["warning", () => tr("注意"), CircleAlert],
  ["summary", () => tr("小结"), ListChecks], ["definition", () => tr("定义"), BookOpen],
];

function InsertOption({ name, label, selected, onSelect, icon: Icon }: {
  name: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  icon: typeof Check;
}) {
  return (
    <label className="teach-insert-option">
      <input type="radio" name={name} checked={selected} onChange={onSelect} />
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

/** Words for the board: what the learner just said, or typed; a note also says what kind of note it is. */
function WordsForm({ kind, recording, said, onInsert }: {
  kind: "text" | "note";
  recording: LearnerRecording;
  said?: string;
  onInsert: (component: ComponentInsert) => void;
}) {
  const [text, setText] = useState("");
  const [role, setRole] = useState<NoteRole>("conclusion");
  const words = text.trim();
  return (
    <InsertSheet disabled={!words} onSubmit={(event) => {
      event.preventDefault();
      if (!words) return;
      onInsert(kind === "note"
        ? { panel: "note", alias: nextComponentAlias(recording, "note"), role, text: words }
        : { panel: "text", alias: nextComponentAlias(recording, "text"), text: words });
    }}>
      {kind === "note" && (
        <fieldset className="teach-insert-section">
          <legend>{tr("这条提示是")}</legend>
          <div className="teach-insert-options">
            {NOTE_ROLES.map(([value, label, icon]) => (
              <InsertOption key={value} name="teach-note-role" label={label()} selected={role === value} onSelect={() => setRole(value)} icon={icon} />
            ))}
          </div>
        </fieldset>
      )}
      <div className="teach-insert-composer">
        <label className="teach-label">{kind === "note" ? tr("提示的内容") : tr("要写的话")}
          <textarea className="teach-input" rows={4} value={text} maxLength={400} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="teach-insert-composer-meta">
          {said && <button type="button" className="teach-secondary" onClick={() => setText(said)}><MessageSquareText size={15} aria-hidden="true" />{sayLabel(said)}</button>}
          <span>{text.length} / 400</span>
        </div>
      </div>
    </InsertSheet>
  );
}

const MAX_COLUMNS = 5;
const MAX_ROWS = 6;

/** A table: its headings and any cells known now; empty cells are filled later by tapping them while talking. */
function TableForm({ recording, onInsert }: { recording: LearnerRecording; onInsert: (component: ComponentInsert) => void }) {
  const [columns, setColumns] = useState<string[]>(["", ""]);
  const [rows, setRows] = useState<string[][]>([["", ""], ["", ""]]);
  const resize = (columnCount: number, rowCount: number) => {
    setColumns((current) => Array.from({ length: columnCount }, (_, index) => current[index] ?? ""));
    setRows((current) => Array.from({ length: rowCount }, (_, row) => Array.from({ length: columnCount }, (__, column) => current[row]?.[column] ?? "")));
  };
  const ready = columns.every((column) => column.trim());
  const stepper = (label: string, value: number, min: number, max: number, set: (next: number) => void) => (
    <div className="teach-stepper" role="group" aria-label={label}>
      <span>{label}</span>
      <button type="button" className="teach-secondary" aria-label={tr("少一个")} disabled={value <= min} onClick={() => set(value - 1)}>−</button>
      <output>{value}</output>
      <button type="button" className="teach-secondary" aria-label={tr("多一个")} disabled={value >= max} onClick={() => set(value + 1)}>+</button>
    </div>
  );
  return (
    <InsertSheet disabled={!ready} onSubmit={(event) => {
      event.preventDefault();
      if (ready) onInsert({ panel: "table", alias: nextComponentAlias(recording, "table"), columns, rows });
    }}>
      <div className="teach-table-size">
        {stepper(tr("列"), columns.length, 1, MAX_COLUMNS, (next) => resize(next, rows.length))}
        {stepper(tr("行"), rows.length, 1, MAX_ROWS, (next) => resize(columns.length, next))}
      </div>
      <div className="teach-table-scroll">
        <table className="teach-table-form" style={{ minWidth: 32 + columns.length * 80 }}>
          <thead><tr>
            <td className="teach-table-index" aria-hidden="true">#</td>
            {columns.map((column, index) => (
              <th key={index} scope="col"><input className="teach-input" aria-label={tr("第 {{v0}} 列的标题", { v0: index + 1 })} placeholder={tr("标题")} value={column}
                onChange={(event) => setColumns(columns.map((value, at) => (at === index ? event.target.value : value)))} /></th>
            ))}
          </tr></thead>
          <tbody>{rows.map((row, rowIndex) => (
            <tr key={rowIndex}><th className="teach-table-index" scope="row">{rowIndex + 1}</th>{row.map((cell, columnIndex) => (
              <td key={columnIndex}><input className="teach-input" aria-label={tr("第 {{v0}} 行第 {{v1}} 列", { v0: rowIndex + 1, v1: columnIndex + 1 })} value={cell}
                onChange={(event) => setRows(rows.map((values, at) => (at === rowIndex ? values.map((value, column) => (column === columnIndex ? event.target.value : value)) : values)))} /></td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
      <p className="teach-insert-hint">{tr("格子可以先空着，讲到的时候点白板上的格子再填。")}</p>
    </InsertSheet>
  );
}

/** Fills one cell of a table on the board, with what the learner just said or typed. */
export function CellEditor({ cell, said, onFill, onCancel }: {
  cell: { row: number; column: number; text: string };
  said?: string;
  onFill: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(cell.text);
  return (
    <form className="teach-add teach-cell-editor" role="dialog" aria-label={tr("填表格")} onSubmit={(event) => { event.preventDefault(); onFill(text.trim()); }}>
      <div className="teach-group-label">{tr("第 {{v0}} 行第 {{v1}} 列", { v0: cell.row + 1, v1: cell.column + 1 })}</div>
      <input className="teach-input" aria-label={tr("格子里写什么")} value={text} maxLength={120} autoFocus onChange={(event) => setText(event.target.value)} />
      {said && <button type="button" className="teach-secondary" onClick={() => setText(said)}>{tr("用我刚说的话：“{{v0}}”", { v0: said.length > 24 ? `${said.slice(0, 24)}…` : said })}</button>}
      <div className="teach-actions">
        <button type="button" className="teach-secondary" onClick={onCancel}>{tr("取消")}</button>
        <button type="submit">{tr("填好了")}</button>
      </div>
    </form>
  );
}

const MAX_BOXES = 8;
const sayLabel = (said: string) => tr("用我刚说的话：“{{v0}}”", { v0: said.length > 24 ? `${said.slice(0, 24)}…` : said });

/** Boxes joined by arrows: steps in order, or a cycle back to the first box. More boxes can be added while talking. */
function DiagramForm({ recording, said, onInsert }: { recording: LearnerRecording; said?: string; onInsert: (component: ComponentInsert) => void }) {
  const [shape, setShape] = useState<"steps" | "cycle">("steps");
  const [boxes, setBoxes] = useState<string[]>(["", ""]);
  const filled = boxes.map((box) => box.trim()).filter(Boolean);
  return (
    <InsertSheet disabled={!filled.length} onSubmit={(event) => {
      event.preventDefault();
      if (filled.length) onInsert({ panel: "diagram", alias: nextComponentAlias(recording, "diagram"), shape, boxes: filled });
    }}>
      <fieldset className="teach-insert-section">
        <legend>{tr("图示的样子")}</legend>
        <div className="teach-insert-options">
          <InsertOption name="teach-diagram-kind" label={tr("一步一步")} selected={shape === "steps"} onSelect={() => setShape("steps")} icon={Workflow} />
          <InsertOption name="teach-diagram-kind" label={tr("转一圈")} selected={shape === "cycle"} onSelect={() => setShape("cycle")} icon={Repeat} />
        </div>
      </fieldset>
      <ol className="teach-diagram-boxes">
        {boxes.map((box, index) => (
          <li key={index}>
            <span aria-hidden="true">{index + 1}</span>
            <input className="teach-input" aria-label={tr("第 {{v0}} 个框", { v0: index + 1 })} placeholder={tr("第 {{v0}} 个框", { v0: index + 1 })} value={box} maxLength={60}
              onChange={(event) => setBoxes(boxes.map((value, at) => (at === index ? event.target.value : value)))} />
            {said && !box.trim() && <button type="button" className="teach-secondary" onClick={() => setBoxes(boxes.map((value, at) => (at === index ? said : value)))}>{tr("用刚说的")}</button>}
          </li>
        ))}
      </ol>
      <button type="button" className="teach-secondary teach-insert-add-row" disabled={boxes.length >= MAX_BOXES} onClick={() => setBoxes([...boxes, ""])}><Plus size={16} aria-hidden="true" />{tr("加一个框")}</button>
      <p className="teach-insert-hint">{tr("可以先放一两个框，讲到的时候点白板上的图示再加。")}</p>
    </InsertSheet>
  );
}

/** One more curve on a graph on the board; a graph that follows an angle cannot take one. */
export function CurveEditor({ follows, curves, letters, onAdd, onCancel }: {
  follows: boolean;
  curves: number;
  /** The graph's slider letters, which a new curve may read. */
  letters: string[];
  onAdd: (expression: string) => void;
  onCancel: () => void;
}) {
  const [expression, setExpression] = useState("");
  const full = curves >= MAX_GRAPH_CURVES;
  const entry = parseGraphEntry(expression);
  const unknown = entry ? entryLetters(entry).filter((letter) => !letters.includes(letter) && !EXPRESSION_NAMES.has(letter)) : [];
  return (
    <form className="teach-add teach-cell-editor" role="dialog" aria-label={tr("在函数图上再画一条")} onSubmit={(event) => {
      event.preventDefault();
      if (entry && !full && !follows && !unknown.length) onAdd(expression.trim());
    }}>
      {follows ? <p className="academy-muted">{tr("这张图跟着单位圆的角度动，不能再加曲线。可以另放一张函数图。")}</p>
        : full ? <p className="academy-muted">{tr("这张图已经有 {{v0}} 条曲线了。", { v0: MAX_GRAPH_CURVES })}</p> : (
          <>
            <label className="teach-label">{tr("再画一条")}<input className="teach-input" value={expression} autoFocus placeholder={tr("如 x^2、x = 2、x^2 + y^2 = 4")} onChange={(event) => setExpression(event.target.value)} /></label>
            {expression.trim() && !entry && <p role="status" className="teach-notice">{tr("写一个函数（如 x^2），一条线（如 x = 2），或一个方程（如 x^2 + y^2 = 4）。")}</p>}
            {unknown.length > 0 && <p role="status" className="teach-notice">{tr("这张图没有 {{v0}}。", { v0: unknown.join("、") })}</p>}
            {letters.length > 0 && <p className="academy-muted">{tr("可以用这张图的滑块：{{v0}}", { v0: letters.join("、") })}</p>}
          </>
        )}
      <div className="teach-actions">
        <button type="button" className="teach-secondary" onClick={onCancel}>{tr("取消")}</button>
        {!follows && !full && <button type="submit" disabled={!entry || unknown.length > 0}>{tr("画上")}</button>}
      </div>
    </form>
  );
}

/** Function names and constants an entry may use besides its letters. */
const EXPRESSION_NAMES = new Set(["abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "ln", "log", "round", "sin", "sqrt", "tan", "pi", "e"]);

/** The most curves the studio puts on one graph (the compiler holds the same limit). */
const MAX_GRAPH_CURVES = 4;

/** One more box at the end of a diagram on the board, with words on the arrow into it if any. */
export function DiagramEditor({ boxes, said, onAdd, onCancel }: {
  /** How many boxes the diagram has now. */
  boxes: number;
  said?: string;
  onAdd: (box: { label: string; link?: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  const full = boxes >= MAX_BOXES;
  return (
    <form className="teach-add teach-cell-editor" role="dialog" aria-label={tr("给图示加一步")} onSubmit={(event) => {
      event.preventDefault();
      if (label.trim() && !full) onAdd({ label: label.trim(), ...(link.trim() ? { link: link.trim() } : {}) });
    }}>
      <div className="teach-group-label">{tr("第 {{v0}} 个框", { v0: boxes + 1 })}</div>
      {full ? <p className="academy-muted">{tr("这个图示已经有 {{v0}} 个框了。", { v0: MAX_BOXES })}</p> : (
        <>
          <input className="teach-input" aria-label={tr("框里写什么")} value={label} maxLength={60} autoFocus onChange={(event) => setLabel(event.target.value)} />
          {said && <button type="button" className="teach-secondary" onClick={() => setLabel(said)}>{sayLabel(said)}</button>}
          <input className="teach-input" aria-label={tr("箭头上写什么（可以不写）")} placeholder={tr("箭头上写什么（可以不写）")} value={link} maxLength={30} onChange={(event) => setLink(event.target.value)} />
        </>
      )}
      <div className="teach-actions">
        <button type="button" className="teach-secondary" onClick={onCancel}>{tr("取消")}</button>
        {!full && <button type="submit" disabled={!label.trim()}>{tr("加上")}</button>}
      </div>
    </form>
  );
}

/** A circle on a coordinate grid, round one of its points. */
function CircleForm({ recording, onShape }: { recording: LearnerRecording; onShape: (shape: GridShape) => void }) {
  const byGrid = gridPoints(recording);
  const all = [...byGrid].filter(([, points]) => points.length >= 1);
  const [grid, setGrid] = useState(all.at(-1)?.[0] ?? "");
  const points = byGrid.get(grid) ?? [];
  const [center, setCenter] = useState(points[0]?.point ?? "");
  const [radius, setRadius] = useState("2");
  const value = numberField(radius);
  const ready = Boolean(points.some((point) => point.point === center) && value !== undefined && value > 0);
  return (
    <InsertSheet action={tr("画在网格上")} disabled={!ready} onSubmit={(event) => {
      event.preventDefault();
      if (ready) onShape({ type: "geometry.circle", node: grid, center, radius: value!, alias: nextComponentAlias(recording, "circle") });
    }}>
      {all.length > 1 && (
        <label className="teach-label">{tr("用哪个网格的点")}
          <select className="teach-input" value={grid} onChange={(event) => {
            const next = event.target.value;
            setGrid(next);
            setCenter(byGrid.get(next)?.[0]?.point ?? "");
          }}>
            {all.map(([alias]) => <option key={alias} value={alias}>{alias}</option>)}
          </select>
        </label>
      )}
      <div className="teach-range">
        <label>{tr("圆心")}
          <select className="teach-input" value={center} onChange={(event) => setCenter(event.target.value)}>
            {points.map((point) => <option key={point.point} value={point.point}>{point.label}</option>)}
          </select>
        </label>
        <label>{tr("半径")}<input className="teach-input" inputMode="decimal" value={radius} onChange={(event) => setRadius(event.target.value)} /></label>
      </div>
    </InsertSheet>
  );
}

/** Small schematic for the inscribed polygon and angle controls. */
function CircleSketch({ sides }: { sides?: number }) {
  const polygon = sides ? Array.from({ length: sides }, (_, index) => {
    const angle = Math.PI * 2 * index / sides - Math.PI / 2;
    return `${60 + 36 * Math.cos(angle)},${52 + 36 * Math.sin(angle)}`;
  }).join(" ") : "";
  return (
    <svg className="teach-circle-sketch" viewBox="0 0 120 104" aria-hidden="true">
      {sides === undefined && <path className="teach-sketch-axis" d="M12 52h96M60 98V7m-3 4 3-4 3 4m41 38 4 3-4 3" />}
      <circle className="teach-sketch-circle" cx="60" cy="52" r="36" />
      {polygon && <polygon className="teach-sketch-shape" points={polygon} />}
      {sides === undefined && <>
        <path className="teach-sketch-shape" d="M60 52h19a19 19 0 0 0-6-14ZM60 52 85 26" />
        <circle className="teach-sketch-point" cx="85" cy="26" r="3" />
        <text x="84" y="45">θ</text>
      </>}
    </svg>
  );
}

/** A regular polygon in a circle, its perimeter shown; its number of sides may be a slider. */
function PolygonForm({ recording, placement, onInsert }: { recording: LearnerRecording; placement: ReactNode; onInsert: (component: ComponentInsert) => void }) {
  const [sides, setSides] = useState("6");
  const [slider, setSlider] = useState(true);
  const value = numberField(sides);
  const ready = value !== undefined && Number.isInteger(value) && value >= 3 && value <= 48;
  return (
    <InsertSheet disabled={!ready} onSubmit={(event) => {
      event.preventDefault();
      if (ready) onInsert({ panel: "polygon", alias: nextComponentAlias(recording, "polygon"), sides: value!, ...(slider ? { slider: { variable: nextParameterVariable(recording, "sides") } } : {}) });
    }}>
      <div className="teach-insert-figure">
        <CircleSketch sides={ready ? value : 0} />
        <label className="teach-label">{tr("几条边（3 到 48）")}<input className="teach-input" inputMode="numeric" value={sides} onChange={(event) => setSides(event.target.value)} /></label>
      </div>
      {!ready && <p className="teach-notice" role="status">{tr("请输入 3 到 48 之间的整数。")}</p>}
      <label className="teach-place"><input type="checkbox" checked={slider} onChange={(event) => setSlider(event.target.checked)} /><span>{tr("边数做成滑块：讲课时拖动，看周长越来越接近圆周")}</span></label>
      {placement}
    </InsertSheet>
  );
}

/** A number line: its range, how finely each unit is split, and optionally a start point and a jump from it. */
function NumberLineForm({ recording, placement, onInsert }: { recording: LearnerRecording; placement: ReactNode; onInsert: (component: ComponentInsert) => void }) {
  const [from, setFrom] = useState("-5");
  const [to, setTo] = useState("5");
  const [parts, setParts] = useState(1);
  const [start, setStart] = useState("");
  const [by, setBy] = useState("");
  const [hops, setHops] = useState(true);
  const [slider, setSlider] = useState(false);
  const [min, max] = [numberField(from), numberField(to)];
  const startText = start.trim() || undefined;
  const byText = startText && by.trim() ? by.trim() : undefined;
  const panel = {
    range: [min ?? Number.NaN, max ?? Number.NaN] as [number, number], subdivisions: parts,
    ...(startText ? { start: startText } : {}),
    ...(byText ? { jump: { by: byText, hops, ...(slider ? { slider: { variable: "" } } : {}) } } : {}),
  };
  const problem = numberLinePanelProblem(panel);
  return (
    <InsertSheet disabled={Boolean(problem)} onSubmit={(event) => {
      event.preventDefault();
      if (problem) return;
      onInsert({
        panel: "number_line", alias: nextComponentAlias(recording, "number-line"), range: panel.range, subdivisions: parts,
        ...(startText ? { start: startText } : {}),
        ...(byText ? { jump: { by: byText, hops, ...(slider ? { slider: { variable: nextParameterVariable(recording, "move") } } : {}) } } : {}),
      });
    }}>
      <div className="teach-range">
        <label>{tr("从")}<input className="teach-input" inputMode="numeric" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>{tr("到")}<input className="teach-input" inputMode="numeric" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label>{tr("每格分成")}
          <select className="teach-input" value={parts} onChange={(event) => setParts(Number(event.target.value))}>
            {NUMBER_LINE_SUBDIVISIONS.map((count) => <option key={count} value={count}>{count === 1 ? tr("不分") : tr("{{v0}} 份", { v0: count })}</option>)}
          </select>
        </label>
      </div>
      <div className="teach-range">
        <label>{tr("起点（可不填）")}<input className="teach-input" value={start} placeholder="3, 3/4" onChange={(event) => setStart(event.target.value)} /></label>
        <label>{tr("移动多少（可不填）")}<input className="teach-input" value={by} placeholder="-5, 1/4" disabled={!startText} onChange={(event) => setBy(event.target.value)} /></label>
      </div>
      {byText && (
        <>
          <label className="teach-place"><input type="checkbox" checked={hops} onChange={(event) => setHops(event.target.checked)} /><span>{tr("一格一跳：讲课时能一格一格地数")}</span></label>
          <label className="teach-place"><input type="checkbox" checked={slider} onChange={(event) => setSlider(event.target.checked)} /><span>{tr("移动做成滑块：讲课时拖动，看跳到哪里")}</span></label>
        </>
      )}
      {problem && <p className="teach-notice" role="status">{problem}</p>}
      {placement}
    </InsertSheet>
  );
}

/** An object moving at constant speed with its distance–time graph: time is a slider, and the speed may be one. */
function ConstantSpeedForm({ recording, placement, onInsert }: { recording: LearnerRecording; placement: ReactNode; onInsert: (component: ComponentInsert) => void }) {
  const [seconds, setSeconds] = useState("10");
  const [speed, setSpeed] = useState("2");
  const [slider, setSlider] = useState(true);
  const time = numberField(seconds);
  const value = numberField(speed);
  const ready = time !== undefined && time > 0 && time <= MAX_MOTION_TIME && value !== undefined && value > 0 && value <= MAX_MOTION_SPEED;
  return (
    <InsertSheet disabled={!ready} onSubmit={(event) => {
      event.preventDefault();
      if (!ready) return;
      const timeVariable = nextParameterVariable(recording, "t");
      onInsert({
        panel: "constant_speed", alias: nextComponentAlias(recording, "motion"),
        time: { variable: timeVariable, max: time! },
        speed: { initial: value!, ...(slider ? { slider: { variable: nextParameterVariable(recording, "v", [timeVariable]), max: Math.min(MAX_MOTION_SPEED, niceAxisMax(value! * 2)) } } : {}) },
      });
    }}>
      <div className="teach-insert-figure">
        <MotionSketch />
        <p>{tr("物体沿直线匀速前进，旁边是它的路程—时间图像。拖动时间滑杆，物体和图上的点一起走。")}</p>
      </div>
      <div className="teach-range">
        <label>{tr("走多少秒")}<input className="teach-input" inputMode="decimal" value={seconds} onChange={(event) => setSeconds(event.target.value)} /></label>
        <label>{tr("速度（米/秒）")}<input className="teach-input" inputMode="decimal" value={speed} onChange={(event) => setSpeed(event.target.value)} /></label>
      </div>
      {!ready && <p className="teach-notice" role="status">{tr("时间和速度都要大于 0（时间最多 3600 秒，速度最多 1000 米/秒）。")}</p>}
      <label className="teach-place"><input type="checkbox" checked={slider} onChange={(event) => setSlider(event.target.checked)} /><span>{tr("速度也做成滑块：讲课时调快调慢，看直线变陡变缓")}</span></label>
      {placement}
    </InsertSheet>
  );
}

/** Small schematic of the track and its distance–time line. */
function MotionSketch() {
  return (
    <svg className="teach-circle-sketch" viewBox="0 0 120 104" aria-hidden="true">
      <path className="teach-sketch-axis" d="M8 30h50M70 96h44M70 96V8" />
      <circle className="teach-sketch-point" cx="40" cy="30" r="4" />
      <path className="teach-sketch-shape" d="M8 30h32M70 96 112 20" />
      <circle className="teach-sketch-point" cx="96" cy="49" r="3" />
    </svg>
  );
}

/** The solids offered, in groups, with the sizes each needs. Cube is a box with equal edges; a truncated pyramid is a pyramid with its top cut off. */
type CompositeParts = Extract<Solid, { shape: "composite" }>["parts"];
const SOLID_GROUPS: Array<[() => string, SolidChoice[]]> = [
  [() => tr("常见的立体"), ["box", "cube", "cylinder", "cone", "sphere", "hemisphere", "ellipsoid", "frustum", "torus"]],
  [() => tr("棱柱和棱锥"), ["prism", "pyramid", "truncated"]],
  [() => tr("组合体"), ["cylinder_cone", "cylinder_hemisphere", "box_pyramid", "two_cylinders"]],
  [() => tr("正多面体"), ["tetrahedron", "octahedron", "dodecahedron", "icosahedron"]],
];
const COMPOSITES: ReadonlySet<SolidChoice> = new Set(["cylinder_cone", "cylinder_hemisphere", "box_pyramid", "two_cylinders"]);
/** A prism's or pyramid's base: regular, or a rectangle or triangle. */
type BaseChoice = "regular" | "rectangle" | "right_triangle" | "triangle";
const BASE_CHOICES: Array<[BaseChoice, () => string]> = [
  ["regular", () => tr("正多边形")], ["rectangle", () => tr("长方形")], ["right_triangle", () => tr("直角三角形")], ["triangle", () => tr("三角形（三边）")],
];
const BASE_FIELDS: Record<BaseChoice, SizeField[]> = { regular: ["sides", "radius"], rectangle: ["x", "y"], right_triangle: ["a", "b"], triangle: ["a", "b", "c"] };
type SizeField = "x" | "y" | "z" | "edge" | "radius" | "height" | "topRadius" | "tube" | "sides" | "a" | "b" | "c" | "topScale" | "topHeight" | "side";
const FIELDS: Record<SolidChoice, SizeField[]> = {
  box: ["x", "y", "z"], cube: ["edge"], cylinder: ["radius", "height"], cone: ["radius", "height"], sphere: ["radius"], hemisphere: ["radius"], ellipsoid: ["x", "y", "z"],
  frustum: ["radius", "topRadius", "height"], torus: ["radius", "tube"], prism: ["height"], pyramid: ["height"], truncated: ["height", "topScale"],
  cylinder_cone: ["radius", "height", "topHeight"], cylinder_hemisphere: ["radius", "height"], box_pyramid: ["side", "height", "topHeight"], two_cylinders: ["radius", "height", "topRadius", "topHeight"],
  tetrahedron: ["radius"], octahedron: ["radius"], dodecahedron: ["radius"], icosahedron: ["radius"],
};
const FIELD_LABELS: Record<SizeField, () => string> = {
  x: () => tr("长"), y: () => tr("宽"), z: () => tr("高"), edge: () => tr("棱长"), radius: () => tr("半径"), height: () => tr("高"),
  topRadius: () => tr("上底半径"), tube: () => tr("管的半径"), sides: () => tr("底面边数（3 到 12）"), a: () => tr("边 a"), b: () => tr("边 b"), c: () => tr("边 c"),
  topScale: () => tr("上底是下底的几倍（0 到 1）"), topHeight: () => tr("上面部分的高"), side: () => tr("底面边长"),
};
/** Labels that differ for one solid: an ellipsoid's semi-axes, a stack's two parts, a right triangle's legs. */
function fieldLabel(choice: SolidChoice, base: BaseChoice, field: SizeField): string {
  if (choice === "ellipsoid" && (field === "x" || field === "y" || field === "z")) return tr("{{v0}} 方向的半轴", { v0: field });
  if (COMPOSITES.has(choice) && field === "height") return tr("下面部分的高");
  if (choice === "two_cylinders" && field === "topRadius") return tr("上面圆柱的半径");
  if (choice === "two_cylinders" && field === "radius") return tr("下面圆柱的半径");
  if (base === "right_triangle" && (field === "a" || field === "b")) return field === "a" ? tr("直角边 a") : tr("直角边 b");
  if (base === "regular" && field === "radius" && ["prism", "pyramid", "truncated"].includes(choice)) return tr("底面外接圆半径");
  return FIELD_LABELS[field]();
}
const DEFAULT_SIZES: Record<SizeField, string> = {
  x: "4", y: "3", z: "2", edge: "3", radius: "2", height: "4", topRadius: "1", tube: "0.6", sides: "6", a: "3", b: "4", c: "5", topScale: "0.5", topHeight: "2", side: "3",
};

/** What a choice in the solid picker is called. */
function choiceName(option: SolidChoice): string {
  if (option === "cube") return tr("正方体");
  if (option === "truncated") return tr("棱台");
  if (COMPOSITES.has(option)) return compositeName(option as CompositeParts);
  return solidName(option as SolidShape);
}

/** A 3D solid: which one, its sizes, and optionally a cutting plane or a net on a slider. */
function SolidForm({ recording, placement, onInsert }: { recording: LearnerRecording; placement: ReactNode; onInsert: (component: ComponentInsert) => void }) {
  const [category, setCategory] = useState(0);
  const [choice, setChoice] = useState<SolidChoice>("box");
  const [baseChoice, setBaseChoice] = useState<BaseChoice>("regular");
  const [sizes, setSizes] = useState<Record<SizeField, string>>(DEFAULT_SIZES);
  const [slider, setSlider] = useState<"none" | "cut" | "unfold">("none");
  const value = (field: SizeField) => numberField(sizes[field]);
  const positive = (field: SizeField) => { const number = value(field); return number !== undefined && number > 0 ? number : undefined; };
  const based = choice === "prism" || choice === "pyramid" || choice === "truncated";
  const fields = based ? [...BASE_FIELDS[baseChoice], ...FIELDS[choice]] : FIELDS[choice];
  const prismBase = ((): { sides: number; radius: number } | { base: SolidBase } | undefined => {
    const [x, y, a, b, c, radius, sides] = [positive("x"), positive("y"), positive("a"), positive("b"), positive("c"), positive("radius"), value("sides")];
    switch (baseChoice) {
      case "regular": return radius && sides && Number.isInteger(sides) && sides >= 3 && sides <= 12 ? { sides, radius } : undefined;
      case "rectangle": return x && y ? { base: { kind: "rectangle", length: x, width: y } } : undefined;
      case "right_triangle": return a && b ? { base: { kind: "right_triangle", a, b } } : undefined;
      case "triangle": return a && b && c && baseCorners({ kind: "triangle", a, b, c }) ? { base: { kind: "triangle", a, b, c } } : undefined;
    }
  })();
  const solid = ((): Solid | undefined => {
    const radius = positive("radius"), height = positive("height"), topHeight = positive("topHeight");
    switch (choice) {
      case "box": { const [x, y, z] = [positive("x"), positive("y"), positive("z")]; return x && y && z ? { shape: "box", size: { x, y, z } } : undefined; }
      case "cube": { const edge = positive("edge"); return edge ? { shape: "box", size: { x: edge, y: edge, z: edge } } : undefined; }
      case "ellipsoid": { const [x, y, z] = [positive("x"), positive("y"), positive("z")]; return x && y && z ? { shape: "ellipsoid", radii: { x, y, z } } : undefined; }
      case "cylinder": case "cone": return radius && height ? { shape: choice, radius, height } : undefined;
      case "prism": case "pyramid": return prismBase && height ? { shape: choice, height, ...prismBase } as Solid : undefined;
      case "truncated": { const topScale = positive("topScale"); return prismBase && height && topScale && topScale < 1 ? { shape: "pyramid", height, topScale, ...prismBase } as Solid : undefined; }
      case "frustum": { const topRadius = positive("topRadius"); return radius && height && topRadius ? { shape: "frustum", radius, topRadius, height } : undefined; }
      case "torus": { const tube = positive("tube"); return radius && tube && tube < radius ? { shape: "torus", radius, tube } : undefined; }
      case "cylinder_cone": return radius && height && topHeight ? { shape: "composite", parts: choice, radius, height, topHeight } : undefined;
      case "cylinder_hemisphere": return radius && height ? { shape: "composite", parts: choice, radius, height } : undefined;
      case "box_pyramid": { const width = positive("side"); return width && height && topHeight ? { shape: "composite", parts: choice, width, height, topHeight } : undefined; }
      case "two_cylinders": { const topRadius = positive("topRadius"); return radius && height && topRadius && topHeight ? { shape: "composite", parts: choice, radius, height, topRadius, topHeight } : undefined; }
      default: return radius ? { shape: choice, radius } : undefined;
    }
  })();
  const unfolds = solid !== undefined ? solidUnfolds(solid) : ["box", "cube", "cylinder", "cone", "prism", "pyramid", "truncated"].includes(choice);
  const chosenSlider = slider === "unfold" && !unfolds ? "none" : slider;
  const [group, options] = SOLID_GROUPS[category]!;
  const dimensions = tr("{{v0}}的尺寸", { v0: choiceName(choice) });
  return (
    <InsertSheet columns disabled={!solid} summary={<span><SolidThumbnail shape={choice} />{choiceName(choice)}</span>} onSubmit={(event) => {
      event.preventDefault();
      if (solid) onInsert({ panel: "solid_3d", alias: nextComponentAlias(recording, solid.shape === "box" ? "box" : "solid"), ...solid,
        ...(chosenSlider === "cut" ? { cut: { variable: nextParameterVariable(recording, "cut") } } : {}),
        ...(chosenSlider === "unfold" ? { unfold: { variable: nextParameterVariable(recording, "unfold") } } : {}) });
    }}>
      <div className="teach-solid-library">
        <div className="teach-solid-categories" role="group" aria-label={tr("立体")}>
          {SOLID_GROUPS.map(([name], index) => (
            <button key={index} type="button" aria-pressed={category === index} onClick={() => setCategory(index)}>{name()}</button>
          ))}
        </div>
        <div className="teach-solid-choices" role="radiogroup" aria-label={group()}>
          {options.map((option) => (
            <label className="teach-solid-choice" key={option}>
              <input type="radio" name="teach-solid-shape" checked={choice === option} onChange={() => setChoice(option)} />
              <SolidThumbnail shape={option} />
              <span>{choiceName(option)}</span>
              {choice === option && <Check className="teach-solid-tick" size={12} aria-hidden="true" />}
            </label>
          ))}
        </div>
      </div>

      <div className="teach-solid-settings">
        <div className="teach-solid-dimensions">
          <h3>{dimensions}</h3>
          {based && (
            <div className="teach-solid-group">
              <span className="teach-group-label">{tr("底面")}</span>
              <div className="teach-note-roles" role="radiogroup" aria-label={tr("底面")}>
                {BASE_CHOICES.map(([option, name]) => (
                  <button key={option} type="button" role="radio" aria-checked={baseChoice === option} onClick={() => setBaseChoice(option)}>{name()}</button>
                ))}
              </div>
            </div>
          )}
          <div className="teach-range" role="group" aria-label={dimensions}>
            {fields.map((field) => (
              <label key={field}>{fieldLabel(choice, baseChoice, field)}
                <input className="teach-input" inputMode={field === "sides" ? "numeric" : "decimal"} value={sizes[field]} onChange={(event) => setSizes({ ...sizes, [field]: event.target.value })} />
              </label>
            ))}
          </div>
          {choice === "torus" && solid === undefined && positive("tube") !== undefined && <p className="teach-notice">{tr("管的半径要比环的半径小。")}</p>}
          {based && baseChoice === "triangle" && prismBase === undefined && positive("a") && positive("b") && positive("c") && <p className="teach-notice">{tr("这三条边围不成三角形：任意两边之和要大于第三边。")}</p>}
          {choice === "truncated" && solid === undefined && (value("topScale") ?? 0) >= 1 && <p className="teach-notice">{tr("上底要比下底小：填 0 到 1 之间的数。")}</p>}
        </div>
        <div className="teach-solid-interaction">
          <h3>{tr("互动方式")}</h3>
          <label className="teach-place">
            <input type="checkbox" checked={chosenSlider === "cut"} onChange={(event) => setSlider(event.target.checked ? "cut" : "none")} />
            <span><strong>{tr("切一刀")}</strong><small>{tr("拖动滑块观察横截面。")}</small></span>
          </label>
          {unfolds && (
            <label className="teach-place">
              <input type="checkbox" checked={chosenSlider === "unfold"} onChange={(event) => setSlider(event.target.checked ? "unfold" : "none")} />
              <span><strong>{tr("展开成平面图")}</strong><small>{tr("拖动滑块展开各个面。")}</small></span>
            </label>
          )}
        </div>
        {placement}
      </div>
    </InsertSheet>
  );
}
