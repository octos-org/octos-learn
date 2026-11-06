// The Add panel of the recording dock: what to put on the board, its settings,
// and for a graph, grid, unit circle or box, where it goes: on a new row, or
// next to a card of the current row so it sits beside what it explains.

import { tr } from "@/i18n";
import { Box, Circle, Grid3x3, LineChart, MessageSquareText, Plus, Repeat, Spline, Square, StickyNote, Table2, Workflow } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { RowCard } from "./board-rows";
import type { ComponentInsert, LearnerRecording, NoteRole } from "./recording";
import { gridPoints, gridRanges, isFigure, lineLabel, nextComponentAlias, nextPointLabel, nextVariable, recordingVariables, type InsertForm } from "./studio-helpers";


function numberField(value: string): number | undefined {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : undefined;
}

export function AddPanel({ recording, grids, row, nextTo, onNextTo, form, onForm, onInsert, onPoint, onLine, said }: {
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
  onInsert: (component: ComponentInsert) => void;
  onPoint: (point: { node: string; point: string; x: number; y: number; label: string }) => void;
  onLine: (line: { node: string; from: string; to: string; alias: string }) => void;
}) {
  const kinds: Array<[InsertForm, string, typeof LineChart]> = [
    ["text", tr("文字"), MessageSquareText], ["note", tr("提示"), StickyNote], ["table", tr("表格"), Table2], ["diagram", tr("图示"), Workflow],
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
          {...(said ? { said } : {})}
        />
      )}
    </div>
  );
}

function InsertPanel({
  form, recording, grids, placement, onInsert, onPoint, onLine, said,
}: {
  form: InsertForm;
  said?: string;
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
  if (form === "text" || form === "note") return <WordsForm kind={form} recording={recording} onInsert={onInsert} {...(said ? { said } : {})} />;
  if (form === "table") return <TableForm recording={recording} onInsert={onInsert} />;
  if (form === "diagram") return <DiagramForm recording={recording} onInsert={onInsert} {...(said ? { said } : {})} />;
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


const NOTE_ROLES: Array<[NoteRole, () => string]> = [
  ["conclusion", () => tr("结论")], ["warning", () => tr("注意")], ["summary", () => tr("小结")], ["definition", () => tr("定义")],
];

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
    <form className="teach-step" onSubmit={(event) => {
      event.preventDefault();
      if (!words) return;
      onInsert(kind === "note"
        ? { panel: "note", alias: nextComponentAlias(recording, "note"), role, text: words }
        : { panel: "text", alias: nextComponentAlias(recording, "text"), text: words });
    }}>
      {kind === "note" && (
        <div className="teach-note-roles" role="radiogroup" aria-label={tr("这条提示是")}>
          {NOTE_ROLES.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={role === value} data-role={value} onClick={() => setRole(value)}>{label()}</button>
          ))}
        </div>
      )}
      <label className="teach-label">{kind === "note" ? tr("提示的内容") : tr("要写的话")}
        <textarea className="teach-input" rows={3} value={text} maxLength={400} onChange={(event) => setText(event.target.value)} />
      </label>
      {said && <button type="button" className="teach-secondary" onClick={() => setText(said)}>{tr("用我刚说的话：“{{v0}}”", { v0: said.length > 24 ? `${said.slice(0, 24)}…` : said })}</button>}
      <button type="submit" disabled={!words}>{tr("放到白板上")}</button>
    </form>
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
    <form className="teach-step" onSubmit={(event) => {
      event.preventDefault();
      if (ready) onInsert({ panel: "table", alias: nextComponentAlias(recording, "table"), columns, rows });
    }}>
      <div className="teach-table-size">
        {stepper(tr("列"), columns.length, 1, MAX_COLUMNS, (next) => resize(next, rows.length))}
        {stepper(tr("行"), rows.length, 1, MAX_ROWS, (next) => resize(columns.length, next))}
      </div>
      <table className="teach-table-form">
        <thead><tr>{columns.map((column, index) => (
          <th key={index}><input className="teach-input" aria-label={tr("第 {{v0}} 列的标题", { v0: index + 1 })} placeholder={tr("标题")} value={column}
            onChange={(event) => setColumns(columns.map((value, at) => (at === index ? event.target.value : value)))} /></th>
        ))}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, columnIndex) => (
            <td key={columnIndex}><input className="teach-input" aria-label={tr("第 {{v0}} 行第 {{v1}} 列", { v0: rowIndex + 1, v1: columnIndex + 1 })} value={cell}
              onChange={(event) => setRows(rows.map((values, at) => (at === rowIndex ? values.map((value, column) => (column === columnIndex ? event.target.value : value)) : values)))} /></td>
          ))}</tr>
        ))}</tbody>
      </table>
      <p className="academy-muted">{tr("格子可以先空着，讲到的时候点白板上的格子再填。")}</p>
      <button type="submit" disabled={!ready}>{tr("放到白板上")}</button>
    </form>
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
    <form className="teach-step" onSubmit={(event) => {
      event.preventDefault();
      if (filled.length) onInsert({ panel: "diagram", alias: nextComponentAlias(recording, "diagram"), shape, boxes: filled });
    }}>
      <div className="teach-note-roles" role="radiogroup" aria-label={tr("图示的样子")}>
        <button type="button" role="radio" aria-checked={shape === "steps"} onClick={() => setShape("steps")}><Workflow size={16} aria-hidden="true" />{tr("一步一步")}</button>
        <button type="button" role="radio" aria-checked={shape === "cycle"} onClick={() => setShape("cycle")}><Repeat size={16} aria-hidden="true" />{tr("转一圈")}</button>
      </div>
      <ol className="teach-diagram-boxes">
        {boxes.map((box, index) => (
          <li key={index}>
            <input className="teach-input" aria-label={tr("第 {{v0}} 个框", { v0: index + 1 })} value={box} maxLength={60}
              onChange={(event) => setBoxes(boxes.map((value, at) => (at === index ? event.target.value : value)))} />
            {said && !box.trim() && <button type="button" className="teach-secondary" onClick={() => setBoxes(boxes.map((value, at) => (at === index ? said : value)))}>{tr("用刚说的")}</button>}
          </li>
        ))}
      </ol>
      <button type="button" className="teach-secondary" disabled={boxes.length >= MAX_BOXES} onClick={() => setBoxes([...boxes, ""])}><Plus size={16} aria-hidden="true" />{tr("加一个框")}</button>
      <p className="academy-muted">{tr("可以先放一两个框，讲到的时候点白板上的图示再加。")}</p>
      <button type="submit" disabled={!filled.length}>{tr("放到白板上")}</button>
    </form>
  );
}

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
