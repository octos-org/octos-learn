import { Check, Loader2, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ServiceError, synthesizeTeacherSample } from "@/byok/providers";
import { prepareClientServices } from "@/byok/services";
import { useTeacherSkin } from "@/hooks/use-teacher-skin";

import { TeacherCard } from "./teacher-card";
import { TEACHER_LORE } from "./teacher-lore";
import { TEACHERS, useSelectedTeacher, type TeacherDefinition } from "./teachers";
import "./teacher-roster.css";

/** One quote being read aloud, keyed by teacher and quote. */
type VoiceState = { teacher: TeacherDefinition["id"]; quote: number; state: "loading" | "playing" } | { teacher: TeacherDefinition["id"]; quote: number; state: "error"; message: string } | null;

/** The academy's teachers, one row each: their card, a short portrait and
 * their words, each of which can be heard in the teacher's voice. Choosing one
 * sets who teaches the next lesson. */
export function TeacherRoster() {
  const { teacher: current, setTeacherId } = useSelectedTeacher();
  const { setSkin } = useTeacherSkin();
  const [voice, setVoice] = useState<VoiceState>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  useEffect(() => () => {
    audio.current?.pause();
    for (const url of cache.current.values()) URL.revokeObjectURL(url);
  }, []);

  // A quote is spoken with the learner's own speech service, in the
  // teacher's voice; each quote is synthesized once per visit. Saved services
  // load with the whiteboard or the voice settings, so a learner who comes
  // here first loads them now.
  const listen = async (teacher: TeacherDefinition, quote: number) => {
    audio.current?.pause();
    if (voice?.teacher === teacher.id && voice.quote === quote && voice.state === "playing") { setVoice(null); return; }
    setVoice({ teacher: teacher.id, quote, state: "loading" });
    const key = `${teacher.id}:${quote}`;
    try {
      let url = cache.current.get(key);
      if (!url) {
        await prepareClientServices().catch(() => undefined);
        url = URL.createObjectURL(await synthesizeTeacherSample(TEACHER_LORE[teacher.id].quotes[quote], teacher.voices));
        cache.current.set(key, url);
      }
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => setVoice((current) => current?.teacher === teacher.id && current.quote === quote ? null : current);
      await player.play();
      setVoice({ teacher: teacher.id, quote, state: "playing" });
    } catch (error) {
      const message = error instanceof ServiceError && error.state === "unconfigured"
        ? "在“设置”里配置自己的语音服务后，就能听到老师的声音。"
        : "暂时播放不了老师的声音，请稍后再试。";
      setVoice({ teacher: teacher.id, quote, state: "error", message });
    }
  };

  return (
    <div className="teacher-roster">
      {TEACHERS.map((teacher) => {
        const lore = TEACHER_LORE[teacher.id];
        const chosen = current.id === teacher.id;
        const mine = voice?.teacher === teacher.id ? voice : null;
        return (
          <article key={teacher.id} className="teacher-roster-row" data-chosen={chosen || undefined} aria-labelledby={`teacher-${teacher.id}-name`}>
            <div className="teacher-roster-card"><TeacherCard teacherId={teacher.id} /></div>
            <div className="teacher-roster-body">
              <p className="teacher-roster-post">{lore.post}</p>
              <h2 id={`teacher-${teacher.id}-name`}>{teacher.name}</h2>
              <div className="teacher-roster-profile">{lore.profile.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
              <div className="teacher-roster-actions">
                <button type="button" className={chosen ? "teacher-roster-chosen" : "teacher-roster-choose"} aria-pressed={chosen}
                  data-testid={`teacher-${teacher.id}`} onClick={() => { setTeacherId(teacher.id); setSkin(teacher.skin); }}>
                  {chosen ? <><Check size={17} aria-hidden="true" /> 正在陪你上课</> : `请${teacher.name}上课`}
                </button>
              </div>
              <ul className="teacher-roster-quotes" aria-label={`${teacher.name}的话`}>
                {lore.quotes.map((quote, index) => {
                  const state = mine?.quote === index ? mine.state : null;
                  return (
                    <li key={quote}>
                      <span>{quote}</span>
                      <button type="button" className="teacher-roster-listen" data-state={state ?? undefined}
                        aria-label={state === "playing" ? `停止播放：${quote}` : `听${teacher.name}说：${quote}`}
                        onClick={() => void listen(teacher, index)} disabled={state === "loading"}>
                        {state === "loading" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                          : state === "playing" ? <Square size={13} fill="currentColor" aria-hidden="true" />
                          : <Volume2 size={17} aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {mine?.state === "error" && <p className="teacher-roster-note" role="status">{mine.message}</p>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
