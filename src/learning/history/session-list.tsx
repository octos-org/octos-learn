import { useLocale } from "@/i18n/use-locale";
import { getLocale, tr } from "@/i18n";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { adoptLearningSession, listLearningSessions, type LearningSessionRecord } from "../learning-session-store";
import { discoverServerLearningSessions } from "../learning-session-sync";

/** Every saved board and course lesson, newest first, after picking up the
 * ones another device saved. Course previews are not lessons and stay out. */
export function SessionList({ currentId, onSelect, onNew }: {
  currentId?: string; onSelect: (session: LearningSessionRecord) => void; onNew: () => void;
}) {
  useLocale();
  const [sessions, setSessions] = useState(() => listLearningSessions().filter(s => s.source?.mode !== "preview"));
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void discoverServerLearningSessions().then(found => {
      if (!active) return;
      found.forEach(adoptLearningSession);
      setSessions(listLearningSessions().filter(s => s.source?.mode !== "preview"));
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setSyncing(false); });
    return () => { active = false; };
  }, []);
  const visible = sessions.filter(s => s.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <button className="learning-history-new" onClick={onNew}><Plus size={18} /> {tr("新建白板")}</button>
    <label className="learning-history-search"><Search size={17} /><input aria-label={tr("搜索学习记录")} placeholder={tr("搜索学习记录")} value={query} onChange={e => setQuery(e.target.value)} /></label>
    {syncing && <p role="status">{tr("正在同步历史记录…")}</p>}
    {error && <p role="status">{tr("暂时无法同步，仍可打开本机保存的记录。")}</p>}
    <div className="learning-history-list">
      {visible.map(session => <button key={session.id} className="learning-history-item" aria-current={session.id === currentId ? "page" : undefined} onClick={() => onSelect(session)}>
        <strong>{session.title}</strong><span>{new Date(session.updatedAt).toLocaleString(getLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {session.source ? tr("课程学习") : tr("自由白板")}{session.id === currentId ? tr(" · 当前") : ""}</span>
      </button>)}
      {!visible.length && <p>{query ? tr("没有找到匹配的学习记录") : tr("还没有保存的学习记录")}</p>}
    </div>
  </>;
}
