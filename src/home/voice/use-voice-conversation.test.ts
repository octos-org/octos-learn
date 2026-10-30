import { setLocale } from "@/i18n";
import { isPrivateAsrBusy } from "./use-voice-conversation";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  assembleTurnFiles,
  buildVoiceTurns,
  collectFreshAudio,
  collectFreshAudioWithTurnIds,
  collectFreshVisuals,
  farewellAudioActive,
  hasVisualMarker,
  isMeaningfulVoiceTranscript,
  pickFreshAudio,
  shouldHandleExitEvent,
  shouldHandleNoSpeechEvent,
  stripVisualMarker,
  useVoiceConversation,
} from "./use-voice-conversation";
import type { Thread } from "@/store/thread-store";
import * as VoiceTranscriptStore from "@/store/voice-transcript-store";

describe("voice transcript admission", () => {
  it("drops punctuation and hesitation-only results without rejecting real commands", () => {
    expect(isMeaningfulVoiceTranscript("嗯。")).toBe(false);
    expect(isMeaningfulVoiceTranscript("呃，嗯……")).toBe(false);
    expect(isMeaningfulVoiceTranscript("   ")).toBe(false);
    expect(isMeaningfulVoiceTranscript("嗯，请讲解这个公式")).toBe(true);
    expect(isMeaningfulVoiceTranscript("开始")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hook-level harness (start() cancellation — post-unmount mic re-acquire).
// The pure-function suites below don't touch these mocks.
// ---------------------------------------------------------------------------

const {
  captureStartMock,
  captureStopMock,
  getActiveBridgeMock,
  sendMessageMock,
  supportsVoiceAdmissionMock,
  admitVoiceMessageMock,
  commitAdmittedVoiceMessageMock,
  interruptActiveTurnMock,
  uploadFilesMock,
  privateAsrEnabledMock,
  nativePrivateAsrAvailableMock,
  preloadPrivateAsrRuntimeMock,
  preloadVoiceCaptureRuntimeMock,
  privateAsrConstructorMock,
  privateAsrInstance,
  captureState,
  cloudAvailable,
  transcribeCloudSpeechMock,
} = vi.hoisted(() => ({
  captureStartMock: vi.fn(async () => {}),
  captureStopMock: vi.fn(async () => {}),
  getActiveBridgeMock: vi.fn((): unknown => undefined),
  sendMessageMock: vi.fn(),
  supportsVoiceAdmissionMock: vi.fn(() => true),
  admitVoiceMessageMock: vi.fn(async () => ({
    status: "speech" as const,
    admissionId: "admission-1",
    transcript: "你好",
  })),
  commitAdmittedVoiceMessageMock: vi.fn(async () => ({ accepted: true })),
  interruptActiveTurnMock: vi.fn(async () => true),
  uploadFilesMock: vi.fn(async () => [] as string[]),
  privateAsrEnabledMock: vi.fn(() => false),
  nativePrivateAsrAvailableMock: vi.fn(() => false),
  preloadPrivateAsrRuntimeMock: vi.fn(async () => {}),
  preloadVoiceCaptureRuntimeMock: vi.fn(async () => {}),
  privateAsrConstructorMock: vi.fn(),
  cloudAvailable: { value: false, privateOffline: false },
  transcribeCloudSpeechMock: vi.fn(async () => ({ status: "speech" as "speech" | "no_speech", transcript: "请解释这个公式" })),
  captureState: {
    error: null as string | null,
    capturing: false,
  },
  privateAsrInstance: {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    isReusable: vi.fn(() => false),
    isNativeRtcActive: vi.fn(() => false),
    setConnectionErrorHandler: vi.fn(),
    setListening: vi.fn(async () => {}),
    commit: vi.fn(async () => "请比较两条函数曲线"),
    getVadStream: vi.fn(async () => ({} as MediaStream)),
  },
}));

vi.mock("@/byok/providers", () => ({ availableService: () => true }));
vi.mock("@/byok/services", () => ({ getServiceStatus: () => ({ detail: "configured" }) }));
vi.mock("./private-asr-client", () => ({
  privateAsrEnabled: privateAsrEnabledMock,
  preloadPrivateAsrRuntime: preloadPrivateAsrRuntimeMock,
  PrivateAsrClient: vi.fn(function PrivateAsrClientMock() {
    privateAsrConstructorMock();
    return privateAsrInstance;
  }),
}));

vi.mock("@/api/voice-routing", () => ({
  getVoiceRouting: vi.fn(async () => ({
    asr: "cloud",
    cloudAsrAvailable: cloudAvailable.value,
    cloudAsrDetail: "Cloud ASR unavailable",
  })),
  markPrivateAsrFailed: vi.fn(),
}));
vi.mock("@/api/cloud-asr", () => ({ transcribeCloudSpeech: transcribeCloudSpeechMock }));

vi.mock("./microphone", () => ({
  nativePrivateAsrAvailable: nativePrivateAsrAvailableMock,
  nativeAudioCaptureAvailable: vi.fn(() => false),
}));

vi.mock("./use-voice-capture", () => ({
  preloadVoiceCaptureRuntime: preloadVoiceCaptureRuntimeMock,
  // Stable object — the hook destructures start/stop and depends on their
  // identity staying constant across renders (mirrors the real hook's
  // useCallback([])-stable fns).
  useVoiceCapture: () => ({
    capturing: captureState.capturing,
    start: captureStartMock,
    stop: captureStopMock,
    error: captureState.error,
  }),
}));

const cameraMock = vi.hoisted(() => ({
  active: false,
  stream: null,
  error: null,
  start: vi.fn(async () => true),
  stop: vi.fn(),
  grabFrame: vi.fn(async () => null),
  settings: {
    rotation: 0,
    mirror: false,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    documentMode: true,
  },
  updateSettings: vi.fn(),
  resetSettings: vi.fn(),
}));

vi.mock("./use-camera-frame", () => ({
  useCameraFrame: () => cameraMock,
}));

// Behavioural audio-playback mock mirroring the real module's contract:
// `playAudioBlob` parks the clip's completion callback (playback "runs" until
// something fires it); `stopAudio` fires it exactly once, so `playOne`'s
// await resolves on interrupt just like the real implementation.
const audioMock = vi.hoisted(() => {
  const state = { onEnded: null as null | (() => void) };
  return {
    state,
    playAudioBlob: vi.fn(async (_blob: Blob, onEnded: () => void) => {
      state.onEnded = onEnded;
      return true;
    }),
    stopAudio: vi.fn(() => {
      const f = state.onEnded;
      state.onEnded = null;
      f?.();
    }),
    unlockAudio: vi.fn(),
  };
});

vi.mock("./audio-playback", () => ({
  playAudioBlob: audioMock.playAudioBlob,
  stopAudio: audioMock.stopAudio,
  unlockAudio: audioMock.unlockAudio,
}));

const threadsMock = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("@/store/projection-render-adapter", () => ({
  useRenderThreads: () => threadsMock.value,
}));

const projectionStoreMock = vi.hoisted(() => ({
  listener: null as
    | null
    | ((storeKey: string, envelope: Record<string, unknown>) => void),
}));

vi.mock("@/store/projection-store", () => ({
  projectionStoreKey: (sessionId: string, topic?: string) =>
    `${sessionId}\u0000${topic ?? ""}`,
  clientMessageIdForTurn: (_storeKey: string, turnId: string) => turnId,
  onEnvelopeObserved: (
    listener: (storeKey: string, envelope: Record<string, unknown>) => void,
  ) => {
    projectionStoreMock.listener = listener;
    return () => {
      if (projectionStoreMock.listener === listener) {
        projectionStoreMock.listener = null;
      }
    };
  },
}));

vi.mock("@/runtime/ui-protocol-send", () => ({
  admitVoiceMessage: admitVoiceMessageMock,
  commitAdmittedVoiceMessage: commitAdmittedVoiceMessageMock,
  interruptActiveTurn: interruptActiveTurnMock,
  sendMessage: sendMessageMock,
  supportsVoiceAdmission: supportsVoiceAdmissionMock,
}));

vi.mock("@/runtime/ui-protocol-runtime", () => ({
  getActiveBridge: getActiveBridgeMock,
}));

vi.mock("@/api/chat", () => ({
  uploadFiles: uploadFilesMock,
}));

vi.mock("@/api/files", () => ({
  buildFileUrl: (p: string) => p,
}));

vi.mock("@/api/client", () => ({
  buildApiHeaders: () => ({}),
  ensureSelectedProfileId: vi.fn(async () => "voice-profile"),
}));

afterEach(() => {
  cloudAvailable.value = false; cloudAvailable.privateOffline = false;
  transcribeCloudSpeechMock.mockReset();
  transcribeCloudSpeechMock.mockResolvedValue({ status: "speech", transcript: "请解释这个公式" });
  supportsVoiceAdmissionMock.mockReset();
  supportsVoiceAdmissionMock.mockReturnValue(true);
  admitVoiceMessageMock.mockReset();
  admitVoiceMessageMock.mockResolvedValue({
    status: "speech",
    admissionId: "admission-1",
    transcript: "你好",
  });
  commitAdmittedVoiceMessageMock.mockReset();
  commitAdmittedVoiceMessageMock.mockResolvedValue({ accepted: true });
  privateAsrInstance.isNativeRtcActive.mockReset();
  privateAsrInstance.isNativeRtcActive.mockReturnValue(false);
});

describe("assembleTurnFiles", () => {
  const audio = new File(["a"], "utterance.wav", { type: "audio/wav" });
  const frame = new File(["f"], "frame.jpg", { type: "image/jpeg" });

  it("sends audio only when the camera is disabled", async () => {
    const grab = vi.fn();
    const files = await assembleTurnFiles(audio, false, grab);
    expect(files).toEqual([audio]);
    expect(grab).not.toHaveBeenCalled();
  });

  it("appends the frame when the camera is enabled", async () => {
    const grab = vi.fn().mockResolvedValue(frame);
    const files = await assembleTurnFiles(audio, true, grab);
    expect(files).toEqual([audio, frame]);
  });

  it("falls back to audio only when grabFrame returns null", async () => {
    const grab = vi.fn().mockResolvedValue(null);
    const files = await assembleTurnFiles(audio, true, grab);
    expect(files).toEqual([audio]);
  });
});

describe("pickFreshAudio", () => {
  it("returns latest unplayed assistant audio file", () => {
    const threads = [
      { responses: [{ role: "assistant", text: "hi", files: [{ path: "a/r1.wav" }] }] },
      { responses: [{ role: "assistant", text: "yo", files: [{ path: "a/r2.wav" }] }] },
    ] as unknown as Thread[];
    const got = pickFreshAudio(threads, new Set(["a/r1.wav"]));
    expect(got).toEqual({ path: "a/r2.wav", text: "yo" });
  });
  it("returns null when all audio already played", () => {
    const threads = [
      { responses: [{ role: "assistant", text: "hi", files: [{ path: "a/r1.wav" }] }] },
    ] as unknown as Thread[];
    expect(pickFreshAudio(threads, new Set(["a/r1.wav"]))).toBeNull();
  });

  it("can skip audio from interrupted turns", () => {
    const threads = [
      {
        id: "old-turn",
        responses: [
          { role: "assistant", text: "old", files: [{ path: "a/old.wav" }] },
        ],
      },
      {
        id: "new-turn",
        responses: [
          { role: "assistant", text: "new", files: [{ path: "a/new.wav" }] },
        ],
      },
    ] as unknown as Thread[];

    expect(collectFreshAudio(threads, new Set(), new Set(["old-turn"]))).toEqual([
      { path: "a/new.wav", text: "new" },
    ]);
  });

  it("keeps turn ids for playback interruption bookkeeping", () => {
    const threads = [
      {
        id: "turn-1",
        responses: [
          { role: "assistant", text: "old", files: [{ path: "a/old.wav" }] },
        ],
      },
    ] as unknown as Thread[];

    expect(collectFreshAudioWithTurnIds(threads, new Set())).toEqual([
      { path: "a/old.wav", text: "old", turnId: "turn-1" },
    ]);
  });
});

describe("buildVoiceTurns", () => {
  it("shows a provisional ASR turn before any canonical thread exists", () => {
    expect(
      buildVoiceTurns(
        [],
        0,
        new Map([["turn-provisional", "先显示识别文字"]]),
        ["turn-provisional"],
      ),
    ).toEqual([
      {
        id: "turn-provisional",
        userText: "先显示识别文字",
        assistantText: "",
        awaitingTranscript: false,
      },
    ]);
  });

  it("uses a live ASR transcript when the canonical user row is still empty", () => {
    const threads = [
      {
        id: "turn-1",
        userMsg: { text: "", files: [{ path: "uploads/utterance.wav" }] },
        pendingAssistant: null,
        responses: [],
      },
    ] as unknown as Thread[];

    expect(
      buildVoiceTurns(
        threads,
        0,
        new Map([["turn-1", "这是刚识别出的文字"]]),
      ),
    ).toEqual([
      {
        id: "turn-1",
        userText: "这是刚识别出的文字",
        assistantText: "",
        awaitingTranscript: false,
      },
    ]);
  });

  it("derives ASR transcript and assistant text from threads", () => {
    const threads = [
      {
        id: "turn-1",
        userMsg: { text: "今天天气怎么样", files: [] },
        pendingAssistant: null,
        responses: [
          { role: "assistant", text: "今天适合出门。", files: [] },
        ],
      },
    ] as unknown as Thread[];

    expect(buildVoiceTurns(threads)).toEqual([
      {
        id: "turn-1",
        userText: "今天天气怎么样",
        assistantText: "今天适合出门。",
        awaitingTranscript: false,
      },
    ]);
  });

  it("marks an audio-only user row as awaiting transcript", () => {
    const threads = [
      {
        id: "turn-1",
        userMsg: { text: "", files: [{ path: "uploads/utterance.wav" }] },
        pendingAssistant: null,
        responses: [],
      },
    ] as unknown as Thread[];

    expect(buildVoiceTurns(threads)).toEqual([
      {
        id: "turn-1",
        userText: "",
        assistantText: "",
        awaitingTranscript: true,
      },
    ]);
  });

  it("hides learning protocol blocks while retaining the ASR transcript", () => {
    const threads = [
      {
        id: "turn-1",
        userMsg: {
          text: "[[LEARNING_CONTEXT]]\nactive: true\nsession_id: learn-1\n[[/LEARNING_CONTEXT]]\n帮我看这一步",
          files: [{ path: "uploads/utterance.wav" }],
        },
        pendingAssistant: null,
        responses: [],
      },
    ] as unknown as Thread[];

    expect(buildVoiceTurns(threads)[0]).toEqual(
      expect.objectContaining({
        userText: "帮我看这一步",
        awaitingTranscript: false,
      }),
    );
  });
});

describe("visual marker", () => {
  it("detects a well-formed marker and ignores empty/absent", () => {
    expect(hasVisualMarker("好的。\n[[VISUAL:html|负反馈电路]]")).toBe(true);
    expect(hasVisualMarker("[[VISUAL:image|一只猫]]")).toBe(true);
    expect(hasVisualMarker("好的。\n[[VISUAL:illustrated|人类细胞结构]]")).toBe(true);
    expect(hasVisualMarker("纯口播没有标记")).toBe(false);
    expect(hasVisualMarker("[[VISUAL:html|]]")).toBe(false);
  });

  it("strips the trailing marker for display", () => {
    expect(stripVisualMarker("我给你画一个。\n[[VISUAL:html|电路]]")).toBe(
      "我给你画一个。",
    );
    expect(stripVisualMarker("没有标记")).toBe("没有标记");
  });
});

describe("collectFreshVisuals", () => {
  it("collects unseen image/html artifacts and classifies by extension", () => {
    const threads = [
      {
        id: "t1",
        responses: [
          {
            role: "assistant",
            text: "x",
            files: [
              { path: "w/reply.wav" }, // audio — ignored
              { path: "w/visual-1.html" },
              { path: "w/poster.png" },
            ],
          },
        ],
      },
    ] as unknown as Thread[];
    expect(collectFreshVisuals(threads, new Set())).toEqual([
      { path: "w/visual-1.html", kind: "html" },
      { path: "w/poster.png", kind: "image" },
    ]);
  });

  it("skips already-seen artifacts and ignored turns", () => {
    const threads = [
      {
        id: "old",
        responses: [
          { role: "assistant", text: "x", files: [{ path: "w/old.png" }] },
        ],
      },
      {
        id: "new",
        responses: [
          { role: "assistant", text: "y", files: [{ path: "w/new.html" }] },
        ],
      },
    ] as unknown as Thread[];
    expect(
      collectFreshVisuals(threads, new Set(["w/seen.png"]), new Set(["old"])),
    ).toEqual([{ path: "w/new.html", kind: "html" }]);
  });
});

describe("shouldHandleExitEvent (voice/exit dedup)", () => {
  const SESSION = "voice-123";

  it("accepts a fresh turn for this session", () => {
    const consumed = new Set<string>();
    expect(
      shouldHandleExitEvent(
        { sessionId: SESSION, turnId: "t1" },
        SESSION,
        consumed,
      ),
    ).toBe(true);
  });

  it("rejects a different session", () => {
    expect(
      shouldHandleExitEvent(
        { sessionId: "other", turnId: "t1" },
        SESSION,
        new Set(),
      ),
    ).toBe(false);
  });

  it("rejects an already-consumed turn (replay / duplicate)", () => {
    const consumed = new Set<string>(["t1"]);
    expect(
      shouldHandleExitEvent(
        { sessionId: SESSION, turnId: "t1" },
        SESSION,
        consumed,
      ),
    ).toBe(false);
  });

  it("rejects missing/empty detail", () => {
    expect(shouldHandleExitEvent(undefined, SESSION, new Set())).toBe(false);
  });

  it("accepts when turnId is absent (cannot dedup, still session-scoped)", () => {
    expect(
      shouldHandleExitEvent({ sessionId: SESSION }, SESSION, new Set(["t1"])),
    ).toBe(true);
  });
});

describe("farewellAudioActive (fallback must not cut off the goodbye)", () => {
  it("is active while a clip is playing", () => {
    expect(farewellAudioActive(true, 0, "speaking")).toBe(true);
  });

  it("is active while clips remain queued", () => {
    expect(farewellAudioActive(false, 2, "thinking")).toBe(true);
  });

  it("is active in the speaking state", () => {
    expect(farewellAudioActive(false, 0, "speaking")).toBe(true);
  });

  it("is NOT active when idle with an empty queue (already done / none)", () => {
    expect(farewellAudioActive(false, 0, "idle")).toBe(false);
    expect(farewellAudioActive(false, 0, "listening")).toBe(false);
  });

  it("is NOT active in `thinking` with an empty queue, so the no-audio case can still exit", () => {
    // A turn that produced no farewell audio sits in `thinking`; the fallback
    // timer must be allowed to leave rather than hang forever.
    expect(farewellAudioActive(false, 0, "thinking")).toBe(false);
  });
});

describe("live ASR transcript projection", () => {
  afterEach(() => {
    threadsMock.value = [];
    VoiceTranscriptStore.__resetVoiceTranscriptStoreForTests();
  });

  it("updates the visible turn before canonical history contains the transcript", () => {
    threadsMock.value = [];
    const { result, rerender, unmount } = renderHook(() =>
      useVoiceConversation("voice-live-asr"),
    );

    expect(result.current.turns).toEqual([]);

    act(() => {
      VoiceTranscriptStore.upsert(
        "voice-live-asr",
        undefined,
        "turn-live-asr",
        "提前显示这句话",
      );
    });

    expect(result.current.turns[0]).toEqual(
      expect.objectContaining({
        userText: "提前显示这句话",
        awaitingTranscript: false,
      }),
    );
    expect(result.current.lastUserText).toBe("提前显示这句话");

    threadsMock.value = [
      {
        id: "turn-live-asr",
        turnId: "turn-live-asr",
        userMsg: {
          text: "",
          files: [{ path: "uploads/utterance.wav" }],
        },
        pendingAssistant: {
          role: "assistant",
          text: "稍后出现回答",
          files: [],
        },
        responses: [],
      },
    ];
    rerender();
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]).toEqual(
      expect.objectContaining({
        userText: "提前显示这句话",
        assistantText: "稍后出现回答",
      }),
    );
    unmount();
  });

  it("replays a transcript that arrived before the voice hook subscribed", () => {
    VoiceTranscriptStore.upsert(
      "voice-asr-before-mount",
      undefined,
      "turn-before-mount",
      "订阅之前已经到达",
    );

    const { result, unmount } = renderHook(() =>
      useVoiceConversation("voice-asr-before-mount"),
    );

    expect(result.current.turns).toEqual([
      {
        id: "turn-before-mount",
        userText: "订阅之前已经到达",
        assistantText: "",
        awaitingTranscript: false,
      },
    ]);
    unmount();
  });
});

describe("canonical reply-audio delivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    threadsMock.value = [];
    projectionStoreMock.listener = null;
    audioMock.state.onEnded = null;
    audioMock.playAudioBlob.mockClear();
    audioMock.stopAudio.mockClear();
    captureStartMock.mockClear();
    captureStopMock.mockClear();
    sendMessageMock.mockClear();
    supportsVoiceAdmissionMock.mockReset();
    supportsVoiceAdmissionMock.mockReturnValue(true);
    getActiveBridgeMock.mockReset();
    getActiveBridgeMock.mockReturnValue(undefined);
    privateAsrEnabledMock.mockReset();
    privateAsrEnabledMock.mockReturnValue(false);
    nativePrivateAsrAvailableMock.mockReset();
    nativePrivateAsrAvailableMock.mockReturnValue(false);
    privateAsrConstructorMock.mockClear();
    privateAsrInstance.start.mockReset();
    privateAsrInstance.start.mockResolvedValue(undefined);
    privateAsrInstance.stop.mockClear();
    privateAsrInstance.isReusable.mockReset();
    privateAsrInstance.isReusable.mockReturnValue(false);
    privateAsrInstance.setConnectionErrorHandler.mockClear();
    privateAsrInstance.setListening.mockClear();
    privateAsrInstance.commit.mockReset();
    privateAsrInstance.commit.mockResolvedValue("请比较两条函数曲线");
    privateAsrInstance.getVadStream.mockClear();
  });

  it("plays every observed sentence file even when consecutive files reuse a seq", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["audio"]),
      })),
    );
    getActiveBridgeMock.mockReturnValue({
      getConnectionState: () => "connected",
    });
    const { result, unmount } = renderHook(() =>
      useVoiceConversation("voice-post-terminal-audio"),
    );

    await act(async () => {
      await result.current.start();
    });
    const onUtterance = captureStartMock.mock.calls[0][0] as (
      wav: Blob,
    ) => void;
    await act(async () => {
      onUtterance(new Blob(["question"]));
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    expect(result.current.state).toBe("thinking");

    await act(async () => {
      projectionStoreMock.listener?.(
        "voice-post-terminal-audio\u0000",
        {
          session_id: "voice-post-terminal-audio",
          thread_id: "turn-post-terminal",
          turn_id: "turn-post-terminal",
          seq: 4,
          payload: {
            type: "file_attached",
            data: {
              path: "reply-first.mp3",
              mime: "audio/mpeg",
              size_bytes: 42,
            },
          },
        },
      );
      projectionStoreMock.listener?.(
        "voice-post-terminal-audio\u0000",
        {
          session_id: "voice-post-terminal-audio",
          thread_id: "turn-post-terminal",
          turn_id: "turn-post-terminal",
          seq: 4,
          payload: {
            type: "file_attached",
            data: {
              path: "reply-second.mp3",
              mime: "audio/mpeg",
              size_bytes: 44,
            },
          },
        },
      );
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      "reply-first.mp3?session=voice-post-terminal-audio",
      { headers: {} },
    );
    expect(audioMock.playAudioBlob).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("speaking");

    await act(async () => {
      const finishFirst = audioMock.state.onEnded;
      audioMock.state.onEnded = null;
      finishFirst?.();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      "reply-second.mp3?session=voice-post-terminal-audio",
      { headers: {} },
    );
    expect(audioMock.playAudioBlob).toHaveBeenCalledTimes(2);
    unmount();
  });
});

describe("BYOK speech admission lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers(); captureStartMock.mockClear(); captureStopMock.mockClear();
    sendMessageMock.mockClear(); uploadFilesMock.mockReset(); uploadFilesMock.mockResolvedValue([]);
    cameraMock.active = false; cameraMock.grabFrame.mockReset(); cameraMock.grabFrame.mockResolvedValue(null);
    getActiveBridgeMock.mockReset(); captureState.error = null; captureState.capturing = false;
  });
  const connect = () => getActiveBridgeMock.mockReturnValue({ getConnectionState: () => "connected" });
  it("does not reacquire a microphone after unmount during connection startup", async () => {
    vi.useFakeTimers(); getActiveBridgeMock.mockReturnValue(undefined);
    const { result, unmount } = renderHook(() => useVoiceConversation("cancel-start"));
    let started!: Promise<void>;
    act(() => { started = result.current.start(); });
    unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(13000); await started; });
    expect(captureStartMock).not.toHaveBeenCalled();
  });
  it("sends only the local transcript to Learn without WAV upload or server admission", async () => {
    connect(); const onAdmittedSpeech = vi.fn(async () => true);
    const { result, unmount } = renderHook(() => useVoiceConversation("direct-learn", undefined, undefined, { onAdmittedSpeech, playReplyAudio: false }));
    await act(async () => { await result.current.start({ initialAudio: new Blob(["wav"]) }); });
    expect(onAdmittedSpeech).toHaveBeenCalledWith(expect.objectContaining({ transcript: "请解释这个公式" }));
    expect(transcribeCloudSpeechMock).toHaveBeenCalledOnce();
    expect(uploadFilesMock).not.toHaveBeenCalled(); expect(admitVoiceMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled(); unmount();
  });
  it("drops silence before capturing or uploading unused camera context", async () => {
    connect(); transcribeCloudSpeechMock.mockResolvedValueOnce({ status: "no_speech", transcript: "" });
    const admitted = vi.fn(async () => true);
    const { result, unmount } = renderHook(() => useVoiceConversation("silence", undefined, undefined, { onAdmittedSpeech: admitted, playReplyAudio: false }));
    await act(async () => { await result.current.start({ initialAudio: new Blob(["silence"]) }); });
    expect(admitted).not.toHaveBeenCalled(); expect(uploadFilesMock).not.toHaveBeenCalled();
    expect(admitVoiceMessageMock).not.toHaveBeenCalled(); unmount();
  });
  it("keeps provider failure out of the server audio admission path", async () => {
    connect(); transcribeCloudSpeechMock.mockRejectedValueOnce(new Error("invalid own key"));
    const { result, unmount } = renderHook(() => useVoiceConversation("invalid-key", undefined, undefined, { onAdmittedSpeech: vi.fn(async () => true), playReplyAudio: false }));
    await act(async () => { await result.current.start({ initialAudio: new Blob(["wav"]) }); });
    expect(admitVoiceMessageMock).not.toHaveBeenCalled(); expect(uploadFilesMock).not.toHaveBeenCalled(); unmount();
  });
  it("sends a transcript through normal message submission when there is no Learn callback", async () => {
    connect();
    const { result, unmount } = renderHook(() => useVoiceConversation("text-submit", undefined, undefined, { playReplyAudio: false }));
    await act(async () => { await result.current.start({ initialAudio: new Blob(["wav"]) }); });
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({ text: "请解释这个公式", media: [] }));
    expect(admitVoiceMessageMock).not.toHaveBeenCalled(); expect(uploadFilesMock).not.toHaveBeenCalled(); unmount();
  });
  it("invalidates an in-flight recognition and stops capture after account/config reset", async () => {
    connect(); let finish!: (result: {status: "speech"; transcript: string}) => void;
    transcribeCloudSpeechMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const admitted = vi.fn(async () => true);
    const { result, unmount } = renderHook(() => useVoiceConversation("identity-reset", undefined, undefined, { onAdmittedSpeech: admitted, playReplyAudio: false }));
    let started!: Promise<void>;
    act(() => { started = result.current.start({ initialAudio: new Blob(["wav"]) }); });
    await act(async () => { for(let i=0;i<10;i++) await Promise.resolve(); });
    act(() => { window.dispatchEvent(new Event("octos:client-services-reset")); });
    await act(async () => { finish({ status: "speech", transcript: "stale account" }); await started; });
    expect(admitted).not.toHaveBeenCalled(); expect(captureStopMock).toHaveBeenCalled(); unmount();
  });
  it("runs ASR concurrently with the selected camera capture and uploads only its image", async () => {
    connect(); cameraMock.active = true;
    const image = new File(["pixels"], "frame.jpg", { type: "image/jpeg" });
    let frame!: (value: File) => void;
    cameraMock.grabFrame.mockImplementationOnce(() => new Promise(resolve => { frame = resolve; }));
    uploadFilesMock.mockResolvedValue(["up/frame.jpg"]);
    const admitted = vi.fn(async () => true);
    const { result, unmount } = renderHook(() => useVoiceConversation("camera-direct", undefined, undefined, { onAdmittedSpeech: admitted, playReplyAudio: false }));
    let started!: Promise<void>;
    await act(async () => { await result.current.start(); });
    const utterance = captureStartMock.mock.calls.at(-1)![0] as (wav: Blob) => Promise<void>;
    act(() => { started = utterance(new Blob(["wav"])); });
    await act(async () => { for(let i=0;i<15;i++) await Promise.resolve(); });
    expect(transcribeCloudSpeechMock).toHaveBeenCalledOnce();
    await act(async () => { frame(image); await started; });
    expect(uploadFilesMock.mock.calls.every(call => (call[0] as File[]).every(file => file.type.startsWith("image/")))).toBe(true);
    expect(admitted).toHaveBeenCalledOnce(); unmount();
  });
});

describe("shouldHandleNoSpeechEvent", () => {
  it("matches the active voice turn in the same session/topic", () => {
    expect(
      shouldHandleNoSpeechEvent(
        {
          sessionId: "s1",
          topic: "voice",
          threadId: "turn-1",
        },
        "s1",
        "voice",
        "turn-1",
      ),
    ).toBe(true);
    expect(
      shouldHandleNoSpeechEvent(
        {
          sessionId: "s1",
          topic: "voice",
          threadId: "turn-2",
        },
        "s1",
        "voice",
        "turn-1",
      ),
    ).toBe(false);
  });
});

it("keeps the private ASR capacity gate independent of translated error text", () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    setLocale(locale, false);
    for (const reason of ["busy", "single-session capacity", "语音服务正在使用中，你可以继续打字"]) expect(isPrivateAsrBusy(new Error(reason))).toBe(true);
    expect(isPrivateAsrBusy(new Error("bridge offline"))).toBe(false);
  }
  setLocale("zh-CN", false);
});
