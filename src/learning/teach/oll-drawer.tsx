import { Copy, X } from "lucide-react";
import { useState } from "react";

import { tr } from "@/i18n";
import type { CompiledLesson } from "./compile-recording";
import { checkOllEdit, effectiveLesson, lessonFingerprint } from "./oll-override";
import type { LearnerRecording, OllOverride } from "./recording";

/**
 * Advanced mode: a side drawer with the lesson's OLL, which the learner may
 * edit by hand, and the draft itself (to copy when something goes wrong).
 */
export function OllDrawer({ recording, compiled, onApply, onClose }: {
  recording: LearnerRecording;
  /** The lesson made from the recording; null while nothing is recorded. */
  compiled: CompiledLesson | null;
  /** Keeps (or, with null, drops) the hand-edited OLL. */
  onApply: (override: OllOverride | null) => void;
  onClose: () => void;
}) {
  const current = compiled ? effectiveLesson(recording, compiled) : null;
  const [tab, setTab] = useState<"oll" | "draft">("oll");
  const [text, setText] = useState(() => (current ? JSON.stringify(current.compiled.lesson, null, 2) : ""));
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const draftText = JSON.stringify(recording, null, 2);
  const copy = (value: string, what: string) => {
    void navigator.clipboard?.writeText(value).then(() => setCopied(what), () => setCopied(null));
  };
  const apply = () => {
    if (!compiled) return;
    const checked = checkOllEdit(text, compiled);
    if ("error" in checked) { setProblem(checked.error); return; }
    setProblem(null);
    onApply({ lesson: checked.lesson, basedOn: lessonFingerprint(compiled.lesson), editedAt: new Date().toISOString() });
  };
  const reset = () => {
    onApply(null);
    if (compiled) setText(JSON.stringify(compiled.lesson, null, 2));
    setProblem(null);
  };
  return (
    <aside className="teach-oll-drawer" role="dialog" aria-modal="false" aria-label={tr("高级：课程数据")}>
      <header>
        <h2>{tr("高级：课程数据")}</h2>
        <button type="button" className="teach-icon-button" aria-label={tr("关闭")} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="teach-oll-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "oll"} onClick={() => setTab("oll")}>{tr("课程（OLL）")}</button>
        <button type="button" role="tab" aria-selected={tab === "draft"} onClick={() => setTab("draft")}>{tr("草稿（排查问题用）")}</button>
      </div>
      {tab === "oll" ? (
        <>
          <p className="academy-muted">{!compiled ? tr("先录一张卡片，才有课程数据。")
            : current?.override === "active" ? tr("“看我的课”和保存用的是你改过的 OLL。录课再改动后，它会失效，换回录课生成的版本。")
              : current?.override === "stale" ? tr("你改过的 OLL 已经失效：之后录课又改动了。现在用的是录课生成的版本；可以在下面重新改。")
                : tr("这是录课生成的 OLL。改完点“检查并使用”，“看我的课”和保存就会用你的版本。")}</p>
          <textarea className="teach-oll-text" spellCheck={false} value={text} disabled={!compiled}
            aria-label={tr("课程（OLL）")} onChange={(event) => setText(event.target.value)} />
          {problem && <p role="alert" className="teach-oll-problem">{tr("这份 OLL 不能用：{{v0}}", { v0: problem })}</p>}
          <div className="teach-panel-row">
            <button type="button" className="teach-primary" disabled={!compiled} onClick={apply}>{tr("检查并使用")}</button>
            <button type="button" className="teach-secondary" disabled={!recording.oll} onClick={reset}>{tr("换回录课生成的")}</button>
            <button type="button" className="teach-secondary" disabled={!text} onClick={() => copy(text, "oll")}><Copy size={14} aria-hidden="true" />{copied === "oll" ? tr("已复制") : tr("复制")}</button>
          </div>
        </>
      ) : (
        <>
          <p className="academy-muted">{tr("这节课草稿的原始数据。遇到问题时复制给开发者，可以照原样重现。")}</p>
          <textarea className="teach-oll-text" spellCheck={false} readOnly value={draftText} aria-label={tr("草稿（排查问题用）")} />
          <div className="teach-panel-row">
            <button type="button" className="teach-secondary" onClick={() => copy(draftText, "draft")}><Copy size={14} aria-hidden="true" />{copied === "draft" ? tr("已复制") : tr("复制")}</button>
          </div>
        </>
      )}
    </aside>
  );
}
