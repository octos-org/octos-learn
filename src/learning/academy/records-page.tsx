import { useNavigate, useSearchParams } from "react-router-dom";

import { AccountHistoryPanel } from "../history/account-history-panel";
import { SessionList } from "../history/session-list";
import { learningSessionHref } from "../learning-history";
import { updateLearningSession, type LearningSessionRecord } from "../learning-session-store";
import { newBoardHref } from "../new-board-href";
import { ReportPanel } from "../report/report-panel";
import { AcademyHeader } from "./academy-header";
import "../learning-history.css";

const TABS = [
  { id: "records", label: "学习记录" },
  { id: "week", label: "周报" },
  { id: "month", label: "月报" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Records, the weekly report and the monthly report, one tab each. Links name
 * the tab: `?tab=week`, `?tab=month`, `?tab=facts` for what each lesson
 * recorded, and `?topic=` from a star for why it is lit. */
export function RecordsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const topicId = params.get("topic");
  const requested = params.get("tab");
  const tab: Tab = requested === "week" || requested === "month" ? requested : "records";
  const facts = Boolean(topicId) || requested === "facts";
  const open = (session: LearningSessionRecord) => {
    updateLearningSession(session.id, { status: "active" });
    navigate(learningSessionHref(session));
  };
  const show = (next: Tab | "facts") => setParams(next === "records" ? {} : { tab: next }, { replace: true });
  return (
    <main className="course-launcher academy-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-records" aria-labelledby="academy-records-title">
          <div className="academy-records-head">
            <h1 id="academy-records-title" className="academy-title">记录</h1>
            <div className="academy-records-tabs" role="tablist" aria-label="记录与报告">
              {TABS.map((item) => (
                <button key={item.id} id={`academy-records-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id}
                  aria-controls="academy-records-panel" onClick={() => show(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div id="academy-records-panel" role="tabpanel" aria-labelledby={`academy-records-tab-${tab}`} className="academy-records-panel">
            {tab === "records" ? <>
              <div className="academy-records-views" role="group" aria-label="记录内容">
                <button type="button" aria-pressed={!facts} onClick={() => show("records")}>白板与课程</button>
                <button type="button" aria-pressed={facts} onClick={() => show("facts")}>每次学习的经过</button>
              </div>
              {facts
                ? <AccountHistoryPanel onSelect={open} topic={topicId ? { id: topicId, name: params.get("name") ?? "" } : undefined}
                  onTopicClose={() => show("facts")} />
                : <div className="academy-sessions"><SessionList onSelect={open} onNew={() => navigate(newBoardHref())} /></div>}
            </> : <ReportPanel key={tab} period={tab} />}
          </div>
        </section>
      </div>
    </main>
  );
}
