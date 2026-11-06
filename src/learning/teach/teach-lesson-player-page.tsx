// Plays a lesson from "My lessons" the way its viewers will see it: from the
// saved package only, so no model, no speech service and no key is needed.
// The course player lets the viewer pause and try the board's components,
// and opens the lesson's "Your turn" practice when the lesson ends.

import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { AudioPlaybackClock } from "@/home/voice/audio-playback";

import { AcademyHeader } from "../academy/academy-header";
import { holdAwards } from "../academy/award-events";
import { LearningWhiteboard } from "../oll/oll-lesson-runtime";
import { useOllLessonRuntime } from "../oll/use-oll-lesson-runtime";
import { useOllNarrationTts } from "../oll/use-oll-narration-tts";
import { fetchLessonPackage } from "./learner-lessons-api";
import { readLearnerPackage, type LoadedLearnerPackage } from "./learner-package";
import { readStoredLearnerPackage } from "./learner-package-store";
import { presenterOfReference } from "./presenters";
import { AvatarPicture } from "./presenter-picker";
import { cardIndexOfBeat, lessonCards } from "./lesson-cards";
import { learnerLessonTopic } from "./teaching-board-setup";
import { LessonContents, lessonContents } from "./lesson-contents";
import "./teach.css";

const LessonAvatarPreview = lazy(() => import("../avatar/lesson-avatar-preview"));

type Loaded = { status: "loading" } | { status: "missing" } | { status: "ready"; lesson: LoadedLearnerPackage };

/** The saved package, or the one made on this device when the service cannot be reached. */
async function loadPackage(id: string): Promise<Loaded> {
  try {
    return { status: "ready", lesson: await readLearnerPackage(await fetchLessonPackage(id)) };
  } catch {
    const stored = await readStoredLearnerPackage(id).catch(() => undefined);
    return stored ? { status: "ready", lesson: await readLearnerPackage(stored.archive) } : { status: "missing" };
  }
}

export function TeachLessonPlayerPage() {
  useLocale();
  const { id } = useParams();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    if (!id) return;
    let active = true;
    void loadPackage(id).then((state) => { if (active) setLoaded(state); });
    return () => { active = false; };
  }, [id]);
  const lesson = loaded.status === "ready" ? loaded.lesson : undefined;
  const topics = useMemo(() => (lesson ? [learnerLessonTopic(lesson.events, lesson.manifest.title, lesson.manifest.language)] : undefined), [lesson]);
  const lessonCardList = useMemo(() => (lesson ? lessonCards(lesson.events) : []), [lesson]);
  const cards = lessonCardList.length;

  const [sound, setSound] = useState(true);
  const runtime = useOllLessonRuntime({
    source: lesson?.source ?? null,
    storageKey: `octos-learn:teach-lesson:${id ?? "none"}:${lesson?.manifest.contentSha256 ?? ""}`,
    narrationTiming: sound ? "external" : "estimated",
    topics,
  });
  const runtimeRef = useRef(runtime);
  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);
  const onStart = useCallback((beatId: string) => runtimeRef.current?.startNarration(beatId), []);
  const onComplete = useCallback((beatId: string) => runtimeRef.current?.completeNarration(beatId), []);
  const onEnd = useCallback((beatId: string, reason: "ended" | "disabled" | "failed" | "cancelled") => runtimeRef.current?.recordNarrationEnd(beatId, reason), []);
  const resolveAudio = useCallback((beatId: string, text: string) => lesson?.narration(beatId, text) ?? null, [lesson]);
  // The presenter moves only with the clip that is actually playing: its own
  // media clock and the mouth track made from the same audio in this package.
  const hasMouthTracks = Boolean(lesson?.manifest.lipSync?.length);
  const packageHash = lesson?.manifest.contentSha256 ?? "";
  const [mediaClock, setMediaClock] = useState<{ beatId: string; clock: AudioPlaybackClock; packageHash: string } | null>(null);
  const onMediaClock = useCallback((beatId: string, clock: AudioPlaybackClock | null) => {
    setMediaClock((previous) => clock ? { beatId, clock, packageHash } : previous?.beatId === beatId ? null : previous);
  }, [packageHash]);
  const beatId = runtime?.currentBeatId, speech = runtime?.activeSpeech ?? "";
  const mouthTrack = useMemo(() => (lesson && beatId ? lesson.mouthTrack(beatId, speech) : null), [lesson, beatId, speech]);
  const performanceTrack = useMemo(() => (lesson && beatId ? lesson.performanceTrack(beatId, speech) : null), [lesson, beatId, speech]);
  const narration = useOllNarrationTts({
    language: lesson?.manifest.language,
    enabled: sound && Boolean(lesson),
    playing: Boolean(runtime?.playing && runtime.activeSpeech.trim()),
    text: runtime?.activeSpeech ?? "",
    narrationId: runtime?.currentBeatId,
    upcomingText: runtime?.nextNarration?.text,
    upcomingNarrationId: runtime?.nextNarration?.beatId,
    prefetchEnabled: true,
    voices: null,
    resolveAudio,
    onPlaybackStart: onStart,
    onPlaybackComplete: onComplete,
    onPlaybackEnd: onEnd,
    ...(hasMouthTracks ? { onMediaClock } : {}),
  });
  const speaking = Boolean(runtime?.playing && speech.trim()) && sound;
  const playing = Boolean(runtime?.playing);
  useEffect(() => {
    holdAwards("teach-lesson-player", playing);
    return () => holdAwards("teach-lesson-player", false);
  }, [playing]);

  if (loaded.status !== "ready" || !lesson) {
    return (
      <main className="course-launcher academy-page teach-page">
        <div className="course-launcher-inner">
          <AcademyHeader />
          {loaded.status === "loading" ? <p role="status">{tr("正在打开这节课…")}</p> : <p role="alert">{tr("找不到这节课。它可能已经删除，或者还没有保存。")}</p>}
          <Link to="/teach" className="teach-back">{tr("← 我的课")}</Link>
        </div>
      </main>
    );
  }

  const card = !runtime ? 0 : runtime.completed ? cards : Math.min(cards, cardIndexOfBeat(lessonCardList, runtime.currentBeatId) + 1);
  const avatar = presenterOfReference(lesson.manifest.author.avatar_ref);
  return (
    <main className="teach-page teach-studio teach-watch">
      <header className="teach-studio-head">
        <Link to="/teach" className="teach-back">{tr("← 我的课")}</Link>
        <h1>{lesson.manifest.title}</h1>
        <span className="teach-group-label">{tr("第 {{v0}} 张，共 {{v1}} 张", { v0: Math.max(1, card), v1: cards })}</span>
      </header>
      {hasMouthTracks ? (
        <div className="teach-watch-layout">
          <section className="teach-watch-stage" aria-label={tr("这节课")}>
            <LearningWhiteboard embedded runtime={runtime} resolveAsset={lesson.resolveAsset}
              overlay={<Suspense fallback={null}><LessonAvatarPreview mode="player" placement="board" characterId={avatar.id} track={mouthTrack} performance={performanceTrack}
                clock={mediaClock && mediaClock.beatId === beatId && mediaClock.packageHash === packageHash ? mediaClock.clock : null}
                playing={speaking} preparing={narration.preparing} /></Suspense>} />
          </section>
        </div>
      ) : (
        <section className="teach-watch-stage" aria-label={tr("这节课")}>
          <LearningWhiteboard runtime={runtime} resolveAsset={lesson.resolveAsset} />
        </section>
      )}
      <LessonContents runtime={runtime} entries={lessonContents(lesson.events)} />
      <div className="teach-watch-bar">
        {!hasMouthTracks && <AvatarPicture avatar={avatar} size={44} />}
        <button type="button" className="teach-primary" disabled={!runtime}
          onClick={() => (runtime?.completed ? runtime.restart() : runtime?.playing ? runtime.pause() : runtime?.play())}>
          {runtime?.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          {runtime?.completed ? tr("再看一遍") : runtime?.playing ? tr("暂停播放") : tr("播放这节课")}
        </button>
        <button type="button" className="teach-icon-button" aria-label={tr("从头开始")} disabled={!runtime} onClick={() => runtime?.restart()}>
          <RotateCcw size={18} aria-hidden="true" />
        </button>
        <button type="button" className="teach-icon-button" aria-pressed={!sound} aria-label={sound ? tr("关掉声音") : tr("打开声音")} onClick={() => setSound(!sound)}>
          {sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
        </button>
        <p className="teach-watch-caption" aria-live="polite">{runtime?.activeSpeech || (runtime?.completed ? tr("看完了！") : "")}</p>
      </div>
      {!runtime?.playing && !runtime?.completed && card > 1 && <p className="academy-muted teach-notice">{tr("暂停的时候，可以自己拖一拖、转一转白板上的图。")}</p>}
      {narration.error && <p role="status" className="teach-notice">{narration.error}</p>}
    </main>
  );
}
