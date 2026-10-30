import { getLocale, tr, type Locale } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { useLearningHistoryRecorder } from "./history/use-learning-history";
import { openHistoryApi } from "./history/history-api";
import { LearnerBackgroundCache } from "./teachers/learner-background";
import { lessonContextSupport, type LessonContextField } from "./teachers/lesson-context-support";
import { classroomTeacher } from "./teachers/classroom-teacher";
import { useLessonTeachers } from "./teachers/lesson-teachers";
import { narrationTeacher } from "./teachers/narration-teacher";
import { NEUTRAL_REACTIONS, teacherProfile, teacherReactions, useSelectedTeacher, type TeacherDefinition } from "./teachers/teachers";
import { holdAwards, muteAwardVoice } from "./academy/award-events";
import { getMyMemory } from "../settings/settings-api";
import { recordDeliveredLesson, recordFailedRequest, recordTeacherText } from "./history/delivered-material";
import type { PlaybackHistoryBinding, PlaybackHistoryContext } from "./history/playback-recorder";
import { openCapabilitySettings } from "@/byok/events";
import { LessonModelError, lessonModelErrorCode, lessonModelErrorMessage } from "./lesson-model-errors";
import { hasStoredInk } from "./learning-document-store";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LearningModelContext, LearningModelIssueContext } from "./setup-state";
import type { CanonicalEvent } from "octos-lesson-language";
import { LanguageSwitch } from "@/i18n/language-switch";
import { compilePlaybackOperations, HeadlessLessonPlayer } from "octos-lesson-language/player";
import { parseCanonicalJsonl } from "octos-lesson-language/web-runtime";
import {
  Camera,
  CameraOff,
  ChevronRight,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { uploadFiles } from "@/api/chat";
import { ensureSelectedProfileId, getToken } from "@/api/client";
import { getSessionFiles } from "@/api/sessions";
import {
  invokeSkillAction,
  listSkillActions,
  listSkillActionJobs,
  type SkillActionJob,
} from "@/api/skill-actions";
import { sendMessage } from "@/runtime/ui-protocol-send";
import { BridgeTimeoutError } from "@/runtime/ui-protocol-bridge";
import { getAnyConnectedBridge } from "@/runtime/ui-protocol-runtime";
import { SelectionRequestState } from "./selection-request-state";
import { unlockAudio } from "@/home/voice/audio-playback";
import { CameraPreview } from "@/home/voice/camera-preview";
import {
  DEFAULT_CAMERA_FRAME_SETTINGS,
} from "@/home/voice/use-camera-frame";
import {
  useVoiceConversation,
  type LearningClientTiming,
  type VoiceConversationOptions,
  type VoiceUtteranceOptions,
  type VoiceConversationTurn,
} from "@/home/voice/use-voice-conversation";
import { useOminixRuntimeSummary } from "@/home/use-ominix-runtime-summary";
import { useRenderThreads } from "@/store/projection-render-adapter";
import type { Thread } from "@/store/thread-store";
import { CameraSettingsDialog } from "./camera-settings-dialog";
import type { LearningBoardContext } from "./learning-board-context";
import geometryLessonSource from "./oll/fixtures/geometry-auxiliary-line-v2.canonical.jsonl?raw";
import mathTwoPointsSource from "./oll/fixtures/math-two-points.canonical.jsonl?raw";
import mathCircleAreaSource from "./oll/fixtures/math-circle-area.canonical.jsonl?raw";
import unitCircleSineLessonSource from "./oll/fixtures/unit-circle-sine.canonical.jsonl?raw";
import { OllCourseOutline } from "./oll/oll-course-outline";
import {
  LearningWhiteboard,
  type DegradedVisualRetryRequest,
  type LearningCourseRenderEvent,
  type VoiceInkSelectionCapture,
  type VoiceInkSelectionRequest,
} from "./oll/oll-lesson-runtime";
import type { InkSelectionSnapshot } from "octos-lesson-language/ink-runtime";
import {
  buildDegradedVisualRetryContext,
  buildDegradedVisualRetryPrompt,
} from "./degraded-visual-retry";
import { isLessonDeliverySettled } from "./oll/lesson-delivery";
import { useOllNarrationTts } from "./oll/use-oll-narration-tts";
import {
  buildOllLessonTopics,
  courseReplayStartStep,
  collectOllLessonArtifacts,
  collectPersistedOllLessonArtifacts,
  composeOllClassroomEvents,
  isOllLessonArtifact,
  loadOllLessonArtifact,
  mergeOllLessonArtifacts,
  ollArtifactIdentity,
} from "./oll/oll-artifacts";
import {
  ollPlaybackStorageKey,
  type OllFixture,
} from "./oll/oll-playback-storage";
import {
  coursePackNarrationBlob,
  type CoursePackPlaybackSource,
} from "./course-pack/course-pack-loader";
import { useOllLessonRuntime, type OllLessonTopicDefinition } from "./oll/use-oll-lesson-runtime";
import {
  addSelectionSource,
  buildSelectionClassificationActionArguments,
  buildSelectionEnhancementActionArguments,
  buildSelectionEnhancementTurnContext,
  collectPersistedSelectionEnhancementArtifacts,
  collectSelectionEnhancementArtifacts,
  formatSelectionLessonRequest,
  hideSelectionEnhancement,
  removeSelectionSources,
  loadSelectionEnhancementArtifact,
  loadSelectionEnhancementState,
  mergeSelectionEnhancementArtifacts,
  parseSelectionClassificationMetadata,
  saveSelectionEnhancementState,
  setSelectionEnhancementCardLayout,
  selectionArtifactMatchesSource,
  selectionBoardContextTargetsExist,
  type SelectionBoardContext,
  type SelectionClassification,
  type SelectionContentKind,
  type SelectionEnhancementArtifact,
  type SelectionEnhancementCardLayout,
  type SelectionEnhancementState,
} from "./selection-enhancements";
import {
  isSelectionLessonRequest,
  selectionAnswerPresentation,
  type SelectionToolId,
} from "./selection-tools";
import { isCurrentInkMergeCompletion } from "./ink-replay";
import { OctosTeacher } from "./octos-teacher";
import { StudentInputDock } from "./student-input-dock";
import type { WhiteboardLoadingState } from "./whiteboard-loading-block";
import {
  buildComposerBoardReferenceContext,
  type ComposerBoardReference,
} from "./composer-board-references";
import {
  isCourseWhiteboardQuestion,
  loadWhiteboardQuestions,
  saveWhiteboardQuestions,
  type WhiteboardQuestionRecord,
  type WhiteboardQuestionStatus,
} from "./whiteboard-questions";
import {
  COURSE_PENDING_FOOTPRINT_HEIGHT,
  COURSE_PENDING_FOOTPRINT_WIDTH,
  createCourseRegion,
  expandCourseRegionBounds,
  loadCourseRegions,
  saveCourseRegions,
  type CourseRegionRecord,
} from "./course-regions";
import { LearnTraceRecorder } from "./learn-trace";
import { LearningTraceInspector } from "./learning-trace-inspector";
import {
  loadRecoverableJson,
  removeRecoverableValue,
  writeRecoverableJson,
} from "./recoverable-storage";
import { evaluateAdmissionFastGate } from "./admission-fast-gate";
import { buildCurrentLessonContext } from "./current-lesson-context";
import { JevAdmissionDebugger } from "./jev-admission-debugger";
import { useDebugSettings } from "@/hooks/use-debug-settings";
import "./learning-workspace.css";

const geometryLessonEvents = parseCanonicalJsonl(geometryLessonSource);
const unitCircleSineLessonEvents = parseCanonicalJsonl(unitCircleSineLessonSource);

const ollFixtureEvents: Record<OllFixture, CanonicalEvent[]> = {
  "math-two-points": parseCanonicalJsonl(mathTwoPointsSource),
  "math-circle-area": parseCanonicalJsonl(mathCircleAreaSource),
  "geometry-v2": geometryLessonEvents,
  "unit-circle-sine": unitCircleSineLessonEvents,
};

const DELIVERABLE_ARTIFACT_SUFFIXES = [
  ".octos-lesson.json",
  ".octos-selection-enhancement.json",
] as const;

export const LESSON_COMPLETION_SPEECH = NEUTRAL_REACTIONS.lessonComplete;
const INTERRUPT_CAPTION_MS = 3_000;
export const LESSON_COMPLETION_BUBBLE_DURATION_MS = 6_000;

interface PendingLessonJobRecord {
  jobId: string;
  turnId: string;
  referenceIds: string[];
  actionId?: "learning.lesson.generate"
    | "learning.lesson.generate-from-camera"
    | "learning.lesson.generate-from-selection";
}

function pendingLessonJobsStorageKey(sessionId: string): string {
  return `octos-learning-lesson-jobs:v1:${sessionId}`;
}

function loadPendingLessonJobs(sessionId: string): Map<string, PendingLessonJobRecord> {
  if (typeof window === "undefined") return new Map();
  return loadRecoverableJson({
    storage: window.localStorage,
    key: pendingLessonJobsStorageKey(sessionId),
    fallback: () => new Map(),
    decode: (records) => {
      if (!Array.isArray(records) || records.some((candidate) => (
        !candidate
        || typeof candidate !== "object"
        || typeof candidate.jobId !== "string"
        || typeof candidate.turnId !== "string"
        || !Array.isArray(candidate.referenceIds)
        || candidate.referenceIds.some((id: unknown) => typeof id !== "string")
        || (candidate.actionId !== undefined
          && candidate.actionId !== "learning.lesson.generate"
          && candidate.actionId !== "learning.lesson.generate-from-camera"
          && candidate.actionId !== "learning.lesson.generate-from-selection")
      ))) {
        throw new Error("invalid pending lesson job state");
      }
      return new Map((records as PendingLessonJobRecord[]).map((candidate) =>
        [candidate.jobId, candidate]));
    },
  });
}

function savePendingLessonJobs(
  sessionId: string,
  jobs: ReadonlyMap<string, PendingLessonJobRecord>,
): void {
  try {
    if (typeof window === "undefined") return;
    if (jobs.size === 0) {
      removeRecoverableValue(
        window.localStorage,
        pendingLessonJobsStorageKey(sessionId),
      );
      return;
    }
    writeRecoverableJson(
      window.localStorage,
      pendingLessonJobsStorageKey(sessionId),
      [...jobs.values()],
    );
  } catch {
    // The current page still tracks the job when browser storage is unavailable.
  }
}

function lessonJobError(job: SkillActionJob): string {
  const modelMessage = lessonModelErrorMessage(lessonModelErrorCode(job.result));
  if (modelMessage) return modelMessage;
  const detail = `${job.error ?? ""} ${job.output ?? ""}`.trim();
  if (/\b429\b|resource exhausted|rate.?limit|quota/iu.test(detail)) {
    return tr("课程生成服务当前比较繁忙，请稍后再试。");
  }
  if (/timeout|timed out|超时/iu.test(detail)) {
    return tr("课程生成超时，请稍后再试。");
  }
  return tr("课程生成失败，请重试。");
}

function lessonJobNonLessonResponse(job: SkillActionJob): {
  disposition: "clarify" | "ignore" | "unsupported";
  learnerResponse: string;
} | null {
  if (!job.result || typeof job.result !== "object" || Array.isArray(job.result)) {
    return null;
  }
  const result = job.result as Record<string, unknown>;
  const metadata = result.structured_metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  const disposition = record.lesson_disposition;
  if (disposition !== "clarify" && disposition !== "ignore" && disposition !== "unsupported") {
    return null;
  }
  return {
    disposition,
    learnerResponse: typeof record.learner_response === "string"
      ? record.learner_response.trim()
      : "",
  };
}

const INSUFFICIENT_LESSON_REQUEST_MESSAGE = () =>
  tr("提问信息不足，无法生成课程。请告诉我你想学习的具体内容。");

function lessonJobArtifacts(
  job: SkillActionJob,
  turnId: string,
): ReturnType<typeof collectPersistedOllLessonArtifacts> {
  if (!job.result || typeof job.result !== "object" || Array.isArray(job.result)) {
    return [];
  }
  const result = job.result as Record<string, unknown>;
  if (!Array.isArray(result.artifacts)) return [];
  return result.artifacts.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const artifact = candidate as Record<string, unknown>;
    const filename = typeof artifact.display_name === "string"
      ? artifact.display_name.trim()
      : "";
    const path = typeof artifact.handle === "string"
      ? artifact.handle.trim()
      : "";
    const leaf = filename.replaceAll("\\", "/").split("/").at(-1) ?? filename;
    const belongsToTurn = leaf === `${turnId}.octos-lesson.json`
      || leaf.startsWith(`${turnId}.part-`);
    if (!path || !belongsToTurn || !isOllLessonArtifact({ filename, path })) {
      return [];
    }
    return [{
      id: `lesson-job:${job.job_id}:${index}:${path}`,
      filename,
      path,
      threadId: turnId,
      turnId,
    }];
  });
}

function threadHasDeliverableArtifact(
  threads: Thread[],
  turnId: string,
): boolean {
  const thread = threads.find(
    (candidate) => candidate.id === turnId || candidate.turnId === turnId,
  );
  if (!thread) return false;
  return [
    ...thread.responses,
    ...(thread.pendingAssistant ? [thread.pendingAssistant] : []),
  ].some((message) => message.files.some((file) => {
    const path = file.path.toLowerCase();
    return DELIVERABLE_ARTIFACT_SUFFIXES.some((suffix) => path.endsWith(suffix));
  }));
}

export interface LearningWorkspaceProps {
  /** Question text placed in the input box of a new board; never sent by itself. */
  initialDraft?: string;
  sessionId: string;
  playbackMode?: "live" | "review";
  voiceEnabled?: boolean;
  onUseTextMode?: () => void;
  onUseVoiceMode?: () => Promise<void> | void;
  onLearnerInput?: (text: string) => void;
  onWhiteboardActivity?: () => void;
  onInkSaveHandlerChange?: (
    handler: (() => Promise<void>) | null,
  ) => void;
  initialAudio?: Blob | null;
  conversationOptions?: VoiceConversationOptions;
  onTurnsChange?: (turns: VoiceConversationTurn[]) => void;
  onBoardContextChange?: (context: LearningBoardContext) => void;
  onBack: () => void;
  onVoiceExit?: () => void;
  ollFixture?: OllFixture;
  coursePack?: CoursePackPlaybackSource;
  courseAccessMode?: "preview" | "instance";
  onStartCourseInteraction?: () => void;
}

function inkPlaybackRunStorageKey(sessionId: string): string {
  return `octos-learning-ink-run:v2:${sessionId}`;
}

function inkMergeSourceStorageKey(sessionId: string): string {
  return `octos-learning-ink-merge-source:v2:${sessionId}`;
}

function cumulativeInkRunStorageKey(sessionId: string): string {
  return `octos-learning-ink-cumulative-run:v2:${sessionId}`;
}

function inkDocumentSessionId(sessionId: string, run: number): string {
  return run === 0 ? sessionId : `${sessionId}:replay:${run}`;
}

function readInkPlaybackRun(sessionId: string): number {
  try {
    if (typeof window === "undefined") return 0;
    const parsed = Number(
      window.localStorage.getItem(inkPlaybackRunStorageKey(sessionId)),
    );
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function findLatestSavedInkSessionId(
  sessionId: string,
  fromRun: number,
): string {
  if (typeof window === "undefined") {
    return fromRun > 0 ? `${sessionId}:replay:${fromRun}` : sessionId;
  }
  for (let r = fromRun; r >= 1; r--) {
    const key = `octos-learning-ink:v1:${sessionId}:replay:${r}`;
    if (hasStoredInk(key)) {
      return `${sessionId}:replay:${r}`;
    }
  }
  return sessionId;
}

function readInkMergeSourceSessionId(
  sessionId: string,
  currentRun: number,
): string | null {
  try {
    if (typeof window === "undefined") return null;
    const currentDoc = inkDocumentSessionId(sessionId, currentRun);
    const source = window.localStorage.getItem(
      inkMergeSourceStorageKey(sessionId),
    );
    if (source && (source === sessionId || source.startsWith(`${sessionId}:replay:`))) {
      if (source !== currentDoc) {
        if (source === sessionId || hasStoredInk(`octos-learning-ink:v1:${source}`)) {
          return source;
        }
      }
    }
    const cumulativeRun = Number(
      window.localStorage.getItem(cumulativeInkRunStorageKey(sessionId)),
    );
    if (
      currentRun > 0 &&
      (!Number.isSafeInteger(cumulativeRun) || cumulativeRun !== currentRun)
    ) {
      return findLatestSavedInkSessionId(sessionId, currentRun - 1);
    }
    if (cumulativeRun === currentRun) return null;
    const latest = findLatestSavedInkSessionId(
      sessionId,
      currentRun > 0 ? currentRun - 1 : 100,
    );
    if (
      latest &&
      latest !== currentDoc &&
      (latest === sessionId || hasStoredInk(`octos-learning-ink:v1:${latest}`))
    ) {
      return latest;
    }
    return null;
  } catch {
    return null;
  }
}

export function LearningWorkspace({
  initialDraft,
  sessionId,
  playbackMode = "live",
  voiceEnabled = true,
  onUseTextMode,
  onUseVoiceMode,
  onLearnerInput,
  onWhiteboardActivity,
  onInkSaveHandlerChange,
  initialAudio,
  conversationOptions,
  onTurnsChange,
  onBoardContextChange,
  onBack,
  onVoiceExit,
  ollFixture,
  coursePack,
  courseAccessMode = "instance",
  onStartCourseInteraction,
}: LearningWorkspaceProps) {
  useLocale();
  const { isJevDebuggerVisible, isTraceInspectorVisible } = useDebugSettings();
  const coursePreview = Boolean(coursePack && courseAccessMode === "preview");
  const history = useLearningHistoryRecorder(sessionId, !coursePreview && !ollFixture);
  const historyRecorder = history.recorder;
  const recordedQuestions = useRef(new Set<string>());
  const recordHistoryQuestion = useCallback((id: string, text: string, modality: "text" | "voice" | "image" | "selection", occurredAt?: string) => {
    if (!historyRecorder || !text.trim() || recordedQuestions.current.has(`${sessionId}:${id}`)) return;
    recordedQuestions.current.add(`${sessionId}:${id}`);
    historyRecorder.record({ kind: "question_submitted", runKey: `question:${id}`, questionId: id, stableKey: `question:${id}`, occurredAt, data: { text, modality } });
  }, [historyRecorder, sessionId]);
  const recordHistoryRoute = useCallback((id: string, route: "direct-action" | "turn", media: string[] = [], teacher?: TeacherDefinition) => {
    historyRecorder?.record({ kind: "question_routed", runKey: `question:${id}`, questionId: id, stableKey: `route:${id}`,
      data: { conversation_route: route, media, ...(teacher ? { teacher_id: teacher.id, teacher_name: teacher.name } : {}) } });
  }, [historyRecorder]);
  const { teacher } = useSelectedTeacher();
  // Who taught each lesson on this board. A lesson keeps its teacher when it
  // is replayed, whoever is chosen now.
  const { teacherOf: lessonTeacherOf, remember: rememberLessonTeacher, settled: lessonTeachersSettled } = useLessonTeachers(sessionId);
  // The teacher a question being prepared was asked of (null when the lesson
  // did not take a teacher's settings).
  const [pendingLessonTeacher, setPendingLessonTeacher] = useState<TeacherDefinition | null>(null);
  const [interruptCaption, setInterruptCaption] = useState<string | null>(null);
  // Achievements are decided by the history service once new facts arrive.
  // Reading them announces each newly earned one to the ceremony host, which
  // waits while a lesson is in progress (see the hold below).
  useEffect(() => {
    const read = () => {
      const token = getToken();
      if (!token) return;
      void openHistoryApi(token).then((api) => api.achievements()).catch(() => undefined);
    };
    window.addEventListener("octos:history-uploaded", read);
    return () => window.removeEventListener("octos:history-uploaded", read);
  }, []);
  const interruptCaptionTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (interruptCaptionTimer.current !== null) window.clearTimeout(interruptCaptionTimer.current);
  }, []);
  const learnerBackground = useMemo(() => new LearnerBackgroundCache(async (token) => {
    const history = openHistoryApi(token);
    const [memory, runs, map] = await Promise.allSettled([
      // Only reuse an existing connection; never open one just for this.
      getAnyConnectedBridge() ? getMyMemory() : Promise.resolve(null),
      history.then((api) => api.runs()),
      history.then((api) => api.learningMap()),
    ]);
    return { memory: memory.status === "fulfilled" ? memory.value : null, runs: runs.status === "fulfilled" ? runs.value.runs : null,
      map: map.status === "fulfilled" ? map.value : null };
  }, { currentAccount: getToken }), []);
  const runtime = useOminixRuntimeSummary();
  const modelConfigured = useContext(LearningModelContext);
  // Voice readiness also reports false before the profile runtime starts.
  // That is not a missing model configuration and must not block text input.
  const aiUnavailable = !modelConfigured;
  const modelIssue = useContext(LearningModelIssueContext);
  const aiUnavailableMessage = modelIssue ?? tr("请先在设置中连接模型，笔迹和已有课程仍可使用。");
  const isEmbeddedCourse = Boolean(coursePack?.isEmbedded);
  const threads = useRenderThreads(sessionId);
  const learnTrace = useMemo(
    () => new LearnTraceRecorder(sessionId),
    [sessionId],
  );
  const [narrationSpeechActive, setNarrationSpeechActive] = useState(false);
  // Declared early: `externalSpeechActive` (below) consults it to decide
  // whether muted narration still owns the microphone (issue #315).
  const [narrationAudioEnabled, setNarrationAudioEnabled] = useState(true);
  const [renderedCourseTurnIds, setRenderedCourseTurnIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [startedNarrationTurnIds, setStartedNarrationTurnIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [completedTurnId, setCompletedTurnId] = useState<string | null>(null);
  const [plainReply, setPlainReply] = useState<{
    turnId: string;
    text: string;
  } | null>(null);
  const [plainReplySpoken, setPlainReplySpoken] = useState(false);
  const [pausedLessonSource, setPausedLessonSource] = useState<string | null>(null);
  const [inkPlaybackRun, setInkPlaybackRun] = useState(
    () => readInkPlaybackRun(sessionId),
  );
  const [inkMergeSourceSessionId, setInkMergeSourceSessionId] = useState(
    () => readInkMergeSourceSessionId(sessionId, readInkPlaybackRun(sessionId)),
  );
  const [playbackCourseTarget, setPlaybackCourseTarget] = useState<{
    courseId: string;
    sequence: number;
  } | null>(null);
  const inkSessionId = inkDocumentSessionId(sessionId, inkPlaybackRun);
  const [loadedOllArtifacts, setLoadedOllArtifacts] = useState<
    Record<string, CanonicalEvent[]>
  >({});
  const [persistedOllArtifacts, setPersistedOllArtifacts] = useState<
    ReturnType<typeof collectPersistedOllLessonArtifacts>
  >([]);
  const [ollArtifactListChecked, setOllArtifactListChecked] = useState(false);
  const [ollGenerationSessionId, setOllGenerationSessionId] = useState<
    string | null
  >(null);
  const pendingLessonJobsRef = useRef(loadPendingLessonJobs(sessionId));
  const [rejectedOllArtifactIds, setRejectedOllArtifactIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [selectionState, setSelectionState] =
    useState<SelectionEnhancementState | null>(null);
  const selectionStateReady = selectionState?.session_id === sessionId;
  const [persistedSelectionArtifacts, setPersistedSelectionArtifacts] =
    useState<ReturnType<typeof collectPersistedSelectionEnhancementArtifacts>>([]);
  const [loadedSelectionArtifacts, setLoadedSelectionArtifacts] = useState<
    Record<string, SelectionEnhancementArtifact>
  >({});
  const selectionStateRef = useRef<SelectionEnhancementState | null>(null);
  const selectionArtifacts = useMemo(
    () => mergeSelectionEnhancementArtifacts(
      persistedSelectionArtifacts,
      collectSelectionEnhancementArtifacts(threads),
    ),
    [persistedSelectionArtifacts, threads],
  );
  // The build flag is the capability contract: it is enabled only alongside
  // an OLL runtime that supports AI ink. Font preparation happens in the
  // whiteboard worker and must not make an immediate question silently fall
  // back to an assistance card during the first paint.
  const [boardWritingReady, setBoardWritingReady] = useState(
    () => import.meta.env.VITE_ENABLE_BOARD_WRITING === "true",
  );
  const selectionRequests = useMemo(() => new SelectionRequestState(sessionId), [sessionId]);
  const selectionScopeRef = useRef<{ sessionId: string; active: boolean } | null>(null);
  useEffect(() => {
    const scope = { sessionId, active: true };
    selectionScopeRef.current = scope;
    return () => { scope.active = false; };
  }, [sessionId]);
  const requestedSelectionArtifactsRef = useRef(new Set<string>());
  const selectionArtifactRequestsRef = useRef(
    new Map<string, AbortController>(),
  );
  const pendingVoiceSelectionRef = useRef<{
    snapshot: InkSelectionSnapshot;
    contentKind: SelectionContentKind;
    boardContext: SelectionBoardContext;
    file: File;
    recordSelection: () => void;
    intent: "question";
  } | null>(null);
  const activeVoiceInkSelectionCaptureRef =
    useRef<VoiceInkSelectionCapture | null>(null);
  const sendVoiceSelectionQuestionRef = useRef<((
    request: VoiceInkSelectionRequest,
    transcript: string,
    turnId: string,
    uploadedMediaPath: string,
  ) => Promise<void>) | null>(null);
  const handleVoiceInkSelectionCaptureChange = useCallback(
    (capture: VoiceInkSelectionCapture | null) => {
      activeVoiceInkSelectionCaptureRef.current = capture;
      // A changed or cleared selection invalidates any snapshot prepared for
      // an earlier utterance. A fresh capture will be taken for the next one.
      pendingVoiceSelectionRef.current = null;
    },
    [],
  );
  const voiceQuestionSourcesRef = useRef(new Map<string, {
    sourceId: string;
    bounds: InkSelectionSnapshot["bounds"];
  } | null>());
  const completedQuestionTurnIdsRef = useRef(new Set<string>());
  const failedQuestionErrorsRef = useRef(new Map<string, string>());
  const [composerBoardReferences, setComposerBoardReferences] =
    useState<ComposerBoardReference[]>([]);
  const [whiteboardQuestions, setWhiteboardQuestions] = useState<
    WhiteboardQuestionRecord[]
  >(() => loadWhiteboardQuestions(sessionId));
  const [courseRegions, setCourseRegions] = useState<CourseRegionRecord[]>(
    () => loadCourseRegions(sessionId),
  );
  useEffect(() => {
    saveWhiteboardQuestions(sessionId, whiteboardQuestions);
  }, [sessionId, whiteboardQuestions]);
  useEffect(() => {
    saveCourseRegions(sessionId, courseRegions);
  }, [courseRegions, sessionId]);
  const addWhiteboardQuestion = useCallback((
    question: WhiteboardQuestionRecord,
  ) => {
    recordHistoryQuestion(question.id, question.text, question.origin === "selection" ? "selection" : "text", question.createdAt);
    setWhiteboardQuestions((current) => {
      const next = [
        ...current.filter((candidate) => candidate.id !== question.id),
        question,
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      return next;
    });
  }, [setWhiteboardQuestions, recordHistoryQuestion]);
  const updateWhiteboardQuestion = useCallback((
    questionId: string,
    patch: Partial<Pick<
      WhiteboardQuestionRecord,
      | "text"
      | "position"
      | "status"
      | "error"
      | "errorCode"
      | "imagePath"
      | "imageProfileId"
      | "source"
    >>,
  ) => {
    setWhiteboardQuestions((current) => {
      let changed = false;
      const next = current.map((question) => {
        if (question.id !== questionId) return question;
        const updated = { ...question, ...patch };
        if (
          updated.text === question.text
          && updated.status === question.status
          && updated.error === question.error
          && updated.errorCode === question.errorCode
          && updated.imagePath === question.imagePath
          && updated.imageProfileId === question.imageProfileId
          && updated.source?.sourceId === question.source?.sourceId
          && updated.source?.bounds.x === question.source?.bounds.x
          && updated.source?.bounds.y === question.source?.bounds.y
          && updated.source?.bounds.width === question.source?.bounds.width
          && updated.source?.bounds.height === question.source?.bounds.height
          && updated.position?.x === question.position?.x
          && updated.position?.y === question.position?.y
        ) return question;
        changed = true;
        return updated;
      });
      if (!changed) return current;
      return next;
    });
  }, [setWhiteboardQuestions]);
  const setWhiteboardQuestionStatus = useCallback((
    questionId: string,
    status: WhiteboardQuestionStatus,
  ) => updateWhiteboardQuestion(questionId, { status }), [
    updateWhiteboardQuestion,
  ]);
  const registerVoiceQuestion = useCallback((
    questionId: string,
    text: string,
    source: {
      sourceId: string;
      bounds: InkSelectionSnapshot["bounds"];
    } | null,
    image?: {
      path: string;
      profileId?: string;
    },
    answerPresentation?: WhiteboardQuestionRecord["answerPresentation"],
  ) => {
    setWhiteboardQuestions((current) => {
      const existing = current.find((question) => question.id === questionId);
      if (existing) {
        const sourceUnchanged = source === null
          ? existing.source === undefined
          : existing.source?.sourceId === source.sourceId
            && existing.source.bounds.x === source.bounds.x
            && existing.source.bounds.y === source.bounds.y
            && existing.source.bounds.width === source.bounds.width
            && existing.source.bounds.height === source.bounds.height;
        if (
          existing.text === text
          && sourceUnchanged
          && (!image || (
            existing.imagePath === image.path
            && existing.imageProfileId === image.profileId
          ))
          && (!answerPresentation
            || existing.answerPresentation === answerPresentation)
        ) return current;
        return current.map((question) => question.id === questionId
          ? {
              ...question,
              text,
              ...(source ? { source } : {}),
              ...(image ? {
                imagePath: image.path,
                imageProfileId: image.profileId,
              } : {}),
              ...(answerPresentation ? { answerPresentation } : {}),
            }
          : question);
      }
      const failedError = failedQuestionErrorsRef.current.get(questionId);
      return [...current, {
        id: questionId,
        sessionId,
        text,
        origin: source ? "selection" as const : "composer" as const,
        createdAt: new Date().toISOString(),
        status: failedError
          ? "failed" as const
          : completedQuestionTurnIdsRef.current.has(questionId)
            ? "answered" as const
            : "pending" as const,
        ...(failedError ? { error: failedError } : {}),
        ...(source ? { source } : {}),
        ...(image ? {
          imagePath: image.path,
          imageProfileId: image.profileId,
        } : {}),
        ...(answerPresentation ? { answerPresentation } : {}),
      }].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
  }, [setWhiteboardQuestions, sessionId]);
  const placeWhiteboardQuestion = useCallback((
    questionId: string,
    position: { x: number; y: number },
  ) => {
    updateWhiteboardQuestion(questionId, { position });
    const question = whiteboardQuestions.find((candidate) =>
      candidate.id === questionId && isCourseWhiteboardQuestion(candidate));
    if (!question) return;
    setCourseRegions((current) => {
      const existing = current.find((region) => region.questionId === questionId);
      if (!existing) {
        return [...current, createCourseRegion(
          sessionId,
          questionId,
          position,
          {
            width: COURSE_PENDING_FOOTPRINT_WIDTH,
            height: COURSE_PENDING_FOOTPRINT_HEIGHT,
          },
          question.createdAt,
        )].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      }
      if (existing.origin.x === position.x && existing.origin.y === position.y) {
        return current;
      }
      const offsetX = position.x - existing.origin.x;
      const offsetY = position.y - existing.origin.y;
      return current.map((region) => region.id === existing.id ? {
        ...region,
        origin: { ...position },
        bounds: {
          ...region.bounds,
          x: region.bounds.x + offsetX,
          y: region.bounds.y + offsetY,
        },
      } : region);
    });
  }, [
    sessionId,
    updateWhiteboardQuestion,
    whiteboardQuestions,
  ]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCourseRegions((current) => {
        const knownQuestionIds = new Set(
          current.map((region) => region.questionId),
        );
        const missing = whiteboardQuestions.flatMap((question) => {
          if (
            !isCourseWhiteboardQuestion(question)
            || !question.position
            || knownQuestionIds.has(question.id)
          ) return [];
          knownQuestionIds.add(question.id);
          return [createCourseRegion(
            sessionId,
            question.id,
            question.position,
            {
              width: COURSE_PENDING_FOOTPRINT_WIDTH,
              height: COURSE_PENDING_FOOTPRINT_HEIGHT,
            },
            question.createdAt,
          )];
        });
        if (missing.length === 0) return current;
        return [...current, ...missing].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt));
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sessionId, whiteboardQuestions]);
  const updateCourseRegion = useCallback((
    regionId: string,
    patch: Partial<Pick<
      CourseRegionRecord,
      "runtimeRegionId" | "bounds" | "reservedWidth"
    >>,
  ) => {
    setCourseRegions((current) => current.map((region) => {
      if (region.id !== regionId) return region;
      const updated = {
        ...region,
        ...patch,
        ...(patch.bounds ? {
          bounds: expandCourseRegionBounds(region.bounds, patch.bounds),
        } : {}),
      };
      return JSON.stringify(updated) === JSON.stringify(region)
        ? region
        : updated;
    }));
  }, []);
  const visibleSelectionEnhancements = useMemo(() => {
    const hidden = new Set(selectionState?.hidden_enhancement_turn_ids ?? []);
    return selectionArtifacts.flatMap((artifact) => {
      const loaded = loadedSelectionArtifacts[artifact.path];
      const source = selectionState?.sources.find(
        (candidate) => candidate.source_id === loaded?.source.source_id,
      );
      return loaded
        && selectionRequests.canConsume(loaded.turn_id)
        && !hidden.has(loaded.turn_id)
        && (!source || selectionArtifactMatchesSource(loaded, source))
        ? [loaded]
        : [];
    });
  }, [loadedSelectionArtifacts, selectionArtifacts, selectionState, selectionRequests]);
  const ollArtifacts = useMemo(
    () => mergeOllLessonArtifacts(
      persistedOllArtifacts,
      collectOllLessonArtifacts(threads),
    ),
    [persistedOllArtifacts, threads],
  );
  const requestedOllArtifactsRef = useRef(new Set<string>());
  const ollArtifactRequestsRef = useRef(new Map<string, AbortController>());
  const deliveredOllLessons = useMemo(() => {
    const lessons: CanonicalEvent[][] = [];
    for (const artifact of ollArtifacts) {
      const artifactIdentity = ollArtifactIdentity(artifact);
      const events = loadedOllArtifacts[artifactIdentity];
      if (rejectedOllArtifactIds.has(artifactIdentity)) continue;
      if (!events) break;
      lessons.push(events);
    }
    return lessons;
  }, [loadedOllArtifacts, ollArtifacts, rejectedOllArtifactIds]);
  const deliveredOllEvents = useMemo(() => {
    const events = composeOllClassroomEvents(deliveredOllLessons, sessionId);
    return events.length > 0 ? events : null;
  }, [deliveredOllLessons, sessionId]);
  const deliveredOllQuestionIds = useMemo(
    () => deliveredOllLessons.map((events) => {
      const artifact = ollArtifacts.find((candidate) =>
        loadedOllArtifacts[ollArtifactIdentity(candidate)] === events);
      return artifact?.turnId;
    }),
    [deliveredOllLessons, loadedOllArtifacts, ollArtifacts],
  );
  useEffect(() => {
    deliveredOllLessons.forEach((events, index) => {
      const turnId = deliveredOllQuestionIds[index];
      if (!turnId) return;
      learnTrace.recordOnce(`${turnId}:lesson-playable-loaded`, {
        turnId,
        source: "octos-web",
        stage: "lesson-playable-loaded",
        status: "completed",
        elapsedMs: learnTrace.elapsedSinceStage(turnId, "request-submitted"),
        data: { canonical_events: events.length },
      });
    });
  }, [deliveredOllLessons, deliveredOllQuestionIds, learnTrace]);
  const packagedPlayback = Boolean(ollFixture || coursePack);
  const packagedOllEvents = coursePack?.playbackEvents
    ?? coursePack?.pack.events
    ?? (ollFixture ? ollFixtureEvents[ollFixture] : null);
  const activeOllEvents = useMemo(() => {
    if (!packagedOllEvents) return deliveredOllEvents;
    // Compose even before the first generated lesson arrives. The pack keeps
    // its lesson.open identity and drops lesson.close, so the program the
    // Runtime checkpoints before generation is a prefix of the one after it.
    // Otherwise the Runtime is rebuilt and replays the pack from the start.
    return composeOllClassroomEvents(
      [packagedOllEvents, ...deliveredOllLessons],
      sessionId,
      { keepFirstLessonIdentity: true },
    );
  }, [deliveredOllEvents, deliveredOllLessons, packagedOllEvents, sessionId]);
  const appendedOllEventCountRef = useRef(1);
  const ollAppendBlockedRef = useRef(false);
  const activeOllCompilation = useMemo(() => {
    try {
      return { operations: activeOllEvents
        ? compilePlaybackOperations(activeOllEvents, { allowIncomplete: true })
        : [], error: null };
    } catch (error) {
      return { operations: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [activeOllEvents]);
  const activeOllOperations = activeOllCompilation.operations;
  const expectedOllOperationCount = activeOllOperations.length;
  const activeOllTopics = useMemo(
    () => buildOllLessonTopics(
      packagedOllEvents
        ? (deliveredOllLessons.length > 0
          ? [packagedOllEvents, ...deliveredOllLessons]
          : [packagedOllEvents])
        : deliveredOllLessons,
      packagedOllEvents
        ? [undefined, ...deliveredOllQuestionIds]
        : deliveredOllQuestionIds,
    ),
    [deliveredOllLessons, deliveredOllQuestionIds, packagedOllEvents],
  );
  const deliveredHistorySnapshots = useRef(new WeakMap<CanonicalEvent[], string>());
  // Filled on first use, so a Runtime bound during render sees the snapshot
  // of a lesson that arrived in that same render.
  const historySnapshotOf = useCallback((events: CanonicalEvent[]) => {
    let snapshotJson = deliveredHistorySnapshots.current.get(events);
    if (snapshotJson === undefined) { snapshotJson = JSON.stringify(events); deliveredHistorySnapshots.current.set(events, snapshotJson); }
    return snapshotJson;
  }, []);
  const playbackHistory = useMemo<PlaybackHistoryBinding | undefined>(() => {
    if (!historyRecorder) return undefined;
    const context = (topic: OllLessonTopicDefinition | undefined): PlaybackHistoryContext | undefined => {
      if (topic?.questionId) {
        const source = deliveredOllLessons[deliveredOllQuestionIds.indexOf(topic.questionId)];
        return { runKey: `question:${topic.questionId}`, questionId: topic.questionId,
          sourceSnapshotJson: source ? historySnapshotOf(source) : undefined,
          course: { kind: "generated", id: topic.questionId, version: topic.questionId } };
      }
      if (!coursePack || !topic) return undefined;
      return { runKey: `pack:${coursePack.pack.manifest.packId}@${coursePack.pack.manifest.version}`,
        course: { kind: "course-pack", id: coursePack.pack.manifest.packId, version: coursePack.pack.manifest.version, sha256: coursePack.pack.archiveSha256 } };
    };
    return { recorder: historyRecorder,
      forStep: step => context(activeOllTopics.find(topic => topic.stepIds.includes(step))),
      forTask: task => {
        const topic = activeOllTopics.find(candidate => candidate.taskAliases?.includes(task));
        const binding = context(topic);
        if (!binding || !topic?.questionId) return binding;
        const source = deliveredOllLessons[deliveredOllQuestionIds.indexOf(topic.questionId)];
        const tasks = source?.find(event => event.event === "lesson.open")?.lesson?.tasks;
        const taskIndex = topic.taskAliases?.indexOf(task) ?? -1;
        const sourceTaskId = taskIndex >= 0 ? tasks?.[taskIndex]?.as : undefined;
        // Namespaced Runtime IDs are paired with the original task in the
        // same ordered topic definition; never strip prefixes by guessing.
        return sourceTaskId ? { ...binding, sourceTaskId } : { ...binding, sourceSnapshotJson: undefined };
      },
    };
  }, [historyRecorder, activeOllTopics, coursePack, deliveredOllLessons, deliveredOllQuestionIds, historySnapshotOf]);
  useEffect(() => {
    if (!historyRecorder) return;
    deliveredOllLessons.forEach((events, index) => {
      const question = deliveredOllQuestionIds[index];
      const artifact = ollArtifacts.find(candidate => loadedOllArtifacts[ollArtifactIdentity(candidate)] === events);
      if (question && artifact) {
        recordDeliveredLesson(historyRecorder, question, artifact.path, events, historySnapshotOf(events));
      }
    });
  }, [historyRecorder, deliveredOllLessons, deliveredOllQuestionIds, ollArtifacts, loadedOllArtifacts, historySnapshotOf]);
  const startupNarration = useMemo(() => {
    if (playbackMode !== "live") return null;
    const topic = [...activeOllTopics].reverse().find((candidate) =>
      candidate.questionId
      && !startedNarrationTurnIds.has(candidate.questionId));
    if (!topic) return null;
    const stepIds = new Set(topic.stepIds);
    const operation = activeOllOperations.find((candidate) =>
      candidate.type === "narration.begin"
      && Boolean(candidate.step_id && stepIds.has(candidate.step_id))
      && Boolean(candidate.beat_id && candidate.narration?.text.trim()));
    return operation?.beat_id && operation.narration
      ? {
          turnId: topic.questionId,
          beatId: operation.beat_id,
          text: operation.narration.text,
          language: topic.language,
        }
      : null;
  }, [
    activeOllOperations,
    activeOllTopics,
    playbackMode,
    startedNarrationTurnIds,
  ]);
  const ollOpenSource = activeOllEvents?.[0]
    ? JSON.stringify(activeOllEvents[0])
    : null;
  // The Runtime validates its saved checkpoint against the program delivered
  // when it opens, and discards a checkpoint that runs past that program. On
  // reload a CoursePack is ready before the session's generated lessons are
  // listed and loaded, so opening early would drop progress made in those
  // lessons and replay the pack. Hold the first open until every saved lesson
  // is either loaded or rejected; later lessons append to the open Runtime.
  const ollArtifactsLoading = ollArtifacts.some((artifact) => {
    const identity = ollArtifactIdentity(artifact);
    return !loadedOllArtifacts[identity] && !rejectedOllArtifactIds.has(identity);
  });
  const [ollRestoreReady, setOllRestoreReady] = useState(false);
  if (!ollRestoreReady && ollArtifactListChecked && !ollArtifactsLoading) {
    setOllRestoreReady(true);
  }
  const ollLesson = useOllLessonRuntime({
    history: playbackHistory,
    source: ollRestoreReady ? ollOpenSource : null,
    storageKey: ollPlaybackStorageKey(
      sessionId,
      ollFixture,
      coursePack
        ? `${coursePack.pack.manifest.packId}@${coursePack.pack.manifest.version}:${coursePack.pack.archiveSha256}`
        : undefined,
    ),
    autoPlay: Boolean(activeOllEvents) && playbackMode === "live",
    incremental: Boolean(activeOllEvents),
    narrationTiming: "external",
    startupSpeed: 6,
    startupNarrationId: startupNarration?.beatId,
    startAtEnd: Boolean(activeOllEvents) && playbackMode === "review",
    topics: activeOllTopics,
    deliveredProgram: activeOllEvents,
  });
  // What this board just taught, built only when a question is submitted so
  // that a follow-up such as "the reflection question" can be resolved.
  const lessonRef = useRef(ollLesson);
  useEffect(() => { lessonRef.current = ollLesson; }, [ollLesson]);
  const currentLesson = useCallback(() => {
    const lesson = lessonRef.current;
    return lesson ? buildCurrentLessonContext({
      outline: lesson.outline, reflections: lesson.reflections, studentTasks: lesson.studentTasks,
      cursor: lesson.cursor, settled: lesson.deliverySettled,
    }) : undefined;
  }, []);
  // The gate may count "the reflection question" as clear only when the lesson
  // it starts (from text, the camera or a selection) will receive the same context.
  const gateLessonContext = useCallback((source: "text" | "camera" | "selection") => lessonContextFields.current
    .get(source === "camera" ? "learning.lesson.generate-from-camera" : source === "selection" ? "learning.lesson.generate-from-selection" : "learning.lesson.generate")
    ?.has("current_lesson") ? currentLesson() : undefined, [currentLesson]);
  // Audio ownership follows playback intent, not the current speech sample.
  // A live lesson claims the microphone on its first render and keeps it
  // through Beat/event gaps, then releases it once the Runtime has consumed
  // every operation compiled from the currently delivered Canonical events.
  const hasUndeliveredOllEvents = Boolean(
    ollLesson &&
    (
      ollLesson.totalOperations < expectedOllOperationCount ||
      ollGenerationSessionId === sessionId ||
      whiteboardQuestions.some((question) =>
        isCourseWhiteboardQuestion(question) && question.status === "pending") ||
      ollArtifactsLoading
    ),
  );
  const activeStepId = ollLesson?.currentStepId;
  const currentActiveTopic = (activeStepId
    ? activeOllTopics.find((t) => t.stepIds.includes(activeStepId))
    : undefined) ?? activeOllTopics.find((t) =>
        ollLesson?.outline.find((o) => o.id === t.id)?.steps.at(-1)?.end_cursor === ollLesson?.cursor
      ) ?? activeOllTopics.at(-1);
  // The lesson on screen and the teacher who taught it; a course pack's or
  // fixture's own lesson has no question id.
  const lessonOnScreen = currentActiveTopic
    ? { questionId: currentActiveTopic.questionId, teacher: lessonTeacherOf(currentActiveTopic.questionId) }
    : null;
  const rawTargetTopicEndCursor = currentActiveTopic
    ? ollLesson?.outline.find((cand) => cand.id === currentActiveTopic.id)?.steps.at(-1)?.end_cursor
    : undefined;
  const targetTopicEndCursor = (() => {
    if (typeof rawTargetTopicEndCursor !== "number" || !ollLesson) {
      return rawTargetTopicEndCursor;
    }
    const trailing = activeOllOperations.slice(rawTargetTopicEndCursor, ollLesson.totalOperations);
    if (trailing.length > 0 && trailing.every((op) => op.type === "lesson.close")) {
      return ollLesson.totalOperations;
    }
    return rawTargetTopicEndCursor;
  })();
  const reachedCurrentTopicEnd = typeof targetTopicEndCursor === "number"
    && (ollLesson?.cursor ?? 0) >= targetTopicEndCursor;
  const reachedAllOperations = Boolean(
    ollLesson && ollLesson.cursor >= ollLesson.totalOperations
  );
  const topicPlaybackFinished = Boolean(
    ollLesson
    && !ollLesson.playing
    && (reachedCurrentTopicEnd || reachedAllOperations)
  );
  const deliveryReachedCurrentEnd = Boolean(
    ollLesson &&
    (isLessonDeliverySettled(ollLesson, hasUndeliveredOllEvents)
      || (!hasUndeliveredOllEvents && (topicPlaybackFinished || ollLesson.deliverySettled))),
  );
  // Job completion precedes artifact loading and incremental append. A
  // Runtime still at the previous lesson's end must not announce completion
  // (or release narration ownership) during that handoff. Derive this in the
  // same render; waiting for setDeliverySettled(false) leaves a stale frame.
  const lessonDeliverySettled = Boolean(
    !ollLesson?.activePhaseTransition
    && (ollLesson?.deliverySettled || topicPlaybackFinished)
    && !hasUndeliveredOllEvents
    && deliveryReachedCurrentEnd,
  );
  const replayingWithoutStudentAdditions = inkMergeSourceSessionId !== null;
  const setOllDeliverySettled = ollLesson?.setDeliverySettled;
  useEffect(() => {
    if (hasUndeliveredOllEvents) setOllDeliverySettled?.(false);
    else if (deliveryReachedCurrentEnd) setOllDeliverySettled?.(true);
  }, [
    deliveryReachedCurrentEnd,
    hasUndeliveredOllEvents,
    setOllDeliverySettled,
  ]);
  const lessonStorageLoading = Boolean(ollOpenSource && !ollLesson && playbackMode === "live");
  const lessonOwnsNarration =
    ollLesson !== null &&
    (playbackMode === "live" || ollLesson.playing) &&
    !lessonDeliverySettled &&
    pausedLessonSource !== ollOpenSource;
  const [textTurnPending, setTextTurnPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendErrorCode, setSendErrorCode] = useState<string | undefined>();
  const [completionPromptDismissed, setCompletionPromptDismissed] = useState(false);
  // A background job can be generating before there is an OLL player at all.
  // Do not treat that first-artifact wait as idle maintenance time.
  // Each played beat saves within milliseconds; only a save that is still
  // running after a second is worth showing, or the status line flickers.
  const historySaving = history.localStatus.pendingWrites > 0;
  const [historySavingLong, setHistorySavingLong] = useState(false);
  useEffect(() => {
    if (!historySaving) return;
    const timer = window.setTimeout(() => setHistorySavingLong(true), 1000);
    return () => { window.clearTimeout(timer); setHistorySavingLong(false); };
  }, [historySaving]);
  const historySavingShown = historySaving && historySavingLong;
  const historyClassroomBusy = textTurnPending || ollGenerationSessionId === sessionId
    || hasUndeliveredOllEvents || Boolean(ollLesson?.playing);
  useEffect(() => {
    history.coordinator?.setClassroomBusy(sessionId, historyClassroomBusy);
    return () => history.coordinator?.setClassroomBusy(sessionId, false);
  }, [history.coordinator, sessionId, historyClassroomBusy]);
  // Prefetch learner background only while the classroom is idle, so it is
  // never on the path between submitting a question and the first lesson.
  const lessonContextFields = useRef(new Map<string, Set<LessonContextField>>());
  const languageAwareActions = useRef(new Set<string>());
  const classroomBusyRef = useRef(historyClassroomBusy);
  const backgroundStaleRef = useRef(false);
  // Installed action support changes only with a (re)connection, e.g. after a
  // skill reinstall, so read it on mount and on each bridge connection. The
  // session bridge may not be connected on mount; then the connection event
  // supplies it. Only the latest read may apply.
  useEffect(() => {
    let cancelled = false, latest = 0;
    const readSupport = () => {
      const read = ++latest;
      void Promise.resolve()
        .then(() => Promise.all([listSkillActions(sessionId, "learning.composer"), listSkillActions(sessionId, "learning.selection")]))
        .then((lists) => { if (!cancelled && read === latest) {
          lessonContextFields.current = lessonContextSupport(lists.flat());
          languageAwareActions.current = new Set(lists.flat().filter(action => "language" in ((action.input_schema as { properties?: Record<string, unknown> }).properties ?? {})).map(action => action.id));
        } })
        .catch(() => { /* keep the last known support; unknown means fields are not sent */ });
    };
    const onConnected = () => {
      readSupport();
      // Memory may only now be readable; refresh on the next idle moment.
      backgroundStaleRef.current = true;
      if (!classroomBusyRef.current && historyRecorder) {
        backgroundStaleRef.current = false;
        void learnerBackground.refresh(getToken(), true);
      }
    };
    readSupport();
    window.addEventListener("crew:bridge_connected", onConnected);
    return () => { cancelled = true; window.removeEventListener("crew:bridge_connected", onConnected); };
  }, [historyRecorder, learnerBackground, sessionId]);
  useEffect(() => {
    classroomBusyRef.current = historyClassroomBusy;
    if (historyClassroomBusy || !historyRecorder) return;
    const force = backgroundStaleRef.current;
    backgroundStaleRef.current = false;
    void learnerBackground.refresh(getToken(), force);
  }, [historyClassroomBusy, historyRecorder, learnerBackground]);
  const handleTurnComplete = useCallback((turnId: string) => {
    pendingVoiceSelectionRef.current = null;
    const thread = threads.find((candidate) => candidate.id === turnId);
    const questionId = thread?.turnId ?? turnId;
    completedQuestionTurnIdsRef.current.add(turnId);
    completedQuestionTurnIdsRef.current.add(questionId);
    setWhiteboardQuestionStatus(questionId, "answered");
    setPlainReply(null);
    setPlainReplySpoken(false);
    setCompletedTurnId(turnId);
    learnTrace.recordOnce(`${turnId}:turn-completed`, {
      turnId,
      source: "octos-web",
      stage: "turn-completed",
      status: "completed",
    });
    conversationOptions?.onTurnComplete?.(turnId);
  }, [conversationOptions, learnTrace, setWhiteboardQuestionStatus, threads]);
  const startDirectLessonGeneration = useCallback(async (
    turnId: string,
    learnerRequest: string,
    inputModality: "text" | "voice" = "text",
    visualContext?: {
      kind: "camera" | "ink_selection";
      mediaPath: string;
    },
    clientTiming?: LearningClientTiming,
    lessonLanguage: Locale = getLocale(),
  ) => {
    // The teacher is fixed when the question is submitted; switching later
    // does not change a lesson already being generated.
    const lessonTeacher = teacher;
    const actionId = visualContext?.kind === "camera"
      ? "learning.lesson.generate-from-camera"
      : visualContext?.kind === "ink_selection"
        ? "learning.lesson.generate-from-selection"
        : "learning.lesson.generate";
    const contextFields = lessonContextFields.current.get(actionId);
    const learnerBackgroundText = contextFields?.has("learner_background") ? learnerBackground.current(getToken()) : undefined;
    const currentLessonText = contextFields?.has("current_lesson") ? currentLesson() : undefined;
    // Name the teacher in the record only when the lesson received its settings.
    recordHistoryRoute(turnId, "direct-action", visualContext ? [visualContext.mediaPath] : [],
      contextFields?.has("teacher_profile") ? lessonTeacher : undefined);
    // Narration uses this teacher's voice only for lessons in this teacher's style.
    if (contextFields?.has("teacher_profile")) rememberLessonTeacher(turnId, lessonTeacher.id);
    setPendingLessonTeacher(contextFields?.has("teacher_profile") ? lessonTeacher : null);
    setTextTurnPending(true);
    const requestSource = visualContext?.kind ?? "self_contained";
    const invocationStartedAt = Date.now();
    learnTrace.recordOnce(`${turnId}:skill-invocation-started`, {
      turnId,
      source: "octos-web",
      stage: "skill-invocation",
      status: "started",
      recordedAtEpochMs: invocationStartedAt,
      data: {
        action_id: actionId,
        input_modality: inputModality,
        request_source: requestSource === "camera" ? "current_image" : requestSource,
      },
    });
    try {
      const invocation = await invokeSkillAction(
        sessionId,
        actionId,
        {
          ...(visualContext ? { paths: [visualContext.mediaPath] } : {}),
          turn_id: turnId,
          learner_request: learnerRequest,
          request_source: requestSource === "camera" ? "current_image" : requestSource,
          language: lessonLanguage,
          ...(contextFields?.has("teacher_profile") ? { teacher_profile: teacherProfile(lessonTeacher) } : {}),
          ...(learnerBackgroundText ? { learner_background: learnerBackgroundText } : {}),
          ...(currentLessonText ? { current_lesson: currentLessonText } : {}),
          input_modality: inputModality,
          ...(clientTiming ? {
            client_timing: {
              ...clientTiming,
              skill_invocation_started_at_epoch_ms: invocationStartedAt,
            },
          } : {}),
        },
      );
      const failedResult = (invocation.results ?? [])
        .find((result) => !result.success);
      if (!invocation.ok || failedResult) {
        const code = lessonModelErrorCode(failedResult);
        if (code) throw new LessonModelError(code);
        throw new Error(
          failedResult?.output?.trim() || tr("课程生成任务启动失败，请重试"),
        );
      }
      const jobs = invocation.jobs ?? [];
      learnTrace.recordOnce(`${turnId}:skill-invocation-accepted`, {
        turnId,
        source: "octos-web",
        stage: "skill-invocation",
        status: "accepted",
        elapsedMs: Date.now() - invocationStartedAt,
        data: {
          action_id: actionId,
          background_jobs: jobs.length,
        },
      });
      if (jobs.length === 0) {
        await getSessionFiles(sessionId).then((files) => {
          setPersistedOllArtifacts(collectPersistedOllLessonArtifacts(files));
        });
        setWhiteboardQuestionStatus(turnId, "answered");
        handleTurnComplete(turnId);
        return;
      }
      jobs.forEach((job) => {
        pendingLessonJobsRef.current.set(job.job_id, {
          jobId: job.job_id,
          turnId,
          referenceIds: [],
          actionId,
        });
      });
      savePendingLessonJobs(sessionId, pendingLessonJobsRef.current);
      setOllGenerationSessionId(sessionId);
    } catch (cause) {
      learnTrace.recordOnce(`${turnId}:skill-invocation-failed`, {
        turnId,
        source: "octos-web",
        stage: "skill-invocation",
        status: "failed",
        elapsedMs: Date.now() - invocationStartedAt,
        data: { action_id: actionId },
      });
      throw cause;
    } finally {
      setTextTurnPending(false);
    }
  }, [setTextTurnPending, handleTurnComplete, learnTrace, sessionId, setWhiteboardQuestionStatus, recordHistoryRoute, rememberLessonTeacher, learnerBackground, teacher, currentLesson]);
  const handleVoiceTurnError = useCallback((turnId: string, error: Error) => {
    const message = error.message.trim() || tr("课程生成失败，请稍后再试");
    const errorCode = error instanceof LessonModelError ? error.code : undefined;
    setSendErrorCode(errorCode);
    const thread = threads.find((candidate) => candidate.id === turnId);
    const questionId = thread?.turnId ?? turnId;
    recordFailedRequest(historyRecorder, questionId, turnId);
    failedQuestionErrorsRef.current.set(turnId, message);
    failedQuestionErrorsRef.current.set(questionId, message);
    updateWhiteboardQuestion(questionId, { status: "failed", error: message, errorCode });
    setTextTurnPending(false);
    setCompletedTurnId(null);
    setPlainReply({ turnId: questionId, text: message });
    setPlainReplySpoken(false);
    setSendError(message);
    conversationOptions?.onTurnError?.(turnId, error);
  }, [setTextTurnPending, setSendError, setSendErrorCode, conversationOptions, threads, updateWhiteboardQuestion, historyRecorder]);
  const voiceConversationOptions = useMemo<VoiceConversationOptions>(
    () => {
      type PendingSelection = NonNullable<typeof pendingVoiceSelectionRef.current>;
      const createOptions = (
        captured?: Promise<PendingSelection | null>,
        hasSelection = false,
      ): VoiceConversationOptions & VoiceUtteranceOptions => {
        let frozen: PendingSelection | null = null;
        return ({
          contextKind: hasSelection ? "selection" : undefined,
          ...conversationOptions,
          onTurnStart: (turnId: string) => {
            const pendingSelection = captured ? frozen : pendingVoiceSelectionRef.current;
            voiceQuestionSourcesRef.current.set(turnId, pendingSelection ? {
              sourceId: pendingSelection.snapshot.source_id,
              bounds: { ...pendingSelection.snapshot.bounds },
            } : null);
            conversationOptions?.onTurnStart?.(turnId);
          },
          getAdditionalTurnFiles: async () => {
            let pending = captured ? await captured : pendingVoiceSelectionRef.current;
            if (!captured && !pending) {
              const capture = activeVoiceInkSelectionCaptureRef.current;
              if (!capture) return [];
              const selection = await capture();
              pending = {
                snapshot: selection.snapshot,
                contentKind: selection.contentKind,
                boardContext: selection.boardContext,
                file: selection.contextImage,
                recordSelection: selection.recordSelection,
                intent: "question",
              };
              pendingVoiceSelectionRef.current = pending;
            }
            frozen = pending;
            return pending ? [pending.file] : [];
          },
          shouldIncludeCameraFrame: () =>
            captured ? !hasSelection : activeVoiceInkSelectionCaptureRef.current === null
            && pendingVoiceSelectionRef.current === null,
          buildTurnText: (
            context: Parameters<
              NonNullable<VoiceConversationOptions["buildTurnText"]>
            >[0],
          ) => {
            const base = conversationOptions?.buildTurnText?.(context) ?? "";
            const pending = captured ? frozen : pendingVoiceSelectionRef.current;
            const selectionPath = context.additionalMediaPaths?.[0];
            if (!pending || !selectionPath) return base;
            const selectionContext = [
              base,
              buildSelectionEnhancementTurnContext({
                sessionId,
                turnId: context.turnId,
                mediaPath: selectionPath,
                source: pending.snapshot,
                contentKind: pending.contentKind,
                lessonTitle: ollLesson?.title,
                boardSummary: ollLesson
                  ? tr("{{v0}}；进度 {{v1}}/{{v2}}", { v0: ollLesson.title, v1: ollLesson.cursor, v2: ollLesson.totalOperations })
                  : undefined,
                boardContext: pending.boardContext,
                toolId: "custom-question",
              }),
            ].filter(Boolean).join("\n");
            return selectionContext;
          },
          // Muted narration does NOT own the mic: with the narration silenced
          // there is nothing external to protect, so the student can barge in
          // naturally (issue #315).
          externalSpeechActive:
            voiceEnabled &&
            (((lessonOwnsNarration || lessonStorageLoading) && narrationAudioEnabled) ||
              narrationSpeechActive ||
              textTurnPending),
          // Do not feed the final speaker frame / acoustic echo back into ASR when
          // a lesson or plain spoken reply releases the microphone.
          externalSpeechReleaseDelayMs: 1200,
          onAdmittedSpeech: async (context) => {
            const requestLanguage = getLocale();
            const clientTiming = context.clientTiming ?? {};
            learnTrace.recordOnce(`${context.turnId}:request-submitted`, {
              turnId: context.turnId,
              source: "octos-web",
              stage: "request-submitted",
              status: "started",
              recordedAtEpochMs:
                clientTiming.submitted_at_epoch_ms ?? Date.now(),
              data: { input_modality: "voice" },
            });
            const admissionCompletedAt =
              clientTiming.voice_admission_completed_at_epoch_ms;
            const admissionStartedAt =
              clientTiming.voice_admission_started_at_epoch_ms;
            learnTrace.recordOnce(`${context.turnId}:voice-admission-completed`, {
              turnId: context.turnId,
              source: "octos-web",
              stage: "voice-admission",
              status: "completed",
              ...(admissionCompletedAt === undefined
                ? {}
                : { recordedAtEpochMs: admissionCompletedAt }),
              ...(admissionStartedAt === undefined || admissionCompletedAt === undefined
                ? {}
                : { elapsedMs: admissionCompletedAt - admissionStartedAt }),
              data: {
                request_source: context.currentFramePath
                  ? "current_image"
                  : context.additionalMediaPaths?.length
                    ? "selection"
                    : "self_contained",
              },
            });
            const pendingSelection = captured ? frozen : pendingVoiceSelectionRef.current;
            const selectionPath = context.additionalMediaPaths?.[0];
            const hasSelection = Boolean(pendingSelection && selectionPath);

            const admission = await evaluateAdmissionFastGate({
              text: context.transcript,
              modality: "voice",
              hasCameraFrame: Boolean(context.currentFramePath),
              hasSelection,
              currentLesson: gateLessonContext(hasSelection ? "selection" : context.currentFramePath ? "camera" : "text"),
            });

            if (admission.disposition === "ignore") {
              learnTrace.recordOnce(`${context.turnId}:admission-fast-gate`, {
                turnId: context.turnId,
                source: "octos-web",
                stage: "admission-gate",
                status: "ignored",
                recordedAtEpochMs: Date.now(),
                data: {
                  transcript: context.transcript,
                  reason: admission.reason,
                  latency_ms: admission.latencyMs,
                  gate_source: admission.source,
                },
              });
              return true;
            }

            if (admission.disposition === "clarify") {
              learnTrace.recordOnce(`${context.turnId}:admission-fast-gate`, {
                turnId: context.turnId,
                source: "octos-web",
                stage: "admission-gate",
                status: "clarified",
                recordedAtEpochMs: Date.now(),
                data: {
                  transcript: context.transcript,
                  reason: admission.reason,
                  latency_ms: admission.latencyMs,
                  gate_source: admission.source,
                },
              });
              const clarifyText = admission.reason || INSUFFICIENT_LESSON_REQUEST_MESSAGE();
              setPlainReply({ turnId: context.turnId, text: clarifyText });
              setPlainReplySpoken(false);
              return true;
            }

            learnTrace.recordOnce(`${context.turnId}:admission-fast-gate`, {
              turnId: context.turnId,
              source: "octos-web",
              stage: "admission-gate",
              status: "passed",
              recordedAtEpochMs: Date.now(),
              data: {
                transcript: context.transcript,
                disposition: admission.disposition,
                confidence: admission.confidence,
                latency_ms: admission.latencyMs,
                gate_source: admission.source,
              },
            });

            recordHistoryQuestion(context.turnId, context.transcript, "voice");
            if (pendingSelection && selectionPath) {
              pendingVoiceSelectionRef.current = null;
              pendingSelection.recordSelection();
              if (isSelectionLessonRequest(context.transcript)) {
                registerVoiceQuestion(
                  context.turnId,
                  context.transcript,
                  {
                    sourceId: pendingSelection.snapshot.source_id,
                    bounds: { ...pendingSelection.snapshot.bounds },
                  },
                  {
                    path: selectionPath,
                    profileId: context.mediaProfileId,
                  },
                  "lesson",
                );
                const effectiveTranscript = formatSelectionLessonRequest(
                  context.transcript,
                  pendingSelection.boardContext.targets,
                );
                onLearnerInput?.(effectiveTranscript);
                await startDirectLessonGeneration(
                  context.turnId,
                  effectiveTranscript,
                  "voice",
                  { kind: "ink_selection", mediaPath: selectionPath },
                  clientTiming,
                  requestLanguage,
                );
                return true;
              }
              const sendSelectionQuestion = sendVoiceSelectionQuestionRef.current;
              if (!sendSelectionQuestion) {
                throw new Error(tr("选区语音功能尚未就绪"));
              }
              await sendSelectionQuestion(
                {
                  snapshot: pendingSelection.snapshot,
                  contentKind: pendingSelection.contentKind,
                  boardContext: pendingSelection.boardContext,
                  contextImage: pendingSelection.file,
                  recordSelection: pendingSelection.recordSelection,
                },
                context.transcript,
                context.turnId,
                selectionPath,
              );
              return true;
            }
            if ((context.additionalMediaPaths?.length ?? 0) > 0) {
              recordHistoryRoute(context.turnId, "turn", context.additionalMediaPaths);
              return false;
            }

            registerVoiceQuestion(context.turnId, context.transcript, null);
            if (context.currentFramePath) {
              updateWhiteboardQuestion(context.turnId, {
                imagePath: context.currentFramePath,
                imageProfileId: context.mediaProfileId,
              });
            }
            onLearnerInput?.(context.transcript);
            await startDirectLessonGeneration(
              context.turnId,
              context.transcript,
              "voice",
              context.currentFramePath
                ? { kind: "camera", mediaPath: context.currentFramePath }
                : undefined,
              clientTiming,
              requestLanguage,
            );
            return true;
          },
          onTurnError: handleVoiceTurnError,
          onTurnComplete: handleTurnComplete,
          allowHesitationAdmission: true,
        });
      };
      return {
        ...createOptions(),
        allowHesitationAdmission: true,
        captureUtteranceOptions: () => {
          const prepared = pendingVoiceSelectionRef.current;
          pendingVoiceSelectionRef.current = null;
          const capture = activeVoiceInkSelectionCaptureRef.current;
          const captured = prepared ? Promise.resolve(prepared) : capture
            ? capture().then((selection) => ({
                snapshot: selection.snapshot,
                contentKind: selection.contentKind,
                boardContext: selection.boardContext,
                file: selection.contextImage,
                recordSelection: selection.recordSelection,
                intent: "question" as const,
              }))
            : Promise.resolve(null);
          // Capture can reject before the utterance ends. Keep the rejection for
          // getAdditionalTurnFiles without creating an unhandled promise rejection.
          void captured.catch(() => undefined);
          return {
            ...createOptions(captured, Boolean(prepared || capture)),
            allowHesitationAdmission: true,
          };
        },
      };
    },
    [
      gateLessonContext,
      conversationOptions,
      handleTurnComplete,
      handleVoiceTurnError,
      lessonOwnsNarration,
      lessonStorageLoading,
      learnTrace,
      narrationAudioEnabled,
      narrationSpeechActive,
      ollLesson,
      onLearnerInput,
      registerVoiceQuestion,
      recordHistoryQuestion,
      recordHistoryRoute,
      sessionId,
      startDirectLessonGeneration,
      textTurnPending,
      voiceEnabled,
      updateWhiteboardQuestion,
    ],
  );
  const conv = useVoiceConversation(
    sessionId,
    undefined,
    onVoiceExit ?? onBack,
    voiceConversationOptions,
  );
  const beginFreshInkPlayback = useCallback(() => {
    const next = Number.isSafeInteger(inkPlaybackRun + 1)
      ? inkPlaybackRun + 1
      : 1;
    const sourceSessionId = findLatestSavedInkSessionId(sessionId, inkPlaybackRun);
    setInkPlaybackRun(next);
    setInkMergeSourceSessionId(sourceSessionId);
    try {
      window.localStorage.setItem(
        inkPlaybackRunStorageKey(sessionId),
        String(next),
      );
      window.localStorage.setItem(
        inkMergeSourceStorageKey(sessionId),
        sourceSessionId,
      );
    } catch {
      // The new in-memory run still keeps replay clean when storage is unavailable.
    }
  }, [inkPlaybackRun, sessionId]);
  const markPlaybackCourse = useCallback((stepId?: string) => {
    const topic = (stepId
      ? activeOllTopics.find((candidate) => candidate.stepIds.includes(stepId))
      : activeOllTopics.find((candidate) =>
          candidate.stepIds.includes(ollLesson?.currentStepId ?? "")))
      ?? activeOllTopics.at(-1);
    if (!topic) return;
    const courseId = topic.questionId ?? topic.id;
    setPlaybackCourseTarget((current) => ({
      courseId,
      sequence: (current?.sequence ?? 0) + 1,
    }));
  }, [activeOllTopics, ollLesson?.currentStepId]);
  const courseTopicForBeat = useCallback((beatId: string) =>
    activeOllTopics.find((candidate) => candidate.stepIds.some((stepId) =>
      ollLesson?.outline
        .flatMap((topic) => topic.steps)
        .find((step) => step.id === stepId)
        ?.beats.some((beat) => beat.id === beatId))), [
    activeOllTopics,
    ollLesson?.outline,
  ]);
  const markPlaybackBeatCourse = useCallback((beatId: string) => {
    const step = ollLesson?.outline
      .flatMap((topic) => topic.steps)
      .find((candidate) => candidate.beats.some((beat) => beat.id === beatId));
    markPlaybackCourse(step?.id);
  }, [markPlaybackCourse, ollLesson?.outline]);
  const fullBoard = useMemo(() => {
    if (!activeOllEvents || activeOllEvents.length === 0) return null;
    try {
      const player = new HeadlessLessonPlayer(activeOllEvents, { allowIncomplete: true });
      player.playAll();
      return player.snapshot.board ?? null;
    } catch {
      return null;
    }
  }, [activeOllEvents]);

  const compositeBoard = useMemo(() => {
    if (!ollLesson?.board) return null;
    if (!fullBoard) return ollLesson.board;

    if (ollLesson.playing || !lessonDeliverySettled) {
      return ollLesson.board;
    }

    return {
      ...fullBoard,
      nodes: {
        ...fullBoard.nodes,
        ...ollLesson.board.nodes,
      },
      groups: {
        ...(fullBoard.groups ?? {}),
        ...(ollLesson.board.groups ?? {}),
      },
      connections: {
        ...(fullBoard.connections ?? {}),
        ...(ollLesson.board.connections ?? {}),
      },
      variables: {
        ...(fullBoard.variables ?? {}),
        ...(ollLesson.board.variables ?? {}),
      },
    };
  }, [
    fullBoard,
    lessonDeliverySettled,
    ollLesson,
  ]);

  const controlledOllLesson = useMemo(() => {
    if (!ollLesson) return null;
    const claim = () => setPausedLessonSource(null);
    const release = () => setPausedLessonSource(ollOpenSource);
    return {
      ...ollLesson,
      deliverySettled: lessonDeliverySettled,
      board: compositeBoard ?? ollLesson.board,
      completed: lessonDeliverySettled && Boolean(topicPlaybackFinished || ollLesson.completed),
      play: () => {
        claim();
        if (lessonDeliverySettled || ollLesson.deliverySettled || ollLesson.completed) {
          beginFreshInkPlayback();
        }
        ollLesson.play();
      },
      pause: () => {
        release();
        ollLesson.pause();
      },
      restart: () => {
        claim();
        const firstStepId = courseReplayStartStep(
          activeOllTopics,
          ollLesson.currentStepId,
        );
        markPlaybackCourse(firstStepId ?? ollLesson.currentStepId);
        beginFreshInkPlayback();
        // The Runtime contains every course on this infinite whiteboard.
        // Replaying from the global cursor would restart the first historical
        // course. The top-bar replay control instead starts at the first Step
        // of the course the learner is currently viewing.
        if (firstStepId) ollLesson.playStep(firstStepId);
        else ollLesson.restart();
      },
      nextBeat: () => {
        claim();
        ollLesson.nextBeat();
      },
      playStep: (stepId: string) => {
        claim();
        markPlaybackCourse(stepId);
        if (lessonDeliverySettled || ollLesson.deliverySettled || ollLesson.completed) {
          beginFreshInkPlayback();
        }
        ollLesson.playStep(stepId);
      },
      playBeat: (beatId: string) => {
        claim();
        markPlaybackBeatCourse(beatId);
        if (lessonDeliverySettled || ollLesson.deliverySettled || ollLesson.completed) {
          beginFreshInkPlayback();
        }
        ollLesson.playBeat(beatId);
      },
      setVariable: (alias: string, value: number) => {
        ollLesson.setVariable(alias, value);
      },
      handleStudentVariableInput: (
        alias: string,
        value: number,
        event: Parameters<typeof ollLesson.handleStudentVariableInput>[2],
      ) => {
        return ollLesson.handleStudentVariableInput(alias, value, event);
      },
      handleStudentScene3dInput: (
        nodeId: string,
        view: Parameters<typeof ollLesson.handleStudentScene3dInput>[1],
        event: Parameters<typeof ollLesson.handleStudentScene3dInput>[2],
      ) => {
        return ollLesson.handleStudentScene3dInput(nodeId, view, event);
      },
    };
  }, [
    activeOllTopics,
    beginFreshInkPlayback,
    compositeBoard,
    lessonDeliverySettled,
    markPlaybackBeatCourse,
    markPlaybackCourse,
    ollLesson,
    ollOpenSource,
    topicPlaybackFinished,
  ]);
  const handleInkMergeComplete = useCallback((
    sourceSessionId: string,
    targetSessionId: string,
  ) => {
    // Opening an older saved whiteboard can start a one-time recovery merge.
    // If the learner presses Replay before that asynchronous merge finishes,
    // its completion belongs to the old document and must not reveal student
    // additions inside the newer replay run.
    setInkMergeSourceSessionId((currentSourceSessionId) =>
      isCurrentInkMergeCompletion(
        sourceSessionId,
        targetSessionId,
        currentSourceSessionId,
        inkDocumentSessionId(sessionId, inkPlaybackRun),
      ) ? null : currentSourceSessionId);
  }, [inkPlaybackRun, sessionId]);
  useEffect(() => {
    if (inkMergeSourceSessionId !== null) return;
    try {
      window.localStorage.removeItem(inkMergeSourceStorageKey(sessionId));
      window.localStorage.setItem(
        cumulativeInkRunStorageKey(sessionId),
        String(inkPlaybackRun),
      );
    } catch {
      // The in-memory state is sufficient for this page load.
    }
  }, [inkMergeSourceSessionId, inkPlaybackRun, sessionId]);

  useEffect(() => {
    if (!lessonDeliverySettled || ollLesson?.playing) {
      setCompletionPromptDismissed(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setCompletionPromptDismissed(true);
    }, LESSON_COMPLETION_BUBBLE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [lessonDeliverySettled, ollLesson?.playing]);
  const [fileListError, setFileListError] = useState<string | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
  const cameraSettings = conv.cameraSettings ?? DEFAULT_CAMERA_FRAME_SETTINGS;
  const completedArtifactFilenames = completedTurnId
    ? new Set([
        `${completedTurnId}.octos-lesson.json`,
        `${completedTurnId}.octos-selection-enhancement.json`,
      ])
    : null;
  const completedThreadHasArtifact = Boolean(
    completedTurnId && threadHasDeliverableArtifact(threads, completedTurnId),
  );
  const completedTurnHasArtifact = Boolean(
    completedThreadHasArtifact || (
      completedArtifactFilenames && [
        ...ollArtifacts,
        ...selectionArtifacts,
      ].some((artifact) => completedArtifactFilenames.has(
        artifact.filename.replaceAll("\\", "/").split("/").at(-1) ?? "",
      ))
    ),
  );
  const completedTurn = completedTurnId
    ? conv.turns.find((candidate) => candidate.id === completedTurnId)
    : undefined;
  const completedAssistantText = completedTurn?.assistantText.trim() ?? "";

  useEffect(() => {
    if (!completedTurnId) return;
    // Assistant completion and the voice transcript are independent events.
    // Never classify an audio turn while its transcript is still pending: a
    // late transcript must be allowed to turn this into a real learner turn.
    if (!completedTurn || completedTurn.awaitingTranscript) return;
    if (!completedTurn.userText.trim()) {
      const timer = window.setTimeout(() => {
        setPlainReply(null);
        setPlainReplySpoken(false);
        setCompletedTurnId(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (completedTurnHasArtifact || !completedAssistantText) return;
    const timer = window.setTimeout(() => {
      if (historyRecorder) recordTeacherText(historyRecorder, completedTurnId, `plain:${completedTurnId}`, completedAssistantText);
      setPlainReply({ turnId: completedTurnId, text: completedAssistantText });
      setCompletedTurnId(null);
    }, 2_500);
    return () => window.clearTimeout(timer);
  }, [
    completedAssistantText,
    historyRecorder,
    completedTurn,
    completedTurnHasArtifact,
    completedTurnId,
  ]);

  useEffect(() => {
    if (!plainReply) return;
    const artifactFilenames = new Set([
      `${plainReply.turnId}.octos-lesson.json`,
      `${plainReply.turnId}.octos-selection-enhancement.json`,
    ]);
    const threadHasArtifact = threadHasDeliverableArtifact(
      threads,
      plainReply.turnId,
    );
    if (threadHasArtifact || [...ollArtifacts, ...selectionArtifacts].some(
      (artifact) => artifactFilenames.has(
        artifact.filename.replaceAll("\\", "/").split("/").at(-1) ?? "",
      ),
    )) {
      const timer = window.setTimeout(() => {
        setPlainReply(null);
        setPlainReplySpoken(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [ollArtifacts, plainReply, selectionArtifacts, threads]);

  useEffect(() => {
    let cancelled = false;
    let requestVersion = 0;
    const loadPersistedArtifacts = async () => {
      const version = ++requestVersion;
      try {
        const files = await getSessionFiles(sessionId);
        if (cancelled || version !== requestVersion) return;
        setPersistedOllArtifacts(collectPersistedOllLessonArtifacts(files));
        setPersistedSelectionArtifacts(
          collectPersistedSelectionEnhancementArtifacts(files),
        );
        setFileListError(null);
        setOllArtifactListChecked(true);
      } catch (cause) {
        if (cancelled || version !== requestVersion) return;
        if (!packagedPlayback) {
          setFileListError(
            cause instanceof Error
              ? cause.message
              : tr("无法读取已保存的白板课程"),
          );
        }
        setOllArtifactListChecked(true);
      }
    };
    const handleToolProgress = (event: Event) => {
      const detail = (event as CustomEvent<{
        sessionId?: string;
        tool?: string;
        message?: string;
        terminal?: boolean;
      }>).detail;
      if (
        detail?.sessionId !== sessionId ||
        detail.tool !== "oll_generate_lesson"
      ) return;
      learnTrace.ingestLearningCoachMessage(detail.message);
      setOllGenerationSessionId(detail.terminal === true ? null : sessionId);
      if (
        detail.terminal === true ||
        detail.message?.includes("[artifact:oll_lesson_part]") ||
        detail.message?.includes('"stage":"lesson-artifact-ready"')
      ) {
        void loadPersistedArtifacts();
      }
    };
    const applyLessonJobUpdate = async (job: SkillActionJob) => {
      if (
        !job
        || job.session_id !== sessionId
        || (job.action_id !== "learning.lesson.generate"
          && job.action_id !== "learning.lesson.generate-from-camera"
          && job.action_id !== "learning.lesson.generate-from-selection")
      ) return;
      const pending = pendingLessonJobsRef.current.get(job.job_id);
      if (!pending) return;
      const updatedAt = Date.parse(job.updated_at);
      learnTrace.recordOnce(
        `${pending.turnId}:job:${job.job_id}:${job.status}`,
        {
          turnId: pending.turnId,
          source: "octos-web",
          stage: "lesson-job",
          status: job.status,
          ...(Number.isFinite(updatedAt) ? { recordedAtEpochMs: updatedAt } : {}),
          data: {
            action_id: job.action_id,
            job_id: job.job_id,
          },
        },
      );
      if (job.status === "queued" || job.status === "running") {
        setOllGenerationSessionId(sessionId);
        return;
      }
      // Capture every known failed execution before aggregation or file I/O.
      // Another job for this question may still succeed and deliver material.
      if (job.status !== "succeeded") {
        recordFailedRequest(historyRecorder, pending.turnId, job.job_id, job.status === "cancelled" ? "cancelled" : "failed", "job-ended");
      }
      pendingLessonJobsRef.current.delete(job.job_id);
      savePendingLessonJobs(sessionId, pendingLessonJobsRef.current);
      const sameTurnStillRunning = [...pendingLessonJobsRef.current.values()]
        .some((candidate) => candidate.turnId === pending.turnId);
      if (sameTurnStillRunning) return;
      setOllGenerationSessionId(null);
      const projectedArtifacts = lessonJobArtifacts(job, pending.turnId);
      let artifacts = projectedArtifacts;
      try {
        const files = await getSessionFiles(sessionId);
        artifacts = mergeOllLessonArtifacts(
          collectPersistedOllLessonArtifacts(files),
          projectedArtifacts,
        );
      } catch {
        // A successful job carries an opaque artifact handle, so the live
        // lesson can still load while the ordinary session-file refresh path
        // waits for a reconnect.
      }
      if (artifacts.length > 0) {
        setPersistedOllArtifacts((current) =>
          mergeOllLessonArtifacts(current, artifacts));
      }
      const hasLessonArtifact = artifacts.some(
        (artifact) => artifact.turnId === pending.turnId,
      );
      if (job.status === "succeeded") {
        const nonLesson = lessonJobNonLessonResponse(job);
        if (nonLesson) {
          handleTurnComplete(pending.turnId);
          const learnerResponse = nonLesson.learnerResponse || (
            nonLesson.disposition === "ignore"
              ? INSUFFICIENT_LESSON_REQUEST_MESSAGE()
              : ""
          );
          if (learnerResponse) {
            setPlainReply({
              turnId: pending.turnId,
              text: learnerResponse,
            });
            setPlainReplySpoken(false);
          }
          setCompletedTurnId(null);
          return;
        }
        // Current servers always project a structured result. Treat a
        // successful lesson result with no lesson artifact as a failed
        // delivery instead of displaying the previous lesson's completion
        // message. Jobs without a result are kept as a legacy-server fallback.
        if (job.result && !hasLessonArtifact) {
          recordFailedRequest(historyRecorder, pending.turnId, job.job_id, "failed", "missing-artifact");
          const message = tr("课程已经生成，但白板没有收到课程内容，请重试。");
          failedQuestionErrorsRef.current.set(pending.turnId, message);
          updateWhiteboardQuestion(pending.turnId, {
            status: "failed",
            error: message,
          });
          setCompletedTurnId(null);
          setPlainReply({ turnId: pending.turnId, text: message });
          setPlainReplySpoken(false);
          setSendError(message);
          return;
        }
        setWhiteboardQuestionStatus(pending.turnId, "answered");
        handleTurnComplete(pending.turnId);
        return;
      }
      if (hasLessonArtifact) {
        setWhiteboardQuestionStatus(pending.turnId, "answered");
        setSendError(tr("后续课程内容没有生成完成，已经保留并展示成功生成的部分。"));
        handleTurnComplete(pending.turnId);
        return;
      }
      const message = lessonJobError(job);
      const errorCode = lessonModelErrorCode(job.result);
      setSendErrorCode(errorCode);
      failedQuestionErrorsRef.current.set(pending.turnId, message);
      updateWhiteboardQuestion(pending.turnId, {
        status: "failed",
        error: message,
        errorCode,
      });
      setPlainReply({ turnId: pending.turnId, text: message });
      setPlainReplySpoken(false);
      setSendError(message);
    };
    const handleLessonJobUpdated = (event: Event) => {
      const job = (event as CustomEvent<SkillActionJob>).detail;
      if (job) void applyLessonJobUpdate(job);
    };
    const restorePendingLessonJobs = () => {
      if (pendingLessonJobsRef.current.size === 0) return;
      setOllGenerationSessionId(sessionId);
      void Promise.all([
        listSkillActionJobs(sessionId, { actionId: "learning.lesson.generate" }),
        listSkillActionJobs(sessionId, { actionId: "learning.lesson.generate-from-camera" }),
        listSkillActionJobs(sessionId, { actionId: "learning.lesson.generate-from-selection" }),
      ]).then((jobGroups) => {
        jobGroups.flat().forEach((job) => void applyLessonJobUpdate(job));
      }).catch(() => {
        // The bridge-connected event retries after reconnect.
      });
    };
    const handleBridgeConnected = () => {
      void loadPersistedArtifacts();
      restorePendingLessonJobs();
    };
    window.addEventListener("crew:bridge_connected", handleBridgeConnected);
    window.addEventListener("crew:tool_progress", handleToolProgress);
    window.addEventListener(
      "crew:skill_action_job_updated",
      handleLessonJobUpdated,
    );
    void loadPersistedArtifacts();
    restorePendingLessonJobs();
    const pollInterval = window.setInterval(() => {
      if (pendingLessonJobsRef.current.size > 0) {
        restorePendingLessonJobs();
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      window.removeEventListener(
        "crew:bridge_connected",
        handleBridgeConnected,
      );
      window.removeEventListener("crew:tool_progress", handleToolProgress);
      window.removeEventListener(
        "crew:skill_action_job_updated",
        handleLessonJobUpdated,
      );
    };
  }, [
    handleTurnComplete,
    historyRecorder,
    learnTrace,
    packagedPlayback,
    sessionId,
    setWhiteboardQuestionStatus,
    updateWhiteboardQuestion,
  ]);

  useEffect(() => {
    let cancelled = false;
    for (const controller of selectionArtifactRequestsRef.current.values()) {
      controller.abort();
    }
    selectionArtifactRequestsRef.current.clear();
    requestedSelectionArtifactsRef.current.clear();
    selectionStateRef.current = null;
    setTextTurnPending(false);
    setSelectionState(null);
    setLoadedSelectionArtifacts({});
    void loadSelectionEnhancementState(sessionId).then((state) => {
      if (cancelled) return;
      selectionStateRef.current = state;
      setSelectionState(state);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!voiceEnabled) {
      conv.stop({ preserveCamera: true });
      return;
    }
    if (!runtime.inputReady) return;
    unlockAudio();
    void conv.start(
      initialAudio ? { initialAudio, includeCamera: false } : undefined,
    );
    // The conversation hook owns unmount cleanup and exposes stable controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.inputReady, voiceEnabled]);

  useEffect(() => {
    for (const turn of conv.turns) {
      const text = turn.userText.trim();
      if (!text) continue;
      if (!voiceQuestionSourcesRef.current.has(turn.id)) continue;
      const thread = threads.find((candidate) => candidate.id === turn.id);
      const questionId = thread?.turnId ?? turn.id;
      registerVoiceQuestion(
        questionId,
        text,
        voiceQuestionSourcesRef.current.get(turn.id) ?? null,
      );
    }
    onTurnsChange?.(conv.turns);
  }, [conv.turns, onTurnsChange, registerVoiceQuestion, threads]);

  useEffect(() => {
    if (packagedPlayback || ollArtifacts.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      setWhiteboardQuestions((current) => {
        const known = new Set(current.map((question) => question.id));
        const recovered = ollArtifacts.flatMap((artifact, index) => {
          if (known.has(artifact.turnId)) return [];
          const thread = threads.find((candidate) =>
            candidate.id === artifact.threadId
            || candidate.id === artifact.turnId
            || candidate.turnId === artifact.turnId);
          const turn = conv.turns.find((candidate) =>
            candidate.id === thread?.id
            || candidate.id === artifact.threadId
            || candidate.id === artifact.turnId);
          const text = turn?.userText.trim();
          if (!text) return [];
          known.add(artifact.turnId);
          const threadTimestamp = thread?.userMsg.timestamp;
          const createdAt = typeof threadTimestamp === "number"
            && Number.isFinite(threadTimestamp)
            ? new Date(threadTimestamp).toISOString()
            : new Date(Date.now() + index).toISOString();
          return [{
            id: artifact.turnId,
            sessionId,
            text,
            origin: "composer" as const,
            createdAt,
            status: "answered" as const,
          }];
        });
        if (recovered.length === 0) return current;
        return [...current, ...recovered].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt));
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conv.turns, ollArtifacts, packagedPlayback, sessionId, threads]);

  useEffect(() => {
    const ollArtifactRequests = ollArtifactRequestsRef.current;
    const selectionArtifactRequests = selectionArtifactRequestsRef.current;
    return () => {
      for (const controller of ollArtifactRequests.values()) {
        controller.abort();
      }
      ollArtifactRequests.clear();
      for (const controller of selectionArtifactRequests.values()) {
        controller.abort();
      }
      selectionArtifactRequests.clear();
    };
  }, []);

  useEffect(() => {
    const pending = ollArtifacts.filter(
      (artifact) =>
        !requestedOllArtifactsRef.current.has(artifact.path),
    );
    if (pending.length === 0) return;
    pending.forEach((artifact) => {
      const artifactIdentity = ollArtifactIdentity(artifact);
      const controller = new AbortController();
      requestedOllArtifactsRef.current.add(artifact.path);
      ollArtifactRequestsRef.current.get(artifactIdentity)?.abort();
      ollArtifactRequestsRef.current.set(artifactIdentity, controller);
      loadOllLessonArtifact(artifact, sessionId, controller.signal, (timing) => {
        learnTrace.record({ turnId: artifact.turnId, source: "octos-web",
          stage: "oll-materialization", ...timing });
      })
        .then((events) => {
          if (ollArtifactRequestsRef.current.get(artifactIdentity) !== controller) {
            return;
          }
          setLoadedOllArtifacts((current) => ({
            ...current,
            [artifactIdentity]: events,
          }));
          setRejectedOllArtifactIds((current) => {
            if (!current.has(artifactIdentity)) return current;
            const next = new Set(current);
            next.delete(artifactIdentity);
            return next;
          });
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setRejectedOllArtifactIds((current) => {
            const next = new Set(current);
            next.add(artifactIdentity);
            return next;
          });
          setArtifactError(
            cause instanceof Error ? cause.message : tr("OLL 课程读取失败"),
          );
        })
        .finally(() => {
          if (
            ollArtifactRequestsRef.current.get(artifactIdentity) === controller
          ) {
            ollArtifactRequestsRef.current.delete(artifactIdentity);
          }
        });
    });
  }, [ollArtifacts, sessionId, learnTrace]);

  useEffect(() => {
    if (!selectionState) return;
    const pending = selectionArtifacts.filter(
      (artifact) => selectionRequests.canConsume(artifact.turnId)
        && !requestedSelectionArtifactsRef.current.has(artifact.path),
    );
    if (pending.length === 0) return;
    pending.forEach((artifact) => {
      const controller = new AbortController();
      requestedSelectionArtifactsRef.current.add(artifact.path);
      selectionArtifactRequestsRef.current.set(artifact.path, controller);
      loadSelectionEnhancementArtifact(artifact, sessionId, controller.signal)
        .then((loaded) => {
          if (controller.signal.aborted || !selectionRequests.canConsume(loaded.turn_id)) return;
          const source = selectionState.sources.find(
            (candidate) => candidate.source_id === loaded.source.source_id,
          );
          // The generated artifact is durable server-side while its source SVG
          // is browser-local. A missing local source must not make the already
          // generated result disappear after refresh or on another browser.
          // When a source is present, keep enforcing its immutable checksum.
          if (source && !selectionArtifactMatchesSource(loaded, source)) {
            throw new Error(tr("选区辅助内容无法对应到已保存的原稿快照"));
          }
          setLoadedSelectionArtifacts((current) => ({
            ...current,
            [artifact.path]: loaded,
          }));
        })
        .catch((cause) => {
          requestedSelectionArtifactsRef.current.delete(artifact.path);
          if (controller.signal.aborted) return;
          setArtifactError(
            cause instanceof Error ? cause.message : tr("选区辅助内容读取失败"),
          );
        })
        .finally(() => {
          if (
            selectionArtifactRequestsRef.current.get(artifact.path)
              === controller
          ) {
            selectionArtifactRequestsRef.current.delete(artifact.path);
          }
        });
    });
  }, [selectionArtifacts, selectionState, sessionId, selectionRequests]);

  const appendOllEvents = ollLesson?.appendEvents;

  useEffect(() => {
    // A changed lesson.open creates a new BrowserLessonSession. Re-submit the
    // complete delivered prefix: an upgraded checkpoint will deduplicate its
    // accepted Steps, while a rejected stale checkpoint needs every Step from
    // sequence 1 again.
    appendedOllEventCountRef.current = 1;
    ollAppendBlockedRef.current = false;
  }, [ollOpenSource]);

  useEffect(() => {
    if (!activeOllEvents || !appendOllEvents) return;
    if (ollAppendBlockedRef.current || activeOllCompilation.error) return;
    const append = (events: CanonicalEvent[]): boolean => {
      try {
        appendOllEvents(events);
        return true;
      } catch (error) {
        ollAppendBlockedRef.current = true;
        setArtifactError(tr("课程追加已暂停：{{v0}}", { v0: error instanceof Error ? error.message : String(error) }));
        return false;
      }
    };
    if (appendedOllEventCountRef.current > activeOllEvents.length) {
      appendedOllEventCountRef.current = 1;
    }
    if (playbackMode === "review" || packagedPlayback) {
      const pending = activeOllEvents.slice(appendedOllEventCountRef.current);
      if (pending.length > 0 && !append(pending)) return;
      appendedOllEventCountRef.current = activeOllEvents.length;
      return;
    }
    let eventIndex = appendedOllEventCountRef.current;
    let timer: number | undefined;
    const appendNext = () => {
      const event = activeOllEvents[eventIndex] as CanonicalEvent | undefined;
      if (!event) return;
      if (!append([event])) return;
      eventIndex += 1;
      appendedOllEventCountRef.current = eventIndex;
      if (eventIndex < activeOllEvents.length) {
        timer = window.setTimeout(appendNext, 240);
      }
    };
    appendNext();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeOllCompilation.error, activeOllEvents, appendOllEvents, packagedPlayback, playbackMode]);
  const pauseOllLesson = ollLesson?.pause;
  useEffect(() => {
    if (activeOllCompilation.error) pauseOllLesson?.();
  }, [activeOllCompilation.error, pauseOllLesson]);
  useEffect(() => {
    if (ollLesson) {
      onBoardContextChange?.({
        lastAppliedAction: ollLesson.currentOperation?.action?.action_id,
        boardSummary: tr("{{v0}}；进度 {{v1}}/{{v2}}", { v0: ollLesson.title, v1: ollLesson.cursor, v2: ollLesson.totalOperations }),
      });
      return;
    }
    onBoardContextChange?.({});
  }, [ollLesson, onBoardContextChange]);

  const ollNarrationActive = Boolean(
    ollLesson?.playing && ollLesson.activeSpeech.trim(),
  );
  const plainReplyNarrationId = plainReply && !plainReplySpoken && !lessonOwnsNarration
    ? `plain-reply:${plainReply.turnId}`
    : undefined;
  const startOllNarration = ollLesson?.startNarration;
  const completeOllNarration = ollLesson?.completeNarration;
  const recordOllNarrationEnd = ollLesson?.recordNarrationEnd;
  const handleNarrationStart = useCallback((narrationId: string) => {
    if (!narrationId.startsWith("plain-reply:")) {
      const turnId = courseTopicForBeat(narrationId)?.questionId
        ?? (startupNarration?.beatId === narrationId
          ? startupNarration.turnId
          : undefined);
      if (turnId) {
        setStartedNarrationTurnIds((current) => {
          if (current.has(turnId)) return current;
          const next = new Set(current);
          next.add(turnId);
          return next;
        });
        learnTrace.recordOnce(`${turnId}:lesson-first-narration-started`, {
          turnId,
          source: "octos-web",
          stage: "lesson-first-narration-started",
          status: "started",
          data: { beat_id: narrationId },
        });
      }
      startOllNarration?.(narrationId);
    }
  }, [courseTopicForBeat, learnTrace, startOllNarration, startupNarration]);
  const handleNarrationComplete = useCallback((narrationId: string) => {
    if (narrationId.startsWith("plain-reply:")) {
      setPlainReplySpoken(true);
      return;
    }
    completeOllNarration?.(narrationId);
  }, [completeOllNarration]);
  const resolvePackagedNarration = useCallback((narrationId: string) =>
    coursePack ? coursePackNarrationBlob(coursePack, narrationId) : null,
  [coursePack]);
  // Award ceremonies wait while the teacher is busy: a lesson from generation
  // until it has played to the end (also while paused, not once it failed), a
  // spoken question being answered, or a reply that is still being read. They stay quiet while the learner
  // has muted the teacher on this board.
  const replyAudible = Boolean(plainReplyNarrationId) && narrationAudioEnabled && runtime.ttsReady;
  const teacherBusy = historyClassroomBusy || conv.state === "thinking" || conv.state === "speaking" || replyAudible
    || Boolean(ollLesson && !ollLesson.completed && !ollLesson.failure && ollLesson.cursor > 0);
  useEffect(() => {
    holdAwards(`classroom:${sessionId}`, teacherBusy);
    return () => holdAwards(`classroom:${sessionId}`, false);
  }, [sessionId, teacherBusy]);
  useEffect(() => {
    muteAwardVoice(`classroom:${sessionId}`, !narrationAudioEnabled);
    return () => muteAwardVoice(`classroom:${sessionId}`, false);
  }, [sessionId, narrationAudioEnabled]);
  // Narration speaks as the teacher who taught the lesson the beat belongs to.
  // When this device has no record of that lesson, audible narration and
  // prefetching wait until the history service has said who it was, so no
  // sentence is spoken or synthesized in a voice that turns out to be wrong.
  const narrationVoice = narrationTeacher({
    currentBeatId: ollLesson?.currentBeatId,
    upcomingBeatId: ollLesson?.nextNarration?.beatId,
    startup: startupNarration,
    questionOfBeat: (beatId) => courseTopicForBeat(beatId)?.questionId,
    teacherOf: lessonTeacherOf,
    settled: lessonTeachersSettled,
  });
  const ollNarrationTts = useOllNarrationTts({
    language: lessonOwnsNarration ? ollLesson?.language : undefined,
    upcomingLanguage: ollLesson?.nextNarration?.language,
    prewarmLanguage: startupNarration?.language,
    enabled: (coursePack && lessonOwnsNarration ? true : runtime.ttsReady)
      && narrationAudioEnabled
      && (Boolean(ollLesson) || Boolean(plainReply)),
    playing: lessonOwnsNarration
      ? ollNarrationActive
      : Boolean(plainReplyNarrationId),
    voicePending: lessonOwnsNarration && narrationVoice.current.pending,
    text: lessonOwnsNarration
      ? ollLesson?.activeSpeech ?? ""
      : plainReply?.text ?? "",
    narrationId: lessonOwnsNarration
      ? ollLesson?.currentBeatId
      : plainReplyNarrationId,
    prefetchEnabled: lessonOwnsNarration && !coursePack,
    prewarmText: narrationVoice.prewarm.pending ? undefined : startupNarration?.text,
    prewarmVoices: narrationVoice.prewarm.voices,
    prewarmNarrationId: startupNarration?.beatId,
    upcomingText: lessonOwnsNarration && !narrationVoice.upcoming.pending
      ? ollLesson?.nextNarration?.text
      : undefined,
    upcomingNarrationId: lessonOwnsNarration
      ? ollLesson?.nextNarration?.beatId
      : undefined,
    voices: lessonOwnsNarration ? narrationVoice.current.voices : pendingLessonTeacher?.voices ?? null,
    upcomingVoices: lessonOwnsNarration ? narrationVoice.upcoming.voices : undefined,
    resolveAudio: coursePack && lessonOwnsNarration
      ? resolvePackagedNarration
      : undefined,
    onSpeakingChange: setNarrationSpeechActive,
    onPlaybackStart: handleNarrationStart,
    onPlaybackComplete: handleNarrationComplete,
    onPlaybackEnd: recordOllNarrationEnd,
  });

  const buildTurnText = useCallback(
    (turnId: string, mediaPaths: string[], visibleText: string) => {
      const context =
        conversationOptions?.buildTurnText?.({
          sessionId,
          turnId,
          mediaPaths,
        }) ?? "";
      return [context, visibleText].filter(Boolean).join("\n");
    },
    [conversationOptions, sessionId],
  );

  const rememberSelectionSource = useCallback(
    async (snapshot: InkSelectionSnapshot) => {
      const current = selectionStateRef.current
        ?? await loadSelectionEnhancementState(sessionId);
      const next = addSelectionSource(current, snapshot);
      saveSelectionEnhancementState(next);
      selectionStateRef.current = next;
      setSelectionState(next);
    },
    [sessionId],
  );

  const sendSelectionQuestion = useCallback(
    async ({
      snapshot,
      question,
      contentKind,
      recognizedContent,
      recognitionConfidence,
      toolId,
      boardContext,
      contextImage,
    }: {
      snapshot: InkSelectionSnapshot;
      question: string;
      contentKind: SelectionContentKind;
      recognizedContent?: string;
      recognitionConfidence?: "high" | "medium" | "low";
      toolId: SelectionToolId;
      boardContext: SelectionBoardContext;
      contextImage: File;
    }, delivery?: {
      turnId: string;
      uploadedMediaPath: string;
    }) => {
      const requestLanguage = getLocale();
      if (aiUnavailable) { setSendError(aiUnavailableMessage); return; }
      const selectionScope = selectionScopeRef.current;
      if (!selectionScope?.active || selectionScope.sessionId !== sessionId) return;
      unlockAudio();
      setSendError(null);
      setSendErrorCode(undefined);
      setTextTurnPending(true);
      const turnId = delivery?.turnId ?? crypto.randomUUID();
      const answerPresentation = selectionAnswerPresentation(
        toolId,
        question,
        boardWritingReady,
      );
      addWhiteboardQuestion({
        id: turnId,
        sessionId,
        text: question,
        origin: "selection",
        createdAt: new Date().toISOString(),
        status: "pending",
        answerPresentation,
        source: {
          sourceId: snapshot.source_id,
          bounds: { ...snapshot.bounds },
        },
      });
      onLearnerInput?.(question);
      try {
        await rememberSelectionSource(snapshot);
        if (!selectionScope.active) return;
        const selectionProfileId = await ensureSelectedProfileId();
        const mediaPath = delivery?.uploadedMediaPath
          ?? (await uploadFiles([contextImage], "upload"))[0];
        if (!selectionScope.active) return;
        if (!mediaPath) throw new Error(tr("选区图片上传后没有可用路径"));
        if (toolId === "explain") {
          // “解释这部分” is the one-tap equivalent of typing this exact
          // request into the bottom composer while the selection is active.
          // It therefore uses the same selection-to-lesson action and keeps
          // the selected pixels visible in “我的问题”.
          const effectiveQuestion = formatSelectionLessonRequest(
            question,
            boardContext.targets,
            recognizedContent,
          );
          updateWhiteboardQuestion(turnId, {
            text: effectiveQuestion,
            imagePath: mediaPath,
            imageProfileId: selectionProfileId ?? undefined,
            source: {
              sourceId: snapshot.source_id,
              bounds: { ...snapshot.bounds },
            },
          });
          await startDirectLessonGeneration(
            turnId,
            effectiveQuestion,
            "text",
            { kind: "ink_selection", mediaPath },
            undefined,
            requestLanguage,
          );
          return;
        }
        if (answerPresentation === "lesson") {
          throw new Error(tr("课程请求没有进入课程生成流程"));
        }
        selectionRequests.begin(turnId);
        const actionArguments = buildSelectionEnhancementActionArguments({
          sessionId,
          turnId,
          mediaPath,
          source: snapshot,
          contentKind,
          recognizedContent,
          recognitionConfidence,
          learnerRequest: question,
          lessonTitle: ollLesson?.title,
          boardSummary: ollLesson
            ? tr("{{v0}}；进度 {{v1}}/{{v2}}", { v0: ollLesson.title, v1: ollLesson.cursor, v2: ollLesson.totalOperations })
            : undefined,
          boardContext,
          toolId,
          deliveryMode: answerPresentation,
        });
        recordHistoryRoute(turnId, "direct-action", [mediaPath]);
        const invocation = await invokeSkillAction(
          sessionId,
          "learning.selection.enhance",
          { ...actionArguments,
            ...(languageAwareActions.current.has("learning.selection.enhance") ? { language: requestLanguage } : {}),
            ...(boardWritingReady ? { capabilities: ["board_writing"] } : {}),
          },
        );
        if (!selectionScope.active) return;
        const failedResult = (invocation.results ?? [])
          .find((result) => !result.success);
        if (!invocation.ok || failedResult) {
          const code = lessonModelErrorCode(failedResult);
          if (code) throw new LessonModelError(code);
          throw new Error(
            failedResult?.output?.trim()
              || tr("选区辅助内容生成失败，请重试"),
          );
        }
        const files = await getSessionFiles(sessionId);
        if (!selectionScope.active) return;
        const artifacts = collectPersistedSelectionEnhancementArtifacts(files);
        const resultArtifact = artifacts.find((artifact) => artifact.turnId === turnId);
        if (!resultArtifact) {
          throw new Error(
            tr("没有生成可显示的选区结果。这个内容可能暂不支持，请重试或改用“问小章鱼”查看原因。"),
          );
        }
        const loaded = await loadSelectionEnhancementArtifact(resultArtifact, sessionId);
        if (!selectionScope.active) return;
        if (!selectionArtifactMatchesSource(loaded, snapshot)) {
          throw new Error(tr("选区辅助内容无法对应到已保存的原稿快照"));
        }
        if (!selectionRequests.accept(turnId)) return;
        requestedSelectionArtifactsRef.current.add(resultArtifact.path);
        if (historyRecorder) recordTeacherText(historyRecorder, turnId, `selection:${resultArtifact.path}`, loaded.response.text, [resultArtifact.path]);
        setLoadedSelectionArtifacts((current) => ({ ...current, [resultArtifact.path]: loaded }));
        setPersistedSelectionArtifacts(artifacts);
        setTextTurnPending(false);
        setWhiteboardQuestionStatus(turnId, "answered");
        handleTurnComplete(turnId);
      } catch (cause) {
        if (cause instanceof BridgeTimeoutError) {
          try { selectionRequests.timeout(turnId); } catch {
            // The persisted pending barrier still prevents delivery after reload.
          }
        }
        if (!selectionScope.active) return;
        const message = cause instanceof Error
          ? cause.message
          : tr("选区问题发送失败");
        setTextTurnPending(false);
        recordFailedRequest(historyRecorder, turnId);
        updateWhiteboardQuestion(turnId, { status: "failed", error: message, errorCode: cause instanceof LessonModelError ? cause.code : undefined });
        // Selection failures stay attached to their question on the board.
        // Resolving here prevents the whiteboard toolbar and the workspace
        // shell from rendering duplicate error notices outside that card.
      }
    },
    [setSendError, setSendErrorCode, setTextTurnPending,
      handleTurnComplete,
      aiUnavailable,
      aiUnavailableMessage,
      addWhiteboardQuestion,
      ollLesson,
      onLearnerInput,
      rememberSelectionSource,
      sessionId,
      selectionRequests,
      historyRecorder,
      recordHistoryRoute,
      boardWritingReady,
      startDirectLessonGeneration,
      setWhiteboardQuestionStatus,
      updateWhiteboardQuestion,
    ],
  );

  useEffect(() => {
    const sendVoiceSelectionQuestion = async (
      request: VoiceInkSelectionRequest,
      transcript: string,
      turnId: string,
      uploadedMediaPath: string,
    ) => sendSelectionQuestion({
      ...request,
      question: transcript,
      toolId: "custom-question",
    }, {
      turnId,
      uploadedMediaPath,
    });
    sendVoiceSelectionQuestionRef.current = sendVoiceSelectionQuestion;
    return () => {
      if (sendVoiceSelectionQuestionRef.current === sendVoiceSelectionQuestion) {
        sendVoiceSelectionQuestionRef.current = null;
      }
    };
  }, [sendSelectionQuestion]);

  const classifyInkSelection = useCallback(
    async ({
      snapshot,
      boardContext,
      selectionImage,
    }: {
      snapshot: InkSelectionSnapshot;
      boardContext: SelectionBoardContext;
      selectionImage: File;
    }): Promise<SelectionClassification> => {
      const paths = await uploadFiles([selectionImage], "upload");
      const mediaPath = paths[0];
      if (!mediaPath) throw new Error(tr("选区图片上传后没有可用路径"));
      const invocation = await invokeSkillAction(
        sessionId,
        "learning.selection.classify",
        buildSelectionClassificationActionArguments({
          turnId: crypto.randomUUID(),
          mediaPath,
          source: snapshot,
          boardContext,
        }),
      );
      if (!invocation.ok || (invocation.results ?? []).some((candidate) => !candidate.success)) {
        throw new Error(tr("暂时无法识别选区内容"));
      }
      const result = invocation.results?.find((candidate) =>
        candidate.success && candidate.structured_metadata !== undefined,
      );
      if (!result) throw new Error(tr("选区识别没有返回可用结果"));
      return parseSelectionClassificationMetadata(result.structured_metadata);
    },
    [sessionId],
  );

  const startSelectionVoiceQuestion = useCallback(
    async ({
      snapshot,
      contentKind,
      boardContext,
      contextImage,
    }: {
      snapshot: InkSelectionSnapshot;
      contentKind: SelectionContentKind;
      boardContext: SelectionBoardContext;
      contextImage: File;
    }) => {
      await rememberSelectionSource(snapshot);
      pendingVoiceSelectionRef.current = {
        snapshot,
        contentKind,
        boardContext,
        file: contextImage,
        // The explicit panel action already recorded the selection while
        // preparing its immutable snapshot.
        recordSelection: () => undefined,
        intent: "question",
      };
      if (conv.state === "idle" || conv.state === "error") {
        await conv.start();
      }
    },
    [conv, rememberSelectionSource],
  );

  const referenceSelectionForLesson = useCallback(async ({
    snapshot,
    contentKind,
    boardContext,
    contextImage,
    label,
  }: {
    snapshot: InkSelectionSnapshot;
    contentKind: SelectionContentKind;
    boardContext: SelectionBoardContext;
    contextImage: File;
    label: string;
  }) => {
    await rememberSelectionSource(snapshot);
    const reference: ComposerBoardReference = {
      id: `board-selection:${crypto.randomUUID()}`,
      label,
      snapshot,
      contentKind,
      boardContext,
      contextImage,
    };
    setComposerBoardReferences((current) => [
      ...current.filter((candidate) =>
        candidate.snapshot.source_id !== snapshot.source_id,
      ),
      reference,
    ].slice(-4));
  }, [setComposerBoardReferences, rememberSelectionSource]);

  const deleteSelectionEnhancement = useCallback((turnId: string) => {
    setSelectionState((current) => {
      if (!current) return current;
      const next = hideSelectionEnhancement(current, turnId);
      saveSelectionEnhancementState(next);
      selectionStateRef.current = next;
      return next;
    });
    // The question and result are one auxiliary card. Removing only the
    // artifact leaves an answered question behind, which is then rendered as
    // a fake loading card.
    setWhiteboardQuestions((current) => current.filter((question) =>
      question.id !== turnId));
  }, [setWhiteboardQuestions]);

  const updateSelectionCardLayout = useCallback((
    turnId: string,
    layout: SelectionEnhancementCardLayout,
  ) => {
    const current = selectionStateRef.current;
    if (!current) return;
    const next = setSelectionEnhancementCardLayout(current, turnId, layout);
    if (next === current) return;
    // Persist synchronously from the authoritative ref. Saving inside a React
    // state updater can be deferred until after the pointer event, or skipped
    // entirely if the page reloads first.
    saveSelectionEnhancementState(next);
    selectionStateRef.current = next;
    setSelectionState(next);
  }, []);

  const deleteSelectionSources = useCallback((sourceIds: string[]) => {
    const ids = new Set(sourceIds);
    if (ids.size === 0) return;
    setSelectionState((current) => {
      if (!current) return current;
      const next = removeSelectionSources(current, ids);
      saveSelectionEnhancementState(next);
      selectionStateRef.current = next;
      return next;
    });
    setComposerBoardReferences((current) => current.filter((reference) =>
      !ids.has(reference.snapshot.source_id)));
    const pendingVoice = pendingVoiceSelectionRef.current;
    if (pendingVoice && ids.has(pendingVoice.snapshot.source_id)) {
      pendingVoiceSelectionRef.current = null;
    }
  }, [setComposerBoardReferences]);

  const sendText = useCallback(
    async (text: string, applicationContext?: string) => {
      const requestLanguage = getLocale();
      if (aiUnavailable) { setSendError(aiUnavailableMessage); return; }
      unlockAudio();
      const clientTiming: LearningClientTiming = {
        submitted_at_epoch_ms: Date.now(),
      };
      setSendError(null);
      setSendErrorCode(undefined);
      const references = composerBoardReferences;
      const hasSelection = references.length > 0 || Boolean(activeVoiceInkSelectionCaptureRef.current);
      if (!applicationContext?.trim()) {
        const admission = await evaluateAdmissionFastGate({
          text,
          modality: "text",
          hasCameraFrame: Boolean(conv.cameraActive),
          hasSelection,
          currentLesson: gateLessonContext(hasSelection ? "selection" : conv.cameraActive ? "camera" : "text"),
        });
        if (admission.disposition === "ignore") {
          return;
        }
        if (admission.disposition === "clarify") {
          setSendError(admission.reason || tr("输入内容不够明确，请描述你想学习的具体知识点或题目。"));
          return;
        }
      }
      setTextTurnPending(true);
      const turnId = crypto.randomUUID();
      learnTrace.recordOnce(`${turnId}:request-submitted`, {
        turnId,
        source: "octos-web",
        stage: "request-submitted",
        status: "started",
        recordedAtEpochMs: clientTiming.submitted_at_epoch_ms,
        data: { input_modality: "text" },
      });
      addWhiteboardQuestion({
        id: turnId,
        sessionId,
        text,
        origin: "composer",
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      onLearnerInput?.(text);
      try {
        // The bottom composer is also the text equivalent of the selection
        // voice path. If the learner leaves an ink selection active, capture
        // that immutable selection now and generate the lesson from it. This
        // must not depend on voice being enabled: Android meeting displays may
        // have no usable microphone at all.
        const activeSelection = references.length === 0
          && !applicationContext?.trim()
          && activeVoiceInkSelectionCaptureRef.current
          ? await activeVoiceInkSelectionCaptureRef.current()
          : null;
        const lessonSelection = references.length === 1
          && !applicationContext?.trim()
          ? {
              snapshot: references[0]!.snapshot,
              boardContext: references[0]!.boardContext,
              contextImage: references[0]!.contextImage,
              recordSelection: () => undefined,
              referenceId: references[0]!.id,
            }
          : activeSelection
            ? { ...activeSelection, referenceId: undefined }
            : null;

        if (lessonSelection) {
          if (lessonSelection.boardContext.targets.length > 0
            && !selectionBoardContextTargetsExist(
            lessonSelection.boardContext,
            ollLesson?.board ?? null,
          )) {
            throw new Error(tr("引用的白板内容已经变化，请重新框选后再发送"));
          }
          lessonSelection.recordSelection();
          await rememberSelectionSource(lessonSelection.snapshot);
          const selectionProfileId = await ensureSelectedProfileId();
          clientTiming.media_upload_started_at_epoch_ms = Date.now();
          const [selectionMediaPath] = await uploadFiles(
            [lessonSelection.contextImage],
            "upload",
          );
          clientTiming.media_upload_completed_at_epoch_ms = Date.now();
          if (!selectionMediaPath) {
            throw new Error(tr("选区图片上传失败，请重新框选后再试"));
          }
          const effectiveText = formatSelectionLessonRequest(
            text,
            lessonSelection.boardContext.targets,
          );
          updateWhiteboardQuestion(turnId, {
            text: effectiveText,
            imagePath: selectionMediaPath,
            imageProfileId: selectionProfileId ?? undefined,
            source: {
              sourceId: lessonSelection.snapshot.source_id,
              bounds: { ...lessonSelection.snapshot.bounds },
            },
          });
          await startDirectLessonGeneration(
            turnId,
            effectiveText,
            "text",
            { kind: "ink_selection", mediaPath: selectionMediaPath },
            clientTiming,
            requestLanguage,
          );
          if (lessonSelection.referenceId) {
            setComposerBoardReferences((current) => current.filter(
              (candidate) => candidate.id !== lessonSelection.referenceId,
            ));
          }
          return;
        }

        if (references.some((reference) =>
          reference.boardContext.targets.length > 0
          && !selectionBoardContextTargetsExist(
            reference.boardContext,
            ollLesson?.board ?? null,
          ),
        )) {
          throw new Error(tr("引用的白板内容已经变化，请重新框选后再发送"));
        }
        const mediaPaths = references.length > 0
          ? await uploadFiles(
              references.map((reference) => reference.contextImage),
              "upload",
            )
          : [];
        if (mediaPaths.length !== references.length) {
          throw new Error(tr("白板引用上传不完整"));
        }
        const referenceContext = buildComposerBoardReferenceContext(
          references.map((reference, index) => ({
            reference,
            mediaPath: mediaPaths[index]!,
          })),
        );
        if (references.length === 0 && !applicationContext?.trim()) {
          let cameraMediaPath: string | undefined;
          if (conv.cameraActive) {
            const cameraProfileId = await ensureSelectedProfileId();
            clientTiming.camera_capture_started_at_epoch_ms = Date.now();
            const frame = await conv.captureCurrentFrame();
            clientTiming.camera_capture_completed_at_epoch_ms = Date.now();
            if (!frame) {
              throw new Error(tr("摄像头画面没有截取成功，请确认预览正常后重试"));
            }
            clientTiming.camera_media_bytes = frame.size;
            clientTiming.media_upload_started_at_epoch_ms = Date.now();
            [cameraMediaPath] = await uploadFiles([frame], "upload");
            clientTiming.media_upload_completed_at_epoch_ms = Date.now();
            if (!cameraMediaPath) {
              throw new Error(tr("摄像头画面上传失败，请重试"));
            }
            updateWhiteboardQuestion(turnId, {
              imagePath: cameraMediaPath,
              imageProfileId: cameraProfileId ?? undefined,
            });
          }
          await startDirectLessonGeneration(
            turnId,
            text,
            "text",
            cameraMediaPath
              ? { kind: "camera", mediaPath: cameraMediaPath }
              : undefined,
            clientTiming,
            requestLanguage,
          );
          return;
        }
        recordHistoryRoute(turnId, "turn", mediaPaths);
        sendMessage({
          sessionId,
          text: [
            buildTurnText(turnId, mediaPaths, text),
            applicationContext,
            referenceContext,
          ]
            .filter(Boolean)
            .join("\n"),
          media: mediaPaths,
          clientMessageId: turnId,
          onComplete: () => {
            setTextTurnPending(false);
            setComposerBoardReferences((current) => current.filter(
              (candidate) => !references.some(
                (reference) => reference.id === candidate.id,
              ),
            ));
            setWhiteboardQuestionStatus(turnId, "answered");
            handleTurnComplete(turnId);
          },
          onError: (error) => {
            setTextTurnPending(false);
            recordFailedRequest(historyRecorder, turnId);
            setWhiteboardQuestionStatus(turnId, "failed");
            setSendError(error.message || tr("发送失败"));
          },
        });
      } catch (cause) {
        setTextTurnPending(false);
        recordFailedRequest(historyRecorder, turnId);
        setWhiteboardQuestionStatus(turnId, "failed");
        setSendErrorCode(cause instanceof LessonModelError ? cause.code : undefined);
        setSendError(cause instanceof Error ? cause.message : tr("发送失败"));
        throw cause;
      }
    },
    [
      gateLessonContext,
      buildTurnText,
      aiUnavailable,
      aiUnavailableMessage,
      addWhiteboardQuestion,
      recordHistoryRoute,
      historyRecorder,
      composerBoardReferences,
      conv,
      handleTurnComplete,
      learnTrace,
      ollLesson,
      onLearnerInput,
      rememberSelectionSource,
      sessionId,
      startDirectLessonGeneration,
      setComposerBoardReferences,
      setSendError,
      setSendErrorCode,
      setTextTurnPending,
      setWhiteboardQuestionStatus,
      updateWhiteboardQuestion,
    ],
  );

  const sendImage = useCallback(
    async (file: File) => {
      if (aiUnavailable) { setSendError(aiUnavailableMessage); return; }
      unlockAudio();
      setSendError(null);
      setSendErrorCode(undefined);
      const turnId = crypto.randomUUID();
      const prompt = tr("请看我上传的题目，把题目和关键步骤整理到白板上。");
      recordHistoryQuestion(turnId, prompt, "image");
      addWhiteboardQuestion({
        id: turnId,
        sessionId,
        text: prompt,
        origin: "composer",
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      try {
        setTextTurnPending(true);
        const paths = await uploadFiles([file], "upload");
        onLearnerInput?.(prompt);
        recordHistoryRoute(turnId, "turn", paths);
        sendMessage({
          sessionId,
          text: buildTurnText(
            turnId,
            paths,
            prompt,
          ),
          media: paths,
          clientMessageId: turnId,
          onComplete: () => {
            setTextTurnPending(false);
            setWhiteboardQuestionStatus(turnId, "answered");
            handleTurnComplete(turnId);
          },
          onError: (error) => {
            setTextTurnPending(false);
            recordFailedRequest(historyRecorder, turnId);
            setWhiteboardQuestionStatus(turnId, "failed");
            setSendError(error.message || tr("图片发送失败"));
          },
        });
      } catch (cause) {
        setTextTurnPending(false);
        recordFailedRequest(historyRecorder, turnId);
        setWhiteboardQuestionStatus(turnId, "failed");
        setSendError(cause instanceof Error ? cause.message : tr("图片发送失败"));
      }
    },
    [setSendError, setSendErrorCode, setTextTurnPending,
      addWhiteboardQuestion,
      buildTurnText,
      recordHistoryQuestion,
      recordHistoryRoute,
      historyRecorder,
      aiUnavailable,
      aiUnavailableMessage,
      handleTurnComplete,
      onLearnerInput,
      sessionId,
      setWhiteboardQuestionStatus,
    ],
  );

  const retryDegradedVisual = useCallback(async (
    degraded: DegradedVisualRetryRequest,
  ) => {
    await sendText(
      buildDegradedVisualRetryPrompt(degraded),
      buildDegradedVisualRetryContext(degraded),
    );
  }, [sendText]);

  const handleTeacherClick = () => {
    unlockAudio();
    setCompletionPromptDismissed(true);
    if (lessonOwnsNarration && controlledOllLesson) {
      if (controlledOllLesson.playing) controlledOllLesson.pause();
      else controlledOllLesson.play();
      return;
    }
    if (!voiceEnabled) {
      if (controlledOllLesson) {
        if (controlledOllLesson.playing) controlledOllLesson.pause();
        else controlledOllLesson.play();
      }
      return;
    }
    if (conv.state === "speaking" || conv.state === "thinking") {
      conv.interrupt();
      controlledOllLesson?.pause();
      if (interruptCaptionTimer.current !== null) window.clearTimeout(interruptCaptionTimer.current);
      setInterruptCaption(teacherReactions(ollLesson ? lessonReactionTeacher : teacher).interrupted);
      interruptCaptionTimer.current = window.setTimeout(() => {
        setInterruptCaption(null);
        interruptCaptionTimer.current = null;
      }, INTERRUPT_CAPTION_MS);
      return;
    }
    if (conv.state === "idle" || conv.state === "error") {
      void conv.start();
    }
  };

  const handleUseVoiceMode = async () => {
    setSendError(null);
    setSendErrorCode(undefined);
    try {
      await onUseVoiceMode?.();
    } catch (cause) {
      setSendError(
        cause instanceof Error
          ? cause.message
          : tr("无法启用语音"),
      );
    }
  };

  const closeCameraSettings = useCallback(() => {
    setCameraSettingsOpen(false);
  }, []);
  const handleCourseRendered = useCallback((event: LearningCourseRenderEvent) => {
    setRenderedCourseTurnIds((current) => {
      if (current.has(event.turnId)) return current;
      const next = new Set(current);
      next.add(event.turnId);
      return next;
    });
    learnTrace.recordOnce(`${event.turnId}:lesson-first-rendered`, {
      turnId: event.turnId,
      source: "octos-web",
      stage: "lesson-first-rendered",
      status: "completed",
      elapsedMs: learnTrace.elapsedSinceStage(event.turnId, "request-submitted"),
      data: {
        beat_id: event.beatId,
        operation_type: event.operationType,
        cursor: event.cursor,
      },
    });
  }, [learnTrace]);

  const openCameraSettings = useCallback(() => {
    setCameraSettingsOpen(true);
  }, []);

  useEffect(() => {
    if (!cameraSettingsOpen) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCameraSettings();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [cameraSettingsOpen, closeCameraSettings]);

  const pendingSelectionQuestion = whiteboardQuestions.find((question) =>
    question.origin === "selection" && question.status === "pending");
  const selectionPending = Boolean(pendingSelectionQuestion) || Boolean(conv.selectionTurnPending);
  // A lesson accepted for background generation, from the composer, the
  // camera or a selection and also after a reload, stays with the teacher it
  // was asked of until it arrives, unless an older lesson is playing meanwhile.
  const generatingQuestion = [...whiteboardQuestions].reverse().find((question) =>
    (isCourseWhiteboardQuestion(question) || question.origin === "selection") && question.status === "pending");
  const classroom = classroomTeacher({
    selected: teacher,
    asking: textTurnPending || Boolean(conv.selectionTurnPending),
    askedTeacher: pendingLessonTeacher,
    generating: generatingQuestion ? { teacher: lessonTeacherOf(generatingQuestion.id) } : null,
    playing: Boolean(ollLesson?.playing),
    onScreen: lessonOnScreen,
  });
  // Course packs and fixtures carry their own narration; their own lessons keep the neutral lines.
  const lessonReactionTeacher = classroom.reactions;
  const lessonReactions = teacherReactions(lessonReactionTeacher);
  const teacherSpeech = selectionPending
    ? teacherReactions(classroom.portrait).selection
    : lessonOwnsNarration
    ? ollLesson?.activeSpeech ?? ""
    : interruptCaption ??
      plainReply?.text ??
      (textTurnPending
        ? lessonReactions.preparing
        : ollLesson
          ? ollLesson.activeSpeech ||
            (lessonDeliverySettled && !completionPromptDismissed
              ? lessonReactions.lessonComplete
              : "")
          : conv.state === "thinking"
            ? teacherReactions(teacher).preparing
            : "");
  const teacherState = selectionPending || textTurnPending
    ? "thinking"
    : lessonOwnsNarration
      ? "speaking"
      : conv.state;
  const teacherStateLabel = selectionPending
    ? tr("正在看选区")
    : textTurnPending
    ? tr("正在想")
    : lessonOwnsNarration
      ? tr("课程播放中")
      : plainReply
        ? tr("老师回复")
      : ollLesson
        ? lessonDeliverySettled
          ? tr("课程完成")
          : tr("继续播放")
        : undefined;
  const pendingLessonQuestion = [...whiteboardQuestions].reverse().find(
    (question) => isCourseWhiteboardQuestion(question)
      && question.status === "pending",
  );
  const pendingLessonHasPlayableArtifact = Boolean(
    pendingLessonQuestion && ollArtifacts.some((artifact) =>
      artifact.turnId === pendingLessonQuestion.id
      && Boolean(loadedOllArtifacts[ollArtifactIdentity(artifact)])),
  );
  const pendingLessonAwaitingFirstArtifact = Boolean(
    pendingLessonQuestion && !pendingLessonHasPlayableArtifact,
  );
  const completedQuestionId = completedTurnId
    ? threads.find((thread) => thread.id === completedTurnId)?.turnId
      ?? completedTurnId
    : null;
  const startupCourseTurnId = pendingLessonQuestion?.id ?? completedQuestionId;
  const startupCourseHasPlayableArtifact = Boolean(
    startupCourseTurnId && ollArtifacts.some((artifact) =>
      artifact.turnId === startupCourseTurnId
      && Boolean(loadedOllArtifacts[ollArtifactIdentity(artifact)])),
  );
  const pendingLessonAwaitingFirstRender = Boolean(
    startupCourseTurnId
    && startupCourseHasPlayableArtifact
    && !renderedCourseTurnIds.has(startupCourseTurnId),
  );
  const pendingLessonAwaitingFirstNarration = Boolean(
    startupCourseTurnId
    && startupCourseHasPlayableArtifact
    && startupNarration?.turnId === startupCourseTurnId
    && runtime.ttsReady
    && narrationAudioEnabled
    && !ollNarrationTts.error,
  );
  const lessonLoading = !selectionPending && (
    pendingLessonAwaitingFirstArtifact
    || pendingLessonAwaitingFirstRender
    || pendingLessonAwaitingFirstNarration
    || (
      !plainReply
      && !completedTurnHasArtifact
      && (
        textTurnPending
        || conv.state === "thinking"
        || Boolean(completedTurnId)
        || ollGenerationSessionId === sessionId
      )
    )
  );
  const lessonGenerationInProgress = Boolean(
    ollLesson && ollGenerationSessionId === sessionId,
  );
  const whiteboardLoadingState: WhiteboardLoadingState | null = lessonLoading
    && (!ollLesson
      || pendingLessonAwaitingFirstRender
      || Boolean(
      pendingLessonQuestion && !pendingLessonHasPlayableArtifact,
    ))
    ? {
        id: startupCourseTurnId ?? `lesson:${sessionId}`,
        kind: "lesson",
        title: tr("正在搭建这节课"),
        detail: tr("先整理重点，再把讲解和互动画面放到白板上。"),
      }
    : null;

  return (
    <div className="learning-workspace">
      {historyRecorder && <div className="learning-history-sync-status" data-learning-board-occlusion="" role="status">
        {history.localStatus.error || history.status.error || (historySavingShown ? tr("课堂记录保存中…") : history.status.syncing ? tr("学习记录同步中…") : history.status.pending ? tr("学习记录已保存在本机，等待同步") : history.status.conversationPending ? tr("学习记录已同步，问答仍待交给老师") : !history.status.checked ? tr("正在确认记录同步状态…") : tr("学习记录已同步"))}
        {(history.localStatus.error || history.status.error || history.status.pending || history.status.conversationPending > 0) && <button onClick={() => { void history.coordinator?.retry(); }}>{tr("重试同步")}</button>}
      </div>}
      <header
        className="learning-workspace-topbar"
        data-learning-board-occlusion=""
      >
        <span title={tr("当前课程语言不变；新课程将使用所选语言。")}>
          <LanguageSwitch />
        </span>
        <div>
          <span>{tr("Octos Learning Canvas")}</span>
          <strong>{ollLesson?.title ?? tr("新的学习白板")}</strong>
        </div>
        {ollLesson ? (
          <div className="learning-demo-controls" data-testid="oll-controls">
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                if (controlledOllLesson?.playing) controlledOllLesson.pause();
                else controlledOllLesson?.play();
              }}
              aria-label={ollLesson.playing ? tr("暂停 OLL 课程") : tr("播放 OLL 课程")}
              disabled={lessonDeliverySettled}
            >
              {ollLesson.playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                controlledOllLesson?.nextBeat();
              }}
              aria-label={tr("下一 OLL Beat")}
              disabled={lessonDeliverySettled}
            >
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                controlledOllLesson?.restart();
              }}
              aria-label={tr("重新播放 OLL 课程")}
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setNarrationAudioEnabled((enabled) => !enabled)
              }}
              aria-label={
                narrationAudioEnabled
                  ? tr("关闭课程旁白语音")
                  : tr("开启课程旁白语音")
              }
              aria-pressed={narrationAudioEnabled}
            >
              {narrationAudioEnabled
                ? <Volume2 size={16} />
                : <VolumeX size={16} />}
            </button>
            {lessonGenerationInProgress ? (
              <div
                className="learning-course-generation-status"
                role="status"
                aria-label={tr("课程内容仍在生成")}
              >
                <i aria-hidden="true" />
                <span>{tr("继续生成中")}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="learning-workspace-actions">
          {coursePreview ? (
            <button
              type="button"
              className="learning-mode-button is-active"
              onClick={onStartCourseInteraction}
              disabled={!onStartCourseInteraction}
            >
              <Play size={15} />
              <span>{tr("开始互动学习")}</span>
            </button>
          ) : (
            <>
          <button
            type="button"
            className={`learning-mode-button ${voiceEnabled ? "is-active" : ""}`}
            onClick={voiceEnabled ? onUseTextMode : () => void handleUseVoiceMode()}
            aria-label={
              voiceEnabled && conv.state === "starting"
                ? tr("语音准备中，点击关闭")
                : voiceEnabled ? tr("关闭语音") : tr("启用语音")
            }
            aria-pressed={voiceEnabled}
            aria-busy={voiceEnabled && conv.state === "starting"}
          >
            {voiceEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            <span>
              {voiceEnabled && conv.state === "starting"
                ? tr("语音准备中")
                : voiceEnabled ? tr("关闭语音") : tr("启用语音")}
            </span>
          </button>
          <button
            type="button"
            className={`learning-mode-button ${conv.cameraActive ? "is-active" : ""}`}
            onClick={conv.toggleCamera}
            aria-label={conv.cameraActive ? tr("关闭摄像头") : tr("启用摄像头")}
            aria-pressed={conv.cameraActive}
          >
            {conv.cameraActive ? <Camera size={16} /> : <CameraOff size={16} />}
            <span>{conv.cameraActive ? tr("关闭摄像头") : tr("启用摄像头")}</span>
          </button>
            </>
          )}
        </div>
      </header>

      {voiceEnabled && conv.state === "starting" ? (
        <div
          className="learning-voice-startup"
          role="status"
          aria-live="polite"
          aria-label={tr("正在准备语音识别")}
        >
          <span className="learning-voice-startup-spinner" aria-hidden="true" />
          <span className="learning-voice-startup-copy">
            <strong>{tr("正在准备语音识别")}</strong>
            <small>{conv.startupDetail ?? tr("正在初始化语音组件…")}</small>
            <small>{tr("首次使用需要加载约 17 MB，请保持页面打开。")}</small>
          </span>
          <span className="learning-voice-startup-progress" aria-hidden="true" />
        </div>
      ) : null}

      <main className="learning-canvas-shell">
        <LearningWhiteboard
          runtime={controlledOllLesson ?? ollLesson}
          taskReactions={lessonReactions}
          portableCourseRegion={coursePack?.courseRegion}
          inkSessionId={coursePreview ? undefined : inkSessionId}
          loadingState={whiteboardLoadingState}
          questions={replayingWithoutStudentAdditions || !selectionStateReady
            ? whiteboardQuestions.filter((question) => question.origin !== "selection")
            : whiteboardQuestions}
          courseRegions={courseRegions}
          playbackCourseTarget={playbackCourseTarget}
          onPlaceQuestion={placeWhiteboardQuestion}
          onUpdateCourseRegion={updateCourseRegion}
          onInkActivity={onWhiteboardActivity}
          onInkSaveHandlerChange={onInkSaveHandlerChange}
          onCourseRendered={handleCourseRendered}
          inkMergeSourceSessionId={inkMergeSourceSessionId ?? undefined}
          onInkMergeComplete={handleInkMergeComplete}
          onBoardWritingReady={setBoardWritingReady}
          selectionEnhancements={replayingWithoutStudentAdditions
            ? []
            : visibleSelectionEnhancements}
          selectionSources={replayingWithoutStudentAdditions
            ? []
            : selectionStateReady ? selectionState.sources : []}
          selectionCardLayouts={replayingWithoutStudentAdditions
            ? {}
            : selectionStateReady ? selectionState.card_layouts ?? {} : {}}
          onClassifyInkSelection={classifyInkSelection}
          onAskInkSelection={sendSelectionQuestion}
          onVoiceInkSelection={voiceEnabled
            ? startSelectionVoiceQuestion
            : undefined}
          onVoiceInkSelectionCaptureChange={handleVoiceInkSelectionCaptureChange}
          onReferenceInkSelection={referenceSelectionForLesson}
          onDeleteSelectionEnhancement={deleteSelectionEnhancement}
          onDeleteSelectionSources={deleteSelectionSources}
          onSelectionCardLayoutChange={updateSelectionCardLayout}
          onRetryDegradedVisual={retryDegradedVisual}
        />
      </main>

      {(conv.cameraStream || conv.lastSentFrameUrl) && (
        <div className="learning-camera-monitor" aria-label={tr("摄像头画面")}>
          {conv.cameraStream && (
            <div className="learning-camera-frame">
              <CameraPreview
                stream={conv.cameraStream}
                settings={cameraSettings}
              />
              <button
                type="button"
                className="learning-camera-frame-settings"
                onClick={openCameraSettings}
                aria-label={tr("调整摄像头画面")}
                aria-expanded={cameraSettingsOpen}
                title={tr("调整画面")}
              >
                <Settings2 size={16} />
              </button>
              <span>{tr("老师看到的画面")}</span>
            </div>
          )}
          {conv.lastSentFrameUrl && (
            <div className="learning-camera-frame is-sent">
              <img src={conv.lastSentFrameUrl} alt={tr("本轮已发送给老师的画面")} />
              <span>{tr("本轮已发送")}</span>
            </div>
          )}
        </div>
      )}

      {cameraSettingsOpen && (
        <CameraSettingsDialog
          stream={conv.cameraStream}
          settings={cameraSettings}
          error={conv.cameraError}
          temporaryPreview={false}
          onChange={conv.updateCameraSettings}
          onReset={conv.resetCameraSettings}
          onClose={closeCameraSettings}
        />
      )}

      <OctosTeacher
        state={teacherState}
        speech={teacherSpeech}
        preparing={lessonOwnsNarration && ollNarrationTts.preparing}
        stateLabel={teacherStateLabel}
        onClick={handleTeacherClick}
        disabled={coursePreview}
        teacherId={classroom.portrait.id}
        recordedVoice={Boolean(coursePack) && !lessonOnScreen?.questionId}
      />

      {controlledOllLesson
        ? <OllCourseOutline runtime={controlledOllLesson} />
        : null}

      {!coursePreview ? <StudentInputDock
        textOnly={import.meta.env.MODE === "android"}
        initialText={initialDraft}
        suggestions={!controlledOllLesson && whiteboardQuestions.length === 0
          ? [tr("斜率是什么？"), tr("圆的面积为什么是 πr²？"), tr("二次函数看不懂")]
          : []}
        voiceState={
          textTurnPending
            ? "thinking"
            : runtime.inputReady
              ? conv.state
              : "error"
        }
        cameraActive={conv.cameraActive}
        voiceDisabled={!voiceEnabled || !runtime.inputReady}
        sendDisabled={
          aiUnavailable || textTurnPending ||
          (voiceEnabled &&
            (conv.state === "thinking" || conv.state === "speaking"))
        }
        onMic={handleTeacherClick}
        onToggleCamera={conv.toggleCamera}
        onSendText={sendText}
        onSendImage={sendImage}
        references={composerBoardReferences.map(({ id, label }) => ({ id, label }))}
        onRemoveReference={(id) => setComposerBoardReferences((current) =>
          current.filter((reference) => reference.id !== id),
        )}
      /> : null}

      {(sendError ||
        fileListError ||
        artifactError ||
        activeOllCompilation.error ||
        ollLesson?.failure ||
        conv.error ||
        conv.cameraError ||
        ollNarrationTts.error) && (
        <div className="learning-error" role="alert">
          {sendError ??
            fileListError ??
            artifactError ??
            activeOllCompilation.error ??
            (ollLesson?.failure ? tr("课程已暂停：{{v0}}", { v0: ollLesson.failure.message }) : null) ??
            conv.error ??
            conv.cameraError ??
            ollNarrationTts.error}
          {sendError && lessonModelErrorMessage(sendErrorCode) && (
            <> <button onClick={() => openCapabilitySettings("lesson")}>{tr("前往设置")}</button></>
          )}
          {!sendError && ollNarrationTts.error && (
            <> <button onClick={() => openCapabilitySettings("tts")}>{tr("检查旁白设置")}</button></>
          )}
        </div>
      )}
      {aiUnavailable && !isEmbeddedCourse && (
        <div className="learning-runtime-warning" data-learning-board-occlusion="">
          {modelIssue
            ? <>{modelIssue} <button onClick={() => openCapabilitySettings("lesson")}>{tr("前往设置")}</button></>
            : <>{tr("连接模型后即可生成课程和使用小章鱼辅助；手写和已有课程不受影响。") + " "}<button onClick={() => openCapabilitySettings("lesson")}>{tr("去连接模型")}</button></>}
        </div>
      )}
      {!aiUnavailable && voiceEnabled && !runtime.inputReady && !runtime.loading && (
        <div className="learning-runtime-warning" data-learning-board-occlusion="">
          {tr("语音暂不可用，你可以继续打字、上传题目和阅读课程。") + " "}<button onClick={() => openCapabilitySettings("asr")}>{tr("配置语音输入")}</button>
        </div>
      )}
      {import.meta.env.DEV && import.meta.env.MODE !== "test" && isTraceInspectorVisible ? (
        <LearningTraceInspector recorder={learnTrace} />
      ) : null}
      {import.meta.env.MODE !== "test" && isJevDebuggerVisible ? (
        <JevAdmissionDebugger />
      ) : null}
    </div>
  );
}
