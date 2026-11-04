import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { mountInfiniteBoard, type MountedInfiniteBoard } from "octos-lesson-language/web-runtime";
import { mountInkRuntime, type InkRuntime, type InkRuntimeState } from "../oll/oll-ink-runtime";
import { indexedInkStore } from "../learning-document-store";
import { HandwritingCapture, type HandwritingCaptureError, type HandwritingCaptureFrame, type HandwritingCaptureState } from "./handwriting-capture";
import { HandwritingPointerController, type HandwritingControllerUpdate, type HandwritingPointerAction } from "./handwriting-controller";
import { HANDWRITING_DEFAULT_MODE, type HandwritingGestureMode, type HandwritingInputFrame } from "./handwriting-gesture";
import { drawHandwritingOverlay } from "./handwriting-overlay";
import { formatLatency, summarizeLatency, type HandwritingLatencySummary } from "./handwriting-metrics";
import { simulatedHandwritingFrames } from "./simulated-trajectory";
import "octos-lesson-language/web-runtime/styles.css";
import "./handwriting-lab.css";

const LAB_POINTER_ID = 74_101;
const SIMULATION_FRAME_MS = 33;

function captureErrorText(error: HandwritingCaptureError): string {
  if (error === "permission_denied") return tr("未获得摄像头权限");
  if (error === "model_failed") return tr("手部识别模型加载失败");
  if (error === "capture_failed") return tr("手部捕捉失败");
  if (error === "worker_unavailable") return tr("此浏览器不支持摄像头识别");
  return tr("摄像头不可用");
}

function dispatchInkPointerAction(
  viewport: HTMLElement,
  action: HandwritingPointerAction,
): void {
  const rect = viewport.getBoundingClientRect();
  const type = action.type === "down"
    ? "pointerdown"
    : action.type === "move"
      ? "pointermove"
      : "pointerup";
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: LAB_POINTER_ID,
    pointerType: "pen",
    isPrimary: true,
    button: action.type === "move" ? -1 : 0,
    buttons: action.type === "up" ? 0 : 1,
    clientX: rect.left + action.point.x,
    clientY: rect.top + action.point.y,
    pressure: action.type === "up" ? 0 : 0.5,
  };
  viewport.dispatchEvent(new PointerEvent(type, init));
}

export function HandwritingLabPage() {
  useLocale();
  const viewportRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const lastFrameRef = useRef<HandwritingInputFrame | null>(null);
  const penDownRef = useRef(false);
  const gestureModeRef = useRef<HandwritingGestureMode>(HANDWRITING_DEFAULT_MODE);
  const gestureUpdatedAtRef = useRef(0);
  const gesturePhaseRef = useRef<HandwritingControllerUpdate["phase"] | null>(null);
  const boardRef = useRef<MountedInfiniteBoard | null>(null);
  const inkRef = useRef<InkRuntime | null>(null);
  const captureRef = useRef<HandwritingCapture | null>(null);
  const controllerRef = useRef(new HandwritingPointerController());
  const simulationCancelRef = useRef(false);
  const processingSamplesRef = useRef<number[]>([]);
  const pipelineSamplesRef = useRef<number[]>([]);
  const metricsUpdatedAtRef = useRef(0);
  const [inkReady, setInkReady] = useState(false);
  const [inkState, setInkState] = useState<InkRuntimeState | null>(null);
  const [captureState, setCaptureState] = useState<HandwritingCaptureState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [gestureMode, setGestureMode] = useState<HandwritingGestureMode>(HANDWRITING_DEFAULT_MODE);
  const [gesture, setGesture] = useState<HandwritingControllerUpdate | null>(null);
  const [latency, setLatency] = useState<{
    processing: HandwritingLatencySummary;
    pipeline: HandwritingLatencySummary;
  }>(() => ({ processing: summarizeLatency([]), pipeline: summarizeLatency([]) }));

  const setInkMode = useCallback((mode: "navigate" | "draw") => {
    inkRef.current?.setMode(mode);
  }, []);

  const updateCursor = useCallback((point: { x: number; y: number } | null, penDown: boolean) => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    cursor.hidden = !point;
    cursor.dataset.down = penDown ? "true" : "false";
    if (point) cursor.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
  }, []);

  const dispatchActions = useCallback((actions: HandwritingPointerAction[]) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    for (const action of actions) dispatchInkPointerAction(viewport, action);
  }, []);

  const recordLatency = useCallback((frame: HandwritingCaptureFrame) => {
    processingSamplesRef.current.push(frame.processingMs);
    pipelineSamplesRef.current.push(frame.pipelineMs);
    if (processingSamplesRef.current.length > 90) processingSamplesRef.current.shift();
    if (pipelineSamplesRef.current.length > 90) pipelineSamplesRef.current.shift();
    if (performance.now() - metricsUpdatedAtRef.current < 250) return;
    metricsUpdatedAtRef.current = performance.now();
    setLatency({
      processing: summarizeLatency(processingSamplesRef.current),
      pipeline: summarizeLatency(pipelineSamplesRef.current),
    });
  }, []);

  const processFrame = useCallback((frame: Parameters<HandwritingPointerController["update"]>[0]) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = controllerRef.current.update(frame, {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    });
    updateCursor(update.cursor, update.penDown);
    dispatchActions(update.actions);
    lastFrameRef.current = frame;
    penDownRef.current = update.penDown;
    if (overlayRef.current) drawHandwritingOverlay(overlayRef.current, frame, update.penDown, gestureModeRef.current);
    if (update.phase !== gesturePhaseRef.current || performance.now() - gestureUpdatedAtRef.current >= 100) {
      gesturePhaseRef.current = update.phase;
      gestureUpdatedAtRef.current = performance.now();
      setGesture(update);
    }
  }, [dispatchActions, updateCursor]);

  const finishActiveStroke = useCallback((reason: "lost" | "stop") => {
    dispatchActions(controllerRef.current.reset(performance.now(), reason));
    updateCursor(null, false);
    lastFrameRef.current = null;
    penDownRef.current = false;
    gesturePhaseRef.current = null;
    setGesture(null);
    if (overlayRef.current) drawHandwritingOverlay(overlayRef.current, null);
  }, [dispatchActions, updateCursor]);

  const stopCamera = useCallback(() => {
    finishActiveStroke("stop");
    captureRef.current?.stop();
    captureRef.current = null;
    setCaptureState("idle");
    setInkMode("navigate");
  }, [finishActiveStroke, setInkMode]);

  const startCamera = useCallback(async () => {
    if (simulating || clearing || captureRef.current || !videoRef.current) return;
    setError("");
    setNotice("");
    finishActiveStroke("stop");
    controllerRef.current = new HandwritingPointerController({ mode: gestureMode });
    processingSamplesRef.current = [];
    pipelineSamplesRef.current = [];
    setLatency({ processing: summarizeLatency([]), pipeline: summarizeLatency([]) });
    setInkMode("draw");
    const capture = new HandwritingCapture(videoRef.current, {
      onState: setCaptureState,
      onError: (captureError) => {
        finishActiveStroke("lost");
        setError(captureErrorText(captureError));
        captureRef.current = null;
        setCaptureState("idle");
        setInkMode("navigate");
      },
      onFrame: (frame) => {
        recordLatency(frame);
        processFrame(frame);
      },
    });
    captureRef.current = capture;
    await capture.start();
  }, [clearing, finishActiveStroke, gestureMode, processFrame, recordLatency, setInkMode, simulating]);

  const runSimulation = useCallback(async () => {
    if (simulating || clearing || captureRef.current) return;
    setError("");
    setNotice(tr("模拟轨迹正在播放…"));
    setSimulating(true);
    simulationCancelRef.current = false;
    finishActiveStroke("stop");
    controllerRef.current = new HandwritingPointerController({ mode: gestureMode });
    setInkMode("draw");
    try {
      for (const frame of simulatedHandwritingFrames(gestureMode)) {
        if (simulationCancelRef.current) break;
        processFrame(frame);
        await new Promise((resolve) => setTimeout(resolve, SIMULATION_FRAME_MS));
      }
      finishActiveStroke("stop");
      if (!simulationCancelRef.current) setNotice(tr("模拟轨迹已完成"));
    } finally {
      setInkMode("navigate");
      setSimulating(false);
    }
  }, [clearing, finishActiveStroke, gestureMode, processFrame, setInkMode, simulating]);

  const clearInk = useCallback(async () => {
    const ink = inkRef.current;
    if (!ink || clearing || simulating || captureRef.current) return;
    setClearing(true);
    setError("");
    setNotice("");
    finishActiveStroke("stop");
    try {
      ink.selectAll();
      await ink.deleteSelection();
      await ink.saveNow();
      setNotice(tr("笔迹已清空，可点击撤销笔迹恢复。"));
    } catch {
      setError(tr("清空笔迹失败，请重试。"));
    } finally {
      ink.setMode("navigate");
      setClearing(false);
    }
  }, [clearing, finishActiveStroke, simulating]);

  const runInkHistory = useCallback((action: "undo" | "redo") => {
    const ink = inkRef.current;
    if (!ink) return;
    void Promise.resolve(action === "undo" ? ink.undo() : ink.redo()).catch(() => {
      setError(tr("笔迹历史操作失败"));
    });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const board = mountInfiniteBoard(viewport, () => undefined);
    boardRef.current = board;
    const ink = mountInkRuntime({
      board: board.view,
      viewport,
      storageKey: "octos-learning-ink:v1:handwriting-lab",
      store: indexedInkStore,
      documentId: "handwriting-lab:student-ink",
      locale: getLocale(),
    });
    inkRef.current = ink;
    ink.setMode("navigate");
    const unsubscribe = ink.subscribe(setInkState);
    void ink.ready.then(() => setInkReady(true)).catch(() => {
      setError(tr("笔迹功能加载失败"));
    });
    return () => {
      simulationCancelRef.current = true;
      captureRef.current?.stop();
      captureRef.current = null;
      unsubscribe();
      void ink.destroy();
      inkRef.current = null;
      board.destroy();
      boardRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    simulationCancelRef.current = true;
  }, []);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      drawHandwritingOverlay(canvas, lastFrameRef.current, penDownRef.current, gestureModeRef.current);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const cameraActive = captureState !== "idle";
  const captureStatus = captureState === "starting"
    ? tr("正在启动…")
    : captureState === "loading"
      ? tr("正在加载手部识别模型…")
      : captureState === "tracking"
        ? tr("正在跟踪手部")
        : captureState === "lost"
          ? tr("等待手部")
          : tr("摄像头已停止");
  const gestureStatus = !gesture ? tr("等待识别")
    : gesture.phase === "drawing" ? tr("落笔 · 正在绘制")
    : gesture.phase === "pending" ? gestureMode === "grip" ? tr("合手确认中 · 起笔位置已锁定") : tr("手势确认中 · 保持片刻")
    : gesture.phase === "holding" ? gestureMode === "grip" ? tr("张掌确认中 · 暂停画线") : tr("松手过渡 · 暂停画线")
    : gesture.phase === "ready" ? tr("抬笔 · 可以移动")
    : gesture.phase === "outside" ? gestureMode === "grip" ? tr("请将掌部移回虚线框内") : tr("请将食指移回虚线框内")
    : gesture.phase === "lost" ? tr("未可靠识别手部 · 已抬笔")
    : gestureMode === "grip" ? tr("先张掌，保持片刻再合手")
    : gestureMode === "fist" ? tr("先握拳，保持片刻再伸指")
    : gestureMode === "point" ? tr("先伸出食指和中指，保持片刻") : tr("先分开拇指与食指，保持片刻");

  return (
    <main className="handwriting-lab-page">
      <header className="handwriting-lab-header">
        <div>
          <strong>{tr("隔空书写小样")}</strong>
          <span>{gestureMode === "grip" ? tr("张掌找位置，松松合拢后移动整只手书写，再张掌停止。")
            : gestureMode === "fist" ? tr("先握拳准备，伸食指书写（可同时伸中指），收回食指即抬笔。")
            : gestureMode === "point" ? tr("先双指移动，再收起中指书写；重新伸出中指即抬笔。") : tr("先松开，再捏合落笔；松开立即抬笔。")}</span>
        </div>
        <Link to="/board">{tr("返回白板")}</Link>
      </header>
      <div className="handwriting-lab-body">
        <aside className="handwriting-lab-panel" aria-label={tr("隔空书写控制")}>
          <div className="handwriting-camera-preview">
            <video ref={videoRef} autoPlay muted playsInline aria-label={tr("本机摄像头预览")} />
            <canvas ref={overlayRef} className="handwriting-hand-overlay" aria-label={tr("实时手部关键点与骨架")} />
            {cameraActive || simulating ? <div className="handwriting-live-badge" data-down={gesture?.penDown ? "true" : "false"}>{gestureStatus}</div> : null}
            {!cameraActive && !simulating ? <span>{tr("摄像头已停止")}</span> : null}
            {simulating ? <span className="handwriting-preview-label">{tr("模拟骨架 · 非摄像头识别结果")}</span> : null}
          </div>
          <p className="handwriting-lab-note">{gestureMode === "grip" ? tr("掌部圆点是定位参考：绿色抬笔，橙色落笔。白板光标显示实际落笔位置。")
            : tr("白线为手部骨架，红点为关节；食指尖绿色表示抬笔，橙色表示落笔。")}</p>
          <label className="handwriting-mode-picker">
            <span>{tr("书写手势")}</span>
            <select value={gestureMode} disabled={cameraActive || simulating || clearing} onChange={(event) => {
              finishActiveStroke("stop");
              gestureModeRef.current = event.target.value as HandwritingGestureMode;
              setGestureMode(event.target.value as HandwritingGestureMode);
            }}>
              <option value="grip">{tr("松握拳书写 / 张掌移动（新版试用）")}</option>
              <option value="fist">{tr("伸指书写 / 收拳抬笔（旧版对比）")}</option>
              <option value="point">{tr("单指书写 / 双指移动（对比试用）")}</option>
              <option value="pinch">{tr("拇指与食指捏合（对比试用）")}</option>
            </select>
          </label>
          <div className="handwriting-gesture-guide">
            {gestureMode === "grip" ? <>
              <p>{tr("① 张开手掌并保持片刻，移动白板光标到起笔位置。")}</p>
              <p>{tr("② 四指自然弯回，拇指轻搭外侧；等落笔提示后，移动整只手画线。不用攥紧或捏指尖。")}</p>
              <p>{tr("③ 张开手掌，停止画线，再移动到下一处。")}</p>
              <p>{tr("开合手时锁定光标，避免落点跳动。笔迹比光标略滞后，用于过滤切换动作。")}</p>
            </> : gestureMode === "fist" ? <>
              <p>{tr("① 先握拳并保持片刻：抬笔移动，准备下一笔。拇指随意。")}</p>
              <p>{tr("② 伸出食指，保持片刻后书写；也可同时伸中指。无名指、小指收起。")}</p>
              <p>{tr("③ 食指开始收回就抬笔，不等完全握拳；再次握拳后可开始下一笔。")}</p>
              <p>{tr("始终由食指尖定位，伸中指时也不切换追踪点。张掌、遮挡或识别不清时抬笔。")}</p>
            </> : gestureMode === "point" ? <>
              <p>{tr("① 食指＋中指伸直：抬笔移动，先保持片刻。")}</p>
              <p>{tr("② 只伸食指，其余三指收起：保持片刻后落笔。拇指随意。")}</p>
              <p>{tr("③ 再伸中指：立即抬笔。丢失手部后需先双指移动。")}</p>
            </> : <>
              <p>{tr("先分开拇指与食指，再捏合并保持片刻落笔；松开立即抬笔。")}</p>
              <p>{tr("捏合距离使用三维关键点；模糊过渡时暂停画线，避免松手拖尾。")}</p>
            </>}
          </div>
          <div className="handwriting-lab-actions">
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={!inkReady || simulating || cameraActive || clearing}
            >
              {tr("启动摄像头书写")}
            </button>
            <button
              type="button"
              onClick={stopCamera}
              disabled={!cameraActive}
            >
              {tr("停止摄像头")}
            </button>
            <button
              type="button"
              onClick={() => void runSimulation()}
              disabled={!inkReady || simulating || cameraActive || clearing}
            >
              {simulating ? tr("模拟轨迹正在播放…") : tr("播放模拟轨迹")}
            </button>
          </div>
          <div className="handwriting-lab-actions is-secondary">
            <button type="button" onClick={() => runInkHistory("undo")} disabled={!inkReady || clearing}>{tr("撤销笔迹")}</button>
            <button type="button" onClick={() => runInkHistory("redo")} disabled={!inkReady || clearing}>{tr("重做笔迹")}</button>
            <button className="handwriting-clear-button" type="button" onClick={() => void clearInk()}
              disabled={!inkReady || clearing || cameraActive || simulating || !inkState?.component_count}>
              {clearing ? tr("正在清空…") : tr("清空笔迹")}
            </button>
          </div>
          <dl className="handwriting-lab-status">
            <div><dt>{tr("状态")}</dt><dd>{simulating ? tr("模拟轨迹正在播放…") : captureStatus}</dd></div>
            <div className="handwriting-gesture-status" data-down={gesture?.penDown ? "true" : "false"}><dt>{tr("手势")}</dt><dd aria-live="polite">{gestureStatus}</dd></div>
            {gestureMode === "pinch" ? <div><dt>{tr("捏合距离")}</dt><dd>{gesture && Number.isFinite(gesture.pinchScore) ? gesture.pinchScore.toFixed(2) : "—"}</dd></div> : null}
            <div><dt>{tr("笔迹")}</dt><dd>{inkState?.component_count ?? 0} {tr("项笔迹")} · {inkState?.saved === false ? tr("保存中") : tr("已保存")}</dd></div>
            <div><dt>{tr("模型处理")}</dt><dd>{formatLatency(latency.processing)}</dd></div>
            <div><dt>{tr("端到端")}</dt><dd>{formatLatency(latency.pipeline)}</dd></div>
          </dl>
          <p className="handwriting-lab-note">{tr("摄像头只在本机识别手势，视频不会上传。模拟轨迹期间不会打开摄像头。")}</p>
          <p className="handwriting-lab-note">{tr("笔迹自动沿用白板保存。")}</p>
          {notice ? <p className="handwriting-lab-notice" role="status">{notice}</p> : null}
          {error ? <p className="handwriting-lab-error" role="alert">{error}</p> : null}
        </aside>
        <section className="handwriting-board-frame" aria-label={tr("隔空书写白板")}>
          <div ref={viewportRef} className="handwriting-board" data-testid="handwriting-lab-board" />
          <div ref={cursorRef} className="handwriting-cursor" hidden>
            <i />
          </div>
        </section>
      </div>
    </main>
  );
}
