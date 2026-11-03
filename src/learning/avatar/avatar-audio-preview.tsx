import { useCallback, useEffect, useRef, useState } from "react";
import { tr } from "@/i18n";
import { IllustratedAvatarStage } from "./illustrated-avatar-stage";
import { audioDigest, calibrationWav, lipSyncFrame, parseLipSyncTrack, type LipSyncTrack } from "./lip-sync";
import { preparePreviewAudio } from "./prepare-preview-audio";
import type { LoadedLearnerPackage } from "../teach/learner-package";

const ignoreMetrics = () => undefined;
const blobBytes = (blob: Blob): Promise<ArrayBuffer> => typeof blob.arrayBuffer === "function" ? blob.arrayBuffer() : new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob);
});

export function AvatarAudioPreview() {
  const audio = useRef<HTMLAudioElement>(null);
  const sourceUrl = useRef<string | null>(null);
  const work = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const [track, setTrack] = useState<LipSyncTrack | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"audio" | "timing" | "mismatch" | "graphics" | "package" | "no_mouth" | null>(null);
  const [rate, setRate] = useState("1");
  const [lessonPack, setLessonPack] = useState<LoadedLearnerPackage | null>(null);
  const [cards, setCards] = useState<Array<{ beatId: string; text: string }>>([]);
  const [selectedCard, setSelectedCard] = useState("");
  const onGraphicsError = useCallback(() => setFailure("graphics"), []);
  const frame = useCallback(() => lipSyncFrame(track, (audio.current?.currentTime ?? position / 1000) * 1000, Boolean(track)), [track, position]);

  useEffect(() => {
    const element = audio.current;
    const pause = () => { if (document.hidden) element?.pause(); };
    const invalidate = () => { revision.current++; };
    const releaseUrl = () => { if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); sourceUrl.current = null; };
    document.addEventListener("visibilitychange", pause);
    return () => {
      invalidate(); work.current?.abort(); element?.pause(); element?.removeAttribute("src"); element?.load();
      releaseUrl();
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);

  const load = async (input: () => Promise<ArrayBuffer>, label: string, mediaType: string, preparedTrack?: LipSyncTrack) => {
    const current = ++revision.current;
    work.current?.abort(); const controller = new AbortController(); work.current = controller;
    audio.current?.pause(); audio.current?.removeAttribute("src"); audio.current?.load();
    if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); sourceUrl.current = null;
    setTrack(null); setPlaying(false); setPosition(0); setFailure(null); setBusy(true); setName("");
    try {
      const bytes = await input();
      if (current !== revision.current || controller.signal.aborted) return;
      const prepared = preparedTrack
        ? parseLipSyncTrack(preparedTrack, { audioSha256: await audioDigest(bytes), durationMs: preparedTrack.durationMs })
        : await preparePreviewAudio(bytes, controller.signal);
      if (current !== revision.current || controller.signal.aborted || !audio.current) return;
      sourceUrl.current = URL.createObjectURL(new Blob([bytes], { type: mediaType || "application/octet-stream" }));
      audio.current.src = sourceUrl.current; audio.current.playbackRate = Number(rate); audio.current.volume = .65;
      setTrack(prepared); setName(label);
    } catch { if (current === revision.current && !controller.signal.aborted) setFailure("audio"); }
    finally { if (current === revision.current) setBusy(false); }
  };
  const exportTrack = () => {
    if (!track) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(track)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "avatar-lip-sync.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openCard = (pack: LoadedLearnerPackage, card: { beatId: string; text: string }, index: number) => {
    const prepared = pack.mouthTrack(card.beatId, card.text);
    if (!prepared) { setFailure("no_mouth"); return; }
    setSelectedCard(card.beatId);
    const type = pack.manifest.files.find((file) => file.path === pack.manifest.narration.find((clip) => clip.beatId === card.beatId)?.file)?.mediaType ?? "audio/mpeg";
    void load(async () => {
      const blob = await pack.narration(card.beatId, card.text);
      if (!blob) throw new Error("missing_packaged_audio");
      return blobBytes(blob);
    }, tr("第 {{v0}} 张卡片 · {{v1}}", { v0: index + 1, v1: pack.manifest.title }), type, prepared);
  };
  return <section className="avatar-lab-audio" aria-label={tr("配音与嘴型排练")}>
    <h2>{tr("配音与嘴型排练")}</h2>
    <p>{tr("导入一段已生成的配音，嘴型会跟随音频的实际进度。这里只在本机预览，不录音、不上传，也不会调用付费语音服务。")}</p>
    <div className="avatar-audio-grid">
      <div className="avatar-audio-stage">
        <IllustratedAvatarStage frame={frame} fpsLimit={30} active={playing} onMetrics={ignoreMetrics} onError={onGraphicsError} />
        <span className="avatar-lab-stage-label">{tr("二维星狐 · 互动小样")}</span>
      </div>
      <div className="avatar-audio-controls">
        <div className="avatar-lab-actions">
          <button type="button" className="teach-secondary" onClick={() => void load(async () => calibrationWav(), tr("四秒校准音（非人声）"), "audio/wav")}>{tr("载入校准音")}</button>
          <label className="avatar-lab-import">{tr("导入配音音频")}<input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg" onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            if (file.size > 10_000_000) { setFailure("audio"); return; }
            void load(() => blobBytes(file), file.name, file.type);
          }} /></label>
          <label className="avatar-lab-import">{tr("导入带嘴型的课程包")}<input type="file" accept=".olesson,application/zip" onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            if (file.size > 100_000_000) { setFailure("package"); return; }
            const current = ++revision.current;
            work.current?.abort(); audio.current?.pause(); setPlaying(false); setBusy(true); setFailure(null); setLessonPack(null); setCards([]); setSelectedCard("");
            void blobBytes(file).then(async (bytes) => {
              const { readLearnerPackage, lessonNarration } = await import("../teach/learner-package");
              const pack = await readLearnerPackage(bytes);
              if (current !== revision.current) return;
              const lines = lessonNarration(pack.events);
              if (!lines.length || !pack.mouthTrack(lines[0]!.beatId, lines[0]!.text)) { setFailure("no_mouth"); return; }
              setLessonPack(pack); setCards(lines); openCard(pack, lines[0]!, 0);
            }).catch(() => { if (current === revision.current) setFailure("package"); })
              .finally(() => { if (current === revision.current) setBusy(false); });
          }} /></label>
        </div>
        {lessonPack && <label className="avatar-lab-select">{tr("课包卡片")}<select aria-label={tr("课包卡片")} value={selectedCard} onChange={(event) => {
          const index = cards.findIndex((card) => card.beatId === event.target.value);
          if (index >= 0) openCard(lessonPack, cards[index]!, index);
        }}>{cards.map((card, index) => <option key={card.beatId} value={card.beatId}>{tr("第 {{v0}} 张卡片", { v0: index + 1 })}</option>)}</select></label>}
        <p>{tr("音频限 60 秒、10 MB、单声道或双声道。校准音是四段轻声提示音，用于验证同步，不代表语音或嘴型质量。")}</p>
        {busy && <p role="status">{tr("正在本机分析配音…")}</p>}
        {track && <><strong>{name}</strong><p role="status">{track.method === "envelope-v1" ? tr("基础开合：根据音量变化生成，尚不能区分发音嘴型。") : tr("已载入外部发音嘴型轨，准确度仍需单独验收。")}</p></>}
        <audio ref={audio} controls preload="metadata" aria-label={tr("配音播放控制")} hidden={!track}
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setPosition((audio.current?.currentTime ?? 0) * 1000); }}
          onEnded={() => { setPlaying(false); setPosition((audio.current?.currentTime ?? 0) * 1000); }}
          onTimeUpdate={() => setPosition((audio.current?.currentTime ?? 0) * 1000)}
          onSeeked={() => setPosition((audio.current?.currentTime ?? 0) * 1000)}
          onError={() => { if (sourceUrl.current) { setPlaying(false); setFailure("audio"); } }} />
        <label className="avatar-lab-select">{tr("配音播放速度")}<select value={rate} onChange={(event) => { setRate(event.target.value); if (audio.current) audio.current.playbackRate = Number(event.target.value); }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.5">1.5×</option></select></label>
        {track && <label className="avatar-lab-scrub">{tr("配音进度")} <span>{(position / 1000).toFixed(1)} / {(track.durationMs / 1000).toFixed(1)} s</span><input aria-label={tr("配音进度")} type="range" min="0" max={track.durationMs} step="10" value={Math.min(position, track.durationMs)} onChange={(event) => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value / 1000; setPosition(value); }} /></label>}
        <div className="avatar-lab-actions">
          <button type="button" className="teach-secondary" disabled={!track || busy} onClick={exportTrack}>{tr("导出嘴型轨")}</button>
          <label className="avatar-lab-import">{tr("导入发音嘴型轨")}<input type="file" accept=".json,application/json" disabled={!track || busy} onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file || !track) return;
            if (file.size > 5_000_000) { setFailure("timing"); return; }
            const current = ++revision.current;
            void file.text().then((text) => {
              if (current !== revision.current) return;
              const next = parseLipSyncTrack(JSON.parse(text), track); setTrack(next); setFailure(null);
            }).catch((error: unknown) => { if (current === revision.current) setFailure(error instanceof Error && error.message === "lip_audio_mismatch" ? "mismatch" : "timing"); });
          }} /></label>
        </div>
        <p>{tr("嘴型文件必须匹配当前音频。换配音后需要重新生成；课程包试听会使用包内已验证的配音与嘴型。精细发音嘴型仍需后续完善。")}</p>
        {failure && <p role="alert" className="avatar-lab-error">{failure === "audio" ? tr("音频未能读取，请使用浏览器支持的短音频重试。") : failure === "mismatch" ? tr("嘴型文件与当前音频不匹配，请使用同一段配音生成的文件。") : failure === "timing" ? tr("嘴型文件无效，请检查格式、时长和动作范围。") : failure === "package" ? tr("课程包未能读取，可能已损坏或需要更新应用。") : failure === "no_mouth" ? tr("这个课程包没有嘴型轨。请在准备分享时勾选“保存基础嘴型”，重新下载后导入。") : tr("这台设备暂时无法显示三维头像，请换用支持 WebGL 2 的浏览器。")}</p>}
      </div>
    </div>
  </section>;
}
