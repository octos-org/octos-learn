import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getToken } from "@/api/client";

import { openHistoryApi, type EarnedAchievement, type LearningMap } from "../history/history-api";
import { learningSessionHref } from "../learning-history";
import type { LearningSessionRecord } from "../learning-session-store";
import { achievementName } from "../map/award-line";
import { topicLabel } from "../map/taxonomy-labels";
import { TeacherPortrait } from "../teachers/teacher-portrait";
import { useSelectedTeacher } from "../teachers/teachers";

// Same words as the atlas: a star is lit once it was done without hints;
// every recorded topic leaves a footprint.
type Summary = { lit: number; footprints: number; recent: EarnedAchievement[]; title: string | null };

function summarize(map: LearningMap, awards: EarnedAchievement[], title: string | null): Summary {
  return {
    lit: map.topics.filter((topic) => topic.state === "did-it").length,
    footprints: map.topics.length,
    recent: [...awards].sort((a, b) => b.earned_at.localeCompare(a.earned_at)).slice(0, 3),
    title,
  };
}

/** The top of the academy hall: the chosen teacher greets the learner and
 * offers the last board, beside a glance at the star map and recent awards.
 * The summary is optional; the hall works the same while it is unavailable. */
export function HallHero({ latest }: { latest: LearningSessionRecord | undefined }) {
  const { teacher } = useSelectedTeacher();
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    void openHistoryApi(token)
      .then((api) => Promise.all([api.learningMap(), api.achievements()]))
      .then(([map, awards]) => { if (active) setSummary(summarize(map, awards.achievements, awards.title?.name ?? null)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <section className="academy-hall" aria-label="大厅">
      <div className="academy-greeting">
        <span className="academy-greeting-portrait">
          <TeacherPortrait teacherId={teacher.id} pose="idle" />
        </span>
        <div className="academy-greeting-body">
          <p className="academy-eyebrow">{teacher.name}</p>
          <p className="academy-bubble">{summary?.title ? `${summary.title}，` : ""}{latest ? teacher.hall.resume : teacher.hall.welcome}</p>
          <div className="academy-actions">
            {latest && (
              <Link to={learningSessionHref(latest)} className="academy-primary">
                继续上次的白板 <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
            <Link to="/board?new-board=1" className={latest ? "academy-secondary" : "academy-primary"}>
              <Plus size={18} aria-hidden="true" /> 新建空白白板
            </Link>
          </div>
        </div>
      </div>
      <div className="academy-glance">
        <Link to="/atlas" className="academy-card academy-atlas-card">
          <span className="academy-eyebrow">星图</span>
          <strong>你的知识星图</strong>
          {summary ? (
            <span className="academy-stats">
              <span><b>{summary.lit}</b>颗已点亮</span>
              <span><b>{summary.footprints}</b>个知识点留下足迹</span>
            </span>
          ) : <span className="academy-muted">每学完一段讲解或练习，星图上就会留下足迹。</span>}
          <span className="academy-more">打开星图 <ArrowRight size={16} aria-hidden="true" /></span>
        </Link>
        <Link to="/achievements" className="academy-card">
          <span className="academy-eyebrow">最近获得 · 成就殿</span>
          {summary?.recent.length ? (
            <ul className="academy-awards">
              {summary.recent.map((award) => (
                <li key={`${award.achievement_id}:${award.scope}`}>
                  <i aria-hidden="true" />
                  <span>
                    {achievementName(award.achievement_id)}
                    {award.topic_name ? ` · ${topicLabel(award.scope, award.topic_name)}` : ""}
                  </span>
                  <time dateTime={award.earned_at}>{new Date(award.earned_at).toLocaleDateString("zh-CN")}</time>
                </li>
              ))}
            </ul>
          ) : <span className="academy-muted">还没有成就。完成课程片段或练习后会出现在这里。</span>}
        </Link>
      </div>
    </section>
  );
}
