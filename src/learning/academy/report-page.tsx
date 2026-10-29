import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { learningSessionHref } from "../learning-history";
import { updateLearningSession, type LearningSessionRecord } from "../learning-session-store";
import { newBoardHref } from "../new-board-href";
import { WeeklyReportPanel } from "../report/weekly-report-panel";
import { AcademyHeader } from "./academy-header";
import "../learning-history.css";

/** The weekly and monthly report as its own page, opened from the hall. */
export function ReportPage() {
  const navigate = useNavigate();
  // Stable, so the suggestions under the report are fetched once.
  const resume = useCallback((session: LearningSessionRecord) => {
    updateLearningSession(session.id, { status: "active" });
    navigate(learningSessionHref(session));
  }, [navigate]);
  const ask = useCallback((draft: string) => navigate(newBoardHref(draft)), [navigate]);
  return (
    <main className="course-launcher academy-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-records" aria-labelledby="academy-report-title">
          <h1 id="academy-report-title" className="academy-title">学习周报</h1>
          <WeeklyReportPanel onSelect={resume} onNew={ask} />
        </section>
      </div>
    </main>
  );
}
