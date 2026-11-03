import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { IllustratedAvatarStage } from "./illustrated-avatar-stage";
import { illustratedDemoFrame } from "./illustrated-fox";
import { neutralFrame, type FaceFrame } from "./face-frame";
import { lipSyncFrame, type LipSyncTrack } from "./lip-sync";
import { preparePreviewAudio } from "./prepare-preview-audio";
import "./illustrated-avatar-page.css";

type Pose = "explain" | "think" | "happy";
export default function IllustratedAvatarPage() {
  useLocale();
  const [motion, setMotion] = useState(false), [playing, setPlaying] = useState(false), [pose, setPose] = useState<Pose>("explain");
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [track, setTrack] = useState<LipSyncTrack | null>(null);
  const audio = useRef<HTMLAudioElement>(null), controller = useRef<AbortController | null>(null), anchor = useRef(0), source = useRef<string | null>(null);
  const frame = useCallback((now: number): FaceFrame => {
    const base = playing ? lipSyncFrame(track, (audio.current?.currentTime ?? 0) * 1000, !audio.current?.paused)
      : motion ? illustratedDemoFrame(now - anchor.current) : neutralFrame();
    return { ...base, rotation: pose === "think" ? [.05, -.13, -.065] : base.rotation,
      channels: { ...base.channels, mouthSmileLeft: pose === "happy" ? .8 : pose === "think" ? 0 : .22,
        mouthSmileRight: pose === "happy" ? .8 : pose === "think" ? 0 : .22,
        browInnerUp: pose === "think" ? .65 : pose === "happy" ? .2 : .08,
        ...(pose === "happy" ? { eyeBlinkLeft: .12, eyeBlinkRight: .12 } : {}) } };
  }, [motion, playing, pose, track]);
  useEffect(() => {
    const pause = () => { if (document.hidden) { controller.current?.abort(); audio.current?.pause(); setBusy(false); setPlaying(false); setMotion(false); } };
    document.addEventListener("visibilitychange", pause);
    const element = audio.current;
    return () => { controller.current?.abort(); element?.pause(); element?.removeAttribute("src"); element?.load(); if (source.current) URL.revokeObjectURL(source.current); document.removeEventListener("visibilitychange", pause); };
  }, []);
  const stop = () => { controller.current?.abort(); setBusy(false); audio.current?.pause(); setPlaying(false); setMotion(false); };
  const playVoice = async () => {
    stop(); setError(false); setBusy(true);
    const request = new AbortController(); controller.current = request;
    try {
      if (!track) {
        const response = await fetch(`${import.meta.env.BASE_URL}teach-avatars/star-fox/illustrated-v0.1/demo-lesson.wav`, { signal: request.signal });
        if (!response.ok) throw new Error("demo_audio_unavailable");
        const bytes = await response.arrayBuffer(), prepared = await preparePreviewAudio(bytes, request.signal);
        if (request.signal.aborted || !audio.current) return;
        setTrack(prepared); if (source.current) URL.revokeObjectURL(source.current);
        source.current = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })); audio.current.src = source.current;
      }
      if (request.signal.aborted || !audio.current) return;
      audio.current.currentTime = 0; await audio.current.play();
      if (request.signal.aborted) audio.current.pause();
    } catch { if (!request.signal.aborted) setError(true); }
    finally { if (controller.current === request) setBusy(false); }
  };
  return <main className="fox-preview-page">
    <header><Link to="/teach">{tr("← 回到录课")}</Link><span>{tr("OCTOS LEARN · 二维角色小样")}</span></header>
    <div className="fox-preview-title"><p>{tr("小讲师，开讲啦")}</p><h1>{tr("让插画里的星狐，讲出你的想法。")}</h1>
      <span>{tr("嘴型、眼神和轻轻的点头。先把一个角色做好。")}</span></div>
    <div className="fox-preview-grid">
      <section className="fox-preview-portrait" aria-label={tr("二维角色预览")}>
        <div className="fox-preview-badge">✦ {tr("星狐 · 小讲师")}</div>
        <div className="fox-preview-drawing"><IllustratedAvatarStage frame={frame} active={motion || playing} idleMotion /></div>
        <div className="fox-preview-portrait-foot"><span className={motion || playing ? "is-active" : ""} />{playing ? tr("跟随真实配音播放") : motion ? tr("正在播放演示动作") : tr("准备好，听你讲述")}</div>
      </section>
      <section className="fox-preview-controls">
        <div className="fox-preview-lesson"><div className="fox-preview-card-label">{tr("讲课场景示意")}</div><h2>{tr("把不同的分数，变成同一种小份。")}</h2>
          <div className="fox-preview-equation"><span>½</span><b>＋</b><span>¼</span><b>＝</b><span>¾</span></div>
          <div className="fox-preview-fractions" aria-label={tr("四份中有三份被涂色")}><i /><i /><i /><i /></div>
          <p>{tr("先把二分之一变成四分之二，再加上四分之一，就是四分之三。")}</p>
          <small>{tr("这是固定示例板书，用来观看角色效果。")}</small>
        </div>
        <div className="fox-preview-pose" aria-label={tr("选择角色表现")}>
          {([{ id: "explain", label: tr("认真讲解") }, { id: "think", label: tr("想一想") }, { id: "happy", label: tr("我发现了！") }] as const).map((item) =>
            <button type="button" key={item.id} aria-pressed={pose === item.id} onClick={() => setPose(item.id)}>{item.label}</button>)}
        </div>
        <div className="fox-preview-actions"><button type="button" className="fox-preview-primary" disabled={busy} onClick={() => void playVoice()}>{busy ? tr("正在准备示例…") : tr("听星狐讲一讲")}</button>
          <button type="button" onClick={() => { stop(); anchor.current = performance.now(); setMotion(true); }}>{tr("只看动作")}</button>
          <button type="button" onClick={stop} disabled={!motion && !playing && !busy}>{tr("暂停")}</button></div>
        <audio ref={audio} controls preload="none" aria-label={tr("星狐示例配音")}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        <p className="fox-preview-note">{tr("本机合成的中文示例声音，基础音量嘴型；不是最终音色或精细发音。无需摄像头，不录音、不上传，也不调用付费语音服务。")}</p>
        {error && <p role="alert">{tr("示例配音未能播放，可以先选择“只看动作”。")}</p>}
      </section>
    </div>
  </main>;
}
