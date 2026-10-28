import { X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";

import { ACHIEVEMENT_BY_ID, type AchievementDefinition } from "../../../services/learning-history/achievement-catalog.mjs";
import type { EarnedAchievement } from "../history/history-api";
import { awardLine, awardPresenter, readAwardTone } from "../map/award-line";
import { TeacherPortrait } from "../teachers/teacher-portrait";
import { ServiceError, synthesizeTeacherSample } from "@/byok/providers";
import { prepareClientServices } from "@/byok/services";
import { RARITY_NAME } from "./achievement-display";
import { runAwardParticles } from "./award-particles";
import { awardVoiceMuted } from "./award-events";
import { AWARD_TIERS, RARITY_RANK } from "./award-tiers";
import { Medal } from "./medal";
import "./award-ceremony.css";

const MORE_SHOWN = 6;

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** Rarest first; a titled award wins a tie. Ids the app does not know yet
 * are left out. */
function arrange(items: EarnedAchievement[]) {
  const known = items.flatMap((item) => {
    const definition = ACHIEVEMENT_BY_ID.get(item.achievement_id);
    return definition ? [{ item, definition }] : [];
  });
  return known.sort((a, b) => RARITY_RANK[b.definition.rarity] - RARITY_RANK[a.definition.rarity]
    || Number(Boolean(b.definition.title)) - Number(Boolean(a.definition.title)));
}
const awardKey = (item: EarnedAchievement) => `${item.achievement_id}:${item.scope}`;



function kicker(definition: AchievementDefinition, item: EarnedAchievement): string {
  const rarity = RARITY_NAME[definition.rarity];
  if (definition.hidden) return `发现隐藏成就 · ${rarity}`;
  if (definition.season && /^\d{4}$/.test(item.scope)) return `限时成就 · ${item.scope} · ${rarity}`;
  return `获得成就 · ${rarity}`;
}

/** A full-screen award ceremony that grows with rarity. The rarest award
 * leads; choosing another one earned at the same time puts it in front and
 * plays its arrival again. It stays until the learner closes it (the corner ✕
 * or Escape), then returns focus to where it was. */
export default function AwardCeremony({ items, onShown, onDone }: { items: EarnedAchievement[]; onShown?: () => void; onDone: () => void }) {
  const [awards] = useState(() => arrange(items));
  const [focus, setFocus] = useState(0);
  const lead = awards[focus];
  const rest = awards.filter((_, index) => index !== focus);
  const canvas = useRef<HTMLCanvasElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const medal = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // The chosen medal leaves the list and the one it replaces joins it; focus
  // moves to that one, so pressing it again goes back.
  const returning = useRef<string | null>(null);
  // The host's onDone always drops the batch at the head of its queue.
  const done = useRef(onDone);
  const reduced = reducedMotion();
  const rarity = lead?.definition.rarity ?? "b";
  const [tone] = useState(readAwardTone);
  const teacher = lead ? awardPresenter(lead.item, tone) : null;
  const line = lead ? awardLine(lead.item, tone) : "";
  const leadKey = lead ? awardKey(lead.item) : "";
  // One synthesis per award, shared by every play of it (and by a remounted
  // effect while the first request is still on its way).
  const voices = useRef(new Map<string, Promise<Blob>>());

  useEffect(() => {
    if (!lead) { done.current(); return; }
    onShown?.();
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") done.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
    // One ceremony per mount; the host remounts it for the next batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Each award brought to the front arrives with its own particles.
  useEffect(() => {
    if (reduced || !canvas.current) return;
    return runAwardParticles(canvas.current, rarity, medal.current);
  }, [focus, rarity, reduced]);
  // The presenting teacher reads the line aloud with the learner's own speech
  // service, once per award in front. No service or blocked audio: the line
  // stays on screen and nothing plays.
  useEffect(() => {
    if (!teacher || !line || awardVoiceMuted()) return;
    const controller = new AbortController();
    let stopped = false;
    let player: HTMLAudioElement | null = null;
    let src: string | null = null;
    void (async () => {
      try {
        let audio = voices.current.get(leadKey);
        if (!audio) {
          audio = prepareClientServices().catch(() => undefined)
            .then(() => synthesizeTeacherSample(line, teacher.voices, controller.signal));
          voices.current.set(leadKey, audio);
          audio.catch(() => voices.current.delete(leadKey));
        }
        const blob = await audio;
        if (stopped) return;
        src = URL.createObjectURL(blob);
        player = new Audio(src);
        await player.play();
      } catch (error) {
        if (!(error instanceof ServiceError) && !(error instanceof DOMException)) console.warn("award voice", error);
      }
    })();
    return () => {
      stopped = true;
      // A request still on its way is cancelled; switching quickly through the
      // medals does not pay for lines nobody hears.
      controller.abort();
      player?.pause();
      if (src) URL.revokeObjectURL(src);
    };
  }, [leadKey, line, teacher]);
  useEffect(() => {
    if (returning.current === null) return;
    [...list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []].find((button) => button.dataset.award === returning.current)?.focus();
    returning.current = null;
  }, [focus]);

  if (!lead) return null;
  const { item, definition } = lead;
  const tier = AWARD_TIERS[rarity];
  const style = { "--award-glow": tier.glow, "--award-ray": tier.ray } as CSSProperties;

  const choose = (key: string) => {
    const index = awards.findIndex(({ item: candidate }) => awardKey(candidate) === key);
    if (index < 0) return;
    returning.current = leadKey;
    setFocus(index);
  };
  return (
    <div className="award-ceremony" data-rarity={rarity} role="dialog" aria-modal="true" aria-labelledby="award-ceremony-name" style={style}>
      {/* Keyed by the award in front, so its arrival plays again when chosen. */}
      <Fragment key={leadKey}>
        {tier.level >= 3 && <div className="award-aurora" />}
        {tier.level >= 2 && <div className="award-pillar" />}
        <canvas ref={canvas} aria-hidden="true" />
        <div className="award-flash" />
        {tier.level >= 1 && <div className="award-flare" />}
      </Fragment>
      <div className="award-stage">
        <Fragment key={leadKey}>
          {tier.level >= 2 && <><div className="award-rays" /><div className="award-rays is-inner" /></>}
          <div className="award-halo" />
          <div className="award-shock" />
          {tier.level >= 1 && <div className="award-shock is-second" />}
          <div ref={medal} className="award-medal">
            <Medal achievement={definition} />
            {tier.level >= 1 && <div className="award-sheen" />}
          </div>
          <div className="award-kicker">{kicker(definition, item)}</div>
          <h2 id="award-ceremony-name" className="award-name">{definition.name}</h2>
          <p className="award-condition">{definition.condition}</p>
          {definition.title && <div className="award-banner">解锁称号 · {definition.title}</div>}
        </Fragment>
        {rest.length > 0 && (
          <div className="award-more">
            <span>同时获得 · 点一枚看看</span>
            <ul ref={list}>
              {rest.slice(0, MORE_SHOWN).map(({ item: other, definition: more }) => (
                <li key={awardKey(other)}>
                  <button type="button" data-rarity={more.rarity} data-award={awardKey(other)} onClick={() => choose(awardKey(other))} aria-label={`查看「${more.name}」`}>
                    <Medal achievement={more} />
                    <span>{more.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {rest.length > MORE_SHOWN && <span>还有 {rest.length - MORE_SHOWN} 枚，去成就页看看</span>}
          </div>
        )}
      </div>
      <div key={leadKey} className="award-presenter">
        <p className="award-bubble">{teacher && <b>{teacher.name}</b>}{line}</p>
        {teacher && (
          <span className="award-arch">
            <TeacherPortrait teacherId={teacher.id} pose="approving" frame="card" name={teacher.name} />
          </span>
        )}
      </div>
      <button ref={close} type="button" className="award-close" onClick={() => done.current()} aria-label="关闭"><X size={20} aria-hidden="true" /></button>
    </div>
  );
}
