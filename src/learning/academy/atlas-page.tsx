import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getToken } from "@/api/client";

import { openHistoryApi, type AnalysisStatus, type LearningMap } from "../history/history-api";
import { analysisNotice } from "../map/analysis-notice";
import { AtlasTopicList } from "../map/atlas-topic-list";
import { StarAtlas } from "../map/star-atlas/star-atlas";
import { newBoardHref } from "../new-board-href";
import { AcademyHeader } from "./academy-header";

/** The star atlas as its own place in the academy, full width. */
export function AtlasPage() {
  const navigate = useNavigate();
  const [map, setMap] = useState<LearningMap>();
  const [analysis, setAnalysis] = useState<AnalysisStatus>();
  const [error, setError] = useState(() => !getToken());
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    void openHistoryApi(token).then((api) => {
      // The notice is optional; the atlas still shows if its status is unavailable.
      void api.analysisStatus().then((value) => { if (active) setAnalysis(value); }).catch(() => undefined);
      return api.learningMap();
    }).then((value) => { if (active) setMap(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const notice = analysisNotice(analysis);
  return (
    <main className="course-launcher academy-page">
      <div className="course-launcher-inner academy-wide">
        <AcademyHeader />
        <section className="academy-atlas" aria-labelledby="academy-atlas-title">
          <h1 id="academy-atlas-title" className="academy-title">星图</h1>
          {notice && <p role="status" className="academy-muted">{notice}</p>}
          {error && <p role="status">暂时读不到星图，请稍后再试。</p>}
          {!error && !map && <p role="status">正在读取星图…</p>}
          {map && <>
            <StarAtlas topics={map.topics} onAsk={(draft) => navigate(newBoardHref(draft))} />
            <p className="academy-muted">已探索：播放过相关讲解；正在练习：做过相关练习；做出来过：不用提示达到过练习要求。这些都不等于已经掌握。</p>
            {map.topics.length > 0 && <AtlasTopicList topics={map.topics} />}
          </>}
        </section>
      </div>
    </main>
  );
}
