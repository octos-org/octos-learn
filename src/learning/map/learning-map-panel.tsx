import { useEffect, useState } from "react";

import { getToken } from "../../api/client";
import { openHistoryApi, type AchievementList, type EarnedAchievement, type LearningMap, type MapState } from "../history/history-api";
import { getTeacher, isTeacherId } from "../teachers/teachers";
import { ACHIEVEMENT_NAME, awardLine, readAwardTone, saveAwardTone, type AwardTone } from "./award-line";
import { domainLabel, subjectLabel } from "./taxonomy-labels";

const STATE_LABEL: Record<MapState, string> = { explored: "已探索", practising: "正在练习", "did-it": "做出来过" };

function AchievementCard({ achievement, tone }: { achievement: EarnedAchievement; tone: AwardTone }) {
  const teacher = isTeacherId(achievement.teacher_id) ? getTeacher(achievement.teacher_id) : null;
  return <article className={`learning-map-award${achievement.new ? " is-new" : ""}`}>
    <strong>{ACHIEVEMENT_NAME[achievement.achievement_id]}{achievement.topic_name ? ` · ${achievement.topic_name}` : ""}</strong>
    {achievement.new && <span className="learning-map-new">新获得</span>}
    <p>{teacher && tone === "playful" ? `${teacher.name}：` : ""}{awardLine(achievement, tone)}</p>
    <time>{new Date(achievement.earned_at).toLocaleDateString("zh-CN")}</time>
  </article>;
}

export function LearningMapPanel() {
  const [map, setMap] = useState<LearningMap>();
  const [awards, setAwards] = useState<AchievementList>();
  const [error, setError] = useState(false);
  const [tone, setTone] = useState(readAwardTone);
  useEffect(() => {
    let active = true;
    const token = getToken();
    void Promise.resolve().then(() => {
      if (!token) throw new Error("signed out");
      return openHistoryApi(token);
    }).then(api => Promise.all([api.learningMap(), api.achievements()])).then(([nextMap, nextAwards]) => {
      if (active) { setMap(nextMap); setAwards(nextAwards); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const switchTone = () => {
    const next = tone === "playful" ? "plain" : "playful";
    saveAwardTone(next);
    setTone(next);
  };

  if (error) return <p role="status">暂时读不到学习地图，请稍后再试。</p>;
  if (!map || !awards) return <p role="status">正在读取学习地图…</p>;

  const groups = new Map<string, Map<string, LearningMap["topics"]>>();
  for (const topic of map.topics) {
    const domains = groups.get(topic.subject) ?? new Map();
    domains.set(topic.domain, [...(domains.get(topic.domain) ?? []), topic]);
    groups.set(topic.subject, domains);
  }
  return <div className="learning-history-account learning-map">
    <section aria-label="成就">
      <h3>成就</h3>
      {awards.achievements.length
        ? [...awards.achievements].sort((a, b) => Number(b.new) - Number(a.new)).map(item =>
          <AchievementCard key={`${item.achievement_id}:${item.scope}`} achievement={item} tone={tone} />)
        : <p>还没有成就。完成课程片段或练习后会出现在这里。</p>}
      <button type="button" className="learning-map-tone" onClick={switchTone}>
        {tone === "playful" ? "颁发语改为普通说法" : "颁发语恢复老师的风格"}
      </button>
    </section>
    <section aria-label="学习地图">
      <h3>学习地图</h3>
      <p>已探索：播放过相关讲解；正在练习：做过相关练习；做出来过：不用提示达到过练习要求。这些都不等于已经掌握。</p>
      {!map.topics.length && <p>还没有点亮的知识点。完成课程片段或练习后，这里会留下足迹。</p>}
      {[...groups].map(([subject, domains]) => <div key={subject} className="learning-map-subject">
        <h4>{subjectLabel(subject)}</h4>
        {[...domains].map(([domain, topics]) => <div key={domain} className="learning-map-domain">
          <h5>{domainLabel(domain)}（{topics.length} 个点亮）</h5>
          <ul>
            {topics.map(topic => <li key={topic.topic_id} data-state={topic.state}>
              <strong>{topic.name}</strong>
              <span>{STATE_LABEL[topic.state]}</span>
              <small>{topic.evidence.days.length} 天学过 · 播放 {topic.evidence.played_beats} 段 · 练习 {topic.evidence.task_attempts} 次{topic.evidence.unassisted_successes ? ` · 不用提示做出 ${topic.evidence.unassisted_successes} 次` : ""}</small>
            </li>)}
          </ul>
        </div>)}
      </div>)}
    </section>
  </div>;
}
