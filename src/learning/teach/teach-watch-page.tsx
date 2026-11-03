// "Watch my lesson": the learner's recorded lesson played the way viewers will
// see it, through the course player, narrated in a synthetic voice with the
// learner's words as captions. Nothing is sent anywhere but speech synthesis.

import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Download, PackageCheck, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { normalizeAuthoringLesson } from "octos-lesson-language";

import { getSelectedProfileId } from "@/api/client";
import { availableService, type LessonVoices } from "@/byok/providers";
import { getService, prepareClientServices } from "@/byok/services";

import { AcademyHeader } from "../academy/academy-header";
import { LearningWhiteboard } from "../oll/oll-lesson-runtime";
import { useOllLessonRuntime, type OllLessonTopicDefinition } from "../oll/use-oll-lesson-runtime";
import { useOllNarrationTts } from "../oll/use-oll-narration-tts";
import { compileRecording } from "./compile-recording";
import { LEARNER_PACKAGE_EXTENSION, readLearnerPackage, type LoadedLearnerPackage } from "./learner-package";
import { readStoredLearnerPackage, writeStoredLearnerPackage, type StoredLearnerPackage } from "./learner-package-store";
import { cardChecks, lessonReady } from "./lesson-check";
import { makeLearnerPackage } from "./make-learner-package";
import { findPersonalDetails } from "./privacy";
import { inkSnapshotResolver, loadInkSnapshots } from "./ink-snapshot-store";
import { recordingComplete, setPresenter, type Presenter } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { avatarArtUrl, PRESENTER_AVATARS, presenterAvatar, presenterVoices, type PresenterAvatar } from "./presenters";
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

type PackState =
  | { status: "loading" | "none" | "outdated" }
  | { status: "ready"; stored: StoredLearnerPackage; loaded: LoadedLearnerPackage };

export function TeachWatchPage() {
  useLocale();
  const { id } = useParams();
  const profileId = getSelectedProfileId() ?? "local";
  const [recording, setRecording] = useState(() => loadRecordingDrafts(localStorage, profileId).find((draft) => draft.id === id));
  const choosePresenter = (presenter: Presenter) => {
    if (!recording) return;
    const next = setPresenter(recording, presenter, new Date().toISOString());
    saveRecordingDraft(localStorage, profileId, next);
    setRecording(next);
  };
  const [choosing, setChoosing] = useState(false);
  const [snapshots] = useState(() => loadInkSnapshots(localStorage, profileId));
  const resolveAsset = useMemo(() => inkSnapshotResolver(snapshots), [snapshots]);

  const lesson = useMemo(() => {
    if (!recording || !recordingComplete(recording)) return null;
    try {
      const compiled = compileRecording(recording, { author: learnerAuthor(profileId, recording.presenter), language: getLocale() });
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
      return { compiled, events, source, topics, language: compiled.lesson.lesson.language, cards: compiled.lesson.steps[0]?.beats.length ?? 0 };
    } catch {
      return null;
    }
  }, [recording, profileId]);

  // Narration needs the learner's own speech service; without it the lesson plays at reading pace with captions.
  const [audio, setAudio] = useState<Audio>("checking");
  const [sound, setSound] = useState(true);
  const [resource, setResource] = useState<string>();
  useEffect(() => {
    let active = true;
    void prepareClientServices().catch(() => undefined).then(() => {
      if (!active) return;
      setAudio(availableService("tts") ? "on" : "unavailable");
      setResource(getService("tts")?.params.resource_id);
    });
    return () => { active = false; };
  }, []);
  // The chosen voice speaks when the account's speech resource offers it; otherwise the account's own voice does.
  const voiceChoices = presenterVoices(resource);
  const chosenVoice = voiceChoices.find((voice) => voice.id === recording?.presenter?.voice);
  const wantedVoice = recording?.presenter?.voice;
  const voices = useMemo<LessonVoices | null>(() => {
    const offered = presenterVoices(resource).some((voice) => voice.id === wantedVoice);
    return offered && resource && wantedVoice ? { [resource.trim()]: { id: wantedVoice } } : null;
  }, [wantedVoice, resource]);
  const avatar = presenterAvatar(recording?.presenter?.avatar);

  // The lesson's package, made on this device: once it matches the lesson,
  // the lesson plays from it with no speech service and no model.
  const lessonPrint = fingerprint(lesson?.source ?? "");
  const [pack, setPack] = useState<PackState>({ status: "loading" });
  useEffect(() => {
    if (!recording || !lesson) return;
    let active = true;
    void readStoredLearnerPackage(recording.id).then(async (stored) => {
      if (!stored) return { status: "none" } as PackState;
      if (stored.lessonFingerprint !== lessonPrint) return { status: "outdated" } as PackState;
      return { status: "ready", stored, loaded: await readLearnerPackage(stored.archive) } as PackState;
    }).catch(() => ({ status: "none" }) as PackState).then((state) => { if (active) setPack(state); });
    return () => { active = false; };
  }, [recording, lesson, lessonPrint]);
  const packaged = pack.status === "ready" ? pack.loaded : undefined;
  const checks = recording && lesson ? cardChecks(recording, lesson.compiled, recording.review) : [];
  const checked = Boolean(recording && lessonReady(checks, recording));
  const privateTitles = recording ? [recording.topic.text, ...recording.goals, ...recording.cards.map((card) => card.title)].flatMap((text) => findPersonalDetails(text)) : [];
  const [making, setMaking] = useState<{ done: number; total: number } | null>(null);
  const [makeFailed, setMakeFailed] = useState<string | null>(null);
  const makePackage = async () => {
    if (!recording || !lesson) return;
    setMakeFailed(null);
    setMaking({ done: 0, total: 0 });
    try {
      const { archive, manifest } = await makeLearnerPackage({
        lessonId: recording.id, title: recording.topic.text, language: lesson.language, events: lesson.events, snapshots,
        voices, signal: new AbortController().signal, onProgress: (done, total) => setMaking({ done, total }),
      });
      const stored = { recordingId: recording.id, lessonFingerprint: lessonPrint, contentSha256: manifest.contentSha256, archive: archive.slice().buffer, builtAt: manifest.createdAt };
      await writeStoredLearnerPackage(stored);
      setPack({ status: "ready", stored, loaded: await readLearnerPackage(stored.archive) });
    } catch (error) {
      setMakeFailed(error instanceof Error && error.message ? error.message : tr("这次没能做好，请再试一次。"));
    } finally {
      setMaking(null);
    }
  };
  const download = () => {
    if (pack.status !== "ready" || !recording) return;
    const url = URL.createObjectURL(new Blob([pack.stored.archive], { type: "application/zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `lesson-${recording.id}${LEARNER_PACKAGE_EXTENSION}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const resolvePackagedAudio = useCallback((beatId: string, text: string) => packaged?.narration(beatId, text) ?? null, [packaged]);
  const narrated = (Boolean(packaged) || audio === "on") && sound;

  const runtime = useOllLessonRuntime({
    source: lesson && audio !== "checking" && pack.status !== "loading" ? packaged?.source ?? lesson.source : null,
    storageKey: `octos-learn:teach-watch:${recording?.id ?? "none"}:${lessonPrint}`,
    narrationTiming: narrated ? "external" : "estimated",
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
    enabled: narrated,
    playing: speaking,
    text: runtime?.activeSpeech ?? "",
    narrationId: runtime?.currentBeatId,
    upcomingText: runtime?.nextNarration?.text,
    upcomingNarrationId: runtime?.nextNarration?.beatId,
    prefetchEnabled: true,
    voices,
    ...(packaged ? { resolveAudio: resolvePackagedAudio } : {}),
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
          {choosing && (
            <section className="teach-presenter" aria-label={tr("谁来讲你的课")}>
              <fieldset>
                <legend className="teach-group-label">{tr("形象")}</legend>
                <div className="teach-presenter-avatars">
                  {PRESENTER_AVATARS.map((option) => (
                    <button key={option.id} type="button" aria-pressed={option.id === avatar.id} onClick={() => choosePresenter({ avatar: option.id })}>
                      <AvatarPicture avatar={option} size={56} />{option.name()}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="teach-group-label">{tr("声音")}</legend>
                {voiceChoices.length ? (
                  <div className="teach-presenter-voices">
                    {voiceChoices.map((voice) => (
                      <label key={voice.id} className="teach-place">
                        <input type="radio" name="teach-voice" checked={voice.id === chosenVoice?.id} onChange={() => choosePresenter({ voice: voice.id })} />
                        <span>{voice.name()}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="academy-muted">{tr("你的语音服务还没有可以选的声音，课会用设置里保存的声音。")}</p>
                )}
              </fieldset>
              <button type="button" className="teach-primary" onClick={() => setChoosing(false)}>{tr("好了")}</button>
            </section>
          )}
          <section className="teach-watch-stage" aria-label={tr("你的课")}>
            <LearningWhiteboard runtime={runtime} resolveAsset={packaged?.resolveAsset ?? resolveAsset} />
          </section>
          <div className="teach-watch-bar">
            <button type="button" className="teach-presenter-button" aria-label={tr("换一个形象或声音")} onClick={() => setChoosing(!choosing)}>
              <AvatarPicture avatar={avatar} size={44} />
            </button>
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
          <section className="teach-package" aria-label={tr("分享前的准备")}>
            {pack.status === "ready" ? (
              <>
                <p role="status">{tr("这节课已经准备好分享了：声音已经做好，不联网也能播放。")}</p>
                <button type="button" className="teach-secondary" onClick={download}><Download size={16} aria-hidden="true" />{tr("下载课程包")}</button>
              </>
            ) : making ? (
              <p role="status">{making.total ? tr("正在为第 {{v0}} 张卡片做声音（共 {{v1}} 张）…", { v0: Math.min(making.done + 1, making.total), v1: making.total }) : tr("正在准备…")}</p>
            ) : (
              <>
                <p className="academy-muted">{pack.status === "outdated" ? tr("课改过了，要重新准备一次。") : !checked ? tr("先在编辑页“检查我的课”，没有要改的地方后就能准备分享。")
                  : privateTitles.length ? tr("题目或卡片标题里有个人信息（“{{v0}}”），先回去改掉。", { v0: privateTitles[0]!.quote })
                    : audio !== "on" ? tr("准备分享需要连接语音合成。") : tr("会用你选的声音把每张卡片讲一遍并保存，以后不联网也能播放。")}</p>
                <button type="button" className="teach-primary" disabled={!checked || privateTitles.length > 0 || audio !== "on"} onClick={() => void makePackage()}>
                  <PackageCheck size={16} aria-hidden="true" />{tr("准备分享")}
                </button>
              </>
            )}
            {makeFailed && <p role="alert">{makeFailed}</p>}
          </section>
          {audio === "unavailable" && !packaged && <p role="status" className="teach-notice">{tr("还没有连接语音合成，课会只显示字幕。可以在设置的 API Keys 里连接。")}</p>}
          {narration.error && <p role="status" className="teach-notice">{narration.error}</p>}
        </>
      )}
    </main>
  );
}

/** An avatar's artwork, or a placeholder with its initial until the artwork is added. */
function AvatarPicture({ avatar, size }: { avatar: PresenterAvatar; size: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return <span className="teach-avatar-placeholder" aria-hidden="true" style={{ width: size, height: size, background: avatar.color }}>{avatar.name().slice(0, 1)}</span>;
  }
  return <img className="teach-avatar" src={avatarArtUrl(avatar.id)} alt="" width={size} height={size} onError={() => setMissing(true)} />;
}
