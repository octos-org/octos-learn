// "My lessons": every lesson the learner is teaching or has taught, kept with
// their account and on this device. Saved lessons play from their package;
// drafts open in the studio. In this phase only the learner sees them.

import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";
import { MoreHorizontal, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getSelectedProfileId } from "@/api/client";

import { AcademyHeader } from "../academy/academy-header";
import { forgetSyncedDraft, syncLessonDrafts } from "./draft-sync";
import { deleteLesson, exportLesson, fetchLessonPackage, type SavedLessonSummary } from "./learner-lessons-api";
import { LEARNER_PACKAGE_EXTENSION } from "./learner-package";
import { deleteStoredLearnerPackage } from "./learner-package-store";
import { keptTake, type LearnerRecording } from "./recording";
import { deleteRecordingDraft, loadRecordingDrafts } from "./recording-store";
import "./teach.css";

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
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function stateLine(row: LessonRow): string {
  const lesson = row.saved;
  if (lesson?.saved) {
    if (lesson.state === "withdrawn") return tr("已撤回");
    return lesson.changed_since_saved ? tr("已保存 · 之后又改过，还没重新保存") : tr("已保存 · 只有你能看到");
  }
  const draft = row.draft;
  return draft ? tr("草稿 · 录好 {{v0}}/{{v1}} 张", { v0: draft.cards.filter((card) => keptTake(card)).length, v1: draft.cards.length }) : tr("草稿");
}

export function TeachLessonsPage() {
  useLocale();
  const profileId = getSelectedProfileId() ?? "local";
  // Listed once the account answers, so a saved lesson never shows as a draft first.
  const [list, setList] = useState<LessonRow[]>([]);
  const [reachable, setReachable] = useState<"checking" | "yes" | "no">("checking");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void syncLessonDrafts(localStorage, profileId)
      .then((synced) => ({ lessons: synced.lessons, reached: "yes" as const }))
      .catch(() => ({ lessons: [], reached: "no" as const }))
      .then(({ lessons, reached }) => {
        if (!active) return;
        setList(rows(loadRecordingDrafts(localStorage, profileId), lessons));
        setReachable(reached);
      });
    return () => { active = false; };
  }, [profileId]);

  const remove = async (row: LessonRow) => {
    setFailure(null);
    try {
      if (row.saved) await deleteLesson(row.id);
      deleteRecordingDraft(localStorage, profileId, row.id);
      forgetSyncedDraft(localStorage, profileId, row.id);
      await deleteStoredLearnerPackage(row.id).catch(() => undefined);
      setConfirming(null);
      setList((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : tr("这次没能删除，请再试一次。"));
    }
  };
  const exportRow = async (row: LessonRow) => {
    setFailure(null);
    try {
      save(`lesson-${row.id}.json`, new Blob([JSON.stringify(await exportLesson(row.id), null, 2)], { type: "application/json" }));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : tr("这次没能导出，请再试一次。"));
    }
  };
  const downloadPackage = async (row: LessonRow) => {
    setFailure(null);
    try {
      save(`lesson-${row.id}${LEARNER_PACKAGE_EXTENSION}`, new Blob([await fetchLessonPackage(row.id)], { type: "application/zip" }));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : tr("这次没能下载，请再试一次。"));
    }
  };

  return (
    <main className="course-launcher academy-page teach-page">
      <div className="course-launcher-inner">
        <AcademyHeader />
        <h1 className="academy-title">{tr("我的课")}</h1>
        <p className="academy-muted">{tr("你讲过和正在讲的课。现在只有你自己能看到。")}</p>
        <Link to="/teach" className="teach-primary teach-new-lesson"><Plus size={16} aria-hidden="true" />{tr("讲一节新课")}</Link>
        {reachable === "checking" && <p role="status" className="academy-muted">{tr("正在打开“我的课”…")}</p>}
        {reachable === "no" && <p role="status" className="teach-notice">{tr("现在连不上“我的课”，下面是这台设备上的草稿。")}</p>}
        {failure && <p role="alert">{failure}</p>}
        {list.length === 0 ? (
          reachable !== "checking" && <p className="academy-muted">{tr("还没有课。讲一节吧！")}</p>
        ) : (
          <ul className="teach-lessons" aria-label={tr("我的课")}>
            {list.map((row) => (
              <li key={row.id}>
                <div className="teach-lesson-text">
                  <strong>{row.title}</strong>
                  <span className="teach-chip">{stateLine(row)}</span>
                </div>
                <div className="teach-lesson-actions">
                  {row.saved?.saved && (
                    <Link to={`/teach/lessons/${row.id}/play`} className="teach-primary"><Play size={16} aria-hidden="true" />{tr("播放课")}</Link>
                  )}
                  {row.draft && <Link to={`/teach/${row.id}`} className="teach-secondary">{tr("接着改")}</Link>}
                  {row.draft && (!row.saved?.saved || row.saved.changed_since_saved) && (
                    <Link to={`/teach/${row.id}/watch`} className="teach-secondary">{tr("看一遍再保存")}</Link>
                  )}
                  <details className="teach-lesson-more">
                    <summary aria-label={tr("“{{v0}}”的更多操作", { v0: row.title })}><MoreHorizontal size={16} aria-hidden="true" /></summary>
                    <div>
                      {row.saved && <button type="button" onClick={() => void exportRow(row)}>{tr("导出这节课的记录")}</button>}
                      {row.saved?.saved && <button type="button" onClick={() => void downloadPackage(row)}>{tr("下载课程包")}</button>}
                      <button type="button" onClick={() => setConfirming(row.id)}>{tr("删除")}</button>
                    </div>
                  </details>
                </div>
                {confirming === row.id && (
                  <div className="teach-question" role="alertdialog" aria-label={tr("删除“{{v0}}”？", { v0: row.title })}>
                    <p>{tr("删除后，这节课的草稿、保存的版本和它带来的星图记录都会删掉，不能恢复。")}</p>
                    <button type="button" onClick={() => void remove(row)}>{tr("确定删除")}</button>
                    <button type="button" onClick={() => setConfirming(null)}>{tr("不删了")}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
