import { AccountHistoryPanel } from "./history/account-history-panel";
import { LearningMapPanel } from "./map/learning-map-panel";
import { WeeklyReportPanel } from "./report/weekly-report-panel";
import { weeklyReportShown } from "./report/report-week";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { adoptLearningSession, listLearningSessions, type LearningSessionRecord } from "./learning-session-store";
import { discoverServerLearningSessions } from "./learning-session-sync";
import "./learning-history.css";

export function learningSessionHref(session: LearningSessionRecord): string {
  if (session.source) {
    const q = new URLSearchParams({ version: session.source.version, title: session.title, mode: "learn", instance: session.id });
    return `/course/${encodeURIComponent(session.source.packId)}?${q}`;
  }
  return `/board?session=${encodeURIComponent(session.id)}`;
}

export function LearningHistory({ currentId, onClose, onSelect, onNew }: {
  currentId?: string; onClose: () => void;
  onSelect: (session: LearningSessionRecord) => void; onNew: (draft?: string) => void;
}) {
  const [sessions, setSessions] = useState(() => listLearningSessions().filter(s => s.source?.mode !== "preview"));
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"resume" | "facts" | "map" | "report">("resume");
  const [reportShown] = useState(weeklyReportShown);
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    let active = true;
    void discoverServerLearningSessions().then(found => {
      if (!active) return;
      found.forEach(adoptLearningSession);
      setSessions(listLearningSessions().filter(s => s.source?.mode !== "preview"));
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setSyncing(false); });
    return () => { active = false; previous?.focus(); };
  }, []);
  const visible = sessions.filter(s => s.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="learning-history-overlay" onClick={onClose}>
    <aside ref={panel} className="learning-history-panel" role="dialog" aria-modal="true" aria-label="学习记录" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const elements = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href], summary');
        const first = elements?.[0], last = elements?.[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <header><div><h2>学习记录</h2><p>继续之前的白板与课程</p></div><button onClick={onClose} aria-label="关闭学习记录"><X size={20} /></button></header>
      <div className="learning-history-tabs" role="tablist" aria-label="记录类型">
        <button role="tab" aria-selected={tab === "resume"} onClick={() => setTab("resume")}>继续学习</button>
        <button role="tab" aria-selected={tab === "facts"} onClick={() => setTab("facts")}>学习经过</button>
        <button role="tab" aria-selected={tab === "map"} onClick={() => setTab("map")}>学习地图</button>
        {reportShown && <button role="tab" aria-selected={tab === "report"} onClick={() => setTab("report")}>周报</button>}
      </div>
      {tab === "report" ? <WeeklyReportPanel onSelect={onSelect} onNew={onNew} /> : tab === "map" ? <LearningMapPanel onSelect={onSelect} onNew={onNew} /> : tab === "facts" ? <AccountHistoryPanel onSelect={onSelect} /> : <>
      <button className="learning-history-new" onClick={() => onNew()}><Plus size={18} /> 新建白板</button>
      <label className="learning-history-search"><Search size={17} /><input aria-label="搜索学习记录" placeholder="搜索学习记录" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {syncing && <p role="status">正在同步历史记录…</p>}
      {error && <p role="status">暂时无法同步，仍可打开本机保存的记录。</p>}
      <div className="learning-history-list">
        {visible.map(session => <button key={session.id} className="learning-history-item" aria-current={session.id === currentId ? "page" : undefined} onClick={() => onSelect(session)}>
          <strong>{session.title}</strong><span>{new Date(session.updatedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {session.source ? "课程学习" : "自由白板"}{session.id === currentId ? " · 当前" : ""}</span>
        </button>)}
        {!visible.length && <p>{query ? "没有找到匹配的学习记录" : "还没有保存的学习记录"}</p>}
      </div>
      </>}
    </aside>
  </div>;
}
