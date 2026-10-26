import { useEffect, useMemo, useState } from "react";

import { getToken } from "@/api/client";

import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, DEFAULT_TITLE, TITLES, type AchievementDefinition } from "../../../services/learning-history/achievement-catalog.mjs";
import { openHistoryApi, type AchievementList, type EarnedAchievement, type LearnerTitle } from "../history/history-api";
import { awardLine, readAwardTone } from "../map/award-line";
import { topicLabel } from "../map/taxonomy-labels";
import { getTeacher, isTeacherId } from "../teachers/teachers";
import { AcademyHeader } from "./academy-header";
import { localToday, RARITY_NAME, upcomingSeasons } from "./achievement-display";
import { Medal } from "./medal";

const RARITY_ORDER = { b: 0, s: 1, g: 2, x: 3 } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString("zh-CN");

function earnedLine(items: EarnedAchievement[]): string {
  const latest = items.at(-1)!;
  const teacher = isTeacherId(latest.teacher_id) ? getTeacher(latest.teacher_id).name : null;
  const count = items.length > 1 ? (/^\d{4}$/.test(latest.scope) ? `${items.length} 年 · ` : `${items.length} 个知识点 · `) : "";
  return `${count}${teacher ? `${teacher} · ` : ""}${date(latest.earned_at)}`;
}

/** The hall of achievements: every catalog achievement, lit or not, with
 * progress, the seasonal calendar and the learner's titles. */
export function AchievementsPage() {
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
    if (achievement.hidden) return "隐藏";
    return achievement.season ?? "未获得";
  };
  const medal = (achievement: AchievementDefinition) => {
    const locked = !earned.has(achievement.id);
    return (
      <button key={achievement.id} type="button" className="academy-medal-button" data-locked={locked || undefined} onClick={() => setDetail(achievement)}
        aria-label={`${locked && achievement.hidden ? "隐藏成就" : achievement.name}，${locked ? "未获得" : "已获得"}`}>
        <Medal achievement={achievement} locked={locked} />
        <span className="academy-medal-name">{locked && achievement.hidden ? "？？？" : achievement.name}</span>
        <span className="academy-medal-sub">{subtitle(achievement)}</span>
      </button>
    );
  };
  const today = localToday();

  return (
    <main className="course-launcher academy-page academy-achievements-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-hall-of-fame" aria-labelledby="academy-achievements-title">
          <h1 id="academy-achievements-title" className="academy-title">成就</h1>
          {error && <p role="status">暂时读不到成就，请稍后再试。</p>}
          {!error && !list && <p role="status">正在读取成就…</p>}
          {list && <>
            <div className="academy-fame-stats">
              <span><b>{earned.size}</b>/ {ACHIEVEMENTS.length} 枚已点亮</span>
              <span><b>{ownedTitles.length}</b>/ {TITLES.length} 个称号</span>
              <span><b>{ACHIEVEMENTS.filter((item) => item.hidden && earned.has(item.id)).length}</b>个隐藏成就已发现</span>
              <span className="academy-fame-title">正在使用的称号：<strong>{title.name}</strong></span>
            </div>
            <div className="academy-tabs" role="group" aria-label="成就分类">
              {[{ id: "all", name: "全部" }, ...ACHIEVEMENT_CATEGORIES, { id: "titles", name: "称号衣橱" }].map((category) => {
                const items = ACHIEVEMENTS.filter((item) => item.category === category.id);
                return (
                  <button key={category.id} type="button" aria-pressed={filter === category.id} onClick={() => setFilter(category.id)}>
                    {category.name}{items.length > 0 && <small>{items.filter((item) => earned.has(item.id)).length}/{items.length}</small>}
                  </button>
                );
              })}
            </div>
            {filter === "titles" ? (
              <section className="academy-fame-section" aria-label="称号衣橱">
                <p className="academy-muted">挑一个称号挂在名字旁边，大厅里老师打招呼时会带上它。</p>
                <div className="academy-titles">
                  {TITLES.map((item) => {
                    const owned = ownedTitles.includes(item);
                    const source = ACHIEVEMENTS.find((achievement) => achievement.id === item.id);
                    const secret = !owned && source?.hidden;
                    return (
                      <div key={item.id} className="academy-title-card" data-locked={!owned || undefined}>
                        <strong>{secret ? "？？？" : item.name}</strong>
                        <span>{item.id === DEFAULT_TITLE.id ? "默认称号" : secret ? "来自一个隐藏成就" : `成就「${source?.name}」`}</span>
                        {owned && (
                          <button type="button" aria-pressed={title.id === item.id} disabled={saving} onClick={() => chooseTitle(item.id)}>
                            {title.id === item.id ? "正在使用" : "使用这个称号"}
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
                    <ol className="academy-seasons" aria-label="接下来的限时成就">
                      {upcomingSeasons(today).map((window, index) => (
                        <li key={`${window.id}-${window.year}`} data-open={window.open || undefined} data-next={index === 0 || undefined}>
                          <b>{window.start.slice(5).replace("-", "/")}</b>{window.label}
                          <span>{window.open ? "进行中" : index === 0 ? `下一个 · 还有 ${window.daysAway} 天` : `${window.year} 年`}</span>
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
      <div className="academy-detail" role="dialog" aria-modal="true" aria-labelledby="academy-detail-name" onClick={(event) => event.stopPropagation()}>
        <div className="academy-detail-top">
          <Medal achievement={achievement} locked={!earned} />
          <div>
            <span className={`academy-rarity is-${achievement.rarity}`}>{RARITY_NAME[achievement.rarity]}</span>
            <h2 id="academy-detail-name">{secret ? "隐藏成就" : achievement.name}</h2>
            <p>{secret ? "获得之前不会告诉你条件。继续学下去，它会自己出现。" : achievement.condition}</p>
          </div>
        </div>
        <dl>
          <dt>分类</dt><dd>{category.name}</dd>
          {latest && <><dt>获得</dt><dd>{earned!.length > 1 ? earned!.map((item) => /^\d{4}$/.test(item.scope) ? `${item.scope} 年` : item.topic_name ? topicLabel(item.scope, item.topic_name) : date(item.earned_at)).join("、") : date(latest.earned_at)}</dd>
            <dt>颁发</dt><dd>{isTeacherId(latest.teacher_id) ? `${getTeacher(latest.teacher_id).name}：` : ""}{awardLine(latest, readAwardTone())}</dd></>}
          {!earned && progress && <><dt>进度</dt><dd>{progress.current} / {progress.target}</dd></>}
          {achievement.season && <><dt>时间</dt><dd>{achievement.season}（每年都有，错过了明年还能获得）</dd></>}
          {achievement.title && !secret && <><dt>称号</dt><dd>解锁「{achievement.title}」</dd></>}
        </dl>
        <button type="button" className="academy-primary" onClick={onClose} autoFocus>关闭</button>
      </div>
    </div>
  );
}
