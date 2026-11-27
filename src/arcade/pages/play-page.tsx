// The round screen (plan §5.2): the game fills the screen; the fact sits on a
// torn paper strip, the answer on a sticky note, progress is an ink line, the
// streak an ink splash and the score ink drops.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { deriveFactStates, localDay, stateOf, type AnswerRecord, type FactState } from "../core/fact-states";
import { promptText, skillById, type Skill } from "../core/facts";
import { createRng, randomSeed } from "../core/rng";
import { RoundEngine, type RoundEvent, type RoundSnapshot, type RoundSummary } from "../core/round-engine";
import { planRound } from "../core/schedule";
import { gameById, type ArcadeGame, type GameInfo } from "../games/types";
import { loadProgress, saveAnswer, saveRound, type DeviceProgress } from "../store/device-progress";
import { NibDoodle } from "../ui/nib-doodle";
import { InkDropIcon } from "./arcade-pages";

type Banner = { id: number; text: string };

function bannerFor(streak: number): string {
  if (streak >= 10) return tr("势不可挡！");
  if (streak >= 5) return tr("五连对！");
  return tr("三连对！");
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ArcadePlayPage() {
  useLocale();
  const { skill: skillId, game: gameId } = useParams();
  const [query] = useSearchParams();
  const [roundKey, setRoundKey] = useState(0);
  const skill = skillById(skillId ?? "");
  const game = gameById(gameId ?? "");
  if (!skill || !game?.playable) return <Navigate to="/arcade/skills" replace />;
  const input = query.get("input") === "tap" ? "tap" : "keypad";
  return <Round key={`${roundKey}`} skill={skill} game={game} input={input} onAgain={() => setRoundKey(value => value + 1)} />;
}

interface RoundProps {
  skill: Skill;
  game: GameInfo;
  input: "keypad" | "tap";
  onAgain: () => void;
}

interface Results {
  summary: RoundSummary;
  newlyQuick: number;
  personalBest: boolean;
}

function Round({ skill, game, input, onAgain }: RoundProps) {
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RoundEngine | null>(null);
  const gameRef = useRef<ArcadeGame | null>(null);
  const before = useRef<{ states: Map<string, FactState>; progress: DeviceProgress } | null>(null);
  const answers = useRef<AnswerRecord[]>([]);
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [gameFailed, setGameFailed] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [gain, setGain] = useState<Banner | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const mode = input === "tap" ? "choice" : "answer";
  const [reducedMotion] = useState(prefersReducedMotion);

  // Plan the round from device progress, then load and mount the game.
  useEffect(() => {
    let cancelled = false;
    const seed = randomSeed();
    const rng = createRng(seed);
    let unsubscribe = () => {};
    void (async () => {
      const progress = await loadProgress().catch(() => ({ answers: [], rounds: [] }) as DeviceProgress);
      if (cancelled) return;
      const states = deriveFactStates(progress.answers);
      before.current = { states, progress };
      const plan = planRound(skill, states, rng, { today: localDay(Date.now()) });
      const engine = new RoundEngine({
        roundId: `r-${Date.now().toString(36)}-${seed.toString(36)}`,
        skill, gameId: game.id, plan, mode, input, rng,
        onAnswer: answer => { answers.current.push(answer); void saveAnswer(answer).catch(() => undefined); },
        onEnd: summary => {
          void saveRound(summary).catch(() => undefined);
          const after = deriveFactStates([...progress.answers, ...answers.current]);
          const newlyQuick = skill.facts.filter(fact => stateOf(states, fact.id).status !== "quick" && stateOf(after, fact.id).status === "quick").length;
          const best = Math.max(0, ...progress.rounds.filter(round => round.skillId === skill.id && round.reason === "finished").map(round => round.inkDrops));
          const finishedBefore = progress.rounds.some(round => round.skillId === skill.id && round.reason === "finished");
          setResults({ summary, newlyQuick, personalBest: summary.reason === "finished" && finishedBefore && summary.inkDrops > best });
        },
      });
      engineRef.current = engine;
      unsubscribe = engine.subscribe((event, state) => {
        gameRef.current?.onEvent(event);
        setSnapshot(state);
        handleEvent(event);
      });
      setSnapshot(engine.snapshot());

      try {
        const instance = await game.load!();
        if (cancelled) { instance.dispose(); return; }
        gameRef.current = instance;
        if (host.current) await instance.mount(host.current, { quality: "medium", reducedMotion, mode });
      } catch {
        // The round continues with the HUD only (plan §7.8).
        if (!cancelled) setGameFailed(true);
      }
      if (!cancelled) setReady(true);
    })();

    function handleEvent(event: RoundEvent) {
      if (event.type === "streak_milestone") setBanner({ id: Date.now(), text: bannerFor(event.streak) });
      if (event.type === "answer_correct") setGain({ id: Date.now(), text: `+${event.gained}` });
      if (event.type === "item_shown") setAnnouncement(promptText(event.item, tr("空格")));
    }

    return () => {
      cancelled = true;
      unsubscribe();
      engineRef.current?.dispose();
      gameRef.current?.dispose();
      engineRef.current = null;
      gameRef.current = null;
    };
  }, [skill, game, input, mode, reducedMotion]);

  // Keep the game sized to its host.
  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) gameRef.current?.resize(rect.width, rect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Pause while the page is hidden; paused time does not count (plan §4.5).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) engineRef.current?.pause(); else engineRef.current?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Physical keys: digits, Backspace and Enter; arrows in choice mode.
  const typed = snapshot?.typed ?? "";
  const press = useCallback((key: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    const current = engine.snapshot().typed;
    if (/^\d$/.test(key)) engine.type(current + key);
    else if (key === "Backspace") engine.type(current.slice(0, -1));
    else if (key === "Enter") engine.confirm();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const engine = engineRef.current;
      if (!engine) return;
      if (mode === "choice") {
        if (event.key === "ArrowLeft") engine.choose("left");
        if (event.key === "ArrowRight") engine.choose("right");
        return;
      }
      if (/^\d$/.test(event.key) || event.key === "Backspace" || event.key === "Enter") {
        event.preventDefault();
        press(event.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, press]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(timer);
  }, [banner]);
  useEffect(() => {
    if (!gain) return;
    const timer = setTimeout(() => setGain(null), 900);
    return () => clearTimeout(timer);
  }, [gain]);

  const leave = () => {
    engineRef.current?.leave();
    navigate(`/arcade/skills/${skill.id}/games`);
  };

  const phase = snapshot?.phase ?? "intro";
  const outcome = snapshot?.outcome ?? null;
  const progress = snapshot && snapshot.total ? Math.max(0, (snapshot.phase === "results" ? snapshot.total : snapshot.index + (snapshot.phase === "feedback" ? 1 : 0)) / snapshot.total) : 0;
  const streakLevel = (snapshot?.streak ?? 0) >= 10 ? 3 : (snapshot?.streak ?? 0) >= 5 ? 2 : (snapshot?.streak ?? 0) >= 3 ? 1 : 0;

  return (
    <main className={`arcade-round arcade-mode-${mode}${reducedMotion ? " is-reduced" : ""}`} data-phase={phase} data-index={snapshot?.index ?? -1}>
      <div ref={host} className="arcade-game-host" aria-hidden="true" />
      {gameFailed && <div className="arcade-game-fallback"><NibDoodle size={150} /></div>}

      <header className="arcade-hud-top">
        <button type="button" className="arcade-tab-button" onClick={leave}>{tr("← 返回")}</button>
        <svg className="arcade-ink-line" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
          <path d="M1 3 Q 25 1.6 50 3 T 99 3" pathLength={100} className="arcade-ink-line-track" />
          <path d="M1 3 Q 25 1.6 50 3 T 99 3" pathLength={100} className="arcade-ink-line-ink" style={{ strokeDasharray: `${progress * 100} 100` }} />
        </svg>
        <div className="arcade-score" aria-label={tr("墨水滴数")}>
          <span className={`arcade-streak arcade-streak-${streakLevel}`} aria-label={tr("连对 {{count}} 题", { count: snapshot?.streak ?? 0 })}>
            <svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 6c6 7 15 2 18 9s-4 10 3 15-1 13-8 13-7 9-14 8-8-8-15-9-8-9-4-14-6-12 1-16 10 1 13-6z" /></svg>
            <b>{snapshot?.streak ?? 0}</b>
          </span>
          <InkDropIcon size={28} />
          <b className="arcade-score-value">{snapshot?.inkDrops ?? 0}</b>
          {gain && <span key={gain.id} className="arcade-gain">{gain.text}</span>}
        </div>
      </header>

      {snapshot?.item && phase !== "results" && (
        <div className={`arcade-fact-strip${outcome ? ` is-${outcome.result}` : ""}`}>
          <span className="arcade-paperclip" aria-hidden="true" />
          {snapshot.tokens.map((token, i) => token === null ? (
            <span key={i} className="arcade-blank">{outcome ? outcome.expected : mode === "answer" ? typed || "?" : "?"}</span>
          ) : (
            <span key={i} className="arcade-token">{token}</span>
          ))}
        </div>
      )}
      {snapshot?.item && phase === "feedback" && outcome?.result === "wrong" && <p className="arcade-fact-note">{tr("答案是 {{answer}}，记住它！", { answer: outcome.expected })}</p>}
      {snapshot?.item && phase === "feedback" && outcome?.result === "shown" && <p className="arcade-fact-note">{tr("看一眼，等会儿再来一次。")}</p>}

      {banner && <div key={banner.id} className="arcade-banner" role="status">{banner.text}</div>}

      {phase === "countdown" && <div className="arcade-countdown" aria-hidden="true">{snapshot?.countdown}</div>}

      {phase === "intro" && (
        <div className="arcade-intro">
          <NibDoodle size={140} />
          <p>{mode === "answer" ? tr("算出答案，用键盘输入。答对了小墨就跳过去！") : tr("选出正确的数字。答对了小墨就跑过去！")}</p>
          <button type="button" className="arcade-play-button" disabled={!ready} onClick={() => engineRef.current?.start()}>{ready ? tr("开始") : tr("准备中…")}</button>
        </div>
      )}

      {(phase === "asking" || phase === "feedback") && mode === "answer" && (
        <section className="arcade-sticky arcade-keypad" aria-label={tr("数字键盘")}>
          <div className="arcade-keypad-keys">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map(key => (
              <button key={key} type="button" className="arcade-key" onClick={() => press(key)}>{key}</button>
            ))}
            <button type="button" className="arcade-key is-soft" aria-label={tr("删除")} onClick={() => press("Backspace")}>⌫</button>
            <button type="button" className="arcade-key is-ok" aria-label={tr("确定")} onClick={() => press("Enter")}>✓</button>
          </div>
          <button type="button" className={`arcade-show-me${snapshot?.hint ? " is-offered" : ""}`} onClick={() => engineRef.current?.showMe()}>{tr("告诉我")}</button>
        </section>
      )}

      {(phase === "asking" || phase === "feedback") && mode === "choice" && snapshot?.choices && (
        <section className="arcade-choices" aria-label={tr("二选一")}>
          {(["left", "right"] as const).map((side, i) => {
            const value = snapshot.choices![i];
            // After a miss the wrong pick is crossed out and the right one invites a tap.
            const state = outcome ? (value === outcome.expected ? " is-right" : outcome.result === "wrong" && value === outcome.given ? " is-wrong" : "") : "";
            return (
              <button key={side} type="button" className={`arcade-sticky arcade-choice arcade-choice-${side}${state}`} aria-disabled={state === " is-wrong"} onClick={() => engineRef.current?.choose(side)}>
                {value}
              </button>
            );
          })}
          <button type="button" className={`arcade-show-me${snapshot.hint ? " is-offered" : ""}`} onClick={() => engineRef.current?.showMe()}>{tr("告诉我")}</button>
        </section>
      )}

      {phase === "results" && results && (
        <section className="arcade-results" aria-label={tr("本局结果")}>
          <NibDoodle size={130} mood="cheer" />
          <h2>{results.summary.reason === "finished" ? tr("跑完啦！") : tr("下次接着跑！")}</h2>
          <ul className="arcade-results-list">
            <li><InkDropIcon /> {tr("墨水 {{count}} 滴", { count: results.summary.inkDrops })}{results.personalBest && <span className="arcade-tape">{tr("新纪录")}</span>}</li>
            <li>{tr("答对 {{correct}} / {{answered}} 题", { correct: results.summary.correct, answered: results.summary.answered })}</li>
            <li>{tr("最长连对 {{count}} 题", { count: results.summary.bestStreak })}</li>
            {results.newlyQuick > 0 && <li>{tr("{{count}} 道题变得很快了", { count: results.newlyQuick })}</li>}
          </ul>
          <div className="arcade-results-actions">
            <button type="button" className="arcade-play-button" onClick={onAgain}>{tr("再玩一局")}</button>
            <Link className="arcade-tab-button" to={`/arcade/skills/${skill.id}/games`}>{tr("换个游戏")}</Link>
            <Link className="arcade-tab-button" to="/arcade/skills">{tr("换个练习")}</Link>
          </div>
        </section>
      )}

      <div className="arcade-sr-only" aria-live="polite">{announcement}</div>
    </main>
  );
}
