// Choosing who presents a learner's lesson: one of the app's characters, each
// with its own voice. The characters move while the picker is open; the one
// the learner picks says hello in its voice. Shown at lesson setup, in the
// studio and on the watch page.

import { Check, Volume2 } from "lucide-react";
import { lazy, Suspense, useCallback, useState, type CSSProperties } from "react";

import { tr } from "@/i18n";
import type { FaceFrame } from "../avatar/face-frame";
import type { Presenter } from "./recording";
import { avatarArtUrl, PRESENTER_AVATARS, presenterAvatar, type PresenterAvatar } from "./presenters";
import { usePresenterGreeting, type PresenterGreeting } from "./use-presenter-greeting";

const IllustratedAvatarStage = lazy(() => import("../avatar/illustrated-avatar-stage").then((module) => ({ default: module.IllustratedAvatarStage })));

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

/** The character choices. Picking one (or picking it again) plays one of its greetings. */
export function PresenterPicker({ presenter, onChoose, compact, note }: {
  presenter: Presenter | undefined;
  onChoose: (presenter: Presenter) => void;
  /** Narrow layout for the studio's side panel. */
  compact?: boolean;
  /** Shown under the greeting, e.g. that the lesson will use the settings voice. */
  note?: string | null;
}) {
  const chosen = presenterAvatar(presenter?.avatar);
  const greeting = usePresenterGreeting();
  const speaking = greeting.current;
  const pick = (avatar: PresenterAvatar) => {
    if (avatar.id !== chosen.id) onChoose({ avatar: avatar.id });
    greeting.greet(avatar.id);
  };
  const speaker = speaking ? presenterAvatar(speaking.avatar) : null;
  return (
    <section className="teach-presenter" data-compact={compact || undefined} aria-label={tr("谁来讲你的课")}>
      <div className="teach-presenter-cast" role="radiogroup" aria-label={tr("形象")}>
        {PRESENTER_AVATARS.map((avatar) => {
          const selected = avatar.id === chosen.id;
          const greetingHere = speaking?.avatar === avatar.id ? speaking : null;
          return (
            <button key={avatar.id} type="button" role="radio" aria-checked={selected} className="teach-presenter-card"
              data-greeting={greetingHere ? greetingHere.id : undefined} style={{ "--presenter-color": avatar.color } as CSSProperties}
              aria-label={tr("{{v0}}，{{v1}}", { v0: avatar.name(), v1: avatar.manner() })}
              onClick={(event) => { hop(event.currentTarget); pick(avatar); }}>
              <span className="teach-presenter-stage">
                <PresenterStage avatar={avatar} chosen={selected} greeting={greetingHere} frame={greeting.frame} />
              </span>
              <span className="teach-presenter-name">{avatar.name()}</span>
              {!compact && <span className="teach-presenter-manner">{avatar.manner()}</span>}
              {selected && <span className="teach-presenter-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
      <div className="teach-presenter-greeting" aria-live="polite" data-active={speaking ? true : undefined}>
        {speaking && speaker ? (
          <>
            <AvatarPicture avatar={speaker} size={compact ? 28 : 36} />
            <p><span className="teach-visually-hidden">{tr("{{v0}}说：", { v0: speaker.name() })}</span>{speaking.text}</p>
            {speaking.state === "playing" && <Volume2 size={16} className="teach-presenter-sound" aria-hidden="true" />}
          </>
        ) : (
          <p className="academy-muted">{tr("每个形象都有自己的声音。点一个，听听它怎么打招呼。")}</p>
        )}
      </div>
      {note && <p className="academy-muted teach-presenter-note">{note}</p>}
    </section>
  );
}

/** A small hop of the picked card, unless the learner prefers less motion. */
function hop(element: HTMLElement) {
  if (typeof element.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  element.animate([{ transform: "translateY(0)" }, { transform: "translateY(-8px)", offset: 0.35 }, { transform: "translateY(0)", offset: 0.7 }, { transform: "translateY(-2px)", offset: 0.85 }, { transform: "translateY(0)" }],
    { duration: 520, easing: "ease-out" });
}

/** The character, moving on its own and greeting when it is the one speaking; its portrait until the animation is ready. */
function PresenterStage({ avatar, chosen, greeting, frame }: { avatar: PresenterAvatar; chosen: boolean; greeting: PresenterGreeting | null; frame: (avatar: string, now: number, chosen: boolean) => FaceFrame }) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const draw = useCallback((now: number) => frame(avatar.id, now, chosen || Boolean(greeting)), [frame, avatar.id, chosen, greeting]);
  return (
    <>
      <img className="teach-presenter-still" src={avatarArtUrl(avatar)} alt="" aria-hidden="true" />
      {!failed && (
        <Suspense fallback={null}>
          <IllustratedAvatarStage characterId={avatar.id} frame={draw} active={Boolean(greeting)} idleMotion transparentBackground fpsLimit={30} onError={onError} />
        </Suspense>
      )}
    </>
  );
}
