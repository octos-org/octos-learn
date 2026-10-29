import { useEffect, useRef, type KeyboardEvent } from "react";
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
  // Each tab is its own entry in history, so Back returns to the previous tab.
  const show = (next: Tab | "facts") => setParams(next === "records" ? {} : { tab: next });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Back and Forward change the selected tab too; focus inside the tab list
  // follows it, so it never rests on a tab that is out of the tab order.
  useEffect(() => {
    const selected = tabRefs.current[TABS.findIndex((item) => item.id === tab)];
    if (selected && document.activeElement !== selected && tabRefs.current.includes(document.activeElement as HTMLButtonElement)) selected.focus();
  }, [tab]);
  // Arrow keys, Home and End move between the tabs and open the one reached.
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((item) => item.id === tab);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = (target + TABS.length) % TABS.length;
    show(TABS[next].id);
    tabRefs.current[next]?.focus();
  };
  return (
    <main className="course-launcher academy-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-records" aria-labelledby="academy-records-title">
          <div className="academy-records-head">
            <h1 id="academy-records-title" className="academy-title">记录</h1>
            <div className="academy-records-tabs" role="tablist" aria-label="记录与报告">
              {TABS.map((item, index) => (
                <button key={item.id} ref={(node) => { tabRefs.current[index] = node; }} id={`academy-records-tab-${item.id}`} type="button" role="tab"
                  aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} aria-controls="academy-records-panel"
                  onClick={() => show(item.id)} onKeyDown={onTabKey}>{item.label}</button>
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
