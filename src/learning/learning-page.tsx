import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Home,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  setSessionTitle,
} from "@/api/sessions";
import { UiProtocolQuestionHost } from "@/components/ui-protocol-question-host";
import { ScopedRuntimeBridge } from "@/runtime/runtime-provider";
import {
  SessionContext,
  useModeState,
  type AdaptiveMode,
  type QueueMode,
} from "@/runtime/session-context";
import { unlockAudio } from "@/home/voice/audio-playback";
import {
  getEchoCancelledMicStream,
  nativeAudioCaptureAvailable,
  prepareNativeAudioCapture,
} from "@/home/voice/microphone";
import {
  privateAsrEnabled,
  preloadPrivateAsrRuntime,
} from "@/home/voice/private-asr-client";
import { preloadVoiceCaptureRuntime } from "@/home/voice/use-voice-capture";
import { useWakeLock } from "@/home/use-wake-lock";
import { fetchNativeTtsConfig } from "@/api/voice";
import {
  configureNativeTts,
  nativeTtsBridgeAvailable,
} from "@/home/voice/native-tts";
import type {
  VoiceConversationOptions,
  VoiceConversationTurn,
} from "@/home/voice/use-voice-conversation";
import { buildLearningSessionContext, buildLearningTurnContext } from "./learning-context";
import { LearningWorkspace } from "./learning-workspace";
import { parseCoursePackId } from "./course-pack/course-pack-loader";
import { useCoursePack } from "./course-pack/use-course-pack";
import type { LearningBoardContext } from "./learning-board-context";
import {
  bindCoursePackArchiveDigest,
  createCoursePackLearningInstance,
  createProvisionalLearningSession,
  adoptLearningSession,
  getCoursePackLearningInstance,
  hasDurableLocalWhiteboardContent,
  isSubstantiveLearningText,
  listLearningSessions,
  promoteLearningSession,
  removeLearningSession,
  resolveCoursePackPreviewSession,
  resolveLearningEntrySession,
  titleFromLearningText,
  updateLearningSession,
  type LearningSessionRecord,
} from "./learning-session-store";
import { discoverServerLearningSessions } from "./learning-session-sync";
import { consumeWakeAudio } from "./wake-audio-handoff";
import {
  acquireLearningTabLease,
  getLearningTabOwner,
  releaseLearningTabLease,
  renewLearningTabLease,
} from "./learning-tab-lease";

const AUTO_CAMERA_KEY = "octos_learning_auto_camera";
const INPUT_MODE_KEY = "octos_learning_input_mode";
const LEARNING_TAB_ID = getLearningTabOwner();

type LearningMediaCapability =
  | { available: true }
  | { available: false; message: string };

function detectLearningMediaCapability(): LearningMediaCapability {
  if (nativeAudioCaptureAvailable()) return { available: true };
  if (window.isSecureContext === false) {
    return {
      available: false,
      message:
        "当前页面不是安全连接，浏览器已停用麦克风和摄像头。请使用 HTTPS 地址；同一台电脑也可以使用 http://localhost:5173/learn。",
    };
  }
  if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
    return {
      available: false,
      message:
        "当前浏览器无法访问麦克风和摄像头。请确认浏览器支持媒体设备，并检查系统或浏览器权限设置。",
    };
  }
  return { available: true };
}

function preloadLearningVoiceRuntime(): void {
  void preloadVoiceCaptureRuntime().catch((error) => {
    console.warn("[learn] VAD runtime preload failed", error);
  });
  if (privateAsrEnabled()) {
    void preloadPrivateAsrRuntime().catch((error) => {
      console.warn("[learn] private ASR runtime preload failed", error);
    });
  }
}

async function requestLearningDevices(autoCamera: boolean): Promise<{
  autoCamera: boolean;
  voiceEnabled: boolean;
}> {
  const capability = detectLearningMediaCapability();
  if (!capability.available) throw new Error(capability.message);
  unlockAudio();
  // Permission acquisition, Agora loading, and Silero/ONNX downloads are
  // independent. Begin the network work inside the user's activation gesture
  // instead of waiting for getUserMedia and the ASR session sequentially.
  preloadLearningVoiceRuntime();
  let microphoneStream: MediaStream | null = null;
  let cameraStream: MediaStream | null = null;
  try {
    // Use the same Android-compatible acquisition path as the live voice
    // capture. Requesting audio+video directly here used to fail at the
    // permission gate before the USB-input fallbacks could run.
    if (nativeAudioCaptureAvailable()) {
      // AudioRecord is opened by the voice capture hook. Preparing here keeps
      // this permission gate independent of the broken Android 8 WebView mic.
      prepareNativeAudioCapture();
    } else {
      microphoneStream = await getEchoCancelledMicStream();
    }
    if (autoCamera) {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
    }
  } finally {
    microphoneStream?.getTracks().forEach((track) => track.stop());
    cameraStream?.getTracks().forEach((track) => track.stop());
  }
  localStorage.setItem(AUTO_CAMERA_KEY, String(autoCamera));
  localStorage.setItem(INPUT_MODE_KEY, "voice");
  return { autoCamera, voiceEnabled: true };
}

function LearningSessionScope({
  record,
  children,
}: {
  record: LearningSessionRecord;
  children: ReactNode;
}) {
  const { queueMode, adaptiveMode } = useModeState(record.id);
  const [activeTask, setActiveTask] = useState(false);
  const setServerTaskActive = useCallback(
    (_sessionId: string, active: boolean) => setActiveTask(active),
    [],
  );
  const sessionValue = useMemo(
    () => ({
      sessions: [],
      currentSessionId: record.id,
      historyTopic: "",
      currentSessionTitle: record.title,
      currentSessionStats: null,
      activeTaskOnServer: activeTask,
      queueMode: queueMode as QueueMode,
      adaptiveMode: adaptiveMode as AdaptiveMode,
      setServerTaskActive,
      renameSession: () => {},
      updateSessionStats: () => {},
      switchSession: () => {},
      goBack: async () => false,
      createSession: () => record.id,
      removeSession: async () => {},
      branchSession: async () => {
        throw new Error("session fork is not available on this surface");
      },
      refreshSessions: async () => {},
      markSessionActive: () => {},
    }),
    [
      activeTask,
      adaptiveMode,
      queueMode,
      record.id,
      record.title,
      setServerTaskActive,
    ],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <ScopedRuntimeBridge>{children}</ScopedRuntimeBridge>
    </SessionContext.Provider>
  );
}

function LearningServerSync({
  onDone,
}: {
  onDone: (
    discovered: LearningSessionRecord[],
    authoritative: boolean,
  ) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const sync = async () => {
      attempts += 1;
      try {
        const discovered = await discoverServerLearningSessions();
        if (!cancelled) onDone(discovered, true);
      } catch {
        if (cancelled) return;
        if (attempts < 4) {
          timer = window.setTimeout(() => void sync(), 300);
        } else {
          onDone([], false);
        }
      }
    };

    void sync();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [onDone]);
  return null;
}

export function LearningPage() {
  const navigate = useNavigate();
  // Keep the screen on during lessons (long narration + no interaction;
  // audit L7 — only /home held a wake lock before).
  useWakeLock();
  const ollFixture = useMemo<"geometry-v2" | "unit-circle-sine" | "math-two-points" | "math-circle-area" | undefined>(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "oll-fixture",
    );
    return requested === "geometry-v2" || requested === "unit-circle-sine"
      || requested === "math-two-points" || requested === "math-circle-area"
      ? requested
      : undefined;
  }, []);
  const requestedCoursePack = useMemo(() => new URLSearchParams(
    window.location.search,
  ).get("course-pack"), []);
  const requestedCourseVersion = useMemo(() => new URLSearchParams(
    window.location.search,
  ).get("course-version") ?? undefined, []);
  const requestedCourseMode = useMemo<"preview" | "instance">(() =>
    new URLSearchParams(window.location.search).get("course-mode") === "learn"
      ? "instance"
      : "preview", []);
  const requestedCourseInstance = useMemo(() => new URLSearchParams(
    window.location.search,
  ).get("course-instance"), []);
  const requestedCourseTitle = useMemo(() => new URLSearchParams(
    window.location.search,
  ).get("course-title")?.trim() || undefined, []);
  const newBoardRequested = useMemo(() => new URLSearchParams(
    window.location.search,
  ).get("new-board") === "1", []);
  const coursePackId = useMemo(
    () => parseCoursePackId(requestedCoursePack),
    [requestedCoursePack],
  );
  const staticPlayback = Boolean(ollFixture || coursePackId);
  useEffect(() => {
    if (!nativeTtsBridgeAvailable()) return;
    let cancelled = false;
    void fetchNativeTtsConfig()
      .then((config) => {
        if (!cancelled) configureNativeTts(config);
      })
      .catch((error) => {
        // A previously encrypted configuration remains available during a
        // temporary network outage; never log the configuration itself.
        console.warn("[learn] native TTS configuration refresh failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [hasTabLease] = useState(() =>
    acquireLearningTabLease(LEARNING_TAB_ID),
  );

  // Auto-recover from the lease-blocked dead screen (audit L8): once
  // the other tab closes, its lease expires within the TTL and this
  // poll acquires it — then reload to boot the real workspace. A live
  // owner renews every 5s against a 15s TTL, so we can never steal it.
  useEffect(() => {
    if (hasTabLease) return;
    const id = window.setInterval(() => {
      if (acquireLearningTabLease(LEARNING_TAB_ID)) {
        window.location.reload();
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [hasTabLease]);
  const wakeAudio = useMemo(() => consumeWakeAudio(), []);
  const [initialEntry] = useState(() => {
    if (!hasTabLease) {
      return {
        record: {
          id: "learn-blocked",
          status: "provisional" as const,
          title: "学习助手已在另一个标签页中打开",
          createdAt: 0,
          updatedAt: 0,
        },
      };
    }
    const hadResumableSession = newBoardRequested || listLearningSessions().some(
      (session) => !session.source
        && (session.status === "active" || session.status === "paused"),
    );
    const packSource = coursePackId ? {
      packId: coursePackId,
      version: requestedCourseVersion ?? "0.0.2",
    } : null;
    const requestedInstance = packSource && requestedCourseMode === "instance"
      && requestedCourseInstance
      ? getCoursePackLearningInstance(requestedCourseInstance, packSource)
      : null;
    const resolved = packSource
      ? requestedCourseMode === "instance"
        ? requestedInstance ?? createCoursePackLearningInstance(
            packSource,
            requestedCourseTitle ?? `课程：${coursePackId}`,
          )
        : resolveCoursePackPreviewSession(
            packSource,
            requestedCourseTitle ?? `预览：${coursePackId}`,
          )
      : newBoardRequested
      ? createProvisionalLearningSession()
      : resolveLearningEntrySession();
    const record =
      resolved.status === "paused"
        ? updateLearningSession(resolved.id, { status: "active" }) ?? resolved
        : resolved;
    return {
      hadResumableSession,
      record,
    };
  });
  useEffect(() => {
    if (!newBoardRequested) return;
    // The entry query is a one-shot creation instruction. Removing it after
    // mount lets refresh resume this board instead of creating another one.
    const url = new URL(window.location.href);
    url.searchParams.delete("new-board");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [newBoardRequested]);
  const [record, setRecord] = useState<LearningSessionRecord>(
    initialEntry.record,
  );
  const [courseAccessMode, setCourseAccessMode] = useState<"preview" | "instance">(
    coursePackId ? requestedCourseMode : "instance",
  );
  const [lockedCourseDigest] = useState(
    () => "source" in initialEntry.record
      ? initialEntry.record.source?.archiveSha256
      : undefined,
  );
  const coursePackLoad = useCoursePack(
    coursePackId,
    requestedCourseVersion,
    lockedCourseDigest,
  );
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(() =>
    coursePackId || initialEntry.record.status === "provisional"
      ? null
      : initialEntry.record.id,
  );
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);
  useEffect(() => {
    const digest = coursePackLoad.source?.pack.archiveSha256;
    if (!digest || record.source?.mode !== "instance"
      || record.source.archiveSha256 === digest) return;
    bindCoursePackArchiveDigest(record.id, digest);
  }, [coursePackLoad.source, record.id, record.source]);
  const boardContextRef = useRef<LearningBoardContext>({});
  const [devicePreferences, setDevicePreferences] = useState<{
    autoCamera: boolean;
    voiceEnabled: boolean;
  }>({ autoCamera: false, voiceEnabled: false });
  useEffect(() => {
    // Enter the whiteboard immediately and make media an explicit opt-in on
    // every launch. This also clears a voice preference saved by older APKs.
    localStorage.setItem(AUTO_CAMERA_KEY, "false");
    localStorage.setItem(INPUT_MODE_KEY, "text");
  }, []);
  const [serverSyncReady, setServerSyncReady] = useState(staticPlayback);
  const markerSentRef = useRef(false);
  const [wakeSessionId, setWakeSessionId] = useState<string | null>(
    wakeAudio ? record.id : null,
  );

  const handleServerSync = useCallback(
    (
      discovered: LearningSessionRecord[],
      authoritative: boolean,
    ) => {
      if (!authoritative) {
        setServerSyncReady(true);
        return;
      }

      const adopted = discovered.map((session) => adoptLearningSession(session));
      const keepIds = new Set(adopted.map((session) => session.id));
      for (const local of listLearningSessions()) {
        if (local.source?.kind === "course-pack") continue;
        if (
          !keepIds.has(local.id)
          && !hasDurableLocalWhiteboardContent(local.id)
        ) {
          removeLearningSession(local.id);
        }
      }

      const current = recordRef.current;
      if (current.source?.kind === "course-pack") {
        setServerSyncReady(true);
        return;
      }
      const currentHasLocalWhiteboard =
        hasDurableLocalWhiteboardContent(current.id);
      const currentWasRemoved =
        current.status !== "provisional"
        && !keepIds.has(current.id)
        && !currentHasLocalWhiteboard;
      if (
        (currentWasRemoved ||
          (
            !initialEntry.hadResumableSession
            && current.status === "provisional"
            && !currentHasLocalWhiteboard
          )) &&
        adopted.length > 0
      ) {
        const latest = [...adopted].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        )[0];
        if (current.id !== latest.id) removeLearningSession(current.id);
        const resumed =
          updateLearningSession(latest.id, { status: "active" }) ??
          adoptLearningSession({ ...latest, status: "active" });
        markerSentRef.current = false;
        boardContextRef.current = {};
        setReviewSessionId(resumed.id);
        setWakeSessionId(wakeAudio ? resumed.id : null);
        setRecord(resumed);
      } else if (currentWasRemoved) {
        const next = createProvisionalLearningSession();
        markerSentRef.current = false;
        boardContextRef.current = {};
        setReviewSessionId(null);
        setWakeSessionId(null);
        setRecord(next);
      }
      setServerSyncReady(true);
    },
    [
      initialEntry.hadResumableSession,
      wakeAudio,
    ],
  );

  useEffect(() => {
    if (!hasTabLease) return;
    const timer = window.setInterval(() => {
      renewLearningTabLease(LEARNING_TAB_ID);
    }, 5_000);
    return () => {
      window.clearInterval(timer);
      releaseLearningTabLease(LEARNING_TAB_ID);
    };
  }, [hasTabLease]);

  const buildTurnText = useCallback<NonNullable<VoiceConversationOptions["buildTurnText"]>>(
    (context) => {
      const turnContext = buildLearningTurnContext({
        sessionId: record.id,
        turnId: context.turnId,
        provisional:
          record.status === "provisional" ? true : undefined,
        currentFrame: context.currentFramePath,
        lastAppliedAction: boardContextRef.current.lastAppliedAction,
        boardSummary: boardContextRef.current.boardSummary,
      });
      if (!markerSentRef.current) {
        markerSentRef.current = true;
        const sessionContext = buildLearningSessionContext({
          sessionId: record.id,
          entry:
            wakeSessionId === record.id ? "wake-word" : "direct",
          provisional: record.status === "provisional",
        });
        return `${sessionContext}\n${turnContext}`;
      }
      return turnContext;
    },
    [record.id, record.status, wakeSessionId],
  );

  const conversationOptions = useMemo<VoiceConversationOptions>(
    () => ({
      autoStartCamera:
        devicePreferences?.voiceEnabled === true &&
        devicePreferences.autoCamera,
      buildTurnText,
      playReplyAudio: false,
      showExistingTurns: true,
      onTurnStart: () => {
        setReviewSessionId((current) =>
          current === record.id ? null : current,
        );
      },
    }),
    [buildTurnText, devicePreferences, record.id],
  );

  const handleBoardContextChange = useCallback(
    (context: LearningBoardContext) => {
      boardContextRef.current = context;
    },
    [],
  );

  const useTextMode = useCallback(() => {
    localStorage.setItem(INPUT_MODE_KEY, "text");
    setDevicePreferences((current) => ({
      autoCamera: current?.autoCamera ?? false,
      voiceEnabled: false,
    }));
  }, []);

  const useVoiceMode = useCallback(async () => {
    const preferences = await requestLearningDevices(false);
    setDevicePreferences(preferences);
  }, []);

  const handleLearnerInput = useCallback(
    (text: string) => {
      const currentRecord = recordRef.current;
      setReviewSessionId((current) =>
        current === currentRecord.id ? null : current,
      );
      if (!isSubstantiveLearningText(text)) return;
      let promoted: LearningSessionRecord | null = null;
      if (currentRecord.status === "provisional") {
        promoted = promoteLearningSession(currentRecord.id, text);
      } else if (currentRecord.title === "手写白板") {
        promoted = updateLearningSession(currentRecord.id, {
          title: titleFromLearningText(text),
        });
      } else if (currentRecord.source?.mode === "instance") {
        promoted = updateLearningSession(currentRecord.id, { status: "active" });
      }
      if (!promoted) return;
      recordRef.current = promoted;
      setRecord(promoted);
      if (currentRecord.source?.mode === "instance") return;
      void setSessionTitle(promoted.id, promoted.title).catch(() => {
        // Local title remains usable when an older server cannot persist it.
      });
    },
    [],
  );

  const handleWhiteboardActivity = useCallback(() => {
    const currentRecord = recordRef.current;
    if (currentRecord.source?.mode === "instance") {
      const updated = updateLearningSession(currentRecord.id, { status: "active" });
      if (!updated) return;
      recordRef.current = updated;
      setRecord(updated);
      return;
    }
    if (currentRecord.status !== "provisional") return;
    const promoted = promoteLearningSession(currentRecord.id, "手写白板");
    if (!promoted) return;
    recordRef.current = promoted;
    setRecord(promoted);
    void setSessionTitle(promoted.id, promoted.title).catch(() => {
      // Ink is already durable locally; the title can be retried after the
      // first server-backed action creates the corresponding session.
    });
  }, []);

  const inkSaveHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const leavingRef = useRef(false);
  const handleInkSaveHandlerChange = useCallback((
    handler: (() => Promise<void>) | null,
  ) => {
    inkSaveHandlerRef.current = handler;
  }, []);

  const handleTurnsChange = useCallback(
    (turns: VoiceConversationTurn[]) => {
      const substantive = turns.find((turn) =>
        isSubstantiveLearningText(turn.userText),
      );
      if (substantive) handleLearnerInput(substantive.userText);
    },
    [handleLearnerInput],
  );

  const startCourseInteraction = useCallback(() => {
    const pack = coursePackLoad.source?.pack;
    if (!coursePackId || !pack) return;
    const next = createCoursePackLearningInstance({
      packId: coursePackId,
      version: pack.manifest.version,
      archiveSha256: pack.archiveSha256,
    }, requestedCourseTitle ?? record.title.replace(/^预览：/u, ""));
    const url = new URL(window.location.href);
    url.searchParams.set("course-mode", "learn");
    url.searchParams.set("course-instance", next.id);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    recordRef.current = next;
    markerSentRef.current = false;
    boardContextRef.current = {};
    setCourseAccessMode("instance");
    setReviewSessionId(null);
    setWakeSessionId(null);
    setRecord(next);
  }, [
    coursePackId,
    coursePackLoad.source,
    record.title,
    requestedCourseTitle,
  ]);

  const leaveToHome = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    try {
      await inkSaveHandlerRef.current?.();
    } catch {
      leavingRef.current = false;
      window.alert("笔迹尚未保存成功，请稍后再试。");
      return;
    }
    const current = recordRef.current;
    if (current.status === "active") {
      updateLearningSession(current.id, { status: "paused" });
    }
    navigate("/");
  }, [navigate]);

  const finishAndLeave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    try {
      await inkSaveHandlerRef.current?.();
    } catch {
      leavingRef.current = false;
      window.alert("笔迹尚未保存成功，请稍后再试。");
      return;
    }
    const completed = updateLearningSession(record.id, { status: "completed" });
    if (completed) {
      recordRef.current = completed;
      setRecord(completed);
    }
    navigate("/");
  }, [navigate, record.id]);

  if (!hasTabLease) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center bg-black px-6 text-white">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="absolute left-5 top-6 flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/60 transition hover:border-white/30 hover:text-white"
        >
          <ArrowLeft size={16} />
          返回首页
        </button>
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">学习助手已在另一个标签页中使用</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            为避免两个页面同时占用麦克风，请先关闭另一个学习页。关闭后本页会在数秒内自动恢复。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white">
      <main className="relative min-w-0 flex-1">
        <div
          className="learning-top-action-group absolute left-3 top-6 z-20 flex items-center gap-2"
          data-learning-board-occlusion=""
        >
          <button
            type="button"
            aria-label="返回首页"
            title="返回首页"
            onClick={() => void leaveToHome()}
            className="learning-top-action-button flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/80 text-stone-600 shadow-sm backdrop-blur-md hover:text-cyan-800"
          >
            <Home size={20} />
          </button>
          <button
            type="button"
            aria-label="打开设置"
            title="设置"
            onClick={() => navigate("/settings")}
            className="learning-top-action-button flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/80 text-stone-600 shadow-sm backdrop-blur-md hover:text-cyan-800"
          >
            <Settings size={19} />
          </button>
        </div>
        <LearningSessionScope record={record}>
          {!staticPlayback && <LearningServerSync onDone={handleServerSync} />}
          {requestedCoursePack && !coursePackId ? (
            <div className="flex h-full items-center justify-center text-sm text-red-200">
              无法识别课程包“{requestedCoursePack}”
            </div>
          ) : coursePackLoad.error ? (
            <div className="flex h-full items-center justify-center text-sm text-red-200">
              {coursePackLoad.error}
            </div>
          ) : serverSyncReady && !coursePackLoad.loading ? (
            <LearningWorkspace
              key={`${record.id}:${coursePackLoad.source?.pack.archiveSha256 ?? "live"}`}
              sessionId={record.id}
              playbackMode={
                reviewSessionId === record.id ? "review" : "live"
              }
              initialAudio={
                wakeSessionId === record.id ? wakeAudio : null
              }
              conversationOptions={conversationOptions}
              voiceEnabled={courseAccessMode !== "preview" && devicePreferences.voiceEnabled}
              courseAccessMode={courseAccessMode}
              onStartCourseInteraction={courseAccessMode === "preview"
                ? startCourseInteraction
                : undefined}
              onUseTextMode={useTextMode}
              onUseVoiceMode={useVoiceMode}
              onLearnerInput={handleLearnerInput}
              onWhiteboardActivity={handleWhiteboardActivity}
              onInkSaveHandlerChange={handleInkSaveHandlerChange}
              onTurnsChange={handleTurnsChange}
              onBoardContextChange={handleBoardContextChange}
              onBack={leaveToHome}
              onVoiceExit={finishAndLeave}
              ollFixture={ollFixture}
              coursePack={coursePackLoad.source ?? undefined}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/45">
              {coursePackLoad.loading ? "正在准备课程包…" : "正在恢复学习会话…"}
            </div>
          )}
          <UiProtocolQuestionHost />
        </LearningSessionScope>
      </main>
    </div>
  );
}
