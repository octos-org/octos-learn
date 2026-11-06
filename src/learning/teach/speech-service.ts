// The learner's own speech service, as the presenter choices need it.

import { useEffect, useState } from "react";

import { availableService, speechResource } from "@/byok/providers";
import { getService, prepareClientServices } from "@/byok/services";
import type { Presenter } from "./recording";
import { presenterVoices } from "./presenters";

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

/** The voice a presenter names, while the speech service still offers it. */
export function chosenPresenterVoice(presenter: Presenter | undefined, resource: string | undefined) {
  return presenterVoices(resource).find((voice) => voice.id === presenter?.voice);
}
