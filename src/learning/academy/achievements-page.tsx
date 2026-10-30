import { getLocale, tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getToken } from "@/api/client";

import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, DEFAULT_TITLE, TITLES, type AchievementDefinition } from "@/learning/academy/achievement-catalog";
import { openHistoryApi, type AchievementList, type EarnedAchievement, type LearnerTitle } from "../history/history-api";
import { awardLine, awardPresenter, readAwardTone } from "../map/award-line";
import { topicLabel } from "../map/taxonomy-labels";
import { AcademyHeader } from "./academy-header";
import { localToday, RARITY_NAME, upcomingSeasons } from "./achievement-display";
import { Medal } from "./medal";

const RARITY_ORDER = { b: 0, s: 1, g: 2, x: 3 } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString(getLocale());

const presenterName = (award: Parameters<typeof awardPresenter>[0]) => { const teacher = awardPresenter(award, readAwardTone()); return teacher ? `${teacher.name}：` : ""; };

function earnedLine(items: EarnedAchievement[]): string {
  const latest = items.at(-1)!;
  const teacher = awardPresenter(latest, readAwardTone())?.name ?? null;
  const count = items.length > 1 ? (/^\d{4}$/.test(latest.scope) ? tr("{{v0}} 年 · ", { v0: items.length }) : tr("{{v0}} 个知识点 · ", { v0: items.length })) : "";
  return `${count}${teacher ? `${teacher} · ` : ""}${date(latest.earned_at)}`;
}

/** The hall of achievements: every catalog achievement, lit or not, with
 * progress, the seasonal calendar and the learner's titles. */

export function AchievementsPage() {
  useLocale();
  const [list, setList] = useState<AchievementList>();
  const [error, setError] = useState(() => !getToken());
  const [filter, setFilter] = useState<string>("all");
  const [detail, setDetail] = useState<AchievementDefinition | null>(null);
  const [title, setTitle] = useState<LearnerTitle>(DEFAULT_TITLE);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    void openHistoryApi(token).then((api) => api.achievements())
      .then((value) => { if (active) { setList(value); if (value.title) setTitle(value.title); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const earned = useMemo(() => {
    const map = new Map<string, EarnedAchievement[]>();
    for (const item of list?.achievements ?? []) map.set(item.achievement_id, [...(map.get(item.achievement_id) ?? []), item]);
    return map;
  }, [list]);
  const progress = useMemo(() => new Map((list?.progress ?? []).map((item) => [item.achievement_id, item])), [list]);
  const chooseTitle = (id: string) => {
    const token = getToken();
    if (!token || saving) return;
    setSaving(true);
    void openHistoryApi(token).then((api) => api.setTitle(id)).then((value) => setTitle(value.title)).catch(() => undefined).finally(() => setSaving(false));
  };

  const ownedTitles = TITLES.filter((item) => item.id === DEFAULT_TITLE.id || earned.has(item.id));
  const subtitle = (achievement: AchievementDefinition) => {
    const items = earned.get(achievement.id);
    if (items) return earnedLine(items);
    const value = progress.get(achievement.id);
    if (value) return `${value.current} / ${value.target}`;
    if (achievement.hidden) return tr("隐藏");
    return achievement.season ?? tr("未获得");
  };
  const medal = (achievement: AchievementDefinition) => {
    const locked = !earned.has(achievement.id);
    const value = locked ? progress.get(achievement.id) : undefined;
    return (
      <button key={achievement.id} type="button" className="academy-medal-button" data-locked={locked || undefined} data-rarity={achievement.rarity} onClick={() => setDetail(achievement)}
        aria-label={`${locked && achievement.hidden ? tr("隐藏成就") : achievement.name}，${locked ? tr("未获得") : tr("已获得")}`}>
        <Medal achievement={achievement} locked={locked} />
        <span className="academy-medal-name">{locked && achievement.hidden ? "？？？" : achievement.name}</span>
        {value
          ? <span className="academy-medal-progress" aria-label={tr("进度 {{v0}} / {{v1}}", { v0: value.current, v1: value.target })}><span><i style={{ width: `${Math.min(100, (value.current / value.target) * 100)}%` }} /></span><b>{value.current}/{value.target}</b></span>
          : <span className="academy-medal-sub">{subtitle(achievement)}</span>}
      </button>
    );
  };
  const recent = (list?.achievements ?? []).slice().sort((a, b) => b.earned_at.localeCompare(a.earned_at))
    .filter((item, index, all) => all.findIndex(other => other.achievement_id === item.achievement_id) === index).slice(0, 5)
    .flatMap(item => { const definition = ACHIEVEMENTS.find(a => a.id === item.achievement_id); return definition ? [{ item, definition }] : []; });
  const share = ACHIEVEMENTS.length ? earned.size / ACHIEVEMENTS.length : 0;
  const today = localToday();

  return (
    <main className="course-launcher academy-page academy-achievements-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-hall-of-fame" aria-labelledby="academy-achievements-title">
          <h1 id="academy-achievements-title" className="academy-title">{tr("成就")}</h1>
          {error && <p role="status">{tr("暂时读不到成就，请稍后再试。")}</p>}
          {!error && !list && <p role="status">{tr("正在读取成就…")}</p>}
          {list && <>
            <div className="academy-fame-hero">
              <div className="academy-fame-ring" role="img" aria-label={tr("已点亮 {{v0}} / {{v1}} 枚", { v0: earned.size, v1: ACHIEVEMENTS.length })}>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(226,189,102,0.18)" strokeWidth="8" />
                  <circle cx="60" cy="60" r="52" fill="none" stroke="url(#fame-ring)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(share * 326.7).toFixed(1)} 326.7`} transform="rotate(-90 60 60)" />
                  <defs><linearGradient id="fame-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6dfa0" /><stop offset="1" stopColor="#c99a3e" /></linearGradient></defs>
                </svg>
                <span><b>{earned.size}</b><small>/ {ACHIEVEMENTS.length}</small></span>
              </div>
              <div className="academy-fame-summary">
                <p className="academy-fame-title">{tr("正在使用的称号")}<strong>{title.name}</strong></p>
                <div className="academy-fame-stats">
                  <span><b>{ownedTitles.length}</b>/ {TITLES.length} {tr("个称号")}</span>
                  <span><b>{ACHIEVEMENTS.filter((item) => item.hidden && earned.has(item.id)).length}</b>{tr("个隐藏成就已发现")}</span>
                  <span><b>{ACHIEVEMENTS.filter((item) => item.rarity === "x" && earned.has(item.id)).length}</b>{tr("枚星耀")}</span>
                </div>
              </div>
              {recent.length > 0 && (
                <ol className="academy-fame-shelf" aria-label={tr("最近获得")}>
                  {recent.map(({ item, definition }) => (
                    <li key={definition.id}>
                      <button type="button" onClick={() => setDetail(definition)} data-rarity={definition.rarity}>
                        <Medal achievement={definition} />
                        <span>{definition.name}</span>
                        <small>{date(item.earned_at)}</small>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="academy-tabs" role="group" aria-label={tr("成就分类")}>
              {[{ id: "all", name: tr("全部") }, ...ACHIEVEMENT_CATEGORIES, { id: "titles", name: tr("称号衣橱") }].map((category) => {
                const items = ACHIEVEMENTS.filter((item) => item.category === category.id);
                return (
                  <button key={category.id} type="button" aria-pressed={filter === category.id} onClick={() => setFilter(category.id)}>
                    {category.name}{items.length > 0 && <small>{items.filter((item) => earned.has(item.id)).length}/{items.length}</small>}
                  </button>
                );
              })}
            </div>
            {filter === "titles" ? (
              <section className="academy-fame-section" aria-label={tr("称号衣橱")}>
                <p className="academy-muted">{tr("挑一个称号挂在名字旁边，大厅里老师打招呼时会带上它。")}</p>
                <div className="academy-titles">
                  {TITLES.map((item) => {
                    const owned = ownedTitles.includes(item);
                    const source = ACHIEVEMENTS.find((achievement) => achievement.id === item.id);
                    const secret = !owned && source?.hidden;
                    return (
                      <div key={item.id} className="academy-title-card" data-locked={!owned || undefined}>
                        <strong>{secret ? "？？？" : item.name}</strong>
                        <span>{item.id === DEFAULT_TITLE.id ? tr("默认称号") : secret ? tr("来自一个隐藏成就") : tr("成就「{{v0}}」", { v0: source?.name })}</span>
                        {owned && (
                          <button type="button" aria-pressed={title.id === item.id} disabled={saving} onClick={() => chooseTitle(item.id)}>
                            {title.id === item.id ? tr("正在使用") : tr("使用这个称号")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : ACHIEVEMENT_CATEGORIES.filter((category) => filter === "all" || filter === category.id).map((category) => {
              const items = ACHIEVEMENTS.filter((item) => item.category === category.id)
                .sort((a, b) => Number(earned.has(b.id)) - Number(earned.has(a.id)) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
              const got = items.filter((item) => earned.has(item.id)).length;
              return (
                <section key={category.id} className="academy-fame-section" aria-labelledby={`fame-${category.id}`}>
                  <div className="academy-fame-head">
                    <h2 id={`fame-${category.id}`}>{category.name}</h2>
                    <span className="academy-muted">{category.description}</span>
                    <span className="academy-fame-bar" aria-hidden="true"><i style={{ width: `${(got / items.length) * 100}%` }} /></span>
                    <span className="academy-muted">{got} / {items.length}</span>
                  </div>
                  {category.id === "season" && (
                    <ol className="academy-seasons" aria-label={tr("接下来的限时成就")}>
                      {upcomingSeasons(today).map((window, index) => (
                        <li key={`${window.id}-${window.year}`} data-open={window.open || undefined} data-next={index === 0 || undefined}>
                          <b>{window.start.slice(5).replace("-", "/")}</b>{window.label}
                          <span>{window.open ? tr("进行中") : index === 0 ? tr("下一个 · 还有 {{v0}} 天", { v0: window.daysAway }) : tr("{{v0}} 年", { v0: window.year })}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="academy-medals">{items.map(medal)}</div>
                </section>
              );
            })}
          </>}
        </section>
      </div>
      {detail && <AchievementDetail achievement={detail} earned={earned.get(detail.id)} progress={progress.get(detail.id)} onClose={() => setDetail(null)} />}
    </main>
  );
}

function AchievementDetail({ achievement, earned, progress, onClose }: {
  achievement: AchievementDefinition; earned: EarnedAchievement[] | undefined; progress: { current: number; target: number } | undefined; onClose: () => void;
}) {
  useLocale();
  const secret = !earned && achievement.hidden;
  const category = ACHIEVEMENT_CATEGORIES.find((item) => item.id === achievement.category)!;
  const latest = earned?.at(-1);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="academy-detail-backdrop" onClick={onClose}>
      <div className={`academy-detail is-${achievement.rarity}`} data-earned={earned ? true : undefined} role="dialog" aria-modal="true" aria-labelledby="academy-detail-name" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="academy-detail-close" onClick={onClose} aria-label={tr("关闭")} autoFocus><X size={18} aria-hidden="true" /></button>
        <div className="academy-detail-top">
          <div className="academy-detail-medal"><Medal achievement={achievement} locked={!earned} /></div>
          <span className={`academy-rarity is-${achievement.rarity}`}>{RARITY_NAME[achievement.rarity]}</span>
          <h2 id="academy-detail-name">{secret ? tr("隐藏成就") : achievement.name}</h2>
          {!secret && <p className="academy-detail-flavor">{achievement.flavor}</p>}
          <p className="academy-detail-condition">{secret ? tr("获得之前不会告诉你条件。继续学下去，它会自己出现。") : achievement.condition}</p>
        </div>
        <dl>
          <dt>{tr("分类")}</dt><dd>{category.name}</dd>
          {latest && <><dt>{tr("获得")}</dt><dd>{earned!.length > 1 ? earned!.map((item) => /^\d{4}$/.test(item.scope) ? tr("{{v0}} 年", { v0: item.scope }) : item.topic_name ? topicLabel(item.scope, item.topic_name) : date(item.earned_at)).join("、") : date(latest.earned_at)}</dd>
            <dt>{tr("颁发")}</dt><dd>{presenterName(latest)}{awardLine(latest, readAwardTone())}</dd></>}
          {!earned && progress && <><dt>{tr("进度")}</dt><dd>{progress.current} / {progress.target}</dd></>}
          {achievement.season && <><dt>{tr("时间")}</dt><dd>{achievement.season}{tr("（每年都有，错过了明年还能获得）")}</dd></>}
          {achievement.title && !secret && <><dt>{tr("称号")}</dt><dd>{tr("解锁「")}{achievement.title}」</dd></>}
        </dl>
      </div>
    </div>
  );
}
