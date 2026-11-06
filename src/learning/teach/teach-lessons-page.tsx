import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { ArrowRight, ArrowUpRight, BookOpen, Download, FileDown, LoaderCircle, MoreHorizontal, PencilLine, Play, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getSelectedProfileId } from "@/api/client";
import { AcademyHeader } from "../academy/academy-header";
import { forgetSyncedDraft, syncLessonDrafts } from "./draft-sync";
import { deleteLesson, exportLesson, fetchLessonPackage, type SavedLessonSummary } from "./learner-lessons-api";
import { LEARNER_PACKAGE_EXTENSION } from "./learner-package";
import { deleteStoredLearnerPackage } from "./learner-package-store";
import { keptTake, type LearnerRecording } from "./recording";
import { deleteRecordingDraft, loadRecordingDrafts } from "./recording-store";
import { deleteRecordingPerformances } from "./take-performance-store";
import { DeleteLessonDialog } from "./delete-lesson-dialog";
import "./teach.css";
import "./teach-pages.css";

interface LessonRow {
  id: string;
  title: string;
  draft?: LearnerRecording;
  saved?: SavedLessonSummary;
  updatedAt: string;
}

function rows(drafts: LearnerRecording[], saved: SavedLessonSummary[]): LessonRow[] {
  const byId = new Map<string, LessonRow>();
  for (const draft of drafts) if (draft.cards.length) byId.set(draft.id, { id: draft.id, title: draft.topic.text, draft, updatedAt: draft.updatedAt });
  for (const lesson of saved) {
    const row = byId.get(lesson.lesson_id);
    byId.set(lesson.lesson_id, { id: lesson.lesson_id, title: row?.title ?? lesson.title, draft: row?.draft, saved: lesson, updatedAt: row?.updatedAt ?? lesson.updated_at });
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function stateLine(row: LessonRow): string {
  if (row.saved?.saved) {
    if (row.saved.state === "withdrawn") return tr("已撤回");
    return row.saved.changed_since_saved ? tr("已保存 · 之后又改过，还没重新保存") : tr("已保存 · 只有你能看到");
  }
  return row.draft ? tr("草稿 · 录好 {{v0}}/{{v1}} 张", { v0: row.draft.cards.filter((card) => keptTake(card)).length, v1: row.draft.cards.length }) : tr("草稿");
}

function LessonMenu({ row, onExport, onDownload, onDelete }: {
  row: LessonRow; onExport: () => void; onDownload: () => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const choose = (action: () => void) => {
    if (ref.current) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); }
    action();
  };
  return <details ref={ref} name="lesson-actions" className="teach-library-menu" onKeyDown={(event) => {
    if (event.key === "Escape" && ref.current?.open) { event.preventDefault(); ref.current.open = false; ref.current.querySelector("summary")?.focus(); }
  }}>
    <summary aria-label={tr("“{{v0}}”的更多操作", { v0: row.title })}><MoreHorizontal size={20} aria-hidden="true" /></summary>
    <div>
      {row.saved && <button type="button" onClick={() => choose(onExport)}><FileDown size={16} aria-hidden="true" />{tr("导出这节课的记录")}</button>}
      {row.saved?.saved && <button type="button" onClick={() => choose(onDownload)}><Download size={16} aria-hidden="true" />{tr("下载课程包")}</button>}
      <button type="button" className="teach-library-delete" onClick={() => choose(onDelete)}><Trash2 size={16} aria-hidden="true" />{tr("删除")}</button>
    </div>
  </details>;
}

/** The single course library. Direct visits sync account drafts before listing them. */
export function TeachLessonsPage() {
  const locale = useLocale();
  const profileId = getSelectedProfileId() ?? "local";
  const [list, setList] = useState<LessonRow[]>([]);
  const [reachable, setReachable] = useState<"checking" | "yes" | "no">("checking");
  const [retry, setRetry] = useState(0);
  const [syncFailures, setSyncFailures] = useState(0);
  const [filter, setFilter] = useState<"all" | "draft" | "saved">("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void syncLessonDrafts(localStorage, profileId)
      .then((synced) => ({ lessons: synced.lessons, reached: "yes" as const, failed: Object.keys(synced.failed).length }))
      .catch(() => ({ lessons: [], reached: "no" as const, failed: 0 }))
      .then(({ lessons, reached, failed }) => {
        if (!active) return;
        setList(rows(loadRecordingDrafts(localStorage, profileId), lessons));
        setReachable(reached); setSyncFailures(failed);
      });
    return () => { active = false; };
  }, [profileId, retry]);

  const remove = async (row: LessonRow) => {
    if (deleting) return;
    setDeleting(true); setDeleteFailure(null);
    try {
      if (row.saved) await deleteLesson(row.id);
      if (!deleteRecordingDraft(localStorage, profileId, row.id)) throw new Error(tr("这台设备暂时保存不了，请稍后再试。"));
      forgetSyncedDraft(localStorage, profileId, row.id);
      await deleteStoredLearnerPackage(row.id).catch(() => undefined);
      await deleteRecordingPerformances(profileId, row.id).catch(() => undefined);
      setConfirming(null);
      setList((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      setDeleteFailure(error instanceof Error ? error.message : tr("这次没能删除，请再试一次。"));
    } finally { setDeleting(false); }
  };
  const exportRow = async (row: LessonRow) => {
    setFailure(null);
    try { save(`lesson-${row.id}.json`, new Blob([JSON.stringify(await exportLesson(row.id), null, 2)], { type: "application/json" })); }
    catch (error) { setFailure(error instanceof Error ? error.message : tr("这次没能导出，请再试一次。")); }
  };
  const downloadPackage = async (row: LessonRow) => {
    setFailure(null);
    try { save(`lesson-${row.id}${LEARNER_PACKAGE_EXTENSION}`, new Blob([await fetchLessonPackage(row.id)], { type: "application/zip" })); }
    catch (error) { setFailure(error instanceof Error ? error.message : tr("这次没能下载，请再试一次。")); }
  };
  const savedCount = list.filter((row) => row.saved?.saved).length;
  const shown = list.filter((row) => filter === "all" || (filter === "saved" ? Boolean(row.saved?.saved) : !row.saved?.saved));
  const target = list.find((row) => row.id === confirming);
  const filters = [{ id: "all", label: tr("全部"), count: list.length }, { id: "draft", label: tr("草稿"), count: list.length - savedCount }, { id: "saved", label: tr("已保存"), count: savedCount }] as const;

  return <main className="course-launcher academy-page teach-page teach-library-page">
    <div className="course-launcher-inner academy-wide">
      <AcademyHeader />
      <section className="academy-records teach-library" aria-labelledby="teach-library-title">
        <header className="academy-records-head teach-library-head">
          <div><h1 id="teach-library-title" className="academy-title">{tr("我的课")}</h1><p>{tr("你讲过和正在讲的课。现在只有你自己能看到。")}</p></div>
          <span className="teach-library-eyebrow"><BookOpen size={16} aria-hidden="true" />{tr("我的讲解")}</span>
        </header>
        <div className="academy-report-band teach-library-intro">
          <div><p className="teach-library-kicker">{tr("从理解，到讲清楚")}</p><h2>{tr("把你知道的，讲成一节课。")}</h2><p>{tr("从一个主题开始，写下思路，留下你的讲解。")}</p></div>
          <Link to="/teach/new" className="teach-library-create"><Plus size={18} aria-hidden="true" />{tr("讲一节新课")}<ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className="teach-library-toolbar">
          <div className="academy-records-views teach-library-filters" role="group" aria-label={tr("课程筛选")}>
            {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{reachable === "checking" ? "—" : item.count}</span></button>)}
          </div>
          <span className="teach-library-sort">{tr("最近更新")}</span>
        </div>
        {reachable === "checking" && <p role="status" className="teach-library-status"><LoaderCircle size={18} className="teach-library-spin" aria-hidden="true" />{tr("正在打开“我的课”…")}</p>}
        {(reachable === "no" || syncFailures > 0) && <div className="teach-library-notice" role="status"><p>{reachable === "no" ? tr("现在连不上“我的课”，下面是这台设备上的草稿。") : tr("有 {{v0}} 节课暂未同步，请稍后重试。", { v0: syncFailures })}</p><button type="button" onClick={() => { setReachable("checking"); setRetry((value) => value + 1); }}><RefreshCw size={15} aria-hidden="true" />{tr("重试")}</button></div>}
        {failure && <p role="alert" className="teach-library-error">{failure}</p>}
        {shown.length > 0 ? <ul className="teach-library-list" aria-label={tr("我的课")}>
          {shown.map((row) => {
            const total = row.draft?.cards.length ?? row.saved?.saved?.cards ?? 0;
            const recorded = row.draft?.cards.filter((card) => keptTake(card)).length ?? total;
            const saved = Boolean(row.saved?.saved);
            return <li key={row.id} className="teach-library-card" data-saved={saved || undefined}>
              <div className="teach-library-card-top"><span className="teach-library-badge" data-saved={saved || undefined}>{saved ? tr("已保存") : tr("草稿")}</span>
                <time dateTime={row.updatedAt}>{tr("更新于 {{v0}}", { v0: new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(row.updatedAt)) })}</time>
                <LessonMenu row={row} onExport={() => void exportRow(row)} onDownload={() => void downloadPackage(row)} onDelete={() => { setDeleteFailure(null); setConfirming(row.id); }} />
              </div>
              <h2>{row.title}</h2>
              {row.draft?.goals[0] && <p className="teach-library-goal">{row.draft.goals[0]}</p>}
              <div className="teach-library-progress"><p>{stateLine(row)}</p>{total > 0 && <progress aria-label={tr("“{{v0}}”的录制进度", { v0: row.title })} value={recorded} max={total} />}</div>
              <div className="teach-library-card-actions">
                {saved && <Link to={`/teach/lessons/${row.id}/play`} className="teach-library-action teach-library-action-primary"><Play size={15} aria-hidden="true" />{tr("播放课")}</Link>}
                {row.draft && <Link to={`/teach/${row.id}`} className={`teach-library-action${!saved ? " teach-library-action-primary" : ""}`}><PencilLine size={15} aria-hidden="true" />{tr("接着改")}</Link>}
                {row.draft && (!saved || row.saved?.changed_since_saved) && <Link to={`/teach/${row.id}/watch`} className="teach-library-preview"><Play size={14} aria-hidden="true" />{tr("看一遍再保存")}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
              </div>
            </li>;
          })}
        </ul> : reachable !== "checking" && <div className="teach-library-empty"><BookOpen size={34} strokeWidth={1.3} aria-hidden="true" /><h2>{filter === "all" ? tr("你的第一节课，从这里开始") : filter === "saved" ? tr("还没有保存好的课") : tr("还没有正在录制的课")}</h2><p>{filter === "saved" ? tr("录好并检查课程后，就可以把它保存到这里。") : tr("选一个你想分享的主题，慢慢把它讲清楚。")}</p>{filter !== "saved" && <Link to="/teach/new" className="teach-library-action teach-library-action-primary"><Plus size={16} aria-hidden="true" />{tr("讲一节新课")}</Link>}</div>}
        <footer className="teach-library-tools"><span>{tr("更多创作工具")}</span><Link to="/teach/package"><FileDown size={15} aria-hidden="true" />{tr("播放课程包")}<ArrowUpRight size={13} aria-hidden="true" /></Link><Link to="/teach/avatar-2d"><Sparkles size={15} aria-hidden="true" />{tr("体验动态头像")}<ArrowUpRight size={13} aria-hidden="true" /></Link></footer>
      </section>
      {target && <DeleteLessonDialog title={target.title} busy={deleting} error={deleteFailure} onConfirm={() => void remove(target)} onCancel={() => { if (!deleting) setConfirming(null); }} />}
    </div>
  </main>;
}
