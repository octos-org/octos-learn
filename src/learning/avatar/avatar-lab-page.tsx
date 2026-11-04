import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Download, Pause, Play, ScanFace, Square } from "lucide-react";
import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { getSelectedProfileId } from "@/api/client";
import { AcademyHeader } from "../academy/academy-header";
import { TeachBoard, type TeachBoardHandle } from "../teach/teach-board";
import { IllustratedAvatarStage } from "./illustrated-avatar-stage";
import {PAINTED_CHARACTERS,paintedCharacter,type PaintedCharacterId} from './painted-characters';
import type { AvatarRenderMetrics } from "./avatar-render-metrics";
import { AvatarClipLibrary } from "./avatar-clip-library";
import { AvatarAudioPreview } from "./avatar-audio-preview";
import { EXPRESSION_SAMPLES, expressionSample } from "./expression-samples";
import { FaceCapture, selfTestFaceModel, type CaptureError, type CaptureState } from "./face-capture";
import { demoFaceFrame, FaceSmoother, neutralFrame, type FaceFrame } from "./face-frame";
import { AVATAR_TRACK_SCHEMA, MAX_TRACK_MS, parseAvatarTrack, percentile, PerformanceRecorder, sampleAvatarTrack, type AvatarTrack } from "./performance-track";
import "../teach/teach.css";
import "./avatar-lab.css";
import type { LocalRigPose } from './painted-local-rig';

const noAssets = () => undefined;
const INITIAL_MANUAL = { mouth: 0, round: 0,wide:0, smile: 0, frown: 0, leftEye: 0, rightEye: 0, squint: 0, gazeX: 0, gazeY: 0, brows: 0, browDown: 0, yaw: 0, pitch: 0, tilt: 0 };
const errorMessage = (code: CaptureError) => ({
  camera_unavailable: tr("没有找到可用摄像头，请检查连接。"),
  permission_denied: tr("摄像头权限未开启，你仍可播放演示。"),
  model_failed: tr("表情模型未能启动，请刷新后重试。"),
  capture_failed: tr("摄像头画面处理失败，请停止后重试。"),
  worker_unavailable: tr("这个浏览器暂不支持独立线程捕捉，请换用较新的浏览器。"),
})[code];

export default function AvatarLabPage() {
  useLocale();
  const [mode, setMode] = useState<"idle" | "demo" | "camera" | "replay" | "manual">("idle");
  const [manual, setManual] = useState(INITIAL_MANUAL);
  const [characterId,setCharacterId]=useState<PaintedCharacterId>('star-fox');
  const [naturalMotion,setNaturalMotion]=useState(true);
  const [localRig,setLocalRig]=useState(true);
  const [localPose,setLocalPose]=useState<LocalRigPose|undefined>();
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [error, setError] = useState<CaptureError | "graphics" | "track" | "ink" | null>(null);
  const [metrics, setMetrics] = useState<AvatarRenderMetrics | null>(null);
  const [captureMetrics, setCaptureMetrics] = useState({ processing: 0, pipeline: 0, samples: 0 });
  const [fpsLimit, setFpsLimit] = useState<30 | 60>(30);
  const [recording, setRecording] = useState(false);
  const [track, setTrack] = useState<AvatarTrack | null>(null);
  const [replayTime, setReplayTime] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [inkReady, setInkReady] = useState(false);
  const [modelCheck, setModelCheck] = useState<"idle" | "running" | "passed">("idle");
  const profileId = getSelectedProfileId() ?? "local";
  const modelCheckAbort = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const capture = useRef<FaceCapture | null>(null);
  const board = useRef<TeachBoardHandle>(null);
  const inputFrame = useRef<FaceFrame>(neutralFrame());
  const smoother = useRef(new FaceSmoother());
  const recorder = useRef(new PerformanceRecorder());
  const playback = useRef({ anchor: 0, offset: 0 });
  const sourceRevision = useRef(0);
  const [inkId] = useState(() => `avatar-lab-${getSelectedProfileId() ?? "local"}`);
  const captureSamples = useRef<{ processing: number[]; pipeline: number[]; lastReport: number }>({ processing: [], pipeline: [], lastReport: 0 });

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
    const invalidateImport = () => { sourceRevision.current++; };
    const stopForVisibility = () => {
      if (document.hidden) {
        invalidateImport();
        owner.stop(); modelCheckAbort.current?.abort(); setModelCheck("idle");
        setMode("idle"); setReplayPlaying(false); finishRecording();
      }
    };
    document.addEventListener("visibilitychange", stopForVisibility);
    return () => { invalidateImport(); owner.stop(); capture.current = null; modelCheckAbort.current?.abort(); document.removeEventListener("visibilitychange", stopForVisibility); };
  }, [finishRecording]);

  const getFrame = useCallback((now: number) => {
    if (mode === "manual") {
      const frame: FaceFrame = { timeMs: now, source: "demo", tracked: true, rotation: [manual.pitch, manual.yaw, manual.tilt],
        channels: { jawOpen: manual.mouth, mouthPucker: manual.round,mouthStretchLeft:manual.wide,mouthStretchRight:manual.wide, mouthSmileLeft: manual.smile, mouthSmileRight: manual.smile,
          mouthFrownLeft: manual.frown, mouthFrownRight: manual.frown,
          eyeBlinkLeft: manual.leftEye, eyeBlinkRight: manual.rightEye, eyeSquintLeft: manual.squint, eyeSquintRight: manual.squint,
          eyeLookInLeft: Math.max(0,manual.gazeX), eyeLookOutRight: Math.max(0,manual.gazeX),
          eyeLookOutLeft: Math.max(0,-manual.gazeX), eyeLookInRight: Math.max(0,-manual.gazeX),
          eyeLookDownLeft: Math.max(0,manual.gazeY), eyeLookDownRight: Math.max(0,manual.gazeY),
          eyeLookUpLeft: Math.max(0,-manual.gazeY), eyeLookUpRight: Math.max(0,-manual.gazeY),
          browInnerUp: manual.brows, browDownLeft: manual.browDown, browDownRight: manual.browDown } };
      if (recorder.current.recording && !recorder.current.append(frame, now)) finishRecording();
      return frame;
    }
    const state = { mode, track, replayPlaying, replayTime };
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
  }, [finishRecording, mode, track, replayPlaying, replayTime, manual]);

  useEffect(() => {
    if (!replayPlaying || !track) return;
    const timer = setInterval(() => {
      const time = Math.min(track.durationMs, playback.current.offset + performance.now() - playback.current.anchor);
      setReplayTime(time); if (time >= track.durationMs) setReplayPlaying(false);
    }, 100);
    return () => clearInterval(timer);
  }, [replayPlaying, track]);

  const stop = useCallback(() => {

    setLocalPose(undefined);
    sourceRevision.current++;
    modelCheckAbort.current?.abort(); modelCheckAbort.current = null; setModelCheck("idle");
    capture.current?.stop(); finishRecording(); setReplayPlaying(false); setMode("idle");
    inputFrame.current = neutralFrame(); smoother.current.reset();
  }, [finishRecording]);
  const demo = () => { stop(); setError(null); setMode("demo"); };
  const startCamera = () => {
    stop(); setError(null); setMode("camera");
    captureSamples.current = { processing: [], pipeline: [], lastReport: 0 };
    setCaptureMetrics({ processing: 0, pipeline: 0, samples: 0 });
    void capture.current?.start();
  };
  const replay = () => {
    setLocalPose(undefined);
    sourceRevision.current++;
    capture.current?.stop(); finishRecording(); smoother.current.reset();
    const offset = replayTime >= (track?.durationMs ?? 0) ? 0 : replayTime;
    playback.current = { anchor: performance.now(), offset };
    setReplayTime(offset); setMode("replay"); setReplayPlaying(true);
  };
  const pauseReplay = () => {
    setReplayTime(Math.min(track?.durationMs ?? 0, playback.current.offset + performance.now() - playback.current.anchor));
    setReplayPlaying(false);
  };
  const openTrack = useCallback((value: AvatarTrack, play = false) => {
    stop(); setTrack(value); setReplayTime(0); setMode("replay"); setError(null);
    playback.current = { anchor: performance.now(), offset: 0 }; setReplayPlaying(play);
  }, [stop]);
  const download = (value: unknown, filename: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const status = (mode === "manual") ? tr("正在手动调整，未使用摄像头") : mode === "demo" ? tr("演示动作，未使用摄像头") : mode === "replay" ? tr("回放动作片段") : mode !== "camera" ? tr("准备好了")
    : captureState === "starting" ? tr("正在连接摄像头…") : captureState === "loading" ? tr("正在本机加载表情模型…")
      : captureState === "tracking" ? tr("正在跟随你的表情") : tr("请面对摄像头，让整张脸进入画面");
  const canRecord = mode === "manual" || mode === "demo" || (mode === "camera" && (captureState === "tracking" || captureState === "lost"));
  const hasCaptureMetrics = mode === "camera" && captureMetrics.samples > 0;

  return (
    <main className="course-launcher academy-page teach-page avatar-lab">
      <div className="course-launcher-inner">
        <AcademyHeader />
        <div className="avatar-lab-heading"><div><Link to="/teach">{tr("← 回到录课")}</Link><h1>{tr("二维虚拟形象互动试验室")}</h1></div><span>{tr("技术预览")}</span></div>
        <p className="avatar-lab-intro">{tr("选择你的小讲师，跟随表情和轻微头动。摄像头、手动调节和动作回放使用同一套控制。手臂暂不启用。")}</p>
        <div className="avatar-lab-characters" role="group" aria-label={tr("选择虚拟形象")}>
          {PAINTED_CHARACTERS.map(character=><button key={character.id} type="button" aria-pressed={characterId===character.id} disabled={recording} onClick={()=>{setCharacterId(character.id);setError(previous=>previous==='graphics'?null:previous);setMetrics(null);}}>
            <img src={`${import.meta.env.BASE_URL}${character.assets.extended}`} alt="" /><span>{character.name()}</span>
          </button>)}
        </div>
        <div className="avatar-lab-pose" aria-label={tr("星狐定格检查")}>
          <span>{tr("定格检查")}</span>
          {[
            { label: tr("自然表情"), channels: {}, rotation: [0, 0, 0] },
            { label: tr("张嘴"), channels: { jawOpen: .9 }, rotation: [0, 0, 0] },
            { label: tr("闭唇"), channels: { jawOpen: .9, mouthClose: 1 }, rotation: [0, 0, 0] },
            { label: tr("圆唇"), channels: { mouthPucker: .9 }, rotation: [0, 0, 0] },
            { label: tr("微笑开口"), channels: { mouthSmileLeft: .8, mouthSmileRight: .8, jawOpen: .65 }, rotation: [0, 0, 0] },
            { label: tr("看向左侧"), channels: { eyeLookOutLeft: .9, eyeLookInRight: .9 }, rotation: [0, 0, 0] },
            { label: tr("看向右侧"), channels: { eyeLookInLeft: .9, eyeLookOutRight: .9 }, rotation: [0, 0, 0] },
            { label: tr("眯眼微笑"), channels: { mouthSmileLeft: .8, mouthSmileRight: .8, cheekSquintLeft: .8, cheekSquintRight: .8 }, rotation: [0, 0, 0] },
            { label: tr("皱眉"), channels: { browDownLeft: .9, browDownRight: .9, mouthFrownLeft: .7, mouthFrownRight: .7 }, rotation: [0, 0, 0] },
            { label: tr("疑惑"), channels: { browOuterUpLeft: .9, browDownRight: .4, mouthFrownRight: .4 }, rotation: [0, 0, .04] },
            { label: tr("担心"), channels: { browInnerUp: .9, mouthFrownLeft: .8, mouthFrownRight: .8 }, rotation: [0, 0, 0] },
            { label: tr("双眼闭合"), channels: { eyeBlinkLeft: 1, eyeBlinkRight: 1 }, rotation: [0, 0, 0] },
            { label: tr("轻轻偏头"), channels: { jawOpen: .65 }, rotation: [0, -.4, -.1] },
          ].map((pose) => <button key={pose.label} type="button" onClick={() => {
            const frame: FaceFrame = { timeMs: 0, source: "demo", tracked: true, channels: pose.channels, rotation: pose.rotation as FaceFrame["rotation"] };
            openTrack({ schema: AVATAR_TRACK_SCHEMA, durationMs: 1000, frames: [frame, { ...frame, timeMs: 1000 }] });
          }}>{pose.label}</button>)}
        </div>
        <div className="avatar-lab-grid">
          <section className="avatar-lab-stage" aria-label={tr("动态头像")}>
            <IllustratedAvatarStage key={characterId} characterId={characterId} localRig={localRig&&characterId==='star-fox'} localPose={localPose} idleMotion={naturalMotion&&mode!=='replay'&&!localPose} className="avatar-lab-illustrated" frame={getFrame} fpsLimit={fpsLimit} active={mode === "demo" || mode === "camera" || (mode === "manual" && recording) || replayPlaying} onMetrics={setMetrics} onError={onGraphicsError} />
            <span className="avatar-lab-stage-label">{paintedCharacter(characterId).name()}</span>
            {recording && <span className="avatar-lab-recording">{tr("正在录动作片段（最长 60 秒）")}</span>}
            <div className="avatar-lab-status" role="status">{status}</div>
          </section>
          <section className="avatar-lab-controls" aria-label={tr("头像控制")}>
            {characterId==='star-fox'&&<fieldset className="avatar-lab-local-rig">
              <legend>{tr('星狐效果调节')}</legend>
              <label><input type="checkbox" checked={localRig} disabled={recording} onChange={e=>{setLocalRig(e.target.checked);setLocalPose(undefined);}} />{tr('使用新版发束与嘴型')}</label>
              {localRig&&<>
                {([{key:'hair',label:tr('右侧发束'),min:-1},{key:'leftHair',label:tr('左侧发束'),min:-1},{key:'forelock',label:tr('刘海轻摆'),min:-1}] as const).map(control=><label key={control.key}>{control.label}<input aria-label={control.label} type="range" min={control.min} max="1" step=".01" value={localPose?.[control.key]??0} disabled={recording} onChange={e=>{const value=Number(e.target.value);setLocalPose(p=>({ear:0,hair:0,...p,[control.key]:value}));}} /></label>)}
                <button type="button" className="teach-secondary" onClick={()=>{setLocalPose(undefined);}}>{tr('回到自动跟随')}</button>
                <small>{tr('耳朵只在转头后轻微随动，静止时保持安静。')}</small>
              </>}
            </fieldset>}
            <label className="avatar-lab-natural-motion"><input type="checkbox" checked={naturalMotion} onChange={event=>setNaturalMotion(event.target.checked)} />{tr('毛发自然小动作')}</label>
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
            <Link className="teach-secondary" to="/teach/avatar-2d/example">{tr("观看讲课配音示例")}</Link>
          </section>
        </div>
        <section className="avatar-lab-manual" aria-label={tr("手动调整表情")}>
          <div className="avatar-lab-manual-heading"><div><h2>{tr("拖动滑杆，马上看效果")}</h2><p>{tr("无需摄像头。手动调整会停止当前跟随或回放，也可以录制动作片段。")}</p></div>
            <button type="button" className="teach-secondary" onClick={() => { stop(); setManual(INITIAL_MANUAL); setMode("manual"); }}>{tr("恢复自然表情")}</button></div>
          <div className="avatar-lab-sliders">{([
            { key: "mouth", label: tr("嘴巴开合"), min: 0, max: 1 }, { key: "round", label: tr("圆唇程度"), min: 0, max: 1 },{key:'wide',label:tr('横向口型'),min:0,max:1}, { key: "smile", label: tr("微笑程度"), min: 0, max: 1 },
            { key: "leftEye", label: tr("左眼闭合"), min: 0, max: 1 }, { key: "rightEye", label: tr("右眼闭合"), min: 0, max: 1 },
            { key: "gazeX", label: tr("左右视线"), min: -1, max: 1 }, { key: "gazeY", label: tr("上下视线"), min: -1, max: 1 },
            { key: "squint", label: tr("眯眼程度"), min: 0, max: 1 }, { key: "frown", label: tr("嘴角下压"), min: 0, max: 1 },
            { key: "browDown", label: tr("皱眉程度"), min: 0, max: 1 },
            { key: "brows", label: tr("抬眉程度"), min: 0, max: 1 }, { key: "yaw", label: tr("左右偏头"), min: -.6, max: .6 },
            { key: "pitch", label: tr("点头幅度"), min: -.35, max: .35 }, { key: "tilt", label: tr("歪头角度"), min: -.1, max: .1 },
          ] as const).filter(item=>item.key!=='wide'||(localRig&&characterId==='star-fox')).map((item) => <label key={item.key} htmlFor={`avatar-manual-${item.key}`}><span>{item.label}<output>{manual[item.key].toFixed(2)}</output></span>
            <input id={`avatar-manual-${item.key}`} aria-label={item.label} type="range" min={item.min} max={item.max} step="0.01" value={manual[item.key]} onChange={(event) => {
              if (mode !== "manual") stop();
              const value = Number(event.target.value);
              setManual((previous) => ({ ...previous, [item.key]: value })); setMode("manual");
            }} /></label>)}</div>
        </section>
        {error && <p className="avatar-lab-error" role="alert">{error === "graphics" ? tr("二维角色未能载入，请刷新重试。")
          : error === "track" ? tr("这个动作文件无法读取，请使用有效的头像片段。") : error === "ink" ? tr("白板未能开启，请刷新后重试。") : errorMessage(error)}</p>}
        <section className="avatar-lab-track" aria-label={tr("动作片段")}>
          <div className="avatar-lab-actions">
            <button type="button" className="teach-secondary" disabled={!canRecord} onClick={() => {
              if (recording) finishRecording(); else {  setLocalPose(undefined); sourceRevision.current++; recorder.current.begin(performance.now()); setRecording(true); }
            }}>{recording ? tr("结束动作片段") : tr("录一段动作")}</button>
            <button type="button" className="teach-secondary" disabled={!track || recording} onClick={() => replayPlaying ? pauseReplay() : replay()}>{replayPlaying ? <Pause size={17} /> : <Play size={17} />}{replayPlaying ? tr("暂停片段") : tr("回放片段")}</button>
            <button type="button" className="teach-secondary" disabled={!track || recording} onClick={() => track && download(track, "avatar-performance.json")}><Download size={17} />{tr("导出动作片段")}</button>
            <label className="avatar-lab-import">{tr("导入动作片段")}<input type="file" accept=".json,application/json" onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
              if (file.size > 5_000_000) { setError("track"); return; }
              const revision = ++sourceRevision.current;
              void file.text().then((text) => { if (revision === sourceRevision.current) { const imported = parseAvatarTrack(JSON.parse(text)); openTrack(imported); } }).catch(() => { if (revision === sourceRevision.current) setError("track"); });
            }} /></label>
          </div>
          {track && <label className="avatar-lab-scrub">{tr("片段进度")} <span>{(replayTime / 1000).toFixed(1)} / {(track.durationMs / 1000).toFixed(1)} s</span><input type="range" aria-label={tr("片段进度")} min="0" max={Math.max(1, track.durationMs)} step="10" value={replayTime} disabled={recording} onChange={(event) => { sourceRevision.current++; capture.current?.stop(); setReplayPlaying(false); setMode("replay"); setReplayTime(Number(event.target.value)); }} /></label>}
          <p>{tr("片段只保存角色动作参数，不包含照片或声音；导出后可在另一台支持的设备上回放。")}</p>
        </section>
        <section className="avatar-lab-samples" aria-label={tr("无需摄像头的表情排练")}>
          <h2>{tr("无需摄像头的表情排练")}</h2>
          <p>{tr("这些是预设的合成动作，每段 4 秒，可回放、定位或保存。用于检查角色动作，不代表真人捕捉效果。")}</p>
          <div className="avatar-lab-actions">{EXPRESSION_SAMPLES.map((sample) => <button key={sample.id} type="button" className="teach-secondary" disabled={recording} onClick={() => openTrack(expressionSample(sample.id), true)}>{sample.name()}</button>)}</div>
        </section>
        <AvatarClipLibrary key={`library:${profileId}`} profileId={profileId} track={track} disabled={recording} sourceKey={mode} onOpen={(value) => openTrack(value)} />
        <AvatarAudioPreview key={`audio:${profileId}`} characterId={characterId} localRig={localRig&&characterId==='star-fox'} />
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
