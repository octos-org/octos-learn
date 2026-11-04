import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { tr } from "@/i18n";
import { getSelectedProfileId } from "@/api/client";
import { useLocale } from "@/i18n/use-locale";
import { unlockAudio, type AudioPlaybackClock } from "@/home/voice/audio-playback";
import { LearningWhiteboard } from "../oll/oll-lesson-runtime";
import { useOllLessonRuntime } from "../oll/use-oll-lesson-runtime";
import { useOllNarrationTts } from "../oll/use-oll-narration-tts";
import { readLearnerPackage, type LoadedLearnerPackage } from "./learner-package";
import { presenterOfReference } from "./presenters";
import { nodeSections } from "./teaching-board-setup";
import "./teach.css";

const LessonAvatarPreview = lazy(() => import("../avatar/lesson-avatar-preview"));
const blobBytes = (blob: Blob): Promise<ArrayBuffer> => typeof blob.arrayBuffer === "function" ? blob.arrayBuffer() : new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob);
});

/** Read-only downloaded-lesson playback. Missing audio never triggers paid TTS. */
export default function LearnerPackageViewer() {
  useLocale();
  const profileId = getSelectedProfileId() ?? "local";
  const [pack, setPack] = useState<LoadedLearnerPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState(true);
  const [showAvatar, setShowAvatar] = useState(true);
  const [media, setMedia] = useState<{ beatId: string; packageHash: string; clock: AudioPlaybackClock } | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    const invalidate = () => { revision.current++; };
    return invalidate;
  }, []);
  const topics = useMemo(() => {
    if (!pack) return [];
    const sections = nodeSections(pack.events);
    return [{ id: "downloaded-lesson", title: pack.manifest.title, language: pack.manifest.language,
      stepIds: [...new Set(pack.events.flatMap((event) => event.step?.id ? [event.step.id] : []))], nodeIds: Object.keys(sections), nodeSections: sections }];
  }, [pack]);
  const runtime = useOllLessonRuntime({
    source: pack?.source ?? null, storageKey: `octos-learn:package-watch:${profileId}:${pack?.manifest.contentSha256 ?? "none"}`,
    narrationTiming: sound ? "external" : "estimated", topics,
  });
  const runtimeRef = useRef(runtime);
  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);
  const start = useCallback((beatId: string) => runtimeRef.current?.startNarration(beatId), []);
  const complete = useCallback((beatId: string) => runtimeRef.current?.completeNarration(beatId), []);
  const end = useCallback((beatId: string, reason: "ended" | "disabled" | "failed" | "cancelled") => runtimeRef.current?.recordNarrationEnd(beatId, reason), []);
  const resolveAudio = useCallback(async (beatId: string, text: string) => {
    const audio = await pack?.narration(beatId, text);
    if (!audio) throw new Error("Missing verified packaged narration");
    return audio;
  }, [pack]);
  const clock = useCallback((beatId: string, value: AudioPlaybackClock | null) => {
    setMedia((previous) => value ? { beatId, clock: value, packageHash: pack?.manifest.contentSha256 ?? "" } : previous?.beatId === beatId ? null : previous);
  }, [pack]);
  const speaking = Boolean(runtime?.playing && runtime.activeSpeech.trim());
  const hasMouth = Boolean(pack?.manifest.lipSync?.length);
  const narrationBeatId = runtime?.currentBeatId, narrationText = runtime?.activeSpeech ?? "";
  const mouth = useMemo(() => pack && narrationBeatId ? pack.mouthTrack(narrationBeatId, narrationText) : null,
    [pack, narrationBeatId, narrationText]);
  const moves = useMemo(() => pack && narrationBeatId ? pack.performanceTrack(narrationBeatId, narrationText) : null,
    [pack, narrationBeatId, narrationText]);
  const narration = useOllNarrationTts({ enabled: Boolean(pack) && sound, playing: speaking,
    language: pack?.manifest.language, narrationId: runtime?.currentBeatId, text: runtime?.activeSpeech ?? "",
    resolveAudio, onPlaybackStart: start, onPlaybackComplete: complete, onPlaybackEnd: end,
    ...(hasMouth ? { onMediaClock: clock } : {}),
  });
  return <main className="teach-page teach-studio teach-watch teach-package-viewer">
    <header className="teach-studio-head"><Link to="/teach" className="teach-back">{tr("← 回到录课")}</Link><h1>{pack?.manifest.title ?? tr("播放课程包")}</h1></header>
    <div className="teach-package-import">
      <label>{tr("选择课程包")}<input type="file" accept=".olesson,application/zip" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        if (file.size > 100_000_000) { setFailed(true); return; }
        const current = ++revision.current;
        runtimeRef.current?.pause(); setPack(null); setMedia(null); setBusy(true); setFailed(false);
        void blobBytes(file).then(readLearnerPackage).then((loaded) => { if (current === revision.current) setPack(loaded); })
          .catch(() => { if (current === revision.current) setFailed(true); })
          .finally(() => { if (current === revision.current) setBusy(false); });
      }} /></label>
      <p>{tr("读取已下载的白板、配音和可用嘴型，不会上传课程，也不会调用语音合成。")}</p>
      {busy && <p role="status">{tr("正在读取课程包…")}</p>}
      {failed && <p role="alert">{tr("课程包未能读取，可能已损坏或需要更新应用。")}</p>}
    </div>
    {pack ? <>
      <div className="teach-watch-layout"><section className="teach-watch-stage" aria-label={tr("你的课")}><LearningWhiteboard embedded runtime={runtime} resolveAsset={pack.resolveAsset} /></section>
        {hasMouth && showAvatar && <Suspense fallback={null}><LessonAvatarPreview characterId={presenterOfReference(pack.manifest.author.avatar_ref).id} track={mouth} performance={moves}
          clock={media && media.beatId === narrationBeatId && media.packageHash === pack.manifest.contentSha256 ? media.clock : null}
          playing={speaking && sound} preparing={narration.preparing} /></Suspense>}
      </div>
      <div className="teach-watch-bar"><button type="button" className="teach-primary" disabled={!runtime} onClick={() => {
        if (sound) unlockAudio();
        if (runtime?.completed) runtime.restart(); else if (runtime?.playing) runtime.pause(); else runtime?.play();
      }}>{runtime?.completed ? tr("再看一遍") : runtime?.playing ? tr("暂停播放") : tr("播放课程")}</button>
        <button type="button" className="teach-secondary" disabled={!runtime} onClick={() => runtime?.restart()}>{tr("从头开始")}</button>
        <label className="teach-place"><input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} /><span>{tr("播放声音")}</span></label>
        {hasMouth && <label className="teach-place"><input type="checkbox" checked={showAvatar} onChange={(event) => setShowAvatar(event.target.checked)} /><span>{tr("显示动态头像预览")}</span></label>}
      </div>
      <p className="teach-watch-caption" aria-live="polite">{runtime?.activeSpeech || (runtime?.completed ? tr("看完了！") : "")}</p>
      {narration.error && <p role="status">{narration.error}</p>}
    </> : !busy && <p className="teach-notice">{tr("选择一个 .olesson 文件开始观看。")}</p>}
  </main>;
}
