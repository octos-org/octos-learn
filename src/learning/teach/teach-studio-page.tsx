import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Box, Circle, Crosshair, Grid3x3, Highlighter, LineChart, MousePointer2, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { getSelectedProfileId } from "@/api/client";

import { AcademyHeader } from "../academy/academy-header";
import { compileRecording, type CompiledLesson } from "./compile-recording";
import {
  appendEvent,
  cancelTake,
  correctTranscript,
  currentTake,
  finishTake,
  keptTake,
  startTake,
  type BoardTarget,
  type ComponentInsert,
  type LearnerRecording,
  type RecordingEvent,
} from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { gridRanges, learnerAuthor, nextComponentAlias, nextPointLabel, nextVariable, recordingVariables } from "./studio-helpers";
import { TeachBoard } from "./teach-board";
import "./teach.css";

type Tool = "none" | "laser" | "highlighter";
type InsertForm = "graph" | "coordinate_grid" | "unit_circle" | "solid_3d" | "point" | null;

const noAssets = () => undefined;

function numberField(value: string): number | undefined {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : undefined;
}

/** Records a planned lesson card by card on a live board. */
export function TeachStudioPage({ clock = () => Date.now() }: { clock?: () => number }) {
  useLocale();
  const { id } = useParams();
  const profileId = getSelectedProfileId() ?? "local";
  const [recording, setRecording] = useState<LearnerRecording | undefined>(() =>
    loadRecordingDrafts(localStorage, profileId).find((draft) => draft.id === id));
  const [selected, setSelected] = useState(() => recording?.cards[0]?.key);
  const [tool, setTool] = useState<Tool>("none");
  const [form, setForm] = useState<InsertForm>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const takeStartedAt = useRef<number | null>(null);

  // Every change builds on the latest recording, not the copy this render saw,
  // so a tap and an immediate stop can never overwrite each other.
  const latest = useRef(recording);
  const update = useCallback((change: (current: LearnerRecording) => LearnerRecording) => {
    if (!latest.current) return;
    const next = change(latest.current);
    latest.current = next;
    setRecording(next);
    setSaveFailed(!saveRecordingDraft(localStorage, profileId, next));
  }, [profileId]);

  const card = recording?.cards.find((candidate) => candidate.key === selected);
  const recordingTake = card ? currentTake(card) : undefined;
  const isRecording = Boolean(recordingTake);
  const now = () => new Date(clock()).toISOString();
  const elapsed = () => Math.max(0, clock() - (takeStartedAt.current ?? clock()));

  const compiled = useMemo<{ lesson: CompiledLesson | null; error?: string }>(() => {
    if (!recording) return { lesson: null };
    try {
      return { lesson: compileRecording(recording, { author: learnerAuthor(profileId), language: getLocale(), includeTakeInProgress: true }) };
    } catch (error) {
      return { lesson: null, error: (error as Error).message };
    }
  }, [recording, profileId]);

  const record = (event: RecordingEvent) => {
    if (!recording || !card || !isRecording) return;
    const key = card.key;
    update((current) => appendEvent(current, key, event, now()));
  };
  const withTime = <T extends object>(event: T) => ({ t: elapsed(), ...event }) as T & { t: number };

  const start = () => {
    if (!recording || !card) return;
    takeStartedAt.current = clock();
    const key = card.key;
    update((current) => startTake(current, key, now()));
  };
  const stop = () => {
    if (!recording || !card || !recordingTake) return;
    const duration = Math.max(1, elapsed());
    takeStartedAt.current = null;
    // Speech recognition fills the transcript once connected; until then the
    // learner types or corrects what they said below.
    const key = card.key;
    update((current) => finishTake(current, key, now(), { durationMs: duration, asrText: "", speechSpanMs: [0, duration] }));
    setTool("none");
    setForm(null);
  };
  const cancel = () => {
    if (!recording || !card) return;
    takeStartedAt.current = null;
    const key = card.key;
    update((current) => cancelTake(current, key, now()));
  };

  const onTarget = (target: BoardTarget) => {
    if (tool === "laser") record(withTime({ type: "tool.laser" as const, target }));
    if (tool === "highlighter") record(withTime({ type: "tool.highlighter" as const, target }));
  };

  useEffect(() => {
    if (!isRecording) takeStartedAt.current = null;
  }, [isRecording]);

  if (!recording) {
    return (
      <main className="course-launcher academy-page teach-page">
        <div className="course-launcher-inner"><AcademyHeader /><p role="alert">{tr("找不到这节课的草稿。")}</p></div>
      </main>
    );
  }

  const kept = card ? keptTake(card) : undefined;
  const grids = recording.cards.flatMap((candidate) => candidate.takes.filter((take) => take.status !== "superseded").flatMap((take) =>
    (take.events as RecordingEvent[]).flatMap((event) => (event.type === "component.insert" && event.panel === "coordinate_grid" ? [event.alias] : []))));

  return (
    <main className="course-launcher academy-page teach-page teach-studio">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <h1 className="academy-title">{recording.topic.text}</h1>
        <ol className="teach-card-strip" aria-label={tr("卡片")}>
          {recording.cards.map((candidate, index) => {
            const status = currentTake(candidate) ? tr("正在录") : keptTake(candidate) ? tr("已录好") : tr("还没录");
            return (
              <li key={candidate.key}>
                <button type="button" aria-pressed={candidate.key === selected} disabled={isRecording && candidate.key !== selected} onClick={() => setSelected(candidate.key)}>
                  <span>{index + 1}. {candidate.title}</span>
                  <span className="teach-chip">{status}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="teach-studio-body">
          <TeachBoard compiled={compiled.lesson} resolveAsset={noAssets} onTarget={isRecording && tool !== "none" ? onTarget : undefined} />
          <aside className="teach-controls" aria-label={tr("录课工具")}>
            {card && !isRecording && (
              <button type="button" className="teach-record" onClick={start}>{kept ? tr("重录这张卡片") : tr("开始录这张卡片")}</button>
            )}
            {isRecording && (
              <div className="teach-actions">
                <button type="button" className="teach-record recording" onClick={stop}>{tr("停止")}</button>
                <button type="button" className="teach-secondary" onClick={cancel}>{tr("放弃这次")}</button>
              </div>
            )}

            {isRecording && (
              <>
                <div className="teach-toolbar" role="group" aria-label={tr("指点工具")}>
                  {([["none", tr("不指点"), MousePointer2], ["laser", tr("激光笔"), Crosshair], ["highlighter", tr("荧光笔"), Highlighter]] as const).map(([value, label, Icon]) => (
                    <button key={value} type="button" aria-pressed={tool === value} onClick={() => setTool(value)}><Icon size={16} aria-hidden="true" /> {label}</button>
                  ))}
                </div>
                {tool !== "none" && <p className="academy-muted">{tr("在白板上点一张卡片或它的一部分。")}</p>}
                <div className="teach-toolbar" role="group" aria-label={tr("放入组件")}>
                  {([["graph", tr("函数图"), LineChart], ["coordinate_grid", tr("坐标网格"), Grid3x3], ["unit_circle", tr("单位圆"), Circle], ["solid_3d", tr("长方体"), Box]] as const).map(([value, label, Icon]) => (
                    <button key={value} type="button" aria-pressed={form === value} onClick={() => setForm(form === value ? null : value)}><Icon size={16} aria-hidden="true" /> {label}</button>
                  ))}
                  {grids.length > 0 && (
                    <button type="button" aria-pressed={form === "point"} onClick={() => setForm(form === "point" ? null : "point")}><Square size={16} aria-hidden="true" /> {tr("放一个点")}</button>
                  )}
                </div>
                {form && (
                  <InsertPanel
                    form={form}
                    recording={recording}
                    grids={grids}
                    onInsert={(component) => { record(withTime({ type: "component.insert" as const, ...component })); setForm(null); }}
                    onPoint={(point) => { record(withTime({ type: "point_tool.place" as const, ...point })); setForm(null); }}
                  />
                )}
              </>
            )}

            {card && kept && !isRecording && (
              <TranscriptEditor
                key={`${card.key}-${kept.take}`}
                text={kept.text ?? ""}
                onSave={(text) => update((current) => correctTranscript(current, card.key, text, now()))}
              />
            )}
            {compiled.error && <p role="alert">{tr("这张卡片里有一处无法放上白板：{{v0}}", { v0: compiled.error })}</p>}
            {saveFailed && <p role="alert">{tr("这台设备暂时保存不了，请稍后再试。")}</p>}
          </aside>
        </div>
      </div>
    </main>
  );
}

function TranscriptEditor({ text, onSave }: { text: string; onSave: (text: string) => void }) {
  const [value, setValue] = useState(text);
  return (
    <form className="teach-step" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSave(value); }}>
      <label className="teach-label">
        {tr("你在这张卡片说的话")}
        <textarea className="teach-input" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <button type="submit" disabled={!value.trim() || value === text}>{tr("保存字幕")}</button>
    </form>
  );
}

function InsertPanel({
  form, recording, grids, onInsert, onPoint,
}: {
  form: Exclude<InsertForm, null>;
  recording: LearnerRecording;
  grids: string[];
  onInsert: (component: ComponentInsert) => void;
  onPoint: (point: { node: string; point: string; x: number; y: number; label: string }) => void;
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
              {variables.map((variable) => <option key={variable} value={variable}>{variable}</option>)}
            </select>
          </label>
        )}
        <button type="submit" disabled={!ready || !expression.trim()}>{tr("放到白板上")}</button>
      </form>
    );
  }
  if (form === "coordinate_grid") {
    const ready = axes();
    return (
      <form className="teach-step" onSubmit={(event) => { event.preventDefault(); if (ready) onInsert({ panel: "coordinate_grid", alias: nextComponentAlias(recording, "grid"), ...ready }); }}>
        {rangeFields}
        <button type="submit" disabled={!ready}>{tr("放到白板上")}</button>
      </form>
    );
  }
  if (form === "unit_circle") {
    return (
      <form className="teach-step" onSubmit={(event) => { event.preventDefault(); onInsert({ panel: "unit_circle", alias: nextComponentAlias(recording, "unit-circle"), variable: nextVariable(recording) }); }}>
        <p className="academy-muted">{tr("单位圆带一个角度滑杆，拖动圆上的点也能改角度。")}</p>
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
        <button type="submit" disabled={!ready}>{tr("放到白板上")}</button>
      </form>
    );
  }
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
