// Choosing who presents a learner's lesson: one of the app's characters and
// one of the catalog voices for the learner's speech service. Shown in the
// studio before recording and on the watch page.

import { Loader2, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ServiceError, synthesizeTeacherSample } from "@/byok/providers";
import { tr } from "@/i18n";
import type { Presenter } from "./recording";
import { avatarArtUrl, PRESENTER_AVATARS, presenterAvatar, presenterVoices, type PresenterAvatar } from "./presenters";
import { chosenPresenterVoice, type SpeechAudio } from "./speech-service";

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

type Sample = { voice: string; state: "loading" | "playing" } | { voice: string; state: "error"; message: string } | null;

/** The character and voice choices; each voice can be heard before choosing it. */
export function PresenterPicker({ presenter, resource, audio, onChoose, onDone, compact }: {
  presenter: Presenter | undefined;
  resource: string | undefined;
  audio: SpeechAudio;
  onChoose: (presenter: Presenter) => void;
  onDone?: () => void;
  /** Narrow layout for the studio's side panel. */
  compact?: boolean;
}) {
  const avatar = presenterAvatar(presenter?.avatar);
  const voices = presenterVoices(resource);
  const chosen = chosenPresenterVoice(presenter, resource);
  const [sample, setSample] = useState<Sample>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const work = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, string>());
  useEffect(() => () => {
    work.current?.abort();
    player.current?.pause();
    for (const url of cache.current.values()) URL.revokeObjectURL(url);
  }, []);

  const listen = async (voiceId: string) => {
    work.current?.abort();
    player.current?.pause();
    if (sample?.voice === voiceId && sample.state !== "error") { setSample(null); return; }
    const controller = new AbortController();
    work.current = controller;
    setSample({ voice: voiceId, state: "loading" });
    try {
      let url = cache.current.get(voiceId);
      if (!url) {
        const blob = await synthesizeTeacherSample(tr("你好！这节课由我来讲。"), resource ? { [resource.trim()]: { id: voiceId } } : {}, controller.signal);
        url = URL.createObjectURL(blob);
        cache.current.set(voiceId, url);
      }
      if (controller.signal.aborted) return;
      const audioElement = new Audio(url);
      player.current = audioElement;
      audioElement.onended = () => setSample((current) => (current?.voice === voiceId ? null : current));
      await audioElement.play();
      if (!controller.signal.aborted) setSample({ voice: voiceId, state: "playing" });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof ServiceError && error.state === "unconfigured"
        ? tr("在“设置”里连接语音服务后，就能试听声音。")
        : tr("暂时试听不了这个声音，请稍后再试。");
      setSample({ voice: voiceId, state: "error", message });
    }
  };

  return (
    <section className="teach-presenter" data-compact={compact || undefined} aria-label={tr("谁来讲你的课")}>
      <fieldset>
        <legend className="teach-group-label">{tr("形象")}</legend>
        <div className="teach-presenter-avatars">
          {PRESENTER_AVATARS.map((option) => (
            <button key={option.id} type="button" aria-pressed={option.id === avatar.id} onClick={() => onChoose({ avatar: option.id })}>
              <AvatarPicture avatar={option} size={compact ? 48 : 56} />{option.name()}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="teach-group-label">{tr("声音")}</legend>
        <button type="button" className="teach-secondary" aria-pressed={!presenter?.voice} onClick={() => onChoose({ voice: "" })}>{tr("使用设置中的声音")}</button>
        {audio === "checking" ? null : voices.length ? (
          <div className="teach-presenter-voices">
            {voices.map((voice) => {
              const mine = sample?.voice === voice.id ? sample : null;
              return (
                <div key={voice.id} className="teach-presenter-voice">
                  <label className="teach-place">
                    <input type="radio" name="teach-voice" checked={voice.id === chosen?.id} onChange={() => onChoose({ voice: voice.id })} />
                    <span>{voice.name()}</span>
                  </label>
                  <button type="button" className="teach-icon-button" disabled={audio !== "on"}
                    aria-label={mine?.state === "playing" ? tr("停止试听") : tr("试听{{v0}}", { v0: voice.name() })}
                    title={mine?.state === "playing" ? tr("停止试听") : tr("试听{{v0}}", { v0: voice.name() })}
                    onClick={() => void listen(voice.id)}>
                    {mine?.state === "loading" ? <Loader2 size={16} className="teach-spin" aria-hidden="true" />
                      : mine?.state === "playing" ? <Square size={14} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="academy-muted">{tr("你的语音服务还没有可以选的声音，课会用设置里保存的声音。")}</p>
        )}
        {sample?.state === "error" && <p role="status" className="teach-notice">{sample.message}</p>}
      </fieldset>
      {onDone && <button type="button" className="teach-primary" onClick={onDone}>{tr("好了")}</button>}
    </section>
  );
}
