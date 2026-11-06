// "Watch my lesson": the learner's recorded lesson played the way viewers will
// see it, through the course player, narrated in a synthetic voice with the
// learner's words as captions. Nothing is sent anywhere but speech synthesis.

import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { Check, Download, PackageCheck, Pause, Play, RotateCcw, UserRound, UserRoundX, Volume2, VolumeX, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { normalizeAuthoringLesson, type CanonicalEvent } from "octos-lesson-language";

import { getSelectedProfileId, getToken } from "@/api/client";
import type { LessonVoices } from "@/byok/providers";

import { AcademyHeader } from "../academy/academy-header";
import { holdAwards } from "../academy/award-events";
import { openHistoryApi } from "../history/history-api";
import { LearningWhiteboard } from "../oll/oll-lesson-runtime";
import { useOllLessonRuntime, type OllLessonTopicDefinition } from "../oll/use-oll-lesson-runtime";
import { useOllNarrationTts } from "../oll/use-oll-narration-tts";
import { compileRecording, type CompiledLesson } from "./compile-recording";
import { syncLessonDrafts } from "./draft-sync";
import { listLessons, saveLessonPackage } from "./learner-lessons-api";
import { LEARNER_PACKAGE_EXTENSION, lessonNarration, readLearnerPackage, type LoadedLearnerPackage } from "./learner-package";
import { readStoredLearnerPackage, writeStoredLearnerPackage, type StoredLearnerPackage } from "./learner-package-store";
import { cardChecks, lessonReady } from "./lesson-check";
import { makeLearnerPackage, type CardPerformances } from "./make-learner-package";
import { findPersonalDetails } from "./privacy";
import { inkSnapshotResolver, loadInkSnapshots } from "./ink-snapshot-store";
import { keptTake, setPresenter, type Presenter } from "./recording";
import { readTakePerformance } from "./take-performance-store";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { useLiveNarrationAvatar } from "./live-narration-avatar";
import { effectiveLesson } from "./oll-override";
import { LessonContents, lessonContents } from "./lesson-contents";
import { presenterAvatar, presenterOfReference } from "./presenters";
import { AvatarPicture, PresenterPicker } from "./presenter-picker";
import { presenterLessonVoices, presenterVoiceNote, useSpeechService } from "./speech-service";
import { learnerAuthor } from "./studio-helpers";
import { unlockAudio, type AudioPlaybackClock } from "@/home/voice/audio-playback";
import { cardIndexOfBeat, lessonCards } from "./lesson-cards";
import { WatchSequence } from "./watch-sequence";
import { learnerLessonTopic } from "./teaching-board-setup";
import "./teach.css";

const LessonAvatarPreview = lazy(() => import("../avatar/lesson-avatar-preview"));

/**
 * The stored camera performance of each camera take, by narration beat: each
 * of the card's beats gets the movement made while its sentences were said.
 * A take whose movement is missing on this device (for example a draft
 * recorded on another device) is presented with mouth motion only.
 */
async function cardPerformances(profileId: string, recordingId: string, takes: Array<{ cardKey: string; take: number; speechSpanMs?: [number, number] }>,
  events: CanonicalEvent[], beatSpeech: CompiledLesson["beatSpeech"]): Promise<CardPerformances> {
  const beats = lessonNarration(events);
  const found: CardPerformances = {};
  for (const take of takes) {
    const spoken = beats.flatMap((line) => {
      const key = line.beatId.slice(line.beatId.lastIndexOf(":beat:") + ":beat:".length);
      // A hand-edited lesson in the older shape names the beat after its card.
      if (key === take.cardKey) return [{ beatId: line.beatId, speechSpanMs: take.speechSpanMs }];
      const speech = beatSpeech?.[key];
      return speech?.card === take.cardKey ? [{ beatId: line.beatId, speechSpanMs: speech.speechSpanMs ?? take.speechSpanMs }] : [];
    });
    if (!spoken.length) continue;
    const track = await readTakePerformance({ profileId, recordingId, cardKey: take.cardKey, take: take.take }).catch(() => null);
    if (!track) continue;
    for (const { beatId, speechSpanMs } of spoken) found[beatId] = { track, ...(speechSpanMs ? { speechSpanMs } : {}) };
  }
  return found;
}

/** A short, stable fingerprint of the lesson, so a changed lesson starts again from the top. */
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}


/** What "My lessons" holds for this lesson: the saved version's content hash, or nothing yet. */
type Saved = { status: "checking" | "unreachable" } | { status: "known"; contentSha256: string | null };

type PackState =
  | { status: "loading" | "none" | "outdated" }
  | { status: "ready"; stored: StoredLearnerPackage; loaded: LoadedLearnerPackage };

export function TeachWatchPage() {
  useLocale();
  const { id } = useParams();
  // The beat to start from, when the studio opened the lesson at a sentence.
  const [searchParams] = useSearchParams();
  const [startBeat, setStartBeat] = useState(() => searchParams.get("from"));
  const profileId = getSelectedProfileId() ?? "local";
  const [recording, setRecording] = useState(() => loadRecordingDrafts(localStorage, profileId).find((draft) => draft.id === id));
  const makeWork = useRef<AbortController | null>(null);
  const [making, setMaking] = useState<{ done: number; total: number } | null>(null);
  const [makeFailed, setMakeFailed] = useState<string | null>(null);
  // The moving presenter shows by default; the learner can hide it.
  const [showAvatar, setShowAvatar] = useState(true);
  const [mediaClock, setMediaClock] = useState<{ beatId: string; clock: AudioPlaybackClock; packageHash: string } | null>(null);
  const choosePresenter = (presenter: Presenter) => {
    if (!recording) return;
    makeWork.current?.abort(); makeWork.current = null; setMaking(null); setMakeFailed(null);
    const next = setPresenter(recording, presenter, new Date().toISOString());
    saveRecordingDraft(localStorage, profileId, next);
    setRecording(next);
  };
  const [choosing, setChoosing] = useState(false);
  const [snapshots] = useState(() => loadInkSnapshots(localStorage, profileId));
  const resolveAsset = useMemo(() => inkSnapshotResolver(snapshots), [snapshots]);

  const lesson = useMemo(() => {
    // The cards recorded so far can be watched before the rest are recorded.
    if (!recording || !recording.cards.some((entry) => keptTake(entry))) return null;
    try {
      // The learner's hand-edited OLL (advanced mode) while it is current, else the lesson made from the recording.
      const { compiled, override } = effectiveLesson(recording, compileRecording(recording, { author: learnerAuthor(profileId, recording.presenter), language: getLocale() }));
      const events = normalizeAuthoringLesson(compiled.lesson, {
        lessonId: `learner-${recording.id}`, boardId: `learner-${recording.id}-board`, baseRevision: 0, resourceContext: compiled.resourceContext,
      });
      const source = events.map((event) => JSON.stringify(event)).join("\n");
      const topics: OllLessonTopicDefinition[] = [learnerLessonTopic(events, recording.topic.text, compiled.lesson.lesson.language)];
      return { compiled, override, events, source, topics, language: compiled.lesson.lesson.language, cards: lessonCards(events) };
    } catch {
      return null;
    }
  }, [recording, profileId]);

  // Narration needs the learner's own speech service; without it the lesson plays at reading pace with captions.
  const { audio, resource } = useSpeechService();
  const [sound, setSound] = useState(true);
  // A chosen voice must still be offered; using the account voice is an explicit choice.
  // The character narrates in its own voice; a speech resource without one uses the saved settings voice.
  const voices = useMemo<LessonVoices | null>(() => presenterLessonVoices(recording?.presenter?.avatar, resource), [recording?.presenter?.avatar, resource]);
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
    if (!recording || !lesson) return;
    setMakeFailed(null);
    setMaking({ done: 0, total: 0 });
    makeWork.current?.abort(); const controller = new AbortController(); makeWork.current = controller;
    try {
      let stored = pack.status === "ready" ? pack.stored : undefined;
      if (!stored) {
        const performances = includePerformance ? await cardPerformances(profileId, recording.id, cameraTakes, lesson.events, lesson.compiled.beatSpeech) : undefined;
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
  const narrated = (Boolean(packaged) || (audio === "on")) && sound;

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
  // Before the lesson is saved, its narration is made while it plays, and the presenter follows it the same way.
  const livePerformances = useCallback(async (): Promise<CardPerformances> => (recording && lesson && recording.presenter?.cameraMotion === "on" && cameraTakes.length
    ? cardPerformances(profileId, recording.id, cameraTakes, lesson.events, lesson.compiled.beatSpeech) : {}), [recording, lesson, cameraTakes, profileId]);
  const live = useLiveNarrationAvatar({
    enabled: showAvatar && !packaged && pack.status !== "loading" && audio === "on" && sound,
    events: lesson?.events ?? null, voices, language: lesson?.language, performances: livePerformances,
  });
  const liveAvatar = Boolean(live.resolveAudio);
  const mouthTrack = useMemo(() => packaged && narrationBeatId
    ? packaged.mouthTrack(narrationBeatId, narrationText) : live.mouthTrack(narrationBeatId, narrationText), [packaged, narrationBeatId, narrationText, live]);
  const performanceTrack = useMemo(() => packaged && narrationBeatId
    ? packaged.performanceTrack(narrationBeatId, narrationText) : live.performanceTrack(narrationBeatId, narrationText), [packaged, narrationBeatId, narrationText, live]);
  const hasMouthTracks = Boolean(packaged?.manifest.lipSync?.length) || liveAvatar;
  // Whether the moving presenter can show at all: a saved package with mouth motion, or a voice to make narration with.
  const avatarPossible = Boolean(packaged?.manifest.lipSync?.length) || (!packaged && audio === "on" && sound);
  const playing = Boolean(runtime?.playing);
  useEffect(() => {
    holdAwards("teach-watch", playing);
    return () => holdAwards("teach-watch", false);
  }, [playing]);
  // The save panel closes on Escape and on a press outside it.
  const [saveOpen, setSaveOpen] = useState(false);
  const saveMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!saveOpen) return;
    const press = (event: PointerEvent) => { if (!saveMenu.current?.contains(event.target as Node)) setSaveOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setSaveOpen(false); };
    document.addEventListener("pointerdown", press);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", press); document.removeEventListener("keydown", key); };
  }, [saveOpen]);
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
    ...(packaged ? { resolveAudio: resolvePackagedAudio } : live.resolveAudio ? { resolveAudio: live.resolveAudio } : {}),
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

  // Cards not recorded yet are left out of what plays.
  const unrecorded = recording.cards.filter((entry) => !keptTake(entry)).length;
  const isSaved = pack.status === "ready" && saved.status === "known" && saved.contentSha256 === pack.stored.contentSha256;
  const canSave = unrecorded === 0 && checked && !privateTitles.length && (pack.status === "ready" || (audio === "on"));
  const contents = lesson ? lessonContents(lesson.events, (key) => recording?.cards.find((candidate) => candidate.key === key)?.title) : [];
  const card = !runtime ? 0 : runtime.completed ? lesson?.cards.length ?? 0 : Math.min(lesson?.cards.length ?? 0, cardIndexOfBeat(lesson?.cards ?? [], runtime.currentBeatId) + 1);
  return (
    <main className="teach-page teach-studio teach-watch">
      <header className="teach-studio-head">
        <Link to={`/teach/${recording.id}`} className="teach-back">{tr("← 回去改课")}</Link>
        <h1>{recording.topic.text}</h1>
        {lesson && <span className="teach-group-label">{tr("第 {{v0}} 张，共 {{v1}} 张", { v0: Math.max(1, card), v1: lesson.cards.length })}</span>}
        {lesson && unrecorded > 0 && <span className="teach-watch-chip" title={tr("还有 {{v0}} 张卡片没录，现在先看录好的 {{v1}} 张。全部录完、检查通过后就能保存。", { v0: unrecorded, v1: lesson.cards.length })}>
          {tr("还有 {{v0}} 张没录", { v0: unrecorded })}</span>}
        {lesson && (
          <div className="teach-save" ref={saveMenu}>
            <button type="button" className={canSave && !isSaved ? "teach-primary" : "teach-secondary"} aria-expanded={saveOpen} aria-haspopup="dialog" onClick={() => setSaveOpen(!saveOpen)}>
              {isSaved ? <Check size={16} aria-hidden="true" /> : <PackageCheck size={16} aria-hidden="true" />}
              {making ? (making.total ? tr("正在保存 {{v0}}/{{v1}}", { v0: Math.min(making.done + 1, making.total), v1: making.total }) : tr("正在保存…"))
                : isSaved ? tr("已保存") : tr("保存这节课")}
            </button>
            {saveOpen && (
              <section className="teach-save-panel" role="dialog" aria-label={tr("保存这节课")}>
                <header>
                  <h2>{tr("保存这节课")}</h2>
                  <button type="button" className="teach-icon-button" aria-label={tr("关闭")} onClick={() => setSaveOpen(false)}><X size={18} aria-hidden="true" /></button>
                </header>
                {making ? (
                  <p role="status">{making.total ? tr("正在为第 {{v0}} 张卡片做声音（共 {{v1}} 张）…", { v0: Math.min(making.done + 1, making.total), v1: making.total }) : tr("正在保存…")}</p>
                ) : isSaved ? (
                  <p role="status">{tr("这节课已经保存在“我的课”里，只有你能看到。声音已经做好，不联网也能播放。")}</p>
                ) : (
                  <p className="teach-save-status" data-blocked={!canSave || undefined}>{unrecorded > 0 ? tr("全部卡片录完、检查通过后就能保存。")
                    : !checked ? tr("先在编辑页“检查我的课”，没有要改的地方后就能保存。")
                    : privateTitles.length ? tr("题目或卡片标题里有个人信息（“{{v0}}”），先回去改掉。", { v0: privateTitles[0]!.quote })
                      : pack.status === "ready" ? tr("声音已经做好了，保存到“我的课”就完成了。")
                        : audio !== "on" ? tr("保存这节课需要连接语音合成，用来给每张卡片做声音。")
                          : pack.status === "outdated" ? tr("课改过了，保存时会重新做一遍声音。") : tr("会用你选的声音把每张卡片讲一遍，再保存到“我的课”，以后不联网也能播放。")}</p>
                )}
                {makeFailed && <p role="alert">{makeFailed}</p>}
                <fieldset className="teach-save-options">
                  <legend className="teach-group-label">{tr("课里一起保存")}</legend>
                  <label className="teach-save-option"><input type="checkbox" checked={includeLipSync} disabled={Boolean(making)} onChange={(event) => choosePresenter({ mouthMotion: event.target.checked ? "basic" : "off" })} />
                    <span>{tr("保存基础嘴型（预览）")}{includeLipSync && <small>{tr("会随配音保存简单的嘴部动作，每张卡片的配音最多 60 秒。下载课包后，可在动态头像试验室逐卡试听；精细发音嘴型仍需后续完善。")}</small>}</span></label>
                  {cameraTakes.length > 0 && <label className="teach-save-option"><input type="checkbox" checked={includePerformance} disabled={Boolean(making) || !includeLipSync}
                    onChange={(event) => choosePresenter({ cameraMotion: event.target.checked ? "on" : "off" })} />
                    <span>{tr("带上我录课时的表情和转头")}<small>{includeLipSync
                      ? tr("{{v0}} 张卡片录了摄像头动作。课里只放表情和头部动作的数字，按配音重新对齐；不会放你的画面或声音。", { v0: cameraTakes.length })
                      : tr("要带上表情和转头，请先勾选保存基础嘴型。")}</small></span></label>}
                </fieldset>
                <div className="teach-save-actions">
                  {isSaved ? <Link to="/teach" className="teach-secondary">{tr("去“我的课”")}</Link> : (
                    <button type="button" className="teach-primary" disabled={!canSave || Boolean(making)} onClick={() => void saveLesson()}>
                      <PackageCheck size={16} aria-hidden="true" />{tr("保存到我的课")}
                    </button>
                  )}
                  {pack.status === "ready" && <button type="button" className="teach-secondary" onClick={download}><Download size={16} aria-hidden="true" />{tr("下载课程包")}</button>}
                </div>
              </section>
            )}
          </div>
        )}
      </header>
      {!lesson ? (
        <p role="alert" className="teach-notice">{tr("还没有录好的卡片，录好第一张就能看了。")}</p>
      ) : (
        <>
          {choosing && (
            <div className="teach-presenter-panel">
              <PresenterPicker presenter={recording.presenter} onChoose={choosePresenter} note={presenterVoiceNote(audio, resource)} />
              <button type="button" className="teach-primary" onClick={() => setChoosing(false)}>{tr("好了")}</button>
            </div>
          )}
          <div className="teach-watch-layout">
            <section className="teach-watch-stage" aria-label={tr("你的课")}>
              <LearningWhiteboard embedded runtime={runtime} resolveAsset={packaged?.resolveAsset ?? resolveAsset}
                overlay={showAvatar && hasMouthTracks ? <Suspense fallback={null}><LessonAvatarPreview placement="board"
                  characterId={packaged ? presenterOfReference(packaged.manifest.author.avatar_ref).id : avatar.id} track={mouthTrack} performance={performanceTrack} clock={mediaClock && mediaClock.beatId === narrationBeatId && mediaClock.packageHash === (packaged?.manifest.contentSha256 ?? "") ? mediaClock.clock : null}
                  playing={speaking && narrated} preparing={narration.preparing}
                /></Suspense> : null} />
            </section>
          </div>
          <LessonContents runtime={runtime} entries={contents} onJump={() => { if (narrated) unlockAudio(); }} />
          <div className="teach-watch-bar">
            <button type="button" className="teach-presenter-button" aria-label={tr("换一个形象")} onClick={() => setChoosing(!choosing)}>
              <AvatarPicture avatar={avatar} size={44} />
            </button>
            <button type="button" className="teach-primary" disabled={!runtime || audio === "checking"}
              onClick={() => {
                if (narrated) unlockAudio();
                // Opened at a sentence from the studio: the first play starts there.
                const from = startBeat && lesson?.cards.flatMap((entry) => entry.beatIds).find((beatId) => beatId.endsWith(`:beat:${startBeat}`));
                if (from && runtime) { setStartBeat(null); runtime.playBeat(from); return; }
                if (runtime?.completed) runtime.restart(); else if (runtime?.playing) runtime.pause(); else runtime?.play();
              }}>
              {runtime?.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {runtime?.completed ? tr("再看一遍") : runtime?.playing ? tr("暂停播放") : tr("播放我的课")}
            </button>
            <button type="button" className="teach-icon-button" aria-label={tr("从头开始")} disabled={!runtime} onClick={() => runtime?.restart()}>
              <RotateCcw size={18} aria-hidden="true" />
            </button>
            {avatarPossible && (
              <button type="button" className="teach-icon-button" aria-pressed={showAvatar} aria-label={tr("显示动态头像预览")} title={tr("显示动态头像预览")} onClick={() => setShowAvatar(!showAvatar)}>
                {showAvatar ? <UserRound size={18} aria-hidden="true" /> : <UserRoundX size={18} aria-hidden="true" />}
              </button>
            )}
            {audio === "on" && (
              <button type="button" className="teach-icon-button" aria-pressed={!sound} aria-label={sound ? tr("关掉声音") : tr("打开声音")} onClick={() => setSound(!sound)}>
                {sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
              </button>
            )}
            <p className="teach-watch-caption" aria-live="polite">{runtime?.activeSpeech || (runtime?.completed ? tr("看完了！") : "")}</p>
          </div>
          {/* The playing card's words and actions, the current ones lit, to check the recording. */}
          <WatchSequence recording={recording} compiled={lesson.compiled} cards={lesson.cards} runtime={runtime} onJump={() => { if (narrated) unlockAudio(); }} />
          {audio === "unavailable" && !packaged && <p role="status" className="teach-notice">{tr("还没有连接语音合成，课会只显示字幕。可以在设置的 API Keys 里连接。")}</p>}
          {narration.error && <p role="status" className="teach-notice">{narration.error}</p>}
        </>
      )}
    </main>
  );
}

