import { Check, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ServiceError, synthesizeTeacherSample } from "@/byok/providers";
import { prepareClientServices } from "@/byok/services";
import { useTeacherSkin } from "@/hooks/use-teacher-skin";

import { TeacherCard } from "./teacher-card";
import { TEACHER_LORE } from "./teacher-lore";
import { TEACHERS, useSelectedTeacher, type TeacherDefinition } from "./teachers";
import "./teacher-roster.css";

type VoiceState = { teacher: TeacherDefinition["id"]; state: "loading" | "playing" } | { teacher: TeacherDefinition["id"]; state: "error"; message: string } | null;

/** The academy's teachers, one row each: their card, a short portrait, their
 * words and their voice. Choosing one sets who teaches the next lesson. */
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

  // The line is spoken with the learner's own speech service, in the
  // teacher's voice; each teacher's line is synthesized once per visit.
  // Saved services load with the whiteboard or the voice settings, so a
  // learner who comes here first loads them now.
  const listen = async (teacher: TeacherDefinition) => {
    audio.current?.pause();
    if (voice?.teacher === teacher.id && voice.state === "playing") { setVoice(null); return; }
    setVoice({ teacher: teacher.id, state: "loading" });
    try {
      let url = cache.current.get(teacher.id);
      if (!url) {
        await prepareClientServices().catch(() => undefined);
        url = URL.createObjectURL(await synthesizeTeacherSample(TEACHER_LORE[teacher.id].voiceLine, teacher.voices));
        cache.current.set(teacher.id, url);
      }
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => setVoice(null);
      await player.play();
      setVoice({ teacher: teacher.id, state: "playing" });
    } catch (error) {
      const message = error instanceof ServiceError && error.state === "unconfigured"
        ? "在“设置”里配置自己的语音服务后，就能听到老师的声音。"
        : "暂时播放不了老师的声音，请稍后再试。";
      setVoice({ teacher: teacher.id, state: "error", message });
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
                <button type="button" className="teacher-roster-voice" onClick={() => void listen(teacher)} disabled={mine?.state === "loading"}>
                  <Volume2 size={17} aria-hidden="true" />
                  {mine?.state === "loading" ? "正在准备…" : mine?.state === "playing" ? "停止" : "听听我的声音"}
                </button>
              </div>
              {mine?.state === "error" && <p className="teacher-roster-note" role="status">{mine.message}</p>}
              <ul className="teacher-roster-quotes" aria-label={`${teacher.name}的话`}>
                {lore.quotes.map((quote) => <li key={quote}>{quote}</li>)}
              </ul>
            </div>
          </article>
        );
      })}
    </div>
  );
}
