import { useNavigate, useSearchParams } from "react-router-dom";

import { AccountHistoryPanel } from "../history/account-history-panel";
import { SessionList } from "../history/session-list";
import { learningSessionHref } from "../learning-history";
import { updateLearningSession, type LearningSessionRecord } from "../learning-session-store";
import { newBoardHref } from "../new-board-href";
import { AcademyHeader } from "./academy-header";
import "../learning-history.css";

/** Every board and lesson to pick up again, and what each lesson recorded,
 * with deletion. A star links here with its topic to show why it is lit. */
export function RecordsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const topicId = params.get("topic");
  const tab = topicId || params.get("tab") === "facts" ? "facts" : "resume";
  const open = (session: LearningSessionRecord) => {
    updateLearningSession(session.id, { status: "active" });
    navigate(learningSessionHref(session));
  };
  return (
    <main className="course-launcher academy-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-records" aria-labelledby="academy-records-title">
          <h1 id="academy-records-title" className="academy-title">学习记录</h1>
          <div className="learning-history-tabs" role="tablist" aria-label="记录类型">
            <button role="tab" aria-selected={tab === "resume"} onClick={() => setParams({}, { replace: true })}>继续学习</button>
            <button role="tab" aria-selected={tab === "facts"} onClick={() => setParams({ tab: "facts" }, { replace: true })}>学习经过</button>
          </div>
          {tab === "facts"
            ? <AccountHistoryPanel onSelect={open} topic={topicId ? { id: topicId, name: params.get("name") ?? "" } : undefined}
              onTopicClose={() => setParams({ tab: "facts" }, { replace: true })} />
            : <SessionList onSelect={open} onNew={() => navigate(newBoardHref())} />}
        </section>
      </div>
    </main>
  );
}
