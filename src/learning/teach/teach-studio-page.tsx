import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { ArrowUpRight, Box, Circle, Crosshair, Eraser, Grid3x3, Highlighter, LineChart, MousePointer2, PenLine, Sparkles, Spline, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";

import { getSelectedProfileId } from "@/api/client";
import { fetchCloudAsrStatus, transcribeCloudSpeech } from "@/api/cloud-asr";
import { useVoiceCapture } from "@/home/voice/use-voice-capture";

import { AcademyHeader } from "../academy/academy-header";
import { compileRecording, EmptyLessonError, type CompiledLesson } from "./compile-recording";
import {
  addInkMark,
  addTakeInk,
  appendEvent,
  cancelTake,
  correctTranscript,
  currentTake,
  finishTake,
  answerOcto,
  keptTake,
  recordingComplete,
  setOctoQuestion,
  setReview,
  startTake,
  type BoardTarget,
  type CardInk,
  type InkMark,
  type ComponentInsert,
  type LearnerRecording,
  type RecordingEvent,
} from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { gridPoints, gridRanges, learnerAuthor, lineThrough, nextComponentAlias, nextPointLabel, nextVariable, recordingVariables } from "./studio-helpers";
import { inkChecksum, inkSnapshotResolver, loadInkSnapshots, saveInkSnapshot } from "./ink-snapshot-store";
import { NeatFormulaPanel, OctoQuestionPanel, ReviewPanel } from "./assist-panels";
import { ReadabilityPanel } from "./readability-panel";
import { askOcto, inkToMath, reviewLesson } from "./teach-assist";
import { TakeSpeech, type Transcribe } from "./take-speech";
import { STUDIO_LESSON_ID } from "./studio-board-ids";
import { InputLevel, MicStatus, type MicState } from "./mic-status";
import { TeachBoard, type BoardBox, type FrozenInk, type SceneGesture, type TeachBoardHandle, type VariableGesture } from "./teach-board";
import "./teach.css";

type Tool = "none" | "pen" | "eraser" | "laser" | "highlighter" | "arrow";

/** "Make it neat": the learner circles writing, Octo reads it, the learner confirms it. */
type NeatStage =
  | { stage: "idle" }
  | { stage: "selecting"; selected: number }
  | { stage: "reading" }
  | { stage: "confirming"; latex: string; confidence: "high" | "medium" | "low" };

const centre = (box: BoardBox) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const contains = (box: BoardBox, point: { x: number; y: number }) =>
  point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;

function without(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  next.delete(value);
  return next;
}
type InsertForm = "graph" | "coordinate_grid" | "unit_circle" | "solid_3d" | "point" | "line" | null;

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
  const boardRef = useRef<TeachBoardHandle>(null);
  const capture = useVoiceCapture();
  const speechRef = useRef<TakeSpeech | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [liveText, setLiveText] = useState("");
  // How the microphone is doing during a take: on or not, hearing speech, and sentences being turned into text.
  const [mic, setMic] = useState<MicState>({ listening: null, speaking: false, transcribing: 0 });
  const [level] = useState(() => new InputLevel());
  const listening = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [octo, setOcto] = useState<{ pending: Set<string>; failed: Set<string> }>({ pending: new Set(), failed: new Set() });
  const [neat, setNeat] = useState<NeatStage>({ stage: "idle" });
  const stopSelecting = useRef<(() => void) | null>(null);
  const [review, setReviewState] = useState<{ pending: boolean; failed: boolean; compiledAt?: string }>({ pending: false, failed: false });
  const snapshots = useRef(loadInkSnapshots(localStorage, profileId));
  const resolveAsset = useCallback((id: string) => inkSnapshotResolver(snapshots.current)(id), []);

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
      const lesson = compileRecording(recording, { author: learnerAuthor(profileId), language: getLocale(), includeTakeInProgress: true });
      // Loaded the way the board loads it, so a problem is shown instead of breaking the page.
      reduceCanonicalEvents(normalizeAuthoringLesson(lesson.lesson, { lessonId: STUDIO_LESSON_ID, boardId: "studio-board", baseRevision: 0, resourceContext: lesson.resourceContext }));
      return { lesson };
    } catch (error) {
      if (error instanceof EmptyLessonError) return { lesson: null };
      return { lesson: null, error: (error as Error).message };
    }
  }, [recording, profileId]);

  const record = (event: RecordingEvent) => {
    if (!recording || !card || !isRecording) return;
    const key = card.key;
    update((current) => appendEvent(current, key, event, now()));
  };
  const withTime = <T extends object>(event: T) => ({ t: elapsed(), ...event }) as T & { t: number };

  const chooseTool = (next: Tool) => {
    endNeat();
    setTool(next);
    setArrowFrom(null);
    boardRef.current?.showPointer(null);
    boardRef.current?.setPen(next === "pen" ? "draw" : next === "eraser" ? "erase" : "off");
  };
  const start = (fresh = false) => {
    if (!recording || !card) return;
    takeStartedAt.current = clock();
    const key = card.key;
    setNotice(null);
    update((current) => startTake(current, key, now(), { fresh }));
    void boardRef.current?.startInk(`${recording.id}:${key}:take-${card.takes.length + 1}`);
    // Each sentence is transcribed as soon as the learner finishes it.
    const recognition = fetchCloudAsrStatus().then((status) => status.available).catch(() => false);
    const transcribe: Transcribe = async (wav, signal) => {
      if (!(await recognition)) throw new Error("Speech recognition is not connected");
      return transcribeCloudSpeech(wav, signal);
    };
    setLiveText("");
    setMic({ listening: null, speaking: false, transcribing: 0 });
    level.reset();
    const speech = new TakeSpeech(elapsed, transcribe, (update) => {
      if (speechRef.current !== speech) return;
      setLiveText(update.text);
      setMic((state) => ({ ...state, transcribing: update.transcribing }));
    });
    speechRef.current = speech;
    listening.current = false;
    const current = () => speechRef.current === speech;
    void capture.start((wav) => { if (current()) setMic((state) => ({ ...state, speaking: false })); speech.utterance(wav); }, {
      onSpeechStart: () => { speech.speechStarted(); if (current()) setMic((state) => ({ ...state, speaking: true })); },
      onVADMisfire: () => { if (current()) setMic((state) => ({ ...state, speaking: false })); },
      onAudioFrame: (frame) => { if (current()) level.push(frame); },
    }).then(async (started) => {
      if (speechRef.current !== speech) return;
      listening.current = started;
      setMic((state) => ({ ...state, listening: started }));
      if (!started) setNotice(tr("麦克风不能用。可以照常录，录完在下面输入你说的话。"));
      else if (!(await recognition) && speechRef.current === speech) setNotice(tr("还没有连接语音识别，说的话不会自动变成字幕。可以在设置的 API Keys 里连接，或者录完在下面输入。"));
    });
  };
  const stop = async () => {
    if (!recording || !card || !recordingTake) return;
    const duration = Math.max(1, elapsed());
    takeStartedAt.current = null;
    const key = card.key;
    chooseTool("none");
    setForm(null);
    setTranscribing(true);
    const speech = speechRef.current;
    speechRef.current = null;
    await capture.stop();
    let spoken: Awaited<ReturnType<TakeSpeech["finish"]>> = { text: "", failed: 0 };
    if (speech) {
      spoken = await speech.finish();
      const connected = await fetchCloudAsrStatus().then((status) => status.available).catch(() => false);
      if (spoken.failed && !connected) setNotice(tr("还没有连接语音识别。请在下面输入你在这张卡片说的话。"));
      else if (spoken.failed) setNotice(tr("有 {{v0}} 段话没听清。请在下面补上。", { v0: spoken.failed }));
      else if (!spoken.speechSpanMs && listening.current) setNotice(tr("这次没有听到你说话。看看麦克风有没有打开，或者在下面输入你说的话。"));
    }
    setLiveText("");
    // Strokes the learner pointed at that are still there become selections of the frozen writing.
    const board = boardRef.current;
    const marks = unassignedMarks(key).filter((mark) => board?.hasStrokeAt(centre(mark.box)));
    const frozen = await board?.freezeInk();
    const ink: CardInk[] = frozen ? [await keepInk(key, recordingTake.take, frozen, [], undefined, marks)] : [];
    // The learner corrects what recognition heard, or types it, below.
    update((current) => finishTake(current, key, now(), {
      durationMs: duration, asrText: spoken.text, speechSpanMs: spoken.speechSpanMs ?? [0, duration], ink,
    }));
    setTranscribing(false);
    if (card.kind === "teach") void askOctoAbout(key);
  };

  /**
   * Stores frozen ink on this device and describes it for the card. Marks on
   * its strokes become selections, with their place in the writing as regions.
   */
  const keepInk = async (key: string, take: number, frozen: FrozenInk, selections: string[], part?: number, marks: InkMark[] = []): Promise<CardInk> => {
    const snapshotId = `ink-snap:${recording!.id}-${key}-t${take}${part ? `-n${part}` : ""}@v1`;
    const inside = marks.filter((mark) => contains(frozen, centre(mark.box)));
    const regions = Object.fromEntries(inside.map((mark) => [mark.selection, {
      x: (mark.box.x - frozen.x) / frozen.width, y: (mark.box.y - frozen.y) / frozen.height,
      width: mark.box.width / frozen.width, height: mark.box.height / frozen.height,
    }]));
    const stored = { svg: frozen.svg, width: frozen.width, height: frozen.height, ...(inside.length ? { regions } : {}) };
    snapshots.current = { ...snapshots.current, [snapshotId]: stored };
    if (!saveInkSnapshot(localStorage, profileId, snapshotId, stored)) setSaveFailed(true);
    return {
      snapshotId, sha256: await inkChecksum(frozen.svg), selections: [...selections, ...inside.map((mark) => mark.selection)],
      ...(frozen.annotates ? { annotates: frozen.annotates } : {}),
    };
  };
  /** The take's marks not yet part of a frozen piece of writing. */
  const unassignedMarks = (key: string): InkMark[] => {
    const take = latest.current?.cards.find((candidate) => candidate.key === key)?.takes.at(-1);
    const assigned = new Set((take?.ink ?? []).flatMap((ink) => ink.selections));
    return (take?.inkMarks ?? []).filter((mark) => !assigned.has(mark.selection));
  };

  // Octo, as a curious student, asks about the card just recorded. It never blocks recording.
  const askOctoAbout = async (key: string) => {
    const current = latest.current;
    if (!current) return;
    setOcto((state) => ({ pending: new Set(state.pending).add(key), failed: without(state.failed, key) }));
    try {
      const question = await askOcto(current, compileQuietly(current), key, getLocale());
      update((latestRecording) => setOctoQuestion(latestRecording, key, question, now()));
      setOcto((state) => ({ ...state, pending: without(state.pending, key) }));
    } catch {
      setOcto((state) => ({ pending: without(state.pending, key), failed: new Set(state.failed).add(key) }));
    }
  };
  const compileQuietly = (current: LearnerRecording) => {
    try {
      return compileRecording(current, { author: learnerAuthor(profileId), language: getLocale() });
    } catch {
      return null;
    }
  };

  // Make it neat: circle the writing, Octo reads it, the learner confirms,
  // and the neat math takes the writing's place on the board right away.
  const endNeat = () => {
    stopSelecting.current?.();
    stopSelecting.current = null;
    setNeat({ stage: "idle" });
  };
  const startNeat = () => {
    const board = boardRef.current;
    if (!board?.inkCount()) {
      setNotice(tr("先写一点，再请小章鱼整理。"));
      return;
    }
    setNotice(null);
    setTool("none");
    setArrowFrom(null);
    stopSelecting.current?.();
    stopSelecting.current = board.selectInk((selected) => setNeat((state) => (state.stage === "selecting" ? { stage: "selecting", selected } : state)));
    setNeat((state) => (state.stage === "selecting" ? state : { stage: "selecting", selected: 0 }));
  };
  const readNeat = async (all: boolean) => {
    const board = boardRef.current;
    if (!recording || !board) return;
    if (all) board.selectAllInk();
    setNeat({ stage: "reading" });
    try {
      const ink = await board.selectedInk();
      if (!ink) { setNeat({ stage: "selecting", selected: 0 }); return; }
      const result = await inkToMath(recording, ink, getLocale());
      if (!result.readable) {
        setNotice(tr("小章鱼没看清这段手写。可以写清楚一点再试。"));
        setNeat({ stage: "selecting", selected: 1 });
        return;
      }
      setNeat({ stage: "confirming", latex: result.latex, confidence: result.confidence });
    } catch {
      setNotice(tr("这次没能整理，请再试一次。"));
      setNeat({ stage: "selecting", selected: 1 });
    }
  };
  const confirmNeat = async (latex: string) => {
    const board = boardRef.current;
    if (!card || !recordingTake || !board) return;
    const key = card.key;
    const take = recordingTake.take;
    const frozen = await board.cutSelectedInk();
    endNeat();
    board.setPen("off");
    if (!frozen) return;
    const part = (latest.current?.cards.find((candidate) => candidate.key === key)?.takes.at(-1)?.ink?.length ?? 0) + 1;
    const selection = `sel-${key}-t${take}-n${part}`;
    const alias = nextComponentAlias(latest.current ?? recording!, "formula");
    // Marks on the strokes just made neat go with them.
    const marks = unassignedMarks(key).filter((mark) => contains(frozen, centre(mark.box)) && !board.hasStrokeAt(centre(mark.box)));
    const ink = await keepInk(key, take, frozen, [selection], part, marks);
    update((current) => addTakeInk(current, key, { ...ink, neat: { selection, latex, alias } }, now()));
    record(withTime({ type: "make_neat.confirmed" as const, selection, latex, alias, replacesInk: true }));
  };

  const runReview = async () => {
    const current = latest.current;
    if (!current) return;
    setReviewState({ pending: true, failed: false });
    try {
      const result = await reviewLesson(current, compileQuietly(current), getLocale());
      update((latestRecording) => setReview(latestRecording, { at: now(), cards: result.cards, overall: result.overall }, now()));
      setReviewState({ pending: false, failed: false, compiledAt: current.updatedAt });
    } catch {
      setReviewState({ pending: false, failed: true });
    }
  };
  const cancel = () => {
    if (!recording || !card) return;
    takeStartedAt.current = null;
    const key = card.key;
    chooseTool("none");
    speechRef.current?.cancel();
    speechRef.current = null;
    setLiveText("");
    setMic({ listening: null, speaking: false, transcribing: 0 });
    endNeat();
    void capture.stop();
    void boardRef.current?.discardInk();
    update((current) => cancelTake(current, key, now()));
  };

  // A drag happened over time; it is placed at its start, never before the take's last action.
  const lastEventTime = () => {
    const latestCard = latest.current?.cards.find((candidate) => candidate.key === selected);
    return (latestCard ? currentTake(latestCard)?.events.at(-1)?.t : undefined) ?? 0;
  };
  const onVariableGesture = (gesture: VariableGesture) => {
    const { startedAgoMs, ...drag } = gesture;
    record({ type: "variable.drag", ...drag, t: Math.max(lastEventTime(), elapsed() - startedAgoMs) });
  };
  const onSceneGesture = (gesture: SceneGesture) => {
    record({ type: "view.rotate", ...gesture, t: Math.max(lastEventTime(), elapsed()) });
  };

  const [arrowFrom, setArrowFrom] = useState<BoardTarget | null>(null);
  /** A pointing tool used on a card, part, or stroke of writing; `at` is where to show the pointer when not on a card. */
  const onTarget = (target: BoardTarget, at?: { x: number; y: number }) => {
    const pointer = at ? { at } : target;
    if (tool === "laser") {
      record(withTime({ type: "tool.laser" as const, target }));
      boardRef.current?.showPointer(pointer);
    }
    if (tool === "highlighter") {
      record(withTime({ type: "tool.highlighter" as const, target }));
      boardRef.current?.showPointer(pointer);
    }
    if (tool === "arrow") {
      if (!arrowFrom) {
        setArrowFrom(target);
        boardRef.current?.showPointer(pointer, { hold: true });
        return;
      }
      record(withTime({ type: "tool.arrow" as const, from: arrowFrom, to: target }));
      setArrowFrom(null);
      boardRef.current?.showPointer(null);
    }
  };
  // A stroke of the take's own writing becomes a selection when the writing is frozen.
  const onStroke = (box: BoardBox) => {
    if (!card || !recordingTake) return;
    const key = card.key;
    const marks = latest.current?.cards.find((candidate) => candidate.key === key)?.takes.at(-1)?.inkMarks ?? [];
    const selection = `sel-${key}-t${recordingTake.take}-m${marks.length + 1}`;
    update((current) => addInkMark(current, key, { selection, box }, now()));
    onTarget({ inkSelection: selection }, centre(box));
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
          <TeachBoard
            ref={boardRef}
            compiled={compiled.lesson}
            resolveAsset={resolveAsset}
            onTarget={isRecording && (tool === "laser" || tool === "highlighter" || tool === "arrow") ? (target) => onTarget(target) : undefined}
            onStroke={isRecording && (tool === "laser" || tool === "highlighter" || tool === "arrow") ? onStroke : undefined}
            onVariableGesture={isRecording && tool === "none" ? onVariableGesture : undefined}
            onSceneGesture={isRecording && tool === "none" ? onSceneGesture : undefined}
          />
          <aside className="teach-controls" aria-label={tr("录课工具")}>
            {card && !isRecording && (
              <button type="button" className="teach-record" onClick={() => start()}>{kept ? tr("重录这张卡片") : tr("开始录这张卡片")}</button>
            )}
            {card && kept && !isRecording && (
              <>
                <p className="academy-muted">{tr("重录时白板上的内容会留着，你重新说、重新指就好。")}</p>
                <button type="button" className="teach-secondary" onClick={() => start(true)}>{tr("这张卡片从头来")}</button>
              </>
            )}
            {isRecording && (
              <div className="teach-actions">
                <button type="button" className="teach-record recording" disabled={transcribing} onClick={() => void stop()}>{transcribing ? tr("正在整理字幕…") : tr("停止")}</button>
                <button type="button" className="teach-secondary" disabled={transcribing} onClick={cancel}>{tr("放弃这次")}</button>
              </div>
            )}
            {notice && <p role="status" className="teach-notice">{notice}</p>}
            {isRecording && (
              <section className="teach-live-captions" aria-label={tr("你正在说的话")}>
                <MicStatus state={mic} level={level} />
                <h2 className="teach-label">{tr("你正在说的话")}</h2>
                <p aria-live="polite">{liveText || <span className="academy-muted">{tr("开始说吧，你说的话会出现在这里。")}</span>}</p>
              </section>
            )}

            {isRecording && (
              <>
                <div className="teach-toolbar" role="group" aria-label={tr("书写和指点")}>
                  {([["none", tr("移动白板"), MousePointer2], ["pen", tr("笔"), PenLine], ["eraser", tr("橡皮"), Eraser], ["laser", tr("激光笔"), Crosshair], ["highlighter", tr("荧光笔"), Highlighter], ["arrow", tr("箭头"), ArrowUpRight]] as const).map(([value, label, Icon]) => (
                    <button key={value} type="button" aria-pressed={tool === value} onClick={() => chooseTool(value)}><Icon size={16} aria-hidden="true" /> {label}</button>
                  ))}
                </div>
                {(tool === "laser" || tool === "highlighter") && <p className="academy-muted">{tr("在白板上点一张卡片或它的一部分。")}</p>}
                {tool === "arrow" && <p className="academy-muted">{arrowFrom ? tr("再点箭头指向的地方。") : tr("先点箭头从哪里出发。")}</p>}
                {tool === "pen" && <p className="academy-muted">{tr("直接在白板上写。写在图上的会贴在那张图上。")}</p>}
                {tool === "none" && <p className="academy-muted">{tr("拖动单位圆上的点或滑杆、转动长方体，都会录进这张卡片。")}</p>}
                {neat.stage === "idle" && (
                  <button type="button" className="teach-secondary" onClick={startNeat}>
                    <Sparkles size={16} aria-hidden="true" /> {tr("整理一下")}
                  </button>
                )}
                {neat.stage === "selecting" && (
                  <div className="teach-step" role="group" aria-label={tr("选要整理的手写")}>
                    <p className="academy-muted">{tr("在白板上画一个圈，圈住要整理的手写。")}</p>
                    <button type="button" disabled={!neat.selected} onClick={() => void readNeat(false)}>{tr("整理圈住的手写")}</button>
                    <button type="button" className="teach-secondary" onClick={() => void readNeat(true)}>{tr("整理这张卡片上所有手写")}</button>
                    <button type="button" className="teach-secondary" onClick={() => { endNeat(); boardRef.current?.setPen("off"); }}>{tr("取消")}</button>
                  </div>
                )}
                {neat.stage === "reading" && <p role="status" className="academy-muted">{tr("小章鱼在看你的手写…")}</p>}
                {neat.stage === "confirming" && (
                  <NeatFormulaPanel latex={neat.latex} confidence={neat.confidence} onUse={(latex) => void confirmNeat(latex)} onCancel={() => { endNeat(); boardRef.current?.setPen("off"); }} />
                )}
                <div className="teach-toolbar" role="group" aria-label={tr("放入组件")}>
                  {([["graph", tr("函数图"), LineChart], ["coordinate_grid", tr("坐标网格"), Grid3x3], ["unit_circle", tr("单位圆"), Circle], ["solid_3d", tr("长方体"), Box]] as const).map(([value, label, Icon]) => (
                    <button key={value} type="button" aria-pressed={form === value} onClick={() => setForm(form === value ? null : value)}><Icon size={16} aria-hidden="true" /> {label}</button>
                  ))}
                  {grids.length > 0 && (
                    <button type="button" aria-pressed={form === "point"} onClick={() => setForm(form === "point" ? null : "point")}><Square size={16} aria-hidden="true" /> {tr("放一个点")}</button>
                  )}
                  {[...gridPoints(recording).values()].some((points) => points.length >= 2) && (
                    <button type="button" aria-pressed={form === "line"} onClick={() => setForm(form === "line" ? null : "line")}><Spline size={16} aria-hidden="true" /> {tr("过两点画直线")}</button>
                  )}
                </div>
                {form && (
                  <InsertPanel
                    form={form}
                    recording={recording}
                    grids={grids}
                    onInsert={(component) => { record(withTime({ type: "component.insert" as const, ...component })); setForm(null); }}
                    onPoint={(point) => { record(withTime({ type: "point_tool.place" as const, ...point })); setForm(null); }}
                    onLine={(line) => { record(withTime({ type: "graph_it.confirmed" as const, ...line })); setForm(null); }}
                  />
                )}
                {card?.kind === "your_turn" && (
                  <YourTurnPanel
                    variables={recordingVariables(recording)}
                    valueOf={(alias) => boardRef.current?.variableValue(alias)}
                    onSave={(exercise) => {
                      record(withTime({ type: "your_turn.demonstrated" as const, variable: exercise.variable, value: exercise.value }));
                      record(withTime({ type: "your_turn.check_picked" as const, expression: exercise.expression, value: exercise.target, tolerance: exercise.tolerance }));
                      if (exercise.hint) record(withTime({ type: "your_turn.hint_spoken" as const, text: exercise.hint }));
                    }}
                  />
                )}
              </>
            )}

            {card && kept && !isRecording && card.kind === "teach" && (
              <OctoQuestionPanel
                key={`${card.key}-${card.octo?.question ?? ""}`}
                card={card}
                pending={octo.pending.has(card.key)}
                failed={octo.failed.has(card.key)}
                onAnswer={(answer) => update((current) => answerOcto(current, card.key, answer, now()))}
              />
            )}
            {card && kept && !isRecording && (
              <TranscriptEditor
                key={`${card.key}-${kept.take}`}
                text={kept.text ?? ""}
                onSave={(text) => update((current) => correctTranscript(current, card.key, text, now()))}
              />
            )}
            {compiled.error && <p role="alert">{tr("这张卡片里有一处无法放上白板：{{v0}}", { v0: compiled.error })}</p>}
            {!isRecording && compiled.lesson && recordingComplete(recording) && (
              <ReadabilityPanel compiled={compiled.lesson} cards={recording.cards} resolveAsset={resolveAsset} onOpenCard={setSelected} />
            )}
            {!isRecording && compiled.lesson && recordingComplete(recording) && (
              <ReviewPanel
                cards={recording.cards}
                review={recording.review}
                pending={review.pending}
                failed={review.failed}
                stale={Boolean(recording.review) && recording.cards.some((candidate) => (keptTake(candidate)?.startedAt ?? "") > recording.review!.at)}
                onReview={() => void runReview()}
                onOpenCard={setSelected}
              />
            )}
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
  form, recording, grids, onInsert, onPoint, onLine,
}: {
  form: Exclude<InsertForm, null>;
  recording: LearnerRecording;
  grids: string[];
  onInsert: (component: ComponentInsert) => void;
  onPoint: (point: { node: string; point: string; x: number; y: number; label: string }) => void;
  onLine: (line: { points: string[]; expression: string; alias: string; x: [number, number]; y: [number, number] }) => void;
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
  onLine: (line: { points: string[]; expression: string; alias: string; x: [number, number]; y: [number, number] }) => void;
}) {
  const all = [...gridPoints(recording).entries()].filter(([, points]) => points.length >= 2);
  const [grid, setGrid] = useState(all.at(-1)?.[0] ?? "");
  const points = gridPoints(recording).get(grid) ?? [];
  const [first, setFirst] = useState(points[0]?.point ?? "");
  const [second, setSecond] = useState(points[1]?.point ?? "");
  const a = points.find((candidate) => candidate.point === first);
  const b = points.find((candidate) => candidate.point === second);
  const expression = a && b && a !== b ? lineThrough(a, b) : undefined;
  const range = gridRanges(recording).get(grid);
  const choose = (value: string, set: (value: string) => void) => (
    <select className="teach-input" value={value} onChange={(event) => set(event.target.value)}>
      {points.map((candidate) => <option key={candidate.point} value={candidate.point}>{candidate.label}</option>)}
    </select>
  );
  return (
    <form className="teach-step" onSubmit={(event) => {
      event.preventDefault();
      if (expression && range) onLine({ points: [`${grid}#${first}`, `${grid}#${second}`], expression, alias: nextComponentAlias(recording, "line"), x: range.x, y: range.y });
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
      {expression && <p className="academy-muted">y = {expression.replaceAll("*", "·")}</p>}
      {a && b && a.x === b.x && <p role="alert">{tr("这两个点上下对齐，画出的是竖直线，不是函数图。")}</p>}
      <button type="submit" disabled={!expression}>{tr("放到白板上")}</button>
    </form>
  );
}

const READOUTS = (variable: string) => [
  { expression: variable, label: variable },
  { expression: `sin(${variable})`, label: `sin ${variable}` },
  { expression: `cos(${variable})`, label: `cos ${variable}` },
];

function evaluateReadout(expression: string, value: number): number {
  if (expression.startsWith("sin(")) return Math.sin(value);
  if (expression.startsWith("cos(")) return Math.cos(value);
  return value;
}

/**
 * Sets up a "Your turn" exercise from the learner's own demonstration: they
 * put the answer on the board, then choose which reading is checked.
 */
function YourTurnPanel({ variables, valueOf, onSave }: {
  variables: string[];
  valueOf: (alias: string) => number | undefined;
  onSave: (exercise: { variable: string; value: number; expression: string; target: number; tolerance: number; hint: string }) => void;
}) {
  const [variable, setVariable] = useState(variables[0] ?? "");
  const [demonstrated, setDemonstrated] = useState<number>();
  const [expression, setExpression] = useState(variable ? `sin(${variable})` : "");
  const [hint, setHint] = useState("");
  const [saved, setSaved] = useState(false);
  if (!variables.length) return <p className="academy-muted">{tr("“轮到你了”需要一个可以拖动的组件，比如单位圆。先在前面的卡片里放一个。")}</p>;
  const target = demonstrated === undefined ? undefined : Math.round(evaluateReadout(expression, demonstrated) * 100) / 100;
  return (
    <form className="teach-step" aria-label={tr("设置“轮到你了”练习")} onSubmit={(event) => {
      event.preventDefault();
      if (demonstrated === undefined || target === undefined) return;
      onSave({ variable, value: demonstrated, expression, target, tolerance: expression === variable ? 0.05 : 0.01, hint: hint.trim() });
      setSaved(true);
    }}>
      <p className="academy-muted">{tr("先在白板上把答案摆出来，再点“就是这个答案”。")}</p>
      {variables.length > 1 && (
        <select className="teach-input" value={variable} onChange={(event) => { setVariable(event.target.value); setExpression(`sin(${event.target.value})`); setDemonstrated(undefined); }}>
          {variables.map((alias) => <option key={alias} value={alias}>{alias}</option>)}
        </select>
      )}
      <button type="button" className="teach-secondary" onClick={() => setDemonstrated(valueOf(variable))}>{tr("就是这个答案")}</button>
      {demonstrated !== undefined && (
        <>
          <label className="teach-label">{tr("检查哪个读数")}
            <select className="teach-input" value={expression} onChange={(event) => setExpression(event.target.value)}>
              {READOUTS(variable).map((readout) => <option key={readout.expression} value={readout.expression}>{readout.label}</option>)}
            </select>
          </label>
          <p className="academy-muted">{tr("观看的人要让它等于 {{v0}}", { v0: target })}</p>
          <label className="teach-label">{tr("给一个提示（可以不写）")}<input className="teach-input" value={hint} onChange={(event) => setHint(event.target.value)} /></label>
          <button type="submit">{saved ? tr("已保存，可以再改") : tr("保存这道练习")}</button>
        </>
      )}
    </form>
  );
}
