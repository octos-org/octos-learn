import type { LearningMap, MapState } from "../history/history-api";
import { domainLabel, subjectLabel, topicLabel } from "./taxonomy-labels";

const STATE_LABEL: Record<MapState, string> = { explored: "已探索", practising: "正在练习", "did-it": "做出来过" };

/** The lit topics grouped by subject and domain, with their recorded facts. */
export function AtlasTopicList({ topics }: { topics: LearningMap["topics"] }) {
  const groups = new Map<string, Map<string, LearningMap["topics"]>>();
  for (const topic of topics) {
    const domains = groups.get(topic.subject) ?? new Map();
    domains.set(topic.domain, [...(domains.get(topic.domain) ?? []), topic]);
    groups.set(topic.subject, domains);
  }
  return <>
    <details className="learning-map-list">
      <summary>按星域列出（{topics.length} 个知识点）</summary>
      {[...groups].map(([subject, domains]) => <div key={subject} className="learning-map-subject">
        <h4>{subjectLabel(subject)}</h4>
        {[...domains].map(([domain, topics]) => <div key={domain} className="learning-map-domain">
          <h5>{domainLabel(domain)}（{topics.length} 个点亮）</h5>
          <ul>
            {topics.map(topic => <li key={topic.topic_id} data-state={topic.state}>
              <strong>{topicLabel(topic.topic_id, topic.name)}{topicLabel(topic.topic_id, topic.name) !== topic.name && <small className="learning-map-original">{topic.name}</small>}</strong>
              <span>{STATE_LABEL[topic.state]}</span>
              <small>{topic.evidence.days.length} 天学过 · 播放 {topic.evidence.played_beats} 段 · 练习 {topic.evidence.task_attempts} 次{topic.evidence.unassisted_successes ? ` · 不用提示做出 ${topic.evidence.unassisted_successes} 次` : ""}</small>
            </li>)}
          </ul>
        </div>)}
      </div>)}
    </details>
  </>;
}
