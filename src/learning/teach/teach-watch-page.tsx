// "Watch my lesson": the learner's recorded lesson played the way viewers will
// see it, through the course player, narrated in a synthetic voice with the
// learner's words as captions. Nothing is sent anywhere but speech synthesis.

import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Download, PackageCheck, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { normalizeAuthoringLesson, type CanonicalEvent } from "octos-lesson-language";

import { getSelectedProfileId, getToken } from "@/api/client";
import { availableService, speechResource, type LessonVoices } from "@/byok/providers";
import { getService, prepareClientServices } from "@/byok/services";

import { AcademyHeader } from "../academy/academy-header";
import { holdAwards } from "../academy/award-events";
import { openHistoryApi } from "../history/history-api";
import { LearningWhiteboard } from "../oll/oll-lesson-runtime";
import { useOllLessonRuntime, type OllLessonTopicDefinition } from "../oll/use-oll-lesson-runtime";
import { useOllNarrationTts } from "../oll/use-oll-narration-tts";
import { compileRecording } from "./compile-recording";
import { syncLessonDrafts } from "./draft-sync";
import { listLessons, saveLessonPackage } from "./learner-lessons-api";
import { LEARNER_PACKAGE_EXTENSION, lessonNarration, readLearnerPackage, type LoadedLearnerPackage } from "./learner-package";
import { readStoredLearnerPackage, writeStoredLearnerPackage, type StoredLearnerPackage } from "./learner-package-store";
import { cardChecks, lessonReady } from "./lesson-check";
import { makeLearnerPackage, type CardPerformances } from "./make-learner-package";
import { findPersonalDetails } from "./privacy";
import { inkSnapshotResolver, loadInkSnapshots } from "./ink-snapshot-store";
import { keptTake, recordingComplete, setPresenter, type Presenter } from "./recording";
import { readTakePerformance } from "./take-performance-store";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { avatarArtUrl, PRESENTER_AVATARS, presenterAvatar, presenterOfReference, presenterVoices, type PresenterAvatar } from "./presenters";
import { learnerAuthor } from "./studio-helpers";
import { unlockAudio, type AudioPlaybackClock } from "@/home/voice/audio-playback";
import { learnerLessonTopic } from "./teaching-board-setup";
import "./teach.css";

const LessonAvatarPreview = lazy(() => import("../avatar/lesson-avatar-preview"));

/**
 * The stored camera performance of each camera take, by the card's narration
 * beat. A take whose movement is missing on this device (for example a draft
 * recorded on another device) is presented with mouth motion only.
 */
async function cardPerformances(profileId: string, recordingId: string, takes: Array<{ cardKey: string; take: number; speechSpanMs?: [number, number] }>,
  events: CanonicalEvent[]): Promise<CardPerformances> {
  const beats = lessonNarration(events);
  const found: CardPerformances = {};
  for (const take of takes) {
    const beat = beats.find((line) => line.beatId.endsWith(`:beat:${take.cardKey}`));
    if (!beat) continue;
    const track = await readTakePerformance({ profileId, recordingId, cardKey: take.cardKey, take: take.take }).catch(() => null);
    if (track) found[beat.beatId] = { track, ...(take.speechSpanMs ? { speechSpanMs: take.speechSpanMs } : {}) };
  }
  return found;
}

/** A short, stable fingerprint of the lesson, so a changed lesson starts again from the top. */
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

type Audio = "checking" | "on" | "unavailable";

/** What "My lessons" holds for this lesson: the saved version's content hash, or nothing yet. */
type Saved = { status: "checking" | "unreachable" } | { status: "known"; contentSha256: string | null };

type PackState =
  | { status: "loading" | "none" | "outdated" }
  | { status: "ready"; stored: StoredLearnerPackage; loaded: LoadedLearnerPackage };

export function TeachWatchPage() {
  useLocale();
  const { id } = useParams();
  const profileId = getSelectedProfileId() ?? "local";
  const [recording, setRecording] = useState(() => loadRecordingDrafts(localStorage, profileId).find((draft) => draft.id === id));
  const makeWork = useRef<AbortController | null>(null);
  const [making, setMaking] = useState<{ done: number; total: number } | null>(null);
  const [makeFailed, setMakeFailed] = useState<string | null>(null);
  const [showAvatar, setShowAvatar] = useState(() => recording?.presenter?.mouthMotion === "basic");
  const [mediaClock, setMediaClock] = useState<{ beatId: string; clock: AudioPlaybackClock; packageHash: string } | null>(null);
  const choosePresenter = (presenter: Presenter) => {
    if (!recording) return;
    if (presenter.mouthMotion !== undefined) setShowAvatar(presenter.mouthMotion === "basic");
    makeWork.current?.abort(); makeWork.current = null; setMaking(null); setMakeFailed(null);
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
      const topics: OllLessonTopicDefinition[] = [learnerLessonTopic(events, recording.topic.text, compiled.lesson.lesson.language)];
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
      setResource(speechResource(getService("tts")));
    });
    return () => { active = false; };
  }, []);
  // A chosen voice must still be offered; using the account voice is an explicit choice.
  const voiceChoices = presenterVoices(resource);
  const chosenVoice = voiceChoices.find((voice) => voice.id === recording?.presenter?.voice);
  const wantedVoice = recording?.presenter?.voice;
  const voiceAvailable = !wantedVoice || Boolean(chosenVoice);
  const voices = useMemo<LessonVoices | null>(() => {
    const offered = presenterVoices(resource).some((voice) => voice.id === wantedVoice);
    return offered && resource && wantedVoice ? { [resource.trim()]: { id: wantedVoice } } : null;
  }, [wantedVoice, resource]);
  const avatar = presenterAvatar(recording?.presenter?.avatar);
  const includeLipSync = recording?.presenter?.mouthMotion === "basic";
  // Cards whose kept take was recorded with the camera on (their movement is on this device).
  const cameraTakes = useMemo(() => recording?.cards.flatMap((card) => {
    const kept = keptTake(card);
    return kept?.camera ? [{ cardKey: card.key, take: kept.take, speechSpanMs: kept.speechSpanMs }] : [];
  }) ?? [], [recording]);
  const includePerformance = includeLipSync && recording?.presenter?.cameraMotion === "on" && cameraTakes.length > 0;

  // The lesson's package, made on this device: once it matches the lesson,
  // the lesson plays from it with no speech service and no model.
  const lessonPrint = fingerprint((lesson?.source ?? "") + (includeLipSync ? "\u0000avatar-mouth-v1" : "")
    + (includePerformance ? `\u0000avatar-performance-v1:${cameraTakes.map((take) => `${take.cardKey}#${take.take}`).join(",")}` : ""));
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
  const onMediaClock = useCallback((beatId: string, clock: AudioPlaybackClock | null) => {
    setMediaClock((previous) => clock ? { beatId, clock, packageHash: packaged?.manifest.contentSha256 ?? "" } : previous?.beatId === beatId ? null : previous);
  }, [packaged]);
  const checks = recording && lesson ? cardChecks(recording, lesson.compiled, recording.review) : [];
  const checked = Boolean(recording && lessonReady(checks, recording));
  const privateTitles = recording ? [recording.topic.text, ...recording.goals, ...recording.cards.map((card) => card.title)].flatMap((text) => findPersonalDetails(text)) : [];
  useEffect(() => {
    const cancel = () => { makeWork.current?.abort(); makeWork.current = null; };
    return cancel;
  }, [id, profileId]);
  const [saved, setSaved] = useState<Saved>({ status: "checking" });
  const recordingId = recording?.id;
  useEffect(() => {
    if (!recordingId) return;
    let active = true;
    void listLessons()
      .then((lessons) => ({ status: "known", contentSha256: lessons.find((item) => item.lesson_id === recordingId)?.saved?.content_sha256 ?? null }) as Saved)
      .catch(() => ({ status: "unreachable" }) as Saved)
      .then((state) => { if (active) setSaved(state); });
    return () => { active = false; };
  }, [recordingId]);
  // Saving makes the package when the lesson has none that matches, then keeps it in "My lessons".
  const saveLesson = async () => {
    if (!recording || !lesson || (pack.status !== "ready" && !voiceAvailable)) return;
    setMakeFailed(null);
    setMaking({ done: 0, total: 0 });
    makeWork.current?.abort(); const controller = new AbortController(); makeWork.current = controller;
    try {
      let stored = pack.status === "ready" ? pack.stored : undefined;
      if (!stored) {
        const performances = includePerformance ? await cardPerformances(profileId, recording.id, cameraTakes, lesson.events) : undefined;
        if (controller.signal.aborted || makeWork.current !== controller) return;
        const { archive, manifest } = await makeLearnerPackage({
          lessonId: recording.id, title: recording.topic.text, language: lesson.language, events: lesson.events, snapshots,
          voices, includeLipSync, ...(performances ? { performances } : {}), signal: controller.signal, onProgress: (done, total) => { if (makeWork.current === controller) setMaking({ done, total }); },
        });
        if (controller.signal.aborted || makeWork.current !== controller) return;
        stored = { recordingId: recording.id, lessonFingerprint: lessonPrint, contentSha256: manifest.contentSha256, archive: archive.slice().buffer, builtAt: manifest.createdAt };
        await writeStoredLearnerPackage(stored);
        const loaded = await readLearnerPackage(stored.archive);
        if (controller.signal.aborted || makeWork.current !== controller) return;
        setPack({ status: "ready", stored, loaded });
      }
      await syncLessonDrafts(localStorage, profileId);
      if (controller.signal.aborted || makeWork.current !== controller) return;
      const lessonSaved = await saveLessonPackage(recording.id, stored.archive);
      if (controller.signal.aborted || makeWork.current !== controller) return;
      setSaved({ status: "known", contentSha256: lessonSaved.saved?.content_sha256 ?? null });
      // A first lesson can earn an award; it plays when the lesson is not playing.
      const token = getToken();
      if (token) void openHistoryApi(token).then((api) => api.achievements()).catch(() => undefined);
    } catch (error) {
      if (!controller.signal.aborted && makeWork.current === controller) setMakeFailed(error instanceof Error && error.message ? error.message : tr("这次没能做好，请再试一次。"));
    } finally {
      if (makeWork.current === controller) { makeWork.current = null; setMaking(null); }
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
  const narrated = (Boolean(packaged) || (audio === "on" && voiceAvailable)) && sound;

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
  const narrationBeatId = runtime?.currentBeatId, narrationText = runtime?.activeSpeech ?? "";
  const mouthTrack = useMemo(() => packaged && narrationBeatId
    ? packaged.mouthTrack(narrationBeatId, narrationText) : null, [packaged, narrationBeatId, narrationText]);
  const performanceTrack = useMemo(() => packaged && narrationBeatId
    ? packaged.performanceTrack(narrationBeatId, narrationText) : null, [packaged, narrationBeatId, narrationText]);
  const hasMouthTracks = Boolean(packaged?.manifest.lipSync?.length);
  const playing = Boolean(runtime?.playing);
  useEffect(() => {
    holdAwards("teach-watch", playing);
    return () => holdAwards("teach-watch", false);
  }, [playing]);
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
    ...(hasMouthTracks ? { onMediaClock } : {}),
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
                <button type="button" className="teach-secondary" aria-pressed={!wantedVoice} onClick={() => choosePresenter({ voice: "" })}>{tr("使用设置中的声音")}</button>
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
          <div className="teach-watch-layout">
            <section className="teach-watch-stage" aria-label={tr("你的课")}>
              <LearningWhiteboard embedded runtime={runtime} resolveAsset={packaged?.resolveAsset ?? resolveAsset} />
            </section>
            {showAvatar && hasMouthTracks && <Suspense fallback={null}><LessonAvatarPreview
              characterId={presenterOfReference(packaged?.manifest.author.avatar_ref).id} track={mouthTrack} performance={performanceTrack} clock={mediaClock && mediaClock.beatId === narrationBeatId && mediaClock.packageHash === packaged?.manifest.contentSha256 ? mediaClock.clock : null}
              playing={speaking && narrated} preparing={narration.preparing}
            /></Suspense>}
          </div>
          <div className="teach-watch-bar">
            <button type="button" className="teach-presenter-button" aria-label={tr("换一个形象或声音")} onClick={() => setChoosing(!choosing)}>
              <AvatarPicture avatar={avatar} size={44} />
            </button>
            <button type="button" className="teach-primary" disabled={!runtime || audio === "checking"}
              onClick={() => { if (narrated) unlockAudio(); if (runtime?.completed) runtime.restart(); else if (runtime?.playing) runtime.pause(); else runtime?.play(); }}>
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
          <section className="teach-package" aria-label={tr("保存这节课")}>
            {hasMouthTracks && <label className="teach-place"><input type="checkbox" checked={showAvatar} onChange={(event) => setShowAvatar(event.target.checked)} /><span>{tr("显示动态头像预览")}</span></label>}
            <label className="teach-place"><input type="checkbox" checked={includeLipSync} disabled={Boolean(making)} onChange={(event) => choosePresenter({ mouthMotion: event.target.checked ? "basic" : "off" })} /><span>{tr("保存基础嘴型（预览）")}</span></label>
            {includeLipSync && <p className="academy-muted">{tr("会随配音保存简单的嘴部动作，每张卡片的配音最多 60 秒。下载课包后，可在动态头像试验室逐卡试听；精细发音嘴型仍需后续完善。")}</p>}
            {cameraTakes.length > 0 && <label className="teach-place"><input type="checkbox" checked={includePerformance} disabled={Boolean(making) || !includeLipSync}
              onChange={(event) => choosePresenter({ cameraMotion: event.target.checked ? "on" : "off" })} /><span>{tr("带上我录课时的表情和转头")}</span></label>}
            {cameraTakes.length > 0 && <p className="academy-muted">{includeLipSync
              ? tr("{{v0}} 张卡片录了摄像头动作。课里只放表情和头部动作的数字，按配音重新对齐；不会放你的画面或声音。", { v0: cameraTakes.length })
              : tr("要带上表情和转头，请先勾选保存基础嘴型。")}</p>}
            {making ? (
              <p role="status">{making.total ? tr("正在为第 {{v0}} 张卡片做声音（共 {{v1}} 张）…", { v0: Math.min(making.done + 1, making.total), v1: making.total }) : tr("正在保存…")}</p>
            ) : pack.status === "ready" && saved.status === "known" && saved.contentSha256 === pack.stored.contentSha256 ? (
              <>
                <p role="status">{tr("这节课已经保存在“我的课”里，只有你能看到。声音已经做好，不联网也能播放。")}</p>
                <Link to="/teach/lessons" className="teach-secondary">{tr("去“我的课”")}</Link>
                <button type="button" className="teach-secondary" onClick={download}><Download size={16} aria-hidden="true" />{tr("下载课程包")}</button>
              </>
            ) : (
              <>
                <p className="academy-muted">{!checked ? tr("先在编辑页“检查我的课”，没有要改的地方后就能保存。")
                  : privateTitles.length ? tr("题目或卡片标题里有个人信息（“{{v0}}”），先回去改掉。", { v0: privateTitles[0]!.quote })
                    : pack.status === "ready" ? tr("声音已经做好了，保存到“我的课”就完成了。")
                      : audio !== "on" ? tr("保存这节课需要连接语音合成，用来给每张卡片做声音。")
                        : pack.status === "outdated" ? tr("课改过了，保存时会重新做一遍声音。") : tr("会用你选的声音把每张卡片讲一遍，再保存到“我的课”，以后不联网也能播放。")}</p>
                <button type="button" className="teach-primary" disabled={!checked || privateTitles.length > 0 || (pack.status !== "ready" && (audio !== "on" || !voiceAvailable))} onClick={() => void saveLesson()}>
                  <PackageCheck size={16} aria-hidden="true" />{tr("保存到我的课")}
                </button>
                {pack.status === "ready" && <button type="button" className="teach-secondary" onClick={download}><Download size={16} aria-hidden="true" />{tr("下载课程包")}</button>}
              </>
            )}
            {makeFailed && <p role="alert">{makeFailed}</p>}
          </section>
          {audio === "unavailable" && !packaged && <p role="status" className="teach-notice">{tr("还没有连接语音合成，课会只显示字幕。可以在设置的 API Keys 里连接。")}</p>}
          {!packaged && audio !== "checking" && !voiceAvailable && <p role="status" className="teach-notice">{tr("之前选择的声音在当前语音服务中不可用。请重新选择声音，或明确选择“使用设置中的声音”。")}</p>}
          {narration.error && <p role="status" className="teach-notice">{narration.error}</p>}
        </>
      )}
    </main>
  );
}

/** An avatar's portrait, cropped to the face, or a placeholder with its initial if it cannot load. */
export function AvatarPicture({ avatar, size }: { avatar: PresenterAvatar; size: number }) {
  const [missing, setMissing] = useState<string | null>(null);
  if (missing === avatar.id) {
    return <span className="teach-avatar-placeholder" aria-hidden="true" style={{ width: size, height: size, background: avatar.color }}>{avatar.name().slice(0, 1)}</span>;
  }
  return <span className="teach-avatar" style={{ width: size, height: size, background: avatar.color }}>
    <img src={avatarArtUrl(avatar)} alt="" width={size} height={size} onError={() => setMissing(avatar.id)} />
  </span>;
}
