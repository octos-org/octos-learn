import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { HandwritingCapture, type HandwritingCaptureState, type HandwritingCaptureError } from "../handwriting/handwriting-capture";
import { HAND_CONNECTIONS, projectPreviewPoint } from "../handwriting/handwriting-overlay";
import { GestureTrialTracker, type HandReading } from "./gesture-trial";
import { EMPTY_IMPULSE_METER, ImpulseCapture, type ImpulseMode } from "./impulse-capture";
import "./gesture-lab.css";

const initialReading: HandReading = { pose: "lost", middleGap: null, indexGap: null };
const cameraError = (code: HandwritingCaptureError) => ({
  permission_denied: tr("请允许摄像头访问，再点击开始。"),
  camera_unavailable: tr("摄像头不可用，请检查连接或关闭其他占用摄像头的应用。"),
  camera_busy: tr("摄像头正在用于其他功能，请关闭后再试。"),
  worker_unavailable: tr("当前浏览器不支持手部识别，请使用新版 Chrome 或 Edge。"),
  model_failed: tr("手部模型加载失败，请刷新后重试。"),
  capture_failed: tr("画面处理失败，请重新开始。"),
})[code];

export default function GestureLabPage() {
  useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const capture = useRef<HandwritingCapture | null>(null);
  const microphone = useRef(new ImpulseCapture());
  const tracker = useRef(new GestureTrialTracker());
  const settings = useRef({ gap: 0.35, sound: 0.079, mode: "peak" as ImpulseMode });
  const mounted = useRef(false);
  const [state, setState] = useState<HandwritingCaptureState>("idle");
  const [error, setError] = useState<HandwritingCaptureError | null>(null);
  const [reading, setReading] = useState(initialReading);
  const [ready, setReady] = useState(false);
  const [gap, setGap] = useState(0.35);
  const [soundThreshold, setSoundThreshold] = useState(0.079);
  const [soundMode, setSoundMode] = useState<ImpulseMode>("peak");
  const [micState, setMicState] = useState<"off" | "starting" | "on">("off");
  const [micError, setMicError] = useState("");
  const [level, setLevel] = useState(EMPTY_IMPULSE_METER);
  const [latency, setLatency] = useState(0);
  const [counts, setCounts] = useState({ poses: 0, sounds: 0, matches: 0 });
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    mounted.current = true;
    const mic = microphone.current;
    const trial = tracker.current;
    const addEvent = (message: string) => setEvents(previous => [message, ...previous].slice(0, 5));
    const clearPreview = () => {
      setReading(initialReading); setReady(false); setLatency(0);
      const overlay = canvas.current;
      overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    };
    const stop = () => {
      capture.current?.stop(); mic.stop(); trial.reset();
      setMicState("off"); setLevel(EMPTY_IMPULSE_METER); clearPreview();
    };
    const controller = new HandwritingCapture(video.current!, {
      onState: setState,
      onError: code => { stop(); setError(code); },
      onFrame: frame => {
        const result = trial.update(frame, settings.current.gap);
        setReading(result.reading); setReady(result.ready); setLatency(frame.pipelineMs);
        if (result.entered || result.matched) setCounts(previous => ({
          ...previous, poses: previous.poses + Number(result.entered), matches: previous.matches + Number(result.matched),
        }));
        if (result.matched) addEvent(tr("手型与声音同时命中（候选）"));
        else if (result.entered) addEvent(tr("看到拇指与中指靠近"));
        const overlay = canvas.current;
        if (!overlay) return;
        const width = overlay.clientWidth, height = overlay.clientHeight;
        if (!width || !height) return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        overlay.width = Math.round(width * dpr); overlay.height = Math.round(height * dpr);
        const context = overlay.getContext("2d");
        if (!context) return;
        context.scale(dpr, dpr);
        if (!frame.landmarks) return;
        const points = frame.landmarks.map(point => projectPreviewPoint(point, { width, height }, {
          width: frame.imageWidth || 640, height: frame.imageHeight || 480,
        }));
        context.lineWidth = 2; context.strokeStyle = "#b4f2de";
        for (const [a, b] of HAND_CONNECTIONS) {
          context.beginPath(); context.moveTo(points[a].x, points[a].y);
          context.lineTo(points[b].x, points[b].y); context.stroke();
        }
        context.setLineDash([5, 4]); context.strokeStyle = result.ready ? "#f9c65c" : "#ffffff";
        context.beginPath(); context.moveTo(points[4].x, points[4].y);
        context.lineTo(points[12].x, points[12].y); context.stroke(); context.setLineDash([]);
        points.forEach((point, index) => {
          context.beginPath(); context.arc(point.x, point.y, index === 4 || index === 12 ? 6 : 3, 0, Math.PI * 2);
          context.fillStyle = index === 4 || index === 12 ? "#f9c65c" : "#ffffff"; context.fill();
        });
      },
    });
    capture.current = controller;
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", stop);
      controller.stop(); mic.stop(); trial.reset(); capture.current = null;
    };
  }, []);

  const stop = () => {
    capture.current?.stop(); microphone.current.stop(); tracker.current.reset();
    setMicState("off"); setLevel(EMPTY_IMPULSE_METER); setReading(initialReading); setReady(false); setLatency(0);
    const overlay = canvas.current;
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
  };
  const startMicrophone = async () => {
    setMicError(""); setMicState("starting");
    try {
      const started = await microphone.current.start(settings.current.sound, setLevel, (time, mode) => {
        const matched = tracker.current.sound(time);
        setCounts(previous => ({ ...previous, sounds: previous.sounds + 1, matches: previous.matches + Number(matched) }));
        setEvents(previous => [matched ? tr("手型与声音同时命中（候选）") : mode === "peak" ? tr("检测到声音突增") : tr("检测到短促声音"), ...previous].slice(0, 5));
      }, () => { setMicState("off"); setLevel(EMPTY_IMPULSE_METER); setMicError(tr("麦克风已断开，请重新开启。")); }, settings.current.mode);
      if (started && mounted.current) setMicState("on");
    } catch {
      if (!mounted.current) return;
      setMicState("off"); setMicError(tr("麦克风未能开启，请检查权限。你仍可只试手型。"));
    }
  };
  const active = state !== "idle";
  const soundStatus = micState === "off" ? tr("声音检测未开启") : micState === "starting" ? tr("正在开启麦克风…") : ({
    off: tr("等待麦克风数据…"), warming: tr("正在适应背景音，请安静片刻…"),
    quiet: tr("正在收音，当前很安静"), below: tr("收到声音，但还没越过门槛，可向左降低门槛"),
    background: tr("音量没有明显高于背景，请靠近麦克风再试"), checking: tr("收到声音，正在等待声音结束"),
    long: tr("声音持续较长，被严格模式过滤；可切换到音量突增模式"),
    hit: tr("声音已命中 ✓"), listening: tr("正在收音，等待下一次声音突增"),
  })[level.status];
  const status = state === "starting" ? tr("正在开启摄像头…") : state === "loading" ? tr("正在加载手部模型…")
    : !active ? tr("点击开始，把一只手放进画面") : ready ? tr("已看到响指准备手型")
    : reading.pose === "middle-pinch" ? tr("保持一下…") : reading.pose === "index-pinch" ? tr("这是食指捏合，请换成中指")
    : reading.pose === "open" ? tr("已看到张开的手") : reading.pose === "other" ? tr("已看到手，请让拇指与中指靠近") : tr("暂未看到手，请把整只手放进画面");

  return <main className="gesture-lab">
    <header><Link to="/teach/avatar-lab">{tr("← 回到互动试验室")}</Link><span>{tr("本机实验")}</span></header>
    <h1>{tr("响指手型试验")}</h1>
    <p className="gesture-intro">{tr("先试摄像头能否认出你的手型，再选择要不要加声音验证。视频和声音只在本机处理，不保存。")}</p>
    <div className="gesture-grid">
      <section className="gesture-preview" aria-label={tr("手部识别预览")}>
        <video ref={video} muted playsInline aria-label={tr("本机摄像头预览")} />
        <canvas ref={canvas} aria-hidden="true" />
        <section className="gesture-readings" aria-label={tr("识别结果")}>
          <div><span>{tr("手型命中")}</span><strong>{counts.poses}</strong></div>
          <div><span>{tr("声音命中")}</span><strong>{counts.sounds}</strong></div>
          <div><span>{tr("联合候选")}</span><strong>{counts.matches}</strong></div>
        </section>
        <div className="gesture-status" data-ready={ready} role="status">
          {status}
          <small>{tr("画面识别延迟")}: {active && latency ? `${Math.round(latency)} ms` : "—"}</small>
          <small>{soundStatus}</small>
          <span key={`${counts.poses}-${counts.sounds}-${counts.matches}`} className="gesture-latest" data-hit={events.length > 0}>
            {events.length ? `${tr("最近触发")}: ${events[0]}` : tr("命中后，这里会显示最近触发，上方计数会增加。")}
          </span>
        </div>
      </section>
      <section className="gesture-controls" aria-label={tr("试验控制")}>
        <h2>{tr("1. 先试手型")}</h2>
        <p>{tr("抬起一只手，让拇指与中指指尖靠近，像准备打响指。黄色圆点标出这两个指尖，保持片刻会显示命中。")}</p>
        <div className="gesture-buttons">
          <button disabled={active} onClick={() => { setError(null); tracker.current.reset(); void capture.current?.start(); }}>{tr("开始识别手型")}</button>
          <button className="secondary" disabled={!active && micState === "off"} onClick={stop}>{tr("停止")}</button>
        </div>
        {error && <p role="alert" className="gesture-error">{cameraError(error)}</p>}
        <label>{tr("指尖靠近的宽松程度")}<output>{gap.toFixed(2)}</output>
          <input type="range" min="0.15" max="0.65" step="0.01" value={gap} onChange={event => {
            const value = Number(event.target.value); settings.current.gap = value; setGap(value); tracker.current.reset(); setReady(false);
          }} />
        </label>
        <p className="gesture-hint">{tr("已经捏住却没命中，可向右调；随便弯手也命中，可向左调。")}</p>
        <h2>{tr("2. 可选：加上声音")}</h2>
        <p>{tr("默认检测音量突然增大，与前后 250 毫秒内的准备手型配对。说话、敲桌和拍手也可能命中，目前只用于试验。")}</p>
        <button className="secondary" disabled={!active || micState === "starting"} onClick={() => {
          if (micState === "on") { microphone.current.stop(); tracker.current.reset(); setMicState("off"); setLevel(EMPTY_IMPULSE_METER); }
          else void startMicrophone();
        }}>{micState === "on" ? tr("关闭声音检测") : micState === "starting" ? tr("正在开启麦克风…") : tr("开启声音检测")}</button>
        {micError && <p role="alert" className="gesture-error">{micError}</p>}
        <label>{tr("声音检测方式")}
          <select value={soundMode} onChange={event => {
            const mode = event.target.value as ImpulseMode; settings.current.mode = mode; setSoundMode(mode);
            microphone.current.setMode(mode); tracker.current.reset();
          }}><option value="peak">{tr("音量突增（容易触发）")}</option><option value="short">{tr("短促声音（更严格）")}</option></select>
        </label>
        <label>{tr("声音触发门槛")}<output>{soundThreshold.toFixed(3)}</output>
          <input type="range" min="0.001" max="0.1" step="0.001" value={soundThreshold} onChange={event => {
            const value = Number(event.target.value); settings.current.sound = value; setSoundThreshold(value); microphone.current.setThreshold(value);
          }} />
        </label>
        <meter aria-label={tr("声音峰值")} min="0" max={Math.max(soundThreshold * 4, level.recentPeak, 0.02)} value={level.recentPeak} />
        <p className="gesture-audio-feedback" data-hit={level.status === "hit"}>{soundStatus}</p>
        <p className="gesture-hint">{tr("最近声音峰值")}: <output aria-label={tr("最近声音峰值")}>{level.recentPeak.toFixed(3)}</output> · {tr("门槛")}: {soundThreshold.toFixed(3)}</p>
        <p className="gesture-hint">{tr("门槛越低越灵敏；有声音却不命中时，先将门槛调低。无需 ASR 或 VAD。")}</p>
      </section>
    </div>
    <section className="gesture-notes">
      <div className="gesture-detail"><span>{tr("拇指到中指距离 / 掌部大小")}: {reading.middleGap?.toFixed(2) ?? "—"}</span><span>{tr("拇指到食指距离 / 掌部大小")}: {reading.indexGap?.toFixed(2) ?? "—"}</span></div>
      <p>{tr("手型命中只表示看到了准备动作，不表示已经打出响指。先对比张手、食指捏合、中指捏合，再试真正打响指。")}</p>
      <div className="gesture-buttons"><button className="secondary" onClick={() => {
        tracker.current.reset(); setReady(false); setCounts({ poses: 0, sounds: 0, matches: 0 }); setEvents([]);
      }}>{tr("清空计数")}</button></div>
      <ol aria-label={tr("最近识别事件")}>{events.map((event, index) => <li key={index}>{event}</li>)}</ol>
    </section>
  </main>;
}
