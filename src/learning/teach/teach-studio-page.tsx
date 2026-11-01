import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { ArrowUpRight, Crosshair, Eraser, Highlighter, ListChecks, MousePointer2, PenLine, Play, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  boardTake,
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
  type LearnerRecording,
  type RecordingEvent,
} from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { isFigure, learnerAuthor, nextComponentAlias, recordingVariables, type InsertForm } from "./studio-helpers";
import { inkChecksum, inkSnapshotResolver, loadInkSnapshots, saveInkSnapshot } from "./ink-snapshot-store";
import { NeatFormulaPanel, OctoQuestionPanel } from "./assist-panels";
import { currentRowCards } from "./board-rows";
import { CheckDialog, type CheckPart, type CheckRun } from "./check-dialog";
import { cardChecks, lessonReady } from "./lesson-check";
import { checkReadability } from "./readability-check";
import { AddPanel } from "./studio-add";
import { askOcto, inkToMath, reviewLesson } from "./teach-assist";
import { TakeSpeech, type Transcribe } from "./take-speech";
import { STUDIO_LESSON_ID } from "./studio-board-ids";
import { InputLevel, MicStatus, type MicState } from "./mic-status";
import { TeachBoard, type BoardBox, type FrozenInk, type SceneGesture, type TeachBoardHandle, type VariableGesture } from "./teach-board";
import "./teach.css";

type Tool = "none" | "pen" | "eraser" | "laser" | "highlighter" | "arrow";

/** Room the tool dock takes at the bottom of the board, kept clear of cards. */
const DOCK_SPACE = 96;

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


/** Records a planned lesson card by card on a live board. */
export function TeachStudioPage({ clock = () => Date.now() }: { clock?: () => number }) {
  useLocale();
  const { id } = useParams();
  const profileId = getSelectedProfileId() ?? "local";
  const [recording, setRecording] = useState<LearnerRecording | undefined>(() =>
    loadRecordingDrafts(localStorage, profileId).find((draft) => draft.id === id));
  const [selected, setSelected] = useState(() => recording?.cards[0]?.key);
  const [tool, setTool] = useState<Tool>("none");
  const [saveFailed, setSaveFailed] = useState(false);
  const takeStartedAt = useRef<number | null>(null);
  // The same start, for showing the take's clock.
  const [takeStart, setTakeStart] = useState<number | null>(null);
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
  const [checkRun, setCheckRun] = useState<CheckRun | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<InsertForm | null>(null);
  const [nextTo, setNextTo] = useState<string | null>(null);
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

  const openAdd = () => {
    chooseTool("none");
    setAddOpen(true);
  };
  const closeAdd = () => {
    setAddOpen(false);
    setForm(null);
    setNextTo(null);
  };
  const chooseTool = (next: Tool) => {
    endNeat();
    setAddOpen(false);
    setTool(next);
    setArrowFrom(null);
    boardRef.current?.showPointer(null);
    boardRef.current?.setPen(next === "pen" ? "draw" : next === "eraser" ? "erase" : "off");
  };
  const start = (fresh = false) => {
    if (!recording || !card) return;
    takeStartedAt.current = clock();
    setTakeStart(takeStartedAt.current);
    const key = card.key;
    setNotice(null);
    update((current) => startTake(current, key, now(), { fresh }));
    void boardRef.current?.startInk(`${recording.id}:${key}:take-${card.takes.length + 1}`);
    // Each sentence is transcribed as soon as the learner finishes it.
    const recognition = fetchCloudAsrStatus().then((status) => status.available).catch(() => false);
    const transcribe: Transcribe = async (wav, signal) => {
      if (!(await recognition)) throw new Error("Speech recognition is not connected");
      return transcribeCloudSpeech(wav, signal, { language: getLocale() });
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
    setTakeStart(null);
    const key = card.key;
    chooseTool("none");
    closeAdd();
    setTranscribing(true);
    const speech = speechRef.current;
    // Words still being spoken when Stop is pressed are kept.
    await capture.stop({ submitSpeech: true });
    speechRef.current = null;
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

  // Check my lesson: the screen check and Octo's review run together; what
  // each found is kept with the draft, so the cards show it until re-checked.
  const runCheck = async () => {
    const current = latest.current;
    const lesson = current ? compileQuietly(current) : null;
    if (!current || !lesson) return;
    const at = now();
    setCheckRun({ screen: "running", octo: "running" });
    const finished = (part: keyof CheckRun, state: CheckPart) => setCheckRun((run) => (run ? { ...run, [part]: state } : run));
    const [screen, reviewed] = await Promise.all([
      checkReadability(lesson, resolveAsset).then((found) => { finished("screen", "done"); return found; }, () => { finished("screen", "failed"); return null; }),
      reviewLesson(current, lesson, getLocale()).then((found) => { finished("octo", "done"); return found; }, () => { finished("octo", "failed"); return null; }),
    ]);
    if (!screen && !reviewed) return;
    update((latestRecording) => setReview(latestRecording, {
      at, cards: reviewed?.cards ?? [], overall: reviewed?.overall ?? "", ...(screen ? { screen } : {}),
    }, now()));
  };
  const cancel = () => {
    if (!recording || !card) return;
    takeStartedAt.current = null;
    setTakeStart(null);
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
  // The take's clock ticks once a second while recording.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => clearInterval(timer);
  }, [isRecording]);

  if (!recording) {
    return (
      <main className="course-launcher academy-page teach-page">
        <div className="course-launcher-inner"><AcademyHeader /><p role="alert">{tr("找不到这节课的草稿。")}</p></div>
      </main>
    );
  }

  const kept = card ? keptTake(card) : undefined;
  const takeClock = takeStart === null ? 0 : Math.max(0, clock() - takeStart);
  const cardIndex = recording.cards.findIndex((candidate) => candidate.key === selected);
  const nextCard = recording.cards[cardIndex + 1];
  const grids = recording.cards.flatMap((candidate) => ((boardTake(candidate)?.events ?? []) as RecordingEvent[])
    .flatMap((event) => (event.type === "component.insert" && event.panel === "coordinate_grid" ? [event.alias] : [])));
  const checks = cardChecks(recording, compiled.lesson, recording.review);
  const checkOf = (key: string) => checks.find((check) => check.key === key);
  const ready = lessonReady(checks, recording);
  const cardCheck = card ? checkOf(card.key) : undefined;
  const pointing = isRecording && (tool === "laser" || tool === "highlighter" || tool === "arrow");
  const row = isRecording && addOpen && isFigure(form) ? currentRowCards(compiled.lesson) : [];
  const hint = !isRecording ? null
    : addOpen ? null
      : tool === "laser" || tool === "highlighter" ? tr("在白板上点一张卡片、它的一部分或你写的字。")
        : tool === "arrow" ? (arrowFrom ? tr("再点箭头指向的地方。") : tr("先点箭头从哪里出发。"))
          : tool === "pen" ? tr("直接在白板上写。写在图上的会贴在那张图上。")
            : null;
  const tools: Array<[Tool | "neat", string, typeof PenLine]> = [
    ["pen", tr("笔"), PenLine], ["eraser", tr("橡皮"), Eraser], ["neat", tr("整理"), Sparkles],
  ];
  const pointers: Array<[Tool, string, typeof PenLine]> = [
    ["laser", tr("激光笔"), Crosshair], ["highlighter", tr("荧光笔"), Highlighter], ["arrow", tr("箭头"), ArrowUpRight],
  ];
  const dockButton = ([value, label, Icon]: [Tool | "neat", string, typeof PenLine]) => (
    <button key={value} type="button" className="teach-tool" disabled={!isRecording}
      aria-pressed={value === "neat" ? neat.stage !== "idle" : tool === value && !addOpen}
      onClick={() => (value === "neat" ? startNeat() : chooseTool(value))}>
      <Icon size={20} aria-hidden="true" />{label}
    </button>
  );

  return (
    <main className="teach-page teach-studio" data-recording={isRecording || undefined}>
      <header className="teach-studio-head">
        <Link to="/teach" className="teach-back">{tr("← 我的课")}</Link>
        <h1>{recording.topic.text}</h1>
        {isRecording ? (
          <span className="teach-rec-badge" role="status"><span aria-hidden="true" />{tr("正在录第 {{v0}} 张 · {{v1}}", { v0: cardIndex + 1, v1: clockText(takeClock) })}</span>
        ) : (
          <>
            <button type="button" className="teach-secondary" disabled={!compiled.lesson || !recordingComplete(recording)} onClick={() => void runCheck()}>
              <ListChecks size={16} aria-hidden="true" />{tr("检查我的课")}
            </button>
            {ready ? (
              <Link className="teach-primary" to={`/teach/${recording.id}/watch`}><Play size={16} aria-hidden="true" />{tr("看我的课")}</Link>
            ) : (
              <button type="button" className="teach-primary" disabled title={tr("检查通过后就能看你的课了")}><Play size={16} aria-hidden="true" />{tr("看我的课")}</button>
            )}
          </>
        )}
      </header>

      <ol className="teach-card-strip" aria-label={tr("卡片")}>
        {recording.cards.map((candidate, index) => {
          const recordingThis = Boolean(currentTake(candidate));
          const flagged = checkOf(candidate.key)?.status === "fix";
          const state = recordingThis ? "recording" : flagged ? "fix" : keptTake(candidate) ? "recorded" : "empty";
          const status = { recording: tr("正在录"), fix: tr("要改一下"), recorded: tr("已录好"), empty: tr("还没录") }[state];
          return (
            <li key={candidate.key}>
              <button type="button" aria-pressed={candidate.key === selected} data-state={state} disabled={isRecording && candidate.key !== selected} onClick={() => setSelected(candidate.key)}>
                <span className="teach-card-mark" aria-hidden="true">{state === "recorded" ? "✓" : state === "fix" ? "!" : state === "recording" ? "●" : ""}</span>
                <span>{index + 1} · {candidate.title}</span>
                <span className="teach-visually-hidden">{status}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="teach-studio-body">
        <section className="teach-stage" aria-label={tr("白板")}>
          <TeachBoard
            ref={boardRef}
            compiled={compiled.lesson}
            resolveAsset={resolveAsset}
            bottomInset={DOCK_SPACE}
            {...(!isRecording && kept && selected ? { focusCard: selected } : {})}
            onTarget={pointing ? (target) => onTarget(target)
              : row.length ? (target) => { if ("node" in target && row.some((entry) => entry.alias === target.node)) setNextTo(target.node); }
                : undefined}
            onStroke={pointing ? onStroke : undefined}
            onVariableGesture={isRecording && tool === "none" ? onVariableGesture : undefined}
            onSceneGesture={isRecording && tool === "none" ? onSceneGesture : undefined}
          />
          {isRecording && addOpen && (
            <AddPanel
              recording={recording}
              grids={grids}
              row={row}
              nextTo={nextTo}
              onNextTo={setNextTo}
              form={form}
              onForm={(next) => { setForm(next); setNextTo(null); }}
              onInsert={(component) => { record(withTime({ type: "component.insert" as const, ...component })); closeAdd(); }}
              onPoint={(point) => { record(withTime({ type: "point_tool.place" as const, ...point })); closeAdd(); }}
              onLine={(line) => { record(withTime({ type: "line_tool.draw" as const, ...line })); closeAdd(); }}
            />
          )}
          {hint && <p className="teach-dock-hint" role="status">{hint}</p>}
          <div className="teach-dock" role="toolbar" aria-label={tr("录课工具")} aria-disabled={!isRecording || undefined}>
            <button type="button" className="teach-tool" disabled={!isRecording} aria-pressed={isRecording && tool === "none" && !addOpen} onClick={() => chooseTool("none")}>
              <MousePointer2 size={20} aria-hidden="true" />{tr("移动")}
            </button>
            {tools.map(dockButton)}
            <span className="teach-dock-divider" aria-hidden="true" />
            {pointers.map(dockButton)}
            <span className="teach-dock-divider" aria-hidden="true" />
            <button type="button" className="teach-tool teach-tool-add" disabled={!isRecording} aria-pressed={addOpen} onClick={() => (addOpen ? closeAdd() : openAdd())}>
              <Plus size={20} aria-hidden="true" />{tr("放入")}
            </button>
          </div>
        </section>

        <aside className="teach-panel" aria-label={tr("这张卡片")}>
          {card && !isRecording && (
            <div className="teach-panel-title">
              <div className="teach-group-label">{tr("第 {{v0}} 张，共 {{v1}} 张", { v0: cardIndex + 1, v1: recording.cards.length })}</div>
              <h2>{card.title}</h2>
              {kept && cardCheck?.status !== "fix" && <span className="teach-recorded">{tr("✓ 已录好 · {{v0}}", { v0: clockText(kept.durationMs ?? 0) })}</span>}
            </div>
          )}

          {isRecording && (
            <>
              <button type="button" className="teach-stop" disabled={transcribing} onClick={() => void stop()}>
                <span aria-hidden="true" />{transcribing ? tr("正在整理字幕…") : tr("停止 · {{v0}}", { v0: clockText(takeClock) })}
              </button>
              {notice && <p role="status" className="teach-notice">{notice}</p>}
              <section className="teach-live-captions" aria-label={tr("你正在说的话")}>
                <MicStatus state={mic} level={level} />
                <h2 className="teach-group-label">{tr("你正在说的话")}</h2>
                <p aria-live="polite">{liveText || <span className="academy-muted">{tr("开始说吧，你说的话会出现在这里。")}</span>}</p>
              </section>
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
              <button type="button" className="teach-secondary teach-panel-end" disabled={transcribing} onClick={cancel}>{tr("放弃这次")}</button>
            </>
          )}

          {card && !isRecording && !kept && (
            <>
              <p className="teach-panel-text">{card.kind === "your_turn"
                ? tr("先摆出答案，再设置看的人要完成的练习。")
                : tr("像给朋友讲一样讲出来。把步骤写下来，讲到哪里就指到哪里。")}</p>
              <button type="button" className="teach-record" onClick={() => start()}><span aria-hidden="true" />{tr("录第 {{v0}} 张", { v0: cardIndex + 1 })}</button>
              <p className="academy-muted">{tr("录的时候你写的、放的、指的，都会和你的声音一起播放。每张卡片都可以重录。")}</p>
              {notice && <p role="status" className="teach-notice">{notice}</p>}
            </>
          )}

          {card && !isRecording && kept && cardCheck?.status === "fix" && (
            <>
              <div className="teach-fix" role="status">
                <div className="teach-fix-title">{tr("这张卡片要改的地方")}</div>
                {cardCheck.findings.map((finding) => <p key={finding.source}>{finding.message}</p>)}
              </div>
              <div>
                <div className="teach-group-label">{tr("你上次说的话")}</div>
                <p className="teach-panel-text">{kept.text || tr("（没有字幕）")}</p>
              </div>
              <button type="button" className="teach-record" onClick={() => start()}><span aria-hidden="true" />{tr("重录我的话")}</button>
              <p className="academy-muted teach-centered">{tr("白板上的东西会留着，只重新录你说的话和指的地方。")}</p>
              <button type="button" className="teach-link-button" onClick={() => start(true)}>{tr("这张卡片从头来")}</button>
            </>
          )}

          {card && !isRecording && kept && cardCheck?.status !== "fix" && (
            <>
              {card.kind === "teach" && (
                <OctoQuestionPanel
                  key={`${card.key}-${card.octo?.question ?? ""}`}
                  card={card}
                  pending={octo.pending.has(card.key)}
                  failed={octo.failed.has(card.key)}
                  onAnswer={(answer) => update((current) => answerOcto(current, card.key, answer, now()))}
                />
              )}
              <TranscriptEditor
                key={`${card.key}-${kept.take}`}
                text={kept.text ?? ""}
                onSave={(text) => update((current) => correctTranscript(current, card.key, text, now()))}
              />
              {notice && <p role="status" className="teach-notice">{notice}</p>}
              <div className="teach-panel-end teach-panel-actions">
                {nextCard ? (
                  <button type="button" className="teach-primary" onClick={() => setSelected(nextCard.key)}>{tr("下一张：第 {{v0}} 张 →", { v0: cardIndex + 2 })}</button>
                ) : (
                  <button type="button" className="teach-primary" disabled={!compiled.lesson || !recordingComplete(recording)} onClick={() => void runCheck()}>{tr("检查我的课")}</button>
                )}
                <div className="teach-panel-row">
                  <button type="button" className="teach-secondary" onClick={() => start()}>{tr("重录我的话")}</button>
                  <button type="button" className="teach-secondary" onClick={() => start(true)}>{tr("这张卡片从头来")}</button>
                </div>
              </div>
            </>
          )}
          {compiled.error && <p role="alert">{tr("这张卡片里有一处无法放上白板：{{v0}}", { v0: compiled.error })}</p>}
          {saveFailed && <p role="alert">{tr("这台设备暂时保存不了，请稍后再试。")}</p>}
        </aside>
      </div>

      {checkRun && (
        <CheckDialog
          run={checkRun}
          checks={checks}
          {...(recording.review?.overall && ready ? { overall: recording.review.overall } : {})}
          {...(ready ? { watchHref: `/teach/${recording.id}/watch` } : {})}
          onFix={(key) => { setCheckRun(null); setSelected(key); }}
          onAgain={() => void runCheck()}
          onClose={() => setCheckRun(null)}
        />
      )}
    </main>
  );
}

/** m:ss for a take's length. */
function clockText(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
