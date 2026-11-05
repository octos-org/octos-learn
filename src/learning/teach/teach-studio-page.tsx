import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { ArrowUpRight, Braces, Crosshair, Eraser, Highlighter, ListChecks, MousePointer2, Pencil, PenLine, Play, Plus, Sparkles, Undo2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  correctSentence,
  correctTranscript,
  currentTake,
  finishTake,
  answerOcto,
  keptTake,
  recordingComplete,
  renameCard,
  setCardKind,
  setOllOverride,
  setOctoQuestion,
  setPresenter,
  setReview,
  startTake,
  undoTakeEvents,
  type BoardTarget,
  type CardInk,
  type InkMark,
  type LearnerRecording,
  type RecordingEvent,
  type Take,
} from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { syncLessonDrafts } from "./draft-sync";
import { isFigure, learnerAuthor, nextComponentAlias, recordingVariables, type InsertForm } from "./studio-helpers";
import { inkChecksum, inkSnapshotResolver, loadInkSnapshots, saveInkSnapshot } from "./ink-snapshot-store";
import { NeatFormulaPanel, OctoQuestionPanel } from "./assist-panels";
import { currentRowCards } from "./board-rows";
import { CheckDialog, type CheckPart, type CheckRun } from "./check-dialog";
import { cardChecks, lessonReady } from "./lesson-check";
import { checkReadability } from "./readability-check";
import { AddPanel } from "./studio-add";
import { askOcto, explainAssistFailure, inkToMath, reviewLesson } from "./teach-assist";
import { TakeSpeech, type LiveSentence, type Transcribe } from "./take-speech";
import { saveTakePerformance } from "./take-performance-store";
import { useTakeCamera } from "./use-take-camera";
import { OllDrawer } from "./oll-drawer";
import { effectiveLesson } from "./oll-override";
import { presenterAvatar } from "./presenters";
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

/**
 * One step Undo takes back during a take, newest last: a change to the live
 * writing, board actions (with the ink marks their taps added), or writing
 * made neat (the formula goes and the handwriting comes back).
 */
type UndoStep =
  | { kind: "ink"; steps: number }
  | { kind: "board"; events: number; inkMarks?: string[] }
  | { kind: "neat"; inkSnapshot: string; inkSteps: number };

const StudioAvatar = lazy(() => import("./studio-avatar"));

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
  const camera = useTakeCamera(clock);
  // Whether this take started with the camera on; a performance is kept only then.
  const cameraTake = useRef(false);
  const speechRef = useRef<TakeSpeech | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [liveSentences, setLiveSentences] = useState<LiveSentence[]>([]);
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
  const [advanced, setAdvanced] = useState(false);
  const undoSteps = useRef<UndoStep[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const pushUndo = (step: UndoStep) => { undoSteps.current.push(step); setCanUndo(true); };
  const clearUndo = () => { undoSteps.current = []; setCanUndo(false); };
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
  // The draft is also kept with the account, a few seconds after the learner stops changing it and never mid-take.
  const changedAt = recording?.updatedAt;
  // Why this lesson could not be kept with the account, when the service refused it.
  const [syncProblem, setSyncProblem] = useState<string | null>(null);
  const lessonId = recording?.id;
  useEffect(() => {
    if (!changedAt || isRecording || !lessonId) return;
    const timer = setTimeout(() => {
      void syncLessonDrafts(localStorage, profileId)
        .then((result) => setSyncProblem(result.failed[lessonId] ?? null))
        // Not reachable (offline, signed out): the draft is safe on this device and syncs later.
        .catch(() => undefined);
    }, 4_000);
    return () => clearTimeout(timer);
  }, [changedAt, isRecording, profileId, lessonId]);
  const now = () => new Date(clock()).toISOString();
  const elapsed = () => Math.max(0, clock() - (takeStartedAt.current ?? clock()));

  const compiled = useMemo<{ lesson: CompiledLesson | null; error?: string }>(() => {
    if (!recording) return { lesson: null };
    try {
      const lesson = compileRecording(recording, { author: learnerAuthor(profileId, recording.presenter), language: getLocale(), includeTakeInProgress: true });
      // Loaded the way the board loads it, so a problem is shown instead of breaking the page.
      reduceCanonicalEvents(normalizeAuthoringLesson(lesson.lesson, { lessonId: STUDIO_LESSON_ID, boardId: "studio-board", baseRevision: 0, resourceContext: lesson.resourceContext }));
      return { lesson };
    } catch (error) {
      if (error instanceof EmptyLessonError) return { lesson: null };
      return { lesson: null, error: (error as Error).message };
    }
  }, [recording, profileId]);
  // The board shows the lesson as viewers see it at the end of the selected
  // card: later cards are not on it yet, and highlights made on this card
  // still show (the next card ends them).
  const boardLesson = useMemo<CompiledLesson | null>(() => {
    if (!recording || !compiled.lesson || !selected) return compiled.lesson;
    try {
      return compileRecording(recording, { author: learnerAuthor(profileId, recording.presenter), language: getLocale(), includeTakeInProgress: true, throughCard: selected });
    } catch (error) {
      // Nothing on the board yet up to this card: an empty board, not the later cards.
      return error instanceof EmptyLessonError ? null : compiled.lesson;
    }
  }, [recording, compiled.lesson, selected, profileId]);
  // Starting a card over removes its board; when later cards build on it, the lesson would break.
  const startOverBreaks = useMemo(() => {
    if (!recording || !card || isRecording || !keptTake(card)) return null;
    try {
      compileRecording(startTake(recording, card.key, new Date().toISOString(), { fresh: true }), { author: learnerAuthor(profileId, recording.presenter), language: getLocale(), includeTakeInProgress: true });
      return null;
    } catch (error) {
      return error instanceof EmptyLessonError ? null : (error as Error).message;
    }
  }, [recording, card, isRecording, profileId]);

  /** Records board actions of the take; together they are one step for Undo unless `undo` is false (the caller adds its own). */
  const record = (events: RecordingEvent | RecordingEvent[], undo: false | { inkMarks?: string[] } = {}) => {
    if (!recording || !card || !isRecording) return;
    const key = card.key;
    const list = Array.isArray(events) ? events : [events];
    update((current) => list.reduce((next, event) => appendEvent(next, key, event, now()), current));
    if (undo) pushUndo({ kind: "board", events: list.length, ...(undo.inkMarks?.length ? { inkMarks: undo.inkMarks } : {}) });
  };
  // Drawing, erasing and moving writing are steps for Undo too, in the order they happen.
  const [inkVersion, setInkVersion] = useState(0);
  useEffect(() => boardRef.current?.onInkEdit((steps) => {
    setInkVersion((version) => version + 1);
    if (takeStartedAt.current !== null) pushUndo({ kind: "ink", steps });
  }), []);
  /** Takes back the take's latest step: what was added last disappears from the board, as if it was never done. */
  const undo = async () => {
    const key = card?.key;
    const step = undoSteps.current.pop();
    setCanUndo(undoSteps.current.length > 0);
    if (!step || !key || !isRecording) return;
    setArrowFrom(null);
    boardRef.current?.showPointer(null);
    if (step.kind === "board") update((current) => undoTakeEvents(current, key, step.events, now(), { inkMarks: step.inkMarks }));
    if (step.kind === "neat") update((current) => undoTakeEvents(current, key, 1, now(), { inkSnapshot: step.inkSnapshot }));
    if (step.kind !== "board") {
      await boardRef.current?.undoInk(step.kind === "ink" ? step.steps : step.inkSteps);
      setInkVersion((version) => version + 1);
    }
  };
  // ⌘Z / Ctrl+Z is Undo while recording, except while typing; caught first, so the ink editor never undoes on its own.
  const undoRef = useRef(undo);
  useEffect(() => { undoRef.current = undo; });
  useEffect(() => {
    if (!isRecording) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
      if (typing) return;
      event.preventDefault();
      event.stopPropagation();
      void undoRef.current();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isRecording]);
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
    clearUndo();
    cameraTake.current = latest.current?.presenter?.cameraMotion === "on";
    if (cameraTake.current) camera.begin(takeStartedAt.current);
    void boardRef.current?.startInk(`${recording.id}:${key}:take-${card.takes.length + 1}`);
    // Each sentence is transcribed as soon as the learner finishes it.
    const recognition = fetchCloudAsrStatus().then((status) => status.available).catch(() => false);
    const transcribe: Transcribe = async (wav, signal) => {
      if (!(await recognition)) throw new Error("Speech recognition is not connected");
      return transcribeCloudSpeech(wav, signal, { language: getLocale() });
    };
    setLiveSentences([]);
    setMic({ listening: null, speaking: false, transcribing: 0 });
    level.reset();
    const speech = new TakeSpeech(elapsed, transcribe, (update) => {
      if (speechRef.current !== speech) return;
      setLiveSentences(update.sentences);
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
    const startedAt = takeStartedAt.current;
    clearUndo();
    const performance = cameraTake.current ? camera.end() : null;
    cameraTake.current = false;
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
    let spoken: Awaited<ReturnType<TakeSpeech["finish"]>> = { text: "", segments: [], failed: 0 };
    if (speech) {
      spoken = await speech.finish();
      const connected = await fetchCloudAsrStatus().then((status) => status.available).catch(() => false);
      if (spoken.failed && !connected) setNotice(tr("还没有连接语音识别。请在下面输入你在这张卡片说的话。"));
      else if (spoken.failed) setNotice(tr("有 {{v0}} 段话没听清。请在下面补上。", { v0: spoken.failed }));
      else if (!spoken.speechSpanMs && listening.current) setNotice(tr("这次没有听到你说话。看看麦克风有没有打开，或者在下面输入你说的话。"));
    }
    setLiveSentences([]);
    // Strokes the learner pointed at that are still there become selections of the frozen writing.
    const board = boardRef.current;
    const marks = unassignedMarks(key).filter((mark) => board?.hasStrokeAt(centre(mark.box)));
    const frozen = await board?.freezeInk();
    const ink: CardInk[] = frozen ? [await keepInk(key, recordingTake.take, frozen, [], undefined, marks, startedAt)] : [];
    // The face and head parameters stay on this device with the take.
    let cameraKept = false;
    if (performance) {
      try { await saveTakePerformance({ profileId, recordingId: recording.id, cardKey: key, take: recordingTake.take }, performance); cameraKept = true; }
      catch { setNotice(tr("这次的摄像头动作没能保存，形象会只跟着配音动嘴。")); }
    }
    // The learner corrects what recognition heard, or types it, below.
    update((current) => finishTake(current, key, now(), {
      durationMs: duration, asrText: spoken.text, speechSpanMs: spoken.speechSpanMs ?? [0, duration], segments: spoken.segments, ink, camera: cameraKept,
    }));
    setTranscribing(false);
    if (card.kind === "teach") void askOctoAbout(key);
  };

  /**
   * Stores frozen ink on this device and describes it for the card. Marks on
   * its strokes become selections, with their place in the writing as regions.
   */
  const keepInk = async (key: string, take: number, frozen: FrozenInk, selections: string[], part?: number, marks: InkMark[] = [],
    startedAt: number | null = takeStartedAt.current): Promise<CardInk> => {
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
      take,
      // Stroke times in take time, so the lesson writes each stroke where it was written among the words.
      ...(frozen.strokeDrawnAt && startedAt !== null ? { strokeTimesMs: frozen.strokeDrawnAt.map((at) => Math.max(0, Math.round(at - startedAt))) } : {}),
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
      return compileRecording(current, { author: learnerAuthor(profileId, current.presenter), language: getLocale() });
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
    } catch (error) {
      // A rejected key is not the learner's handwriting: say what to fix.
      const problem = explainAssistFailure(error);
      setNotice(problem.startsWith(tr("出了点问题：")) ? tr("这次没能整理，请再试一次。") : problem);
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
    record(withTime({ type: "make_neat.confirmed" as const, selection, latex, alias, replacesInk: true }), false);
    pushUndo({ kind: "neat", inkSnapshot: ink.snapshotId, inkSteps: frozen.undoSteps });
  };

  // Check my lesson: the screen check and Octo's review run together; what
  // each found is kept with the draft, so the cards show it until re-checked.
  const runCheck = async () => {
    const current = latest.current;
    const made = current ? compileQuietly(current) : null;
    // The lesson that will be watched and saved: the learner's hand-edited OLL while it is current.
    const lesson = current && made ? effectiveLesson(current, made).compiled : null;
    if (!current || !lesson) return;
    const at = now();
    setCheckRun({ screen: "running", octo: "running" });
    const finished = (part: keyof CheckRun, state: CheckPart) => setCheckRun((run) => (run ? { ...run, [part]: state } : run));
    const [screen, reviewed] = await Promise.all([
      checkReadability(lesson, resolveAsset).then((found) => { finished("screen", "done"); return found; }, () => { finished("screen", "failed"); return null; }),
      reviewLesson(current, lesson, getLocale()).then((found) => { finished("octo", "done"); return found; }, (error: unknown) => {
        const octoProblem = explainAssistFailure(error);
        setCheckRun((run) => (run ? { ...run, octo: "failed", octoProblem } : run));
        return null;
      }),
    ]);
    if (!screen && !reviewed) return;
    update((latestRecording) => setReview(latestRecording, {
      at, cards: reviewed?.cards ?? [], overall: reviewed?.overall ?? "", ...(screen ? { screen } : {}),
      ...(reviewed?.personal_details ? { personal: reviewed.personal_details.map((detail) => ({ card: detail.key, quote: detail.quote, kind: detail.kind })) } : {}),
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
    camera.abort();
    cameraTake.current = false;
    clearUndo();
    setLiveSentences([]);
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
  /**
   * A pointing tool used on a card, part, or stroke of writing; `at` is where
   * to show the pointer when not on a card, `mark` the ink mark a tap on
   * writing added. The laser points for a moment; the highlighter's mark
   * stays (the board draws it from the recording).
   */
  const onTarget = (target: BoardTarget, at?: { x: number; y: number }, mark?: string) => {
    const pointer = at ? { at } : target;
    const marks = (...selections: Array<string | undefined>) => ({ inkMarks: selections.filter((selection): selection is string => Boolean(selection)) });
    if (tool === "laser") {
      record(withTime({ type: "tool.laser" as const, target }), marks(mark));
      boardRef.current?.showPointer(pointer);
    }
    if (tool === "highlighter") record(withTime({ type: "tool.highlighter" as const, target }), marks(mark));
    if (tool === "arrow") {
      // An arrow joins cards: a tap on part of a card means the card.
      const end: BoardTarget = "node" in target ? { node: target.node } : target;
      if (!arrowFrom) {
        setArrowFrom(end);
        arrowFromMark.current = mark;
        boardRef.current?.showPointer("node" in end ? end : pointer, { hold: true });
        return;
      }
      if ("node" in end && "node" in arrowFrom && end.node === arrowFrom.node) {
        setNotice(tr("箭头连接两张不同的卡片。请点另一张卡片。"));
        return;
      }
      setNotice(null);
      record(withTime({ type: "tool.arrow" as const, from: arrowFrom, to: end }), marks(arrowFromMark.current, mark));
      setArrowFrom(null);
      arrowFromMark.current = undefined;
      boardRef.current?.showPointer(null);
    }
  };
  const arrowFromMark = useRef<string | undefined>(undefined);
  // A stroke of the take's own writing becomes a selection when the writing is frozen.
  const onStroke = (box: BoardBox) => {
    if (!card || !recordingTake) return;
    const key = card.key;
    const marks = latest.current?.cards.find((candidate) => candidate.key === key)?.takes.at(-1)?.inkMarks ?? [];
    const selection = `sel-${key}-t${recordingTake.take}-m${marks.length + 1}`;
    update((current) => addInkMark(current, key, { selection, box }, now()));
    onTarget({ inkSelection: selection }, centre(box), selection);
  };
  // The highlighter's marks on writing that is still live; frozen writing shows its marks from the lesson.
  const liveTake = card ? currentTake(card) : undefined;
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const frozen = new Set((liveTake?.ink ?? []).flatMap((ink) => ink.selections));
    const highlighted = new Set((liveTake?.events ?? []).flatMap((event) => (event.type === "tool.highlighter" && "inkSelection" in event.target ? [event.target.inkSelection] : [])));
    board.markInk((liveTake?.inkMarks ?? [])
      .filter((mark) => highlighted.has(mark.selection) && !frozen.has(mark.selection) && board.hasStrokeAt(centre(mark.box)))
      .map((mark) => mark.box));
  }, [liveTake, inkVersion]);

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
  const row = isRecording && addOpen && isFigure(form) ? currentRowCards(boardLesson) : [];
  const hint = !isRecording ? null
    : addOpen ? null
      : tool === "laser" ? tr("激光笔：点一下卡片、它的一部分或你写的字，红点会闪一下，像用手指着说“看这里”。")
        : tool === "highlighter" ? tr("荧光笔：点图上的一个点、一条线，或你写的字，只有它会一直标黄；点卡片的空白处，整张卡片标黄。")
        : tool === "arrow" ? (arrowFrom ? tr("再点箭头指向的地方。") : tr("先点箭头从哪里出发。"))
          : tool === "pen" ? tr("直接在白板上写。写在图上的会贴在那张图上。")
            : null;
  const tools: Array<[Tool | "neat", string, typeof PenLine]> = [
    ["pen", tr("笔"), PenLine], ["eraser", tr("橡皮"), Eraser], ["neat", tr("整理"), Sparkles],
  ];
  const pointers: Array<[Tool, string, typeof PenLine]> = [
    ["laser", tr("激光笔"), Crosshair], ["highlighter", tr("荧光笔"), Highlighter], ["arrow", tr("箭头"), ArrowUpRight],
  ];
  const cameraMotion = recording.presenter?.cameraMotion === "on";
  const startOverHint = tr("后面的卡片用到了这张卡片上的东西，从头来会让它们出错。可以“重录我的话”，或者先把后面用到它的卡片从头来。");
  const avatarPreview = (
    <Suspense fallback={null}>
      <StudioAvatar characterId={presenterAvatar(recording.presenter?.avatar).id} frame={camera.frame} state={camera.state} onOpen={camera.open} />
    </Suspense>
  );
  const dockButton = ([value, label, Icon]: [Tool | "neat", string, typeof PenLine]) => (
    <button key={value} type="button" className="teach-tool" disabled={!isRecording}
      aria-pressed={value === "neat" ? neat.stage !== "idle" : tool === value && !addOpen}
      onClick={() => (value === "neat" ? startNeat() : chooseTool(value))}>
      <Icon size={20} aria-hidden="true" />{label}
    </button>
  );

  return (
    <main className="teach-page teach-studio" data-recording={isRecording || undefined}>
      {/* The camera image is only read by the on-device face model; it is never shown, kept or sent. */}
      <video ref={camera.video} className="teach-camera-feed" muted playsInline aria-hidden="true" />
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
            <button type="button" className="teach-icon-button" aria-label={tr("高级：课程数据")} title={tr("高级：课程数据")} aria-pressed={advanced} onClick={() => setAdvanced(!advanced)}>
              <Braces size={16} aria-hidden="true" />
            </button>
            {ready ? (
              <Link className="teach-primary" to={`/teach/${recording.id}/watch`}><Play size={16} aria-hidden="true" />{tr("看我的课")}</Link>
            ) : (
              <button type="button" className="teach-primary" disabled title={tr("检查通过后就能看你的课了")}><Play size={16} aria-hidden="true" />{tr("看我的课")}</button>
            )}
          </>
        )}
      </header>
      {syncProblem && <p role="status" className="teach-notice teach-sync-problem">{syncProblem}</p>}

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
            compiled={boardLesson}
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
            <span className="teach-dock-divider" aria-hidden="true" />
            <button type="button" className="teach-tool" disabled={!isRecording || !canUndo} title={tr("撤销（⌘/Ctrl+Z）")} onClick={() => void undo()}>
              <Undo2 size={20} aria-hidden="true" />{tr("撤销")}
            </button>
          </div>
        </section>

        <aside className="teach-panel" aria-label={tr("这张卡片")}>
          {card && !isRecording && (
            <div className="teach-panel-title">
              <div className="teach-group-label">{tr("第 {{v0}} 张，共 {{v1}} 张", { v0: cardIndex + 1, v1: recording.cards.length })}</div>
              <CardTitle key={card.key} title={card.title} onRename={(title) => update((current) => renameCard(current, card.key, title, now()))} />
              {kept && cardCheck?.status !== "fix" && <span className="teach-recorded">{tr("✓ 已录好 · {{v0}}", { v0: clockText(kept.durationMs ?? 0) })}</span>}
              <label className="teach-place teach-camera-toggle">
                <input type="checkbox" checked={recording.presenter?.cameraMotion === "on"}
                  onChange={(event) => {
                    const on = event.target.checked;
                    update((current) => setPresenter(current, on ? { cameraMotion: "on", mouthMotion: "basic" } : { cameraMotion: "off" }, now()));
                    if (on) camera.open(); else camera.close();
                  }} />
                <span>{tr("用摄像头带动我的形象")}</span>
              </label>
              {cameraMotion && <p className="academy-muted teach-camera-note">{tr("你的形象会跟着你的表情和转头动，录课时这些动作会记下来。只在这台设备上识别，不保存、不上传你的画面。")}</p>}
              {cameraMotion && avatarPreview}
            </div>
          )}

          {isRecording && (
            <>
              <button type="button" className="teach-stop" disabled={transcribing} onClick={() => void stop()}>
                <span aria-hidden="true" />{transcribing ? tr("正在整理字幕…") : tr("停止 · {{v0}}", { v0: clockText(takeClock) })}
              </button>
              {notice && <p role="status" className="teach-notice">{notice}</p>}
              {cameraMotion && avatarPreview}
              <section className="teach-live-captions" aria-label={tr("你正在说的话")}>
                <MicStatus state={mic} level={level} />
                <h2 className="teach-group-label">{tr("你正在说的话")}</h2>
                {liveSentences.length ? (
                  <ol className="teach-sentences" aria-live="polite">
                    {liveSentences.map((sentence, index) => (
                      <li key={index} className="teach-sentence" data-state={sentence.state}>
                        {sentence.state === "text" ? sentence.text : sentence.state === "transcribing" ? tr("正在听写…") : tr("这句没听清，停止后可以补上。")}
                      </li>
                    ))}
                  </ol>
                ) : <p className="academy-muted">{tr("开始说吧，你说的话会出现在这里。")}</p>}
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
                    record([
                      withTime({ type: "your_turn.demonstrated" as const, variable: exercise.variable, value: exercise.value }),
                      withTime({ type: "your_turn.check_picked" as const, expression: exercise.expression, value: exercise.target, tolerance: exercise.tolerance }),
                      ...(exercise.hint ? [withTime({ type: "your_turn.hint_spoken" as const, text: exercise.hint })] : []),
                    ]);
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
              {card.takes.length === 0 && (card.kind === "your_turn" || !recording.cards.some((other) => other.kind === "your_turn")) && (
                <button type="button" className="teach-secondary" onClick={() => update((current) => setCardKind(current, card.key, card.kind === "your_turn" ? "teach" : "your_turn", now()))}>
                  {card.kind === "your_turn" ? tr("改回讲解卡片") : tr("把这张改成“轮到你了”练习")}
                </button>
              )}
              {notice && <p role="status" className="teach-notice">{notice}</p>}
            </>
          )}

          {card && !isRecording && kept && cardCheck?.status === "fix" && (
            <>
              <div className="teach-fix" role="status">
                <div className="teach-fix-title">{tr("这张卡片要改的地方")}</div>
                {cardCheck.findings.map((finding, index) => <p key={`${finding.source}-${index}`}>{finding.message}</p>)}
              </div>
              <WordsEditor key={`${card.key}-${kept.take}`} cardKey={card.key} take={kept} update={update} now={now}
                label={tr("你的话（课会用这些话来讲，可以直接改）")} />
              <button type="button" className="teach-record" onClick={() => start()}><span aria-hidden="true" />{tr("重录我的话")}</button>
              <p className="academy-muted teach-centered">{tr("白板上的东西会留着，只重新录你说的话和指的地方。")}</p>
              <button type="button" className="teach-link-button" disabled={Boolean(startOverBreaks)} onClick={() => start(true)}>{tr("这张卡片从头来")}</button>
              {startOverBreaks && <p className="academy-muted teach-centered">{startOverHint}</p>}
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
              <WordsEditor key={`${card.key}-${kept.take}`} cardKey={card.key} take={kept} update={update} now={now} />
              {notice && <p role="status" className="teach-notice">{notice}</p>}
              <div className="teach-panel-end teach-panel-actions">
                {nextCard ? (
                  <button type="button" className="teach-primary" onClick={() => setSelected(nextCard.key)}>{tr("下一张：第 {{v0}} 张 →", { v0: cardIndex + 2 })}</button>
                ) : (
                  <button type="button" className="teach-primary" disabled={!compiled.lesson || !recordingComplete(recording)} onClick={() => void runCheck()}>{tr("检查我的课")}</button>
                )}
                <div className="teach-panel-row">
                  <button type="button" className="teach-secondary" onClick={() => start()}>{tr("重录我的话")}</button>
                  <button type="button" className="teach-secondary" disabled={Boolean(startOverBreaks)} onClick={() => start(true)}>{tr("这张卡片从头来")}</button>
                </div>
                {startOverBreaks && <p className="academy-muted">{startOverHint}</p>}
              </div>
            </>
          )}
          {compiled.error && <p role="alert">{tr("这张卡片里有一处无法放上白板：{{v0}}", { v0: compiled.error })}</p>}
          {saveFailed && <p role="alert">{tr("这台设备暂时保存不了，请稍后再试。")}</p>}
        </aside>
        {advanced && !isRecording && (
          <OllDrawer recording={recording} compiled={compileQuietly(recording)}
            onApply={(override) => update((current) => setOllOverride(current, override, now()))} onClose={() => setAdvanced(false)} />
        )}
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

/**
 * What the learner said on a card, to correct before the lesson narrates it:
 * one box per sentence when the take kept its sentences, else one box.
 */
function WordsEditor({ cardKey, take, label, update, now }: {
  cardKey: string; take: Take; label?: string;
  update: (change: (current: LearnerRecording) => LearnerRecording) => void; now: () => string;
}) {
  if (!take.segments) {
    return <TranscriptEditor text={take.text ?? ""} {...(label ? { label } : {})} onSave={(text) => update((current) => correctTranscript(current, cardKey, text, now()))} />;
  }
  return (
    <SentencesEditor sentences={take.segments.map((segment) => segment.text)} {...(label ? { label } : {})}
      onSave={(changes) => update((current) => changes.reduce((next, change) => correctSentence(next, cardKey, change.index, change.text, now()), current))} />
  );
}

function SentencesEditor({ sentences, label, onSave }: { sentences: string[]; label?: string; onSave: (changes: Array<{ index: number; text: string }>) => void }) {
  const [values, setValues] = useState(sentences);
  const changes = values.flatMap((value, index) => (value.trim() !== sentences[index] ? [{ index, text: value }] : []));
  const empty = values.every((value) => !value.trim());
  return (
    <form className="teach-step" onSubmit={(event) => { event.preventDefault(); if (changes.length && !empty) onSave(changes); }}>
      <fieldset className="teach-sentences-edit">
        <legend className="teach-label">{label ?? tr("你在这张卡片说的话")}</legend>
        <ol className="teach-sentences">
          {values.map((value, index) => (
            <li key={index} className="teach-sentence">
              <textarea className="teach-input" rows={2} value={value}
                aria-label={tr("第 {{v0}} 句", { v0: index + 1 })}
                placeholder={tr("这句没听清，在这里写下你说的话。")}
                onChange={(event) => setValues((current) => current.map((item, position) => (position === index ? event.target.value : item)))} />
            </li>
          ))}
        </ol>
      </fieldset>
      <button type="submit" disabled={!changes.length || empty}>{tr("保存字幕")}</button>
    </form>
  );
}

function TranscriptEditor({ text, label, onSave }: { text: string; label?: string; onSave: (text: string) => void }) {
  const [value, setValue] = useState(text);
  return (
    <form className="teach-step" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSave(value); }}>
      <label className="teach-label">
        {label ?? tr("你在这张卡片说的话")}
        <textarea className="teach-input" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <button type="submit" disabled={!value.trim() || value === text}>{tr("保存字幕")}</button>
    </form>
  );
}

// A unit circle's variable is its angle, which the board calls θ.
const READOUTS = (variable: string) => [
  { expression: `sin(${variable})`, label: "sin θ" },
  { expression: `cos(${variable})`, label: "cos θ" },
  { expression: variable, label: tr("θ 本身（弧度）") },
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
      <h2 className="teach-group-label">{tr("设置练习")}</h2>
      <p className="academy-muted">{tr("① 先说出题目，再在白板上拖动单位圆下面的滑块（或圆上的点），把正确答案摆出来。")}</p>
      {variables.length > 1 && (
        <select className="teach-input" value={variable} aria-label={tr("拖动哪个")} onChange={(event) => { setVariable(event.target.value); setExpression(`sin(${event.target.value})`); setDemonstrated(undefined); }}>
          {variables.map((alias) => <option key={alias} value={alias}>{alias}</option>)}
        </select>
      )}
      <p className="academy-muted">{tr("② 摆好了，点这个按钮记下来：")}</p>
      <button type="button" className="teach-secondary" onClick={() => setDemonstrated(valueOf(variable))}>{tr("就是这个答案")}</button>
      {demonstrated !== undefined && (
        <>
          <p className="academy-muted">{tr("③ 选看的人要做对的是哪个数，可以写一句提示，然后保存。看课的人要自己拖到这个答案，才算做对。")}</p>
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

/** The card's title; the learner can rename it. */
function CardTitle({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <div className="teach-card-title">
        <h2>{title}</h2>
        <button type="button" className="teach-icon-button" aria-label={tr("改卡片名字")} title={tr("改卡片名字")} onClick={() => setDraft(title)}>
          <Pencil size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }
  const save = () => {
    if (!draft.trim()) return;
    if (draft.trim() !== title) onRename(draft);
    setDraft(null);
  };
  return (
    <form className="teach-card-title" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <input value={draft} maxLength={80} autoFocus aria-label={tr("卡片名字")} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape") setDraft(null); }} />
      <button type="submit" className="teach-secondary" disabled={!draft.trim()}>{tr("保存")}</button>
      <button type="button" className="teach-link-button" onClick={() => setDraft(null)}>{tr("取消")}</button>
    </form>
  );
}
