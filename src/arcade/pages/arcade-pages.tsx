// The Arcade's menu pages (plan §5.1): home, skill picker and game picker.
// Standalone phase (decision 18): no account, no server, progress on the device.

import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { SKILLS, skillById } from "../core/facts";
import { quickShare, suggestedSkill } from "../core/schedule";
import { GAMES } from "../games/types";
import { clearProgress } from "../store/device-progress";
import { NibDoodle } from "../ui/nib-doodle";
import { saveInput, savedInput, useArcadeProgress, type InputChoice } from "../ui/use-arcade-progress";

function InkDropIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="arcade-ink-icon">
      <path d="M12 2.5c3.6 4.9 6.4 8.6 6.4 12a6.4 6.4 0 0 1-12.8 0c0-3.4 2.8-7.1 6.4-12z" fill="#28408f" />
      <path d="M9.2 14.6a3 3 0 0 0 2.2 3" stroke="#fffdf7" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}
export { InkDropIcon };

function PageShell({ back, title, children }: { back?: string; title: string; children: React.ReactNode }) {
  return (
    <main className="arcade-page">
      <header className="arcade-page-header">
        {back ? <Link className="arcade-tab-button" to={back}>{tr("← 返回")}</Link> : <Link className="arcade-tab-button" to="/">{tr("← 回到白板")}</Link>}
        <h1 className="arcade-title">{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function ArcadeHomePage() {
  useLocale();
  const { inkDrops, progress, loading, reload } = useArcadeProgress();
  const [confirming, setConfirming] = useState(false);
  return (
    <PageShell title={tr("游戏厅")}>
      <section className="arcade-home">
        <div className="arcade-home-nib"><NibDoodle size={180} /></div>
        <p className="arcade-home-line">{tr("我是小墨。答对一题，我就往前跑一步！")}</p>
        <Link className="arcade-play-button" to="/arcade/skills">{tr("开始玩")}</Link>
        {!loading && (
          <p className="arcade-home-total">
            <InkDropIcon /> {tr("已收集 {{count}} 滴墨水", { count: inkDrops })}
            {progress.rounds.length > 0 && <span className="arcade-muted"> · {tr("玩了 {{count}} 局", { count: progress.rounds.length })}</span>}
          </p>
        )}
        <p className="arcade-device-note">{tr("进度只保存在这台设备上。")}</p>
        {progress.rounds.length > 0 && (confirming ? (
          <span className="arcade-clear-confirm">
            {tr("清除这台设备上的游戏厅进度？")}
            <button type="button" className="arcade-link-button" onClick={() => { void clearProgress().then(() => { setConfirming(false); reload(); }); }}>{tr("清除")}</button>
            <button type="button" className="arcade-link-button" onClick={() => setConfirming(false)}>{tr("取消")}</button>
          </span>
        ) : (
          <button type="button" className="arcade-link-button" onClick={() => setConfirming(true)}>{tr("清除这台设备上的进度")}</button>
        ))}
      </section>
    </PageShell>
  );
}

export function ArcadeSkillsPage() {
  useLocale();
  const { states, loading } = useArcadeProgress();
  const suggested = suggestedSkill(SKILLS, states);
  return (
    <PageShell back="/arcade" title={tr("选一项练习")}>
      <section className="arcade-card-grid" aria-busy={loading}>
        {SKILLS.map(skill => {
          const share = quickShare(skill, states);
          const quick = Math.round(share * skill.facts.length);
          return (
            <Link key={skill.id} to={`/arcade/skills/${skill.id}/games`} className={`arcade-card arcade-skill-card${skill.id === suggested.id ? " is-suggested" : ""}`}>
              {skill.id === suggested.id && <span className="arcade-tape">{tr("推荐")}</span>}
              <span className="arcade-card-title">{tr(skill.name)}</span>
              <span className="arcade-card-sub">{tr(skill.ages)}</span>
              <span className="arcade-progress-track" aria-hidden="true"><span className="arcade-progress-fill" style={{ width: `${Math.round(share * 100)}%` }} /></span>
              <span className="arcade-card-sub">{tr("{{quick}} / {{total}} 题已经很快", { quick, total: skill.facts.length })}</span>
            </Link>
          );
        })}
      </section>
    </PageShell>
  );
}

export function ArcadeGamesPage() {
  useLocale();
  const { skill: skillId } = useParams();
  const navigate = useNavigate();
  const skill = skillById(skillId ?? "");
  const [input, setInput] = useState<InputChoice>(savedInput);
  if (!skill) return <Navigate to="/arcade/skills" replace />;
  const choose = (choice: InputChoice) => { setInput(choice); saveInput(choice); };
  return (
    <PageShell back="/arcade/skills" title={tr(skill.name)}>
      <section className="arcade-input-choice" aria-label={tr("怎么作答")}>
        <span className="arcade-muted">{tr("怎么作答：")}</span>
        <button type="button" className={`arcade-chip${input === "keypad" ? " is-on" : ""}`} aria-pressed={input === "keypad"} onClick={() => choose("keypad")}>{tr("数字键盘")}</button>
        <button type="button" className={`arcade-chip${input === "tap" ? " is-on" : ""}`} aria-pressed={input === "tap"} onClick={() => choose("tap")}>{tr("二选一")}</button>
      </section>
      <section className="arcade-card-grid">
        {GAMES.map(game => (
          <button
            key={game.id}
            type="button"
            className={`arcade-card arcade-game-card${game.playable ? "" : " is-locked"}`}
            disabled={!game.playable}
            onClick={() => navigate(`/arcade/play/${skill.id}/${game.id}?input=${input}`)}
          >
            <span className="arcade-card-title">{tr(game.name)}</span>
            <span className="arcade-card-sub">{tr(game.blurb)}</span>
            {!game.playable && <span className="arcade-tape is-grey">{tr("即将推出")}</span>}
          </button>
        ))}
      </section>
    </PageShell>
  );
}
