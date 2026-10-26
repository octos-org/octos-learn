import { useEffect, useRef, type CSSProperties } from "react";

import { ACHIEVEMENT_BY_ID, type AchievementDefinition } from "../../../services/learning-history/achievement-catalog.mjs";
import type { EarnedAchievement } from "../history/history-api";
import { awardLine, readAwardTone } from "../map/award-line";
import { portraitAsset } from "../teachers/teacher-portrait-state";
import { getTeacher, isTeacherId } from "../teachers/teachers";
import { RARITY_NAME } from "./achievement-display";
import { runAwardParticles } from "./award-particles";
import { AWARD_TIERS, RARITY_RANK } from "./award-tiers";
import { Medal } from "./medal";
import "./award-ceremony.css";

const MORE_SHOWN = 6;

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** The rarest award leads; a titled one wins a tie. Ids the app does not know
 * yet are left out. */
function arrange(items: EarnedAchievement[]) {
  const known = items.flatMap((item) => {
    const definition = ACHIEVEMENT_BY_ID.get(item.achievement_id);
    return definition ? [{ item, definition }] : [];
  });
  known.sort((a, b) => RARITY_RANK[b.definition.rarity] - RARITY_RANK[a.definition.rarity]
    || Number(Boolean(b.definition.title)) - Number(Boolean(a.definition.title)));
  return { lead: known[0], rest: known.slice(1) };
}

function kicker(definition: AchievementDefinition, item: EarnedAchievement): string {
  const rarity = RARITY_NAME[definition.rarity];
  if (definition.hidden) return `发现隐藏成就 · ${rarity}`;
  if (definition.season && /^\d{4}$/.test(item.scope)) return `限时成就 · ${item.scope} · ${rarity}`;
  return `获得成就 · ${rarity}`;
}

/** A full-screen award ceremony that grows with rarity. It closes on its own,
 * on 跳过 or on Escape, and returns focus to where it was. */
export default function AwardCeremony({ items, onDone }: { items: EarnedAchievement[]; onDone: () => void }) {
  const { lead, rest } = arrange(items);
  const canvas = useRef<HTMLCanvasElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const medal = useRef<HTMLDivElement>(null);
  // The host's onDone always drops the batch at the head of its queue.
  const done = useRef(onDone);
  const reduced = reducedMotion();
  const rarity = lead?.definition.rarity ?? "b";

  useEffect(() => {
    if (!lead) { done.current(); return; }
    const before = document.activeElement as HTMLElement | null;
    skip.current?.focus();
    const stop = !reduced && canvas.current ? runAwardParticles(canvas.current, rarity, medal.current) : () => undefined;
    const timer = window.setTimeout(() => done.current(), AWARD_TIERS[rarity].ms + rest.length * 600);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") done.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
    // One ceremony per mount; the host remounts it for the next batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!lead) return null;
  const { item, definition } = lead;
  const tier = AWARD_TIERS[rarity];
  const tone = readAwardTone();
  const teacher = tone === "playful" && isTeacherId(item.teacher_id) ? getTeacher(item.teacher_id) : null;
  const style = { "--award-glow": tier.glow, "--award-ray": tier.ray } as CSSProperties;

  return (
    <div className="award-ceremony" data-rarity={rarity} role="dialog" aria-modal="true" aria-labelledby="award-ceremony-name" style={style}>
      {tier.level >= 3 && <div className="award-aurora" />}
      {tier.level >= 2 && <div className="award-pillar" />}
      <canvas ref={canvas} aria-hidden="true" />
      <div className="award-flash" />
      {tier.level >= 1 && <div className="award-flare" />}
      <div className="award-stage">
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
        {rest.length > 0 && (
          <div className="award-more">
            <span>同时获得</span>
            <ul>
              {rest.slice(0, MORE_SHOWN).map(({ item: other, definition: more }) => (
                <li key={`${other.achievement_id}:${other.scope}`}><Medal achievement={more} />{more.name}</li>
              ))}
            </ul>
            {rest.length > MORE_SHOWN && <span>还有 {rest.length - MORE_SHOWN} 枚，去成就殿看看</span>}
          </div>
        )}
      </div>
      <div className="award-presenter">
        <p className="award-bubble">{teacher && <b>{teacher.name}</b>}{awardLine(item, tone)}</p>
        {teacher && (
          <span className="award-arch" aria-hidden="true">
            <span className="award-arch-window">
              <img src={portraitAsset(teacher.id, "arch-bg")} alt="" />
              <img className="award-arch-bust" src={portraitAsset(teacher.id, "bust-approving")} alt="" />
            </span>
            <span className="award-arch-frame" />
          </span>
        )}
      </div>
      <button ref={skip} type="button" className="award-skip" onClick={() => done.current()}>{reduced ? "关闭" : "跳过"}</button>
    </div>
  );
}
