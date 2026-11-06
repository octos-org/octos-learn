// The learner's own speech service, as the presenter choices need it.

import { useEffect, useState } from "react";

import { availableService, speechResource, type LessonVoices } from "@/byok/providers";
import { tr } from "@/i18n";
import { getService, prepareClientServices } from "@/byok/services";
import { presenterAvatar, presenterVoiceFor } from "./presenters";

export type SpeechAudio = "checking" | "on" | "unavailable";

/** Whether the learner's own speech service can narrate, and which voice catalog it offers. */
export function useSpeechService(): { audio: SpeechAudio; resource: string | undefined } {
  const [audio, setAudio] = useState<SpeechAudio>("checking");
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
  return { audio, resource };
}

/** The voices a lesson presented by this character is narrated with: its own voice for the learner's speech resource. */
export function presenterLessonVoices(avatarId: string | undefined, resource: string | undefined): LessonVoices | null {
  const voice = presenterVoiceFor(presenterAvatar(avatarId), resource);
  return voice && resource ? { [resource.trim()]: { id: voice } } : null;
}

/** What the picker should say about narration when the characters' own voices cannot be used. */
export function presenterVoiceNote(audio: SpeechAudio, resource: string | undefined): string | null {
  if (audio === "unavailable") return tr("还没有连接语音合成，课会只显示字幕。可以在设置的 API Keys 里连接。");
  if (audio === "on" && !presenterVoiceFor(presenterAvatar(undefined), resource)) return tr("你的语音服务里没有这些形象的声音，课会用设置里保存的声音来讲。");
  return null;
}
