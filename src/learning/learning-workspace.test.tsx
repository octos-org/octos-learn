import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  VoiceConversation,
  VoiceConversationOptions,
} from "@/home/voice/use-voice-conversation";
import type { Thread } from "@/store/thread-store";
import {
  buildDegradedVisualRetryContext,
  buildDegradedVisualRetryPrompt,
} from "./degraded-visual-retry";
import { LearningWorkspace } from "./learning-workspace";

const conversationMock = vi.hoisted(() => ({
  turns: [] as VoiceConversation["turns"],
  threads: [] as Thread[],
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
  startCamera: vi.fn(async () => true),
  stopCamera: vi.fn(),
  cameraActive: false,
  cameraStream: null as MediaStream | null,
  lastSentFrameUrl: null as string | null,
  cameraSettings: {
    rotation: 0 as const,
    mirror: false,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    documentMode: true,
  },
  updateCameraSettings: vi.fn(),
  resetCameraSettings: vi.fn(),
  options: null as VoiceConversationOptions | null,
  optionsHistory: [] as VoiceConversationOptions[],
}));
const sessionFilesMock = vi.hoisted(() => ({
  getSessionFiles: vi.fn(async () => []),
  invokeSkillAction: vi.fn(async () => ({ action_id: "learning.selection.enhance", ok: true, results: [] })),
}));
const narrationTtsMock = vi.hoisted(() => ({
  useOllNarrationTts: vi.fn(() => ({ error: null, preparing: false })),
}));
const inkRuntimeMock = vi.hoisted(() => ({
  mountInkRuntime: vi.fn(),
}));

vi.mock("@/api/chat", () => ({ uploadFiles: vi.fn() }));
vi.mock("@/api/sessions", () => ({
  getSessionFiles: sessionFilesMock.getSessionFiles,
}));
vi.mock("@/api/skill-actions", () => ({
  invokeSkillAction: sessionFilesMock.invokeSkillAction,
}));
vi.mock("@/runtime/ui-protocol-send", () => ({ sendMessage: vi.fn() }));
vi.mock("@/home/voice/audio-playback", () => ({ unlockAudio: vi.fn() }));
vi.mock("@/home/voice/camera-preview", () => ({
  CameraPreview: () => <canvas data-testid="camera-preview" />,
}));
vi.mock("./oll/use-oll-narration-tts", () => ({
  useOllNarrationTts: narrationTtsMock.useOllNarrationTts,
}));
vi.mock("./oll/oll-ink-runtime", () => ({
  mountInkRuntime: inkRuntimeMock.mountInkRuntime,
}));
vi.mock("@/store/projection-render-adapter", () => ({
  useRenderThreads: () => conversationMock.threads,
}));
vi.mock("@/home/use-ominix-runtime-summary", () => ({
  useOminixRuntimeSummary: () => ({
    ready: true,
    loading: false,
  }),
}));
vi.mock("@/home/voice/use-voice-conversation", () => ({
  useVoiceConversation: (
    _sessionId: string,
    _historyTopic: string | undefined,
    _onExit: (() => void) | undefined,
    options: VoiceConversationOptions,
  ) => {
    conversationMock.options = options;
    conversationMock.optionsHistory.push(options);
    return {
    state: "idle",
    lastUserText: "",
    lastAssistantText: conversationMock.turns.at(-1)?.assistantText ?? "",
    turns: conversationMock.turns,
    error: null,
    start: conversationMock.start,
    stop: conversationMock.stop,
    interrupt: vi.fn(),
    cameraActive: conversationMock.cameraActive,
    cameraStream: conversationMock.cameraStream,
    lastSentFrameUrl: conversationMock.lastSentFrameUrl,
    cameraError: null,
    cameraSettings: conversationMock.cameraSettings,
    updateCameraSettings: conversationMock.updateCameraSettings,
    resetCameraSettings: conversationMock.resetCameraSettings,
    startCamera: conversationMock.startCamera,
    stopCamera: conversationMock.stopCamera,
    toggleCamera: vi.fn(),
    generating: false,
    exiting: false,
    visual: null,
    dismissVisual: vi.fn(),
    };
  },
}));

describe("LearningWorkspace", () => {
  it("builds a component-only retry request that preserves the existing board", () => {
    const degraded = {
      boardId: "learning-board-session-1",
      boardRevision: 12,
      nodeId: "lesson:node:paraboloid-scene",
      visualId: "paraboloid-scene",
      surface: "scene3d",
      purpose: "展示可旋转的抛物面与水平截面",
      title: "这个互动画面暂时没有生成成功",
    };
    expect(buildDegradedVisualRetryPrompt(degraded)).toBe(
      "请重新生成没有成功展示的三维场景“展示可旋转的抛物面与水平截面”。只补充这个画面，不要重做整堂课。",
    );
    const context = buildDegradedVisualRetryContext(degraded);
    expect(context).toContain("request_source: explicit_board_follow_up");
    expect(context).toContain("board_id: learning-board-session-1");
    expect(context).toContain("board_revision: 12");
    expect(context).toContain('"target_id":"lesson:node:paraboloid-scene"');
    expect(context).toContain('"as":"failed-visual"');
  });

  beforeEach(() => {
    cleanup();
    conversationMock.turns = [];
    conversationMock.threads = [];
    conversationMock.start.mockClear();
    conversationMock.stop.mockClear();
    conversationMock.startCamera.mockClear();
    conversationMock.stopCamera.mockClear();
    conversationMock.cameraActive = false;
    conversationMock.cameraStream = null;
    conversationMock.lastSentFrameUrl = null;
    conversationMock.cameraSettings = {
      rotation: 0,
      mirror: false,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      documentMode: true,
    };
    conversationMock.updateCameraSettings.mockClear();
    conversationMock.resetCameraSettings.mockClear();
    conversationMock.options = null;
    conversationMock.optionsHistory = [];
    narrationTtsMock.useOllNarrationTts.mockClear();
    narrationTtsMock.useOllNarrationTts.mockReturnValue({
      error: null,
      preparing: false,
    });
    inkRuntimeMock.mountInkRuntime.mockReset();
    inkRuntimeMock.mountInkRuntime.mockImplementation(() => {
      const state = {
        mode: "navigate" as const,
        component_count: 0,
        selected_count: 0,
        pen_color: "#176b62",
        selection_color: null,
        selection_input: "unknown" as const,
        selection_mode: "rectangle" as const,
        selection_revision: 0,
        document_version: 0,
        saved: true,
      };
      return {
        ready: Promise.resolve(),
        state,
        subscribe: vi.fn((listener: (next: typeof state) => void) => {
          listener(state);
          return () => undefined;
        }),
        setMode: vi.fn(),
        setPenColor: vi.fn(),
        setSelectionColor: vi.fn(),
        setSelectionMode: vi.fn(),
        selectAll: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        mergeSavedDocument: vi.fn(async () => null),
        destroy: vi.fn(async () => undefined),
      };
    });
    sessionFilesMock.getSessionFiles.mockReset();
    sessionFilesMock.getSessionFiles.mockResolvedValue([]);
    sessionFilesMock.invokeSkillAction.mockReset();
    sessionFilesMock.invokeSkillAction.mockResolvedValue({
      action_id: "learning.selection.enhance",
      ok: true,
      results: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the live camera and the exact frame sent with the voice turn", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    conversationMock.cameraActive = true;
    conversationMock.cameraStream = {
      getTracks: () => [],
    } as unknown as MediaStream;
    conversationMock.lastSentFrameUrl = "blob:sent-frame";

    render(
      <LearningWorkspace
        sessionId="learn-camera-feedback"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("camera-preview")).toBeTruthy();
    expect(screen.getByText("老师看到的画面")).toBeTruthy();
    expect(
      screen.getByAltText("本轮已发送给老师的画面").getAttribute("src"),
    ).toBe("blob:sent-frame");
    expect(screen.getByText("本轮已发送")).toBeTruthy();
  });

  it("lets the learner calibrate the exact camera frame sent to the teacher", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    conversationMock.cameraActive = true;
    conversationMock.cameraStream = {
      getTracks: () => [],
    } as unknown as MediaStream;

    render(
      <LearningWorkspace
        sessionId="learn-camera-calibration"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "调整摄像头画面" }).click();
    });
    screen.getByRole("button", { name: "向右旋转摄像头画面" }).click();
    expect(conversationMock.updateCameraSettings).toHaveBeenCalledWith({
      rotation: 90,
    });
    expect(
      screen.getByRole("button", { name: /试卷清晰模式/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("lets text mode request voice and camera without leaving the lesson", async () => {
    const onUseVoiceMode = vi.fn(async () => undefined);
    render(
      <LearningWorkspace
        sessionId="learn-enable-voice"
        voiceEnabled={false}
        onUseVoiceMode={onUseVoiceMode}
        onBack={vi.fn()}
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "启用语音和摄像头" }).click();
      await Promise.resolve();
    });
    expect(onUseVoiceMode).toHaveBeenCalledTimes(1);
  });

  it("keeps camera calibration available in text mode and releases its temporary preview", async () => {
    render(
      <LearningWorkspace
        sessionId="learn-camera-settings-in-text-mode"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    const adjustButton = screen.getByRole("button", { name: "调整摄像头画面" });
    expect(adjustButton).toBeTruthy();
    await act(async () => {
      adjustButton.click();
      await Promise.resolve();
    });

    expect(conversationMock.startCamera).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "调整老师看到的画面" })).toBeTruthy();
    screen.getByRole("button", { name: "关闭摄像头画面设置" }).click();
    expect(conversationMock.stopCamera).toHaveBeenCalledTimes(1);
  });

  it("releases microphone capture when switching from voice to text mode", () => {
    const { rerender } = render(
      <LearningWorkspace
        sessionId="learn-switch-to-text"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );
    expect(conversationMock.start).toHaveBeenCalledTimes(1);

    rerender(
      <LearningWorkspace
        sessionId="learn-switch-to-text"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    expect(conversationMock.stop).toHaveBeenCalledTimes(1);
  });

  it("does not project ordinary assistant prose onto the OLL whiteboard", () => {
    const longReply =
      "第一步：先看 $x^2 + 6x$。配方公式是 $(x+b)^2=x^2+2bx+b^2$。\n\n所以得到 $y=(x+3)^2-4$。";
    conversationMock.turns = [
      {
        id: "turn-1",
        userText: "把 y = x² + 6x + 5 配方，并说出顶点。",
        assistantText: longReply,
        awaitingTranscript: false,
      },
    ];

    render(
      <LearningWorkspace
        sessionId="learn-test"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("向 Octos 提问，我们从这里开始")).toBeTruthy();
    expect(screen.queryByText(longReply)).toBeNull();
    expect(screen.queryByRole("button", { name: "下一步" })).toBeNull();
  });

  it("speaks a completed plain reply and marks the old board as unchanged", async () => {
    vi.useFakeTimers();
    conversationMock.turns = [{
      id: "camera-clarification",
      userText: "这道题怎么写",
      assistantText: "画面有些模糊，请把试卷转正并移近一点。",
      awaitingTranscript: false,
    }];
    const view = render(
      <LearningWorkspace
        sessionId="learn-camera-clarification"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );

    act(() => {
      conversationMock.options?.onTurnComplete?.("camera-clarification");
      view.rerender(
        <LearningWorkspace
          sessionId="learn-camera-clarification"
          voiceEnabled
          onBack={vi.fn()}
        />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(2_600);
    });

    expect(narrationTtsMock.useOllNarrationTts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: true,
        playing: true,
        text: "画面有些模糊，请把试卷转正并移近一点。",
        narrationId: "plain-reply:camera-clarification",
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("本轮没有更新白板");
  });

  it("does not speak a generic reply for a voice turn with no learner transcript", async () => {
    vi.useFakeTimers();
    const genericReply = "好的，你看看还有其他题目需要讲解吗？";
    conversationMock.turns = [{
      id: "empty-voice-turn",
      userText: "",
      assistantText: genericReply,
      awaitingTranscript: true,
    }];
    const view = render(
      <LearningWorkspace
        sessionId="learn-empty-voice-turn"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );

    act(() => {
      conversationMock.options?.onTurnComplete?.("empty-voice-turn");
      view.rerender(
        <LearningWorkspace
          sessionId="learn-empty-voice-turn"
          voiceEnabled
          onBack={vi.fn()}
        />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(2_600);
    });

    expect(screen.queryByText(genericReply)).toBeNull();
    expect(narrationTtsMock.useOllNarrationTts).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: genericReply }),
    );
    expect(screen.queryByText(/本轮没有更新白板/)).toBeNull();
  });

  it("waits for a delayed transcript before classifying the completed reply", async () => {
    vi.useFakeTimers();
    const assistantReply = "我们先把根式里面的十八分解成九乘二。";
    conversationMock.turns = [{
      id: "late-transcript-turn",
      userText: "",
      assistantText: assistantReply,
      awaitingTranscript: true,
    }];
    const view = render(
      <LearningWorkspace
        sessionId="learn-late-transcript"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );

    act(() => {
      conversationMock.options?.onTurnComplete?.("late-transcript-turn");
      view.rerender(
        <LearningWorkspace
          sessionId="learn-late-transcript"
          voiceEnabled
          onBack={vi.fn()}
        />,
      );
      vi.advanceTimersByTime(5_000);
    });
    expect(narrationTtsMock.useOllNarrationTts).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: assistantReply }),
    );

    conversationMock.turns = [{
      id: "late-transcript-turn",
      userText: "根号十八减根号二怎么算",
      assistantText: assistantReply,
      awaitingTranscript: false,
    }];
    view.rerender(
      <LearningWorkspace
        sessionId="learn-late-transcript"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(2_600);
    });

    expect(narrationTtsMock.useOllNarrationTts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        playing: true,
        text: assistantReply,
        narrationId: "plain-reply:late-transcript-turn",
      }),
    );
  });

  it("suspends voice capture in the render that starts OLL playback", () => {
    render(
      <LearningWorkspace
        sessionId="learn-voice-playback-ownership"
        voiceEnabled
        ollFixture="geometry-v2"
        onBack={vi.fn()}
      />,
    );

    expect(conversationMock.options?.externalSpeechActive).toBe(true);
    expect(
      conversationMock.optionsHistory.every(
        (options) => options.externalSpeechActive === true,
      ),
    ).toBe(true);
  });

  it("keeps lesson narration active while the student moves a variable control", async () => {
    render(
      <LearningWorkspace
        sessionId="learn-student-control-during-narration"
        voiceEnabled
        ollFixture="unit-circle-sine"
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(narrationTtsMock.useOllNarrationTts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          playing: true,
          narrationId: expect.any(String),
        }),
      );
    });
    const initialNarration = narrationTtsMock.useOllNarrationTts.mock.calls.at(-1)?.[0];

    const slider = await screen.findByRole("slider", { name: "旋转角 θ" });
    fireEvent.pointerDown(slider, { pointerType: "mouse" });
    fireEvent.change(slider, { target: { value: String(Math.PI / 2) } });
    fireEvent.pointerUp(slider, { pointerType: "mouse" });

    await waitFor(() => {
      expect(narrationTtsMock.useOllNarrationTts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          playing: true,
          narrationId: initialNarration?.narrationId,
        }),
      );
    });
    expect(conversationMock.options?.externalSpeechActive).toBe(true);
  });

  it("feeds the OLL fixture into the real /learn Runtime as incremental events", () => {
    vi.useFakeTimers();
    render(
      <LearningWorkspace
        sessionId="learn-stream-test"
        voiceEnabled={false}
        ollFixture="geometry-v2"
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "打开本课目录" }),
    ).toBeTruthy();
    act(() => vi.advanceTimersByTime(260));
    act(() => {
      screen.getByRole("button", { name: "打开本课目录" }).click();
    });
    expect(screen.getByRole("dialog", { name: "本课目录" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /查看步骤：/ }).length,
    ).toBeGreaterThan(0);
    const expandStep = screen.getAllByRole(
      "button",
      { name: /展开.+的讲解片段/ },
    )[0]!;
    act(() => expandStep.click());
    expect(
      screen.getAllByRole("button", { name: /查看讲解片段：/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /从步骤开始播放：/ }).length,
    ).toBeGreaterThan(0);
    act(() => {
      screen.getAllByRole("button", { name: /查看讲解片段：/ })[0]!.click();
    });
    expect(screen.queryByRole("dialog", { name: "本课目录" })).toBeNull();
  });

  it.each([
    ["text", false],
    ["voice", true],
  ] as const)(
    "enables the shared OLL narration path in %s input mode",
    (_mode, voiceEnabled) => {
      render(
        <LearningWorkspace
          sessionId={`learn-narration-${_mode}`}
          voiceEnabled={voiceEnabled}
          ollFixture="geometry-v2"
          onBack={vi.fn()}
        />,
      );

      expect(narrationTtsMock.useOllNarrationTts).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          onSpeakingChange: expect.any(Function),
        }),
      );
    },
  );

  it("animates the teacher while the next lesson Beat is preparing", () => {
    narrationTtsMock.useOllNarrationTts.mockReturnValue({
      error: null,
      preparing: true,
    });
    render(
      <LearningWorkspace
        sessionId="learn-narration-preparing"
        voiceEnabled
        ollFixture="geometry-v2"
        onBack={vi.fn()}
      />,
    );

    const teacher = screen.getByRole("button", {
      name: "Octos 正在准备下一步",
    });
    expect(teacher.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("稍等一下")).toBeTruthy();
  });

  it("restarts TTS on a saved lesson and opens a clean ink document", async () => {
    render(
      <LearningWorkspace
        sessionId="learn-narration-review"
        playbackMode="review"
        ollFixture="geometry-v2"
        onBack={vi.fn()}
      />,
    );

    expect(narrationTtsMock.useOllNarrationTts).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, playing: false }),
    );

    fireEvent.click(screen.getByRole("button", {
      name: "重新播放 OLL 课程",
    }));

    await waitFor(() => {
      expect(narrationTtsMock.useOllNarrationTts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          playing: true,
          narrationId: expect.any(String),
          text: expect.stringMatching(/\S/),
        }),
      );
    });
    expect(localStorage.getItem(
      "octos-learning-ink-run:v1:learn-narration-review",
    )).toBe("1");
    expect(localStorage.getItem(
      "octos-learning-ink-merge-source:v1:learn-narration-review",
    )).toBe("learn-narration-review");
    await waitFor(() => {
      expect(inkRuntimeMock.mountInkRuntime).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storageKey:
            "octos-learning-ink:v1:learn-narration-review:replay:1",
          documentId:
            "learning-session:learn-narration-review:replay:1:student-ink",
        }),
      );
    });
    expect(inkRuntimeMock.mountInkRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: "octos-learning-ink:v1:learn-narration-review",
        documentId: "learning-session:learn-narration-review:student-ink",
      }),
    );
  });

  it("restores earlier ink into the current document after replay completes", async () => {
    localStorage.setItem(
      "octos-learning-ink-run:v1:learn-finished-replay",
      "1",
    );
    localStorage.setItem(
      "octos-learning-ink-merge-source:v1:learn-finished-replay",
      "learn-finished-replay",
    );

    render(
      <LearningWorkspace
        sessionId="learn-finished-replay"
        playbackMode="review"
        ollFixture="geometry-v2"
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      const currentInk = inkRuntimeMock.mountInkRuntime.mock.results.at(-1)?.value;
      expect(currentInk?.mergeSavedDocument).toHaveBeenCalledWith(
        "octos-learning-ink:v1:learn-finished-replay",
        "learning-session:learn-finished-replay:student-ink",
      );
    });
    await waitFor(() => {
      expect(localStorage.getItem(
        "octos-learning-ink-merge-source:v1:learn-finished-replay",
      )).toBeNull();
    });
    expect(localStorage.getItem(
      "octos-learning-ink-cumulative-run:v1:learn-finished-replay",
    )).toBe("1");
    expect(inkRuntimeMock.mountInkRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey:
          "octos-learning-ink:v1:learn-finished-replay:replay:1",
      }),
    );
  });

  it("recovers ink hidden by the previous replay implementation once", async () => {
    localStorage.setItem(
      "octos-learning-ink-run:v1:learn-legacy-replay",
      "1",
    );

    const view = render(
      <LearningWorkspace
        sessionId="learn-legacy-replay"
        playbackMode="review"
        ollFixture="geometry-v2"
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      const currentInk = inkRuntimeMock.mountInkRuntime.mock.results.at(-1)?.value;
      expect(currentInk?.mergeSavedDocument).toHaveBeenCalledWith(
        "octos-learning-ink:v1:learn-legacy-replay",
        "learning-session:learn-legacy-replay:student-ink",
      );
    });
    await waitFor(() => {
      expect(localStorage.getItem(
        "octos-learning-ink-cumulative-run:v1:learn-legacy-replay",
      )).toBe("1");
    });

    view.unmount();
    inkRuntimeMock.mountInkRuntime.mockClear();
    render(
      <LearningWorkspace
        sessionId="learn-legacy-replay"
        playbackMode="review"
        ollFixture="geometry-v2"
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(inkRuntimeMock.mountInkRuntime).toHaveBeenCalled());
    const restoredInk = inkRuntimeMock.mountInkRuntime.mock.results.at(-1)?.value;
    expect(restoredInk?.mergeSavedDocument).not.toHaveBeenCalled();
  });

  it("loads a delivered OLL Authoring artifact into the /learn Runtime", async () => {
    const fallbackReply = "这是主模型额外生成的完整文本讲解，不应显示在教师气泡里。";
    conversationMock.turns = [{
      id: "client-turn",
      userText: "讲解",
      assistantText: fallbackReply,
      awaitingTranscript: false,
    }];
    conversationMock.threads = [{
      id: "client-turn",
      turnId: "server-turn",
      userMsg: {
        id: "user",
        role: "user",
        text: "讲解",
        files: [],
        toolCalls: [],
        status: "complete",
        timestamp: 1,
      },
      responses: [{
        id: "assistant",
        role: "assistant",
        text: "我们开始。",
        files: [{
          filename: "server-turn.octos-lesson.json",
          path: "study/oll/server-turn.octos-lesson.json",
        }],
        toolCalls: [],
        status: "complete",
        timestamp: 2,
      }],
      pendingAssistant: null,
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dsl: "octos.lesson",
        version: "0.1",
        profile: "authoring",
        lesson: {
          mode: "explain",
          language: "zh-CN",
          title: "模型生成的 OLL 课程",
          goals: ["解释概念"],
        },
        steps: [{
          key: "explain",
          purpose: "写出结论",
          beats: [{
            key: "write",
            say: "先写出核心结论。",
            actions: [{
              do: "write",
              as: "answer",
              kind: "note",
              role: "conclusion",
              content: { text: "核心结论" },
              place: { relation: "new_region", region_role: "lesson_origin" },
            }],
          }],
        }],
        close: { summary: "完成讲解", focus: ["answer"] },
      }),
    }));

    render(
      <LearningWorkspace
        sessionId="learn-model-test"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("模型生成的 OLL 课程")).toBeTruthy();
      expect(screen.getByTestId("oll-controls")).toBeTruthy();
    });
    act(() => {
      conversationMock.options?.onTurnComplete?.("client-turn");
    });
    expect(screen.queryByText(fallbackReply)).toBeNull();
    expect(narrationTtsMock.useOllNarrationTts).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: fallbackReply }),
    );
    expect(
      screen.queryByText("课程已经写到白板上，我们开始吧。"),
    ).toBeNull();
  });

  it("does not turn a local selection enhancement into TTS narration", async () => {
    vi.useFakeTimers();
    const fallbackReply = "这是选区旁边的局部解释，不是一节需要朗读的课程。";
    conversationMock.turns = [{
      id: "selection-turn",
      userText: "解释这里",
      assistantText: fallbackReply,
      awaitingTranscript: false,
    }];
    conversationMock.threads = [{
      id: "selection-turn",
      turnId: "selection-turn",
      userMsg: {
        id: "selection-user",
        role: "user",
        text: "解释这里",
        files: [],
        toolCalls: [],
        status: "complete",
        timestamp: 1,
      },
      responses: [{
        id: "selection-assistant",
        role: "assistant",
        text: fallbackReply,
        files: [{
          filename: "selection-turn.octos-selection-enhancement.json",
          path: "study/oll/selection-turn.octos-selection-enhancement.json",
        }],
        toolCalls: [],
        status: "complete",
        timestamp: 2,
      }],
      pendingAssistant: null,
    }];
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    const view = render(
      <LearningWorkspace
        sessionId="learn-selection-no-tts"
        voiceEnabled
        onBack={vi.fn()}
      />,
    );

    act(() => {
      conversationMock.options?.onTurnComplete?.("selection-turn");
      view.rerender(
        <LearningWorkspace
          sessionId="learn-selection-no-tts"
          voiceEnabled
          onBack={vi.fn()}
        />,
      );
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.queryByText(/本轮没有更新白板/)).toBeNull();
    expect(narrationTtsMock.useOllNarrationTts).not.toHaveBeenCalledWith(
      expect.objectContaining({
        text: fallbackReply,
        narrationId: "plain-reply:selection-turn",
      }),
    );
  });

  it("restores an OLL lesson from durable session files after refresh", async () => {
    sessionFilesMock.getSessionFiles.mockResolvedValue([
      {
        filename: "restored-turn.octos-lesson.json",
        path: "skill-output/study/oll/restored-turn.octos-lesson.json",
        size_bytes: 100,
        modified_at: "2026-07-28T15:45:27.000Z",
      },
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
        dsl: "octos.lesson",
        version: "0.1",
        profile: "authoring",
        lesson: {
          mode: "explain",
          language: "zh-CN",
          title: "刷新后恢复的课程",
          goals: ["恢复白板"],
        },
        steps: [{
          key: "restore",
          purpose: "恢复课程",
          beats: [{
            key: "restore-board",
            say: "恢复白板。",
            actions: [{
              do: "write",
              as: "restored-card",
              kind: "note",
              role: "conclusion",
              content: { text: "已恢复" },
              place: { relation: "new_region" },
            }],
          }],
        }],
        close: { summary: "恢复完成", focus: ["restored-card"] },
        }),
      }));

    render(
      <LearningWorkspace
        sessionId="learn-restored"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("刷新后恢复的课程")).toBeTruthy();
    });
    expect(sessionFilesMock.getSessionFiles).toHaveBeenCalledWith(
      "learn-restored",
    );
  });

  it("refetches durable OLL artifacts when the bridge reconnects", async () => {
    sessionFilesMock.getSessionFiles
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          filename: "reconnected-turn.octos-lesson.json",
          path: "study/oll/reconnected-turn.octos-lesson.json",
          size_bytes: 100,
          modified_at: "2026-07-28T15:45:27.000Z",
        },
      ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dsl: "octos.lesson",
        version: "0.1",
        profile: "authoring",
        lesson: {
          mode: "explain",
          language: "zh-CN",
          title: "重连后恢复的课程",
          goals: ["恢复漏掉的白板文件事件"],
        },
        steps: [{
          key: "restore",
          purpose: "恢复课程",
          beats: [{
            key: "restore-board",
            say: "重新读取白板课程。",
            actions: [{
              do: "write",
              as: "reconnected-card",
              kind: "note",
              role: "conclusion",
              content: { text: "重连恢复成功" },
              place: { relation: "new_region" },
            }],
          }],
        }],
        close: { summary: "恢复完成", focus: ["reconnected-card"] },
      }),
    }));

    render(
      <LearningWorkspace
        sessionId="learn-reconnected"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(sessionFilesMock.getSessionFiles).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByTestId("oll-controls")).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("crew:bridge_connected"));
    });

    await waitFor(() => {
      expect(sessionFilesMock.getSessionFiles).toHaveBeenCalledTimes(2);
      expect(screen.getByText("重连后恢复的课程")).toBeTruthy();
    });
  });

  it("loads the first playable lesson section while the generation tool is still running", async () => {
    const part0File = {
      filename: "progressive-turn.part-000.octos-lesson.json",
      path: "study/oll/progressive-turn.part-000.octos-lesson.json",
      size_bytes: 100,
      modified_at: "2026-08-14T16:00:00.000Z",
    };
    const part1File = {
      filename: "progressive-turn.part-001.octos-lesson.json",
      path: "study/oll/progressive-turn.part-001.octos-lesson.json",
      size_bytes: 200,
      modified_at: "2026-08-14T16:00:01.000Z",
    };
    sessionFilesMock.getSessionFiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([part0File])
      .mockResolvedValue([part0File, part1File]);
    const partialLesson = {
      dsl: "octos.lesson",
      version: "0.1",
      profile: "authoring",
      lesson: {
        mode: "explain",
        language: "zh-CN",
        title: "先到达的第一节",
        goals: ["先播放已经完成的部分"],
      },
      steps: [{
        key: "observe",
        purpose: "先观察",
        beats: [{
          key: "first-board",
          say: "我们先看第一部分。",
          actions: [{
            do: "write",
            as: "first-card",
            kind: "note",
            role: "concept",
            content: { text: "第一部分已经准备好" },
            place: { relation: "new_region" },
          }],
        }],
      }],
      close: { summary: "第一部分完成", focus: ["first-card"] },
    };
    const secondStep = {
      key: "explain",
      purpose: "继续解释",
      beats: [{
        key: "second-board",
        say: "现在继续第二部分。",
        actions: [{
          do: "write",
          as: "second-card",
          kind: "note",
          role: "concept",
          content: { title: "第二部分", items: ["第二部分也已经准备好"] },
          place: { relation: "below", anchor: "first-card" },
        }],
      }],
    };
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes("part-001")
        ? { ...partialLesson, steps: [...partialLesson.steps, secondStep] }
        : partialLesson,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LearningWorkspace
        sessionId="learn-progressive"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(sessionFilesMock.getSessionFiles).toHaveBeenCalledTimes(1),
    );

    act(() => {
      window.dispatchEvent(new CustomEvent("crew:tool_progress", {
        detail: {
          sessionId: "learn-progressive",
          tool: "oll_generate_lesson",
          message: "[artifact:oll_lesson_part] part=0 (study/oll/progressive-turn.part-000.octos-lesson.json)",
          terminal: false,
        },
      }));
    });

    await waitFor(() => {
      expect(sessionFilesMock.getSessionFiles).toHaveBeenCalledTimes(2);
      expect(screen.getByText("先到达的第一节")).toBeTruthy();
      expect(screen.getByTestId("oll-controls")).toBeTruthy();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("crew:tool_progress", {
        detail: {
          sessionId: "learn-progressive",
          tool: "oll_generate_lesson",
          message: "[artifact:oll_lesson_part] part=1 (study/oll/progressive-turn.part-001.octos-lesson.json)",
          terminal: false,
        },
      }));
    });
    await waitFor(() => {
      expect(sessionFilesMock.getSessionFiles).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes("part-001.octos-lesson.json"))).toBe(true);
    });
  });

  it("does not infer an OLL path when the durable file list is empty", async () => {
    sessionFilesMock.getSessionFiles.mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LearningWorkspace
        sessionId="learn-no-artifact"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(sessionFilesMock.getSessionFiles).toHaveBeenCalledWith(
        "learn-no-artifact",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("oll-controls")).toBeNull();
    expect(screen.getByText("向 Octos 提问，我们从这里开始")).toBeTruthy();
  });

  it("surfaces a durable file-list failure without falling back to prose", async () => {
    conversationMock.turns = [{
      id: "turn-with-prose",
      userText: "讲解负数乘法",
      assistantText: "这段普通文本不能替代 OLL 课程。",
      awaitingTranscript: false,
    }];
    sessionFilesMock.getSessionFiles.mockRejectedValue(
      new Error("白板文件列表暂不可用"),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LearningWorkspace
        sessionId="learn-file-list-error"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "白板文件列表暂不可用",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("这段普通文本不能替代 OLL 课程。")).toBeNull();
    expect(screen.queryByTestId("oll-controls")).toBeNull();
  });

  it("keeps loading an OLL artifact while later assistant deltas rerender the thread", async () => {
    const makeThread = (assistantText: string): Thread => ({
      id: "client-streaming-turn",
      turnId: "server-streaming-turn",
      userMsg: {
        id: "streaming-user",
        role: "user",
        text: "讲解负数乘法",
        files: [],
        toolCalls: [],
        status: "complete",
        timestamp: 1,
      },
      responses: [{
        id: "artifact-only-assistant",
        role: "assistant",
        text: "",
        files: [{
          filename: "server-streaming-turn.octos-lesson.json",
          path: "skill-output/study/oll/server-streaming-turn.octos-lesson.json",
        }],
        toolCalls: [],
        status: "complete",
        timestamp: 2,
      }, {
        id: "streaming-assistant",
        role: "assistant",
        text: assistantText,
        files: [],
        toolCalls: [],
        status: "complete",
        timestamp: 3,
      }],
      pendingAssistant: null,
    });
    conversationMock.threads = [makeThread("白板已经准备好")];

    let resolveFetch!: (value: {
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void;
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise((resolve, reject) => {
        resolveFetch = resolve;
        requestSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }));

    const view = render(
      <LearningWorkspace
        sessionId="learn-streaming-artifact-test"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(requestSignal).toBeTruthy());
    conversationMock.threads = [makeThread(
      "白板已经准备好，下面是模型仍在继续流式输出的长文本。",
    )];
    view.rerender(
      <LearningWorkspace
        sessionId="learn-streaming-artifact-test"
        voiceEnabled={false}
        onBack={vi.fn()}
      />,
    );

    expect(requestSignal?.aborted).toBe(false);
    resolveFetch({
      ok: true,
      json: async () => ({
        dsl: "octos.lesson",
        version: "0.1",
        profile: "authoring",
        lesson: {
          mode: "explain",
          language: "zh-CN",
          title: "流式回复中的 OLL 课程",
          goals: ["解释负数乘法"],
        },
        steps: [{
          key: "explain",
          purpose: "写出核心结论",
          beats: [{
            key: "write",
            say: "先看规律。",
            actions: [{
              do: "write",
              as: "answer",
              kind: "note",
              role: "conclusion",
              content: { text: "负负得正" },
              place: { relation: "new_region", region_role: "lesson_origin" },
            }],
          }],
        }],
        close: { summary: "完成讲解", focus: ["answer"] },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("流式回复中的 OLL 课程")).toBeTruthy();
      expect(screen.getByTestId("oll-controls")).toBeTruthy();
    });
  });
});
