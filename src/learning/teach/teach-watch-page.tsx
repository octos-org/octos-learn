// "Watch my lesson": the learner's recorded lesson played the way viewers will
// see it, through the course player, narrated in a synthetic voice with the
// learner's words as captions. Nothing is sent anywhere but speech synthesis.

import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { normalizeAuthoringLesson } from "octos-lesson-language";

import { getSelectedProfileId } from "@/api/client";
import { availableService } from "@/byok/providers";
import { prepareClientServices } from "@/byok/services";

import { AcademyHeader } from "../academy/academy-header";
import { LearningWhiteboard } from "../oll/oll-lesson-runtime";
import { useOllLessonRuntime, type OllLessonTopicDefinition } from "../oll/use-oll-lesson-runtime";
import { useOllNarrationTts } from "../oll/use-oll-narration-tts";
import { compileRecording } from "./compile-recording";
import { inkSnapshotResolver, loadInkSnapshots } from "./ink-snapshot-store";
import { recordingComplete } from "./recording";
import { loadRecordingDrafts } from "./recording-store";
import { learnerAuthor } from "./studio-helpers";
import { nodeSections } from "./teaching-board-setup";
import "./teach.css";

/** A short, stable fingerprint of the lesson, so a changed lesson starts again from the top. */
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

type Audio = "checking" | "on" | "unavailable";

export function TeachWatchPage() {
  useLocale();
  const { id } = useParams();
  const profileId = getSelectedProfileId() ?? "local";
  const [recording] = useState(() => loadRecordingDrafts(localStorage, profileId).find((draft) => draft.id === id));
  const [snapshots] = useState(() => loadInkSnapshots(localStorage, profileId));
  const resolveAsset = useMemo(() => inkSnapshotResolver(snapshots), [snapshots]);

  const lesson = useMemo(() => {
    if (!recording || !recordingComplete(recording)) return null;
    try {
      const compiled = compileRecording(recording, { author: learnerAuthor(profileId), language: getLocale() });
      const events = normalizeAuthoringLesson(compiled.lesson, {
        lessonId: `learner-${recording.id}`, boardId: `learner-${recording.id}-board`, baseRevision: 0, resourceContext: compiled.resourceContext,
      });
      const source = events.map((event) => JSON.stringify(event)).join("\n");
      const sections = nodeSections(events);
      const stepIds = [...new Set(events.flatMap((event) => (event.step?.id ? [event.step.id] : [])))];
      const topics: OllLessonTopicDefinition[] = [{
        id: "learner-lesson", title: recording.topic.text, language: compiled.lesson.lesson.language,
        stepIds, nodeIds: Object.keys(sections), nodeSections: sections,
      }];
      return { source, topics, language: compiled.lesson.lesson.language, cards: compiled.lesson.steps[0]?.beats.length ?? 0 };
    } catch {
      return null;
    }
  }, [recording, profileId]);

  // Narration needs the learner's own speech service; without it the lesson plays at reading pace with captions.
  const [audio, setAudio] = useState<Audio>("checking");
  const [sound, setSound] = useState(true);
  useEffect(() => {
    let active = true;
    void prepareClientServices().catch(() => undefined).then(() => {
      if (active) setAudio(availableService("tts") ? "on" : "unavailable");
    });
    return () => { active = false; };
  }, []);

  const runtime = useOllLessonRuntime({
    source: lesson && audio !== "checking" ? lesson.source : null,
    storageKey: `octos-learn:teach-watch:${recording?.id ?? "none"}:${fingerprint(lesson?.source ?? "")}`,
    narrationTiming: audio === "on" && sound ? "external" : "estimated",
    topics: lesson?.topics,
  });
  const runtimeRef = useRef(runtime);
  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);
  const onStart = useCallback((beatId: string) => runtimeRef.current?.startNarration(beatId), []);
  const onComplete = useCallback((beatId: string) => runtimeRef.current?.completeNarration(beatId), []);
  const onEnd = useCallback((beatId: string, reason: "ended" | "disabled" | "failed" | "cancelled") => runtimeRef.current?.recordNarrationEnd(beatId, reason), []);
  const speaking = Boolean(runtime?.playing && runtime.activeSpeech.trim());
  const narration = useOllNarrationTts({
    language: lesson?.language,
    enabled: audio === "on" && sound,
    playing: speaking,
    text: runtime?.activeSpeech ?? "",
    narrationId: runtime?.currentBeatId,
    upcomingText: runtime?.nextNarration?.text,
    upcomingNarrationId: runtime?.nextNarration?.beatId,
    prefetchEnabled: true,
    onPlaybackStart: onStart,
    onPlaybackComplete: onComplete,
    onPlaybackEnd: onEnd,
  });

  if (!recording) {
    return (
      <main className="course-launcher academy-page teach-page">
        <div className="course-launcher-inner"><AcademyHeader /><p role="alert">{tr("找不到这节课的草稿。")}</p></div>
      </main>
    );
  }

  const card = !runtime ? 0 : runtime.completed ? lesson?.cards ?? 0 : Math.min(lesson?.cards ?? 0, runtime.beatIndex + 1);
  return (
    <main className="teach-page teach-studio teach-watch">
      <header className="teach-studio-head">
        <Link to={`/teach/${recording.id}`} className="teach-back">{tr("← 回去改课")}</Link>
        <h1>{recording.topic.text}</h1>
        {lesson && <span className="teach-group-label">{tr("第 {{v0}} 张，共 {{v1}} 张", { v0: Math.max(1, card), v1: lesson.cards })}</span>}
      </header>
      {!lesson ? (
        <p role="alert" className="teach-notice">{tr("这节课还有卡片没录好，录完就能看了。")}</p>
      ) : (
        <>
          <section className="teach-watch-stage" aria-label={tr("你的课")}>
            <LearningWhiteboard runtime={runtime} resolveAsset={resolveAsset} />
          </section>
          <div className="teach-watch-bar">
            <button type="button" className="teach-primary" disabled={!runtime || audio === "checking"}
              onClick={() => (runtime?.completed ? runtime.restart() : runtime?.playing ? runtime.pause() : runtime?.play())}>
              {runtime?.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {runtime?.completed ? tr("再看一遍") : runtime?.playing ? tr("暂停播放") : tr("播放我的课")}
            </button>
            <button type="button" className="teach-icon-button" aria-label={tr("从头开始")} disabled={!runtime} onClick={() => runtime?.restart()}>
              <RotateCcw size={18} aria-hidden="true" />
            </button>
            {audio === "on" && (
              <button type="button" className="teach-icon-button" aria-pressed={!sound} aria-label={sound ? tr("关掉声音") : tr("打开声音")} onClick={() => setSound(!sound)}>
                {sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
              </button>
            )}
            <p className="teach-watch-caption" aria-live="polite">{runtime?.activeSpeech || (runtime?.completed ? tr("看完了！") : "")}</p>
          </div>
          {audio === "unavailable" && <p role="status" className="teach-notice">{tr("还没有连接语音合成，课会只显示字幕。可以在设置的 API Keys 里连接。")}</p>}
          {narration.error && <p role="status" className="teach-notice">{narration.error}</p>}
        </>
      )}
    </main>
  );
}
