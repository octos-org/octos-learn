import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Download, Pause, Play, ScanFace, Square } from "lucide-react";
import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { getSelectedProfileId } from "@/api/client";
import { AcademyHeader } from "../academy/academy-header";
import { TeachBoard, type TeachBoardHandle } from "../teach/teach-board";
import { AvatarStage, type AvatarRenderMetrics } from "./avatar-stage";
import { FaceCapture, selfTestFaceModel, type CaptureError, type CaptureState } from "./face-capture";
import { demoFaceFrame, FaceSmoother, neutralFrame, type FaceFrame } from "./face-frame";
import { MAX_TRACK_MS, parseAvatarTrack, percentile, PerformanceRecorder, sampleAvatarTrack, type AvatarTrack } from "./performance-track";
import "../teach/teach.css";
import "./avatar-lab.css";

const noAssets = () => undefined;
const errorMessage = (code: CaptureError) => ({
  camera_unavailable: tr("没有找到可用摄像头，请检查连接。"),
  permission_denied: tr("摄像头权限未开启，你仍可播放演示。"),
  model_failed: tr("表情模型未能启动，请刷新后重试。"),
  capture_failed: tr("摄像头画面处理失败，请停止后重试。"),
  worker_unavailable: tr("这个浏览器暂不支持独立线程捕捉，请换用较新的浏览器。"),
})[code];

export default function AvatarLabPage() {
  useLocale();
  const [mode, setMode] = useState<"idle" | "demo" | "camera" | "replay">("idle");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [error, setError] = useState<CaptureError | "graphics" | "track" | "ink" | null>(null);
  const [metrics, setMetrics] = useState<AvatarRenderMetrics | null>(null);
  const [captureMetrics, setCaptureMetrics] = useState({ processing: 0, pipeline: 0, samples: 0 });
  const [fpsLimit, setFpsLimit] = useState<30 | 60>(60);
  const [recording, setRecording] = useState(false);
  const [track, setTrack] = useState<AvatarTrack | null>(null);
  const [replayTime, setReplayTime] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [inkReady, setInkReady] = useState(false);
  const [modelCheck, setModelCheck] = useState<"idle" | "running" | "passed">("idle");
  const modelCheckAbort = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const capture = useRef<FaceCapture | null>(null);
  const board = useRef<TeachBoardHandle>(null);
  const inputFrame = useRef<FaceFrame>(neutralFrame());
  const smoother = useRef(new FaceSmoother());
  const recorder = useRef(new PerformanceRecorder());
  const controls = useRef({ mode, track, replayPlaying, replayTime });
  const playback = useRef({ anchor: 0, offset: 0 });
  const [inkId] = useState(() => `avatar-lab-${getSelectedProfileId() ?? "local"}`);
  const captureSamples = useRef<{ processing: number[]; pipeline: number[]; lastReport: number }>({ processing: [], pipeline: [], lastReport: 0 });

  useEffect(() => { controls.current = { mode, track, replayPlaying, replayTime }; }, [mode, track, replayPlaying, replayTime]);
  const finishRecording = useCallback(() => {
    if (!recorder.current.recording) return;
    const value = recorder.current.finish(performance.now());
    setRecording(false);
    if (value.frames.length) { setTrack(value); setReplayTime(0); setReplayPlaying(false); }
  }, []);
  const onGraphicsError = useCallback(() => setError("graphics"), []);

  useEffect(() => {
    if (!video.current) return;
    const owner = new FaceCapture(video.current, {
      onState: setCaptureState,
      onError: (code) => { setError(code); setMode("idle"); finishRecording(); },
      onFrame: (frame, processingMs, pipelineMs) => {
        inputFrame.current = frame;
        const sample = captureSamples.current;
        sample.processing.push(processingMs); sample.pipeline.push(pipelineMs);
        if (sample.processing.length > 600) { sample.processing.shift(); sample.pipeline.shift(); }
        if (performance.now() - sample.lastReport > 500) {
          sample.lastReport = performance.now();
          setCaptureMetrics({ processing: percentile(sample.processing, .95), pipeline: percentile(sample.pipeline, .95), samples: sample.processing.length });
        }
      },
    });
    capture.current = owner;
    const stopForVisibility = () => {
      if (document.hidden) {
        owner.stop(); modelCheckAbort.current?.abort(); setModelCheck("idle");
        setMode("idle"); setReplayPlaying(false); finishRecording();
      }
    };
    document.addEventListener("visibilitychange", stopForVisibility);
    return () => { owner.stop(); capture.current = null; modelCheckAbort.current?.abort(); document.removeEventListener("visibilitychange", stopForVisibility); };
  }, [finishRecording]);

  const getFrame = useCallback((now: number) => {
    const state = controls.current;
    let frame: FaceFrame;
    if (state.mode === "replay" && state.track) {
      const time = state.replayPlaying ? Math.min(state.track.durationMs, playback.current.offset + now - playback.current.anchor) : state.replayTime;
      frame = sampleAvatarTrack(state.track, time);
      // Replay already contains the displayed, smoothed motion. Do not filter it twice.
      return frame;
    }
    if (state.mode === "demo") frame = demoFaceFrame(now);
    else if (state.mode === "camera" && now - inputFrame.current.timeMs < 600) frame = inputFrame.current;
    else frame = neutralFrame(now);
    const displayed = smoother.current.update(frame, now);
    if (recorder.current.recording && !recorder.current.append(displayed, now)) finishRecording();
    return displayed;
  }, [finishRecording]);

  useEffect(() => {
    if (!replayPlaying || !track) return;
    const timer = setInterval(() => {
      const time = Math.min(track.durationMs, playback.current.offset + performance.now() - playback.current.anchor);
      setReplayTime(time); if (time >= track.durationMs) setReplayPlaying(false);
    }, 100);
    return () => clearInterval(timer);
  }, [replayPlaying, track]);

  const stop = () => {
    modelCheckAbort.current?.abort(); modelCheckAbort.current = null; setModelCheck("idle");
    capture.current?.stop(); finishRecording(); setReplayPlaying(false); setMode("idle");
    inputFrame.current = neutralFrame(); smoother.current.reset();
  };
  const demo = () => { stop(); setError(null); setMode("demo"); };
  const startCamera = () => {
    stop(); setError(null); setMode("camera");
    captureSamples.current = { processing: [], pipeline: [], lastReport: 0 };
    setCaptureMetrics({ processing: 0, pipeline: 0, samples: 0 });
    void capture.current?.start();
  };
  const replay = () => {
    capture.current?.stop(); finishRecording(); smoother.current.reset();
    const offset = replayTime >= (track?.durationMs ?? 0) ? 0 : replayTime;
    playback.current = { anchor: performance.now(), offset };
    setReplayTime(offset); setMode("replay"); setReplayPlaying(true);
  };
  const pauseReplay = () => {
    setReplayTime(Math.min(track?.durationMs ?? 0, playback.current.offset + performance.now() - playback.current.anchor));
    setReplayPlaying(false);
  };
  const download = (value: unknown, filename: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const status = mode === "demo" ? tr("演示动作，未使用摄像头") : mode === "replay" ? tr("回放表情片段") : mode !== "camera" ? tr("准备好了")
    : captureState === "starting" ? tr("正在连接摄像头…") : captureState === "loading" ? tr("正在本机加载表情模型…")
      : captureState === "tracking" ? tr("正在跟随你的表情") : tr("请面对摄像头，让整张脸进入画面");
  const canRecord = mode === "demo" || (mode === "camera" && (captureState === "tracking" || captureState === "lost"));
  const hasCaptureMetrics = mode === "camera" && captureMetrics.samples > 0;

  return (
    <main className="course-launcher academy-page teach-page avatar-lab">
      <div className="course-launcher-inner">
        <AcademyHeader />
        <div className="avatar-lab-heading"><div><Link to="/teach">{tr("← 回到录课")}</Link><h1>{tr("动态头像试验室")}</h1></div><span>{tr("技术预览")}</span></div>
        <p className="avatar-lab-intro">{tr("先试试表情跟随，再在白板上写几笔。当前角色是工程测试模型，星狐正式模型仍需制作。")}</p>
        <div className="avatar-lab-grid">
          <section className="avatar-lab-stage" aria-label={tr("动态头像")}>
            <AvatarStage frame={getFrame} fpsLimit={fpsLimit} active={mode !== "idle"} onMetrics={setMetrics} onError={onGraphicsError} />
            <span className="avatar-lab-stage-label">{tr("工程测试角色")}</span>
            {recording && <span className="avatar-lab-recording">{tr("正在录表情片段（最长 60 秒）")}</span>}
            <div className="avatar-lab-status" role="status">{status}</div>
          </section>
          <section className="avatar-lab-controls" aria-label={tr("头像控制")}>
            <div className="avatar-lab-actions">
              <button type="button" className="teach-primary" disabled={mode === "camera" || modelCheck === "running"} onClick={startCamera}><Camera size={17} />{tr("开启摄像头跟随")}</button>
              <button type="button" className="teach-secondary" onClick={demo}><Play size={17} />{tr("播放演示动作")}</button>
              <button type="button" className="teach-secondary" disabled={mode === "idle"} onClick={stop}><Square size={17} />{tr("停止")}</button>
              <button type="button" className="teach-secondary" disabled={captureState !== "tracking" || mode !== "camera"} onClick={() => smoother.current.calibrate(inputFrame.current)}><ScanFace size={17} />{tr("以自然表情校准")}</button>
              <button type="button" className="teach-secondary" disabled={modelCheck === "running" || mode === "camera"} onClick={() => {
                const controller = new AbortController(); modelCheckAbort.current = controller; setModelCheck("running"); setError(null);
                void selfTestFaceModel(controller.signal).then(() => { if (!controller.signal.aborted) setModelCheck("passed"); })
                  .catch(() => { if (!controller.signal.aborted) { setModelCheck("idle"); setError("model_failed"); } });
              }}>{modelCheck === "running" ? tr("正在自检表情模型…") : tr("自检表情模型")}</button>
            </div>
            {modelCheck === "passed" && <p role="status">{tr("表情模型自检通过，未使用摄像头。")}</p>}
            <p>{tr("只在这台设备上识别，摄像头画面不会上传。此处不采集声音。")}</p>
            <video className="avatar-lab-camera" ref={video} muted playsInline aria-label={tr("本机摄像头预览")} hidden={mode !== "camera"} />
            <label className="avatar-lab-select">{tr("显示速度")}<select value={fpsLimit} onChange={(event) => setFpsLimit(event.target.value === "30" ? 30 : 60)}><option value="60">{tr("流畅（目标 60 帧）")}</option><option value="30">{tr("节能（目标 30 帧）")}</option></select></label>
            <div className="avatar-lab-concept"><img src={`${import.meta.env.BASE_URL}teach-avatars/star-fox/concept-idle.png`} alt={tr("已选定的星狐美术参考")} /><span>{tr("正式星狐模型的美术参考")}</span></div>
          </section>
        </div>
        {error && <p className="avatar-lab-error" role="alert">{error === "graphics" ? tr("这台设备暂时无法显示三维头像，请换用支持 WebGL 2 的浏览器。")
          : error === "track" ? tr("这个表情文件无法读取，请使用有效的头像片段。") : error === "ink" ? tr("白板未能开启，请刷新后重试。") : errorMessage(error)}</p>}
        <section className="avatar-lab-track" aria-label={tr("表情片段")}>
          <div className="avatar-lab-actions">
            <button type="button" className="teach-secondary" disabled={!canRecord} onClick={() => {
              if (recording) finishRecording(); else { recorder.current.begin(performance.now()); setRecording(true); }
            }}>{recording ? tr("结束表情片段") : tr("录一段表情")}</button>
            <button type="button" className="teach-secondary" disabled={!track || recording} onClick={() => replayPlaying ? pauseReplay() : replay()}>{replayPlaying ? <Pause size={17} /> : <Play size={17} />}{replayPlaying ? tr("暂停片段") : tr("回放片段")}</button>
            <button type="button" className="teach-secondary" disabled={!track || recording} onClick={() => track && download(track, "avatar-performance.json")}><Download size={17} />{tr("导出表情片段")}</button>
            <label className="avatar-lab-import">{tr("导入表情片段")}<input type="file" accept=".json,application/json" onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
              if (file.size > 5_000_000) { setError("track"); return; }
              void file.text().then((text) => { const imported = parseAvatarTrack(JSON.parse(text)); stop(); setTrack(imported); setReplayTime(0); setMode("replay"); setError(null); }).catch(() => setError("track"));
            }} /></label>
          </div>
          {track && <label className="avatar-lab-scrub">{tr("片段进度")} <span>{(replayTime / 1000).toFixed(1)} / {(track.durationMs / 1000).toFixed(1)} s</span><input type="range" aria-label={tr("片段进度")} min="0" max={Math.max(1, track.durationMs)} step="10" value={replayTime} disabled={recording} onChange={(event) => { capture.current?.stop(); setReplayPlaying(false); setMode("replay"); setReplayTime(Number(event.target.value)); }} /></label>}
          <p>{tr("片段只保存角色动作参数，不包含照片或声音；导出后可在另一台支持的设备上回放。")}</p>
        </section>
        <section className="avatar-lab-metrics" aria-label={tr("性能观察")}>
          <dl><div><dt>{tr("实际显示帧率")}</dt><dd>{metrics && mode !== "idle" ? metrics.fps.toFixed(0) : "—"} {tr("FPS")}</dd></div><div><dt>{tr("识别耗时 p95")}</dt><dd>{hasCaptureMetrics ? captureMetrics.processing.toFixed(1) : "—"} ms</dd></div><div><dt>{tr("取帧到结果 p95")}</dt><dd>{hasCaptureMetrics ? captureMetrics.pipeline.toFixed(1) : "—"} ms</dd></div><div><dt>{tr("绘制提交耗时 p95")}</dt><dd>{metrics && mode !== "idle" ? metrics.submissionP95Ms.toFixed(1) : "—"} ms</dd></div></dl>
          <p>{tr("取帧到结果不包含摄像头传感延迟，绘制提交耗时不等于 GPU 总耗时；这些数字不能当作完整动作响应延迟。")}</p>
          <button type="button" className="teach-secondary" onClick={() => download({ schema: "octos.avatar-lab-report.v1", at: new Date().toISOString(), renderer: mode === "idle" ? null : metrics, capture: hasCaptureMetrics ? captureMetrics : null, targetFps: fpsLimit, mode, sources: mode === "replay" ? [...new Set(track?.frames.map((frame) => frame.source))] : mode === "camera" ? ["mediapipe"] : mode === "demo" ? ["demo"] : [], trackDurationMs: track?.durationMs ?? 0, maximumTrackMs: MAX_TRACK_MS }, "avatar-lab-report.json")}><Download size={17} />{tr("导出观察报告")}</button>
        </section>
        <section className="avatar-lab-whiteboard" aria-label={tr("同时试写白板")}>
          <div className="avatar-lab-board-heading"><div><h2>{tr("同时试写白板")}</h2><p>{tr("保持头像运行，在这里连续写几笔，感受书写是否跟手。")}</p></div><button type="button" className="teach-secondary" disabled={inkReady} onClick={() => {
            void board.current?.startInk(inkId).then(() => { board.current?.setPen("draw"); setInkReady(true); }).catch(() => setError("ink"));
          }}>{inkReady ? tr("可以开始书写") : tr("开启试写")}</button></div>
          <TeachBoard ref={board} compiled={null} resolveAsset={noAssets} />
        </section>
      </div>
    </main>
  );
}
