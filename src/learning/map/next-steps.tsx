import { useEffect, useState } from "react";

import { getSelectedProfileId, getToken } from "../../api/client";
import { openHistoryApi, type HistoryApi, type NextStep } from "../history/history-api";
import { getLearningSession, type LearningSessionRecord } from "../learning-session-store";
import { nextStepDraft, nextStepLine } from "./next-step-line";
import { nextStepsShown } from "./next-steps-visibility";

const STATE = { explored: "已探索", practising: "正在练习", "did-it": "做出来过" } as const;

/** Up to three next steps from suggestions-v1. Resuming opens the original
 * board; other steps only fill a new board's input box, so nothing is sent
 * (or paid for) until the learner sends it. */
export function NextSteps({ onSelect, onNew }: { onSelect?: (session: LearningSessionRecord) => void; onNew?: (draft: string) => void }) {
  const [shown] = useState(nextStepsShown);
  const [api, setApi] = useState<HistoryApi>();
  const [steps, setSteps] = useState<NextStep[]>();
  useEffect(() => {
    if (!shown) return;
    let active = true;
    const token = getToken();
    void Promise.resolve().then(() => {
      if (!token) throw new Error("signed out");
      return openHistoryApi(token);
    }).then(async next => { const result = await next.suggestions(); if (active) { setApi(next); setSteps(result.suggestions); } })
      .catch(() => { if (active) setSteps([]); });
    return () => { active = false; };
  }, [shown]);
  if (!shown || !steps?.length) return null;

  const dismiss = (step: NextStep) => {
    setSteps(steps.filter(item => item.id !== step.id));
    void api?.dismissSuggestion(step.id).catch(() => undefined);
  };
  return <section className="next-steps" aria-label="下一步可以做什么">
    <h4>下一步可以做什么</h4>
    {steps.map(step => {
      const line = nextStepLine(step);
      // Only this device's own boards of the same account can be reopened.
      const local = ["continue", "revisit"].includes(step.type) && api?.owner === getSelectedProfileId() ? getLearningSession(step.resume.session_id) : null;
      return <article key={step.id} className="next-step">
        <p>{line.speaker ? `${line.speaker}：` : ""}{line.text}</p>
        <div className="next-step-actions">
          {local && onSelect ? <button type="button" onClick={() => onSelect(local)}>回到那节课</button>
            : onNew && <button type="button" onClick={() => void nextStepDraft(step).then(onNew)}>在新白板上问问</button>}
          <button type="button" onClick={() => dismiss(step)}>不感兴趣</button>
        </div>
        <details>
          <summary>为什么推荐这个</summary>
          <p>{step.topic.name}：{STATE[step.topic.state]}，上次学习 {new Date(step.topic.last_at).toLocaleDateString("zh-CN")}。
            {step.target ? ` 目录中的前置关系：${step.type === "foundation" ? `${step.target.name} → ${step.topic.name}` : `${step.topic.name} → ${step.target.name}`}（${step.target.reason}）。还没有和${step.target.name}有关的学习记录，这不代表不会。` : ""}</p>
        </details>
      </article>;
    })}
  </section>;
}
