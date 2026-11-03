// "Check my lesson": one dialog for the screen check and Octo's review, with
// what to fix on each card and a way straight to that card.

import { tr } from "@/i18n";
import { Check, Play, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";

import type { CardCheck } from "./lesson-check";

export type CheckPart = "running" | "done" | "failed";

export interface CheckRun {
  screen: CheckPart;
  octo: CheckPart;
}

function Progress({ state, running, done, failed }: { state: CheckPart; running: string; done: string; failed: string }) {
  return (
    <div className="teach-check-progress" data-state={state}>
      {state === "done" ? <Check size={16} aria-hidden="true" /> : state === "failed" ? <X size={16} aria-hidden="true" /> : <span className="teach-spinner" aria-hidden="true" />}
      <span>{state === "done" ? done : state === "failed" ? failed : running}</span>
    </div>
  );
}

const KIND_TAG = { slip: () => tr("小章鱼 · 口误"), misconception: () => tr("小章鱼 · 概念"), unclear: () => tr("小章鱼 · 不够清楚") } as const;

export function CheckDialog({ run, checks, overall, watchHref, onFix, onAgain, onClose }: {
  run: CheckRun;
  checks: CardCheck[];
  overall?: string;
  /** Where to watch the lesson, once nothing is left to fix. */
  watchHref?: string;
  onFix: (key: string) => void;
  onAgain: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }, []);
  const running = run.screen === "running" || run.octo === "running";
  const toFix = checks.filter((check) => check.status === "fix");
  return (
    <dialog ref={dialog} className="teach-check" aria-labelledby="teach-check-title" onCancel={onClose}>
      <div className="teach-check-head">
        <h2 id="teach-check-title">{tr("检查我的课")}</h2>
        <button type="button" className="teach-icon-button" aria-label={tr("关闭")} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="teach-check-parts">
        <Progress state={run.screen} running={tr("正在小屏幕和大屏幕上各播放一遍…")} done={tr("在小屏幕和大屏幕上都检查过了")} failed={tr("屏幕检查没做完")} />
        <Progress state={run.octo} running={tr("小章鱼在看你的课…")} done={tr("小章鱼看完了你的课")} failed={tr("小章鱼这次没看完")} />
      </div>
      {!running && (
        <p className="teach-check-summary">
          {toFix.length ? tr("还差一点！改好 {{v0}} 张卡片就可以看你的课了。", { v0: toFix.length }) : overall ?? tr("每张卡片都很好，可以看你的课了！")}
        </p>
      )}
      {!running && (
        <ol className="teach-check-list">
          {checks.map((check, index) => (
            <li key={check.key} data-status={check.status}>
              <span className="teach-check-mark" aria-hidden="true">{check.status === "good" ? "✓" : check.status === "fix" ? "!" : "↻"}</span>
              <div>
                <strong>{index + 1} · {check.title}</strong>
                {check.status === "good" && check.praise && <p>{check.praise}</p>}
                {check.status === "redo" && <p>{tr("这张卡片检查后又重录了，再检查一遍就知道了。")}</p>}
                {check.findings.map((finding, findingIndex) => (
                  <p key={`${finding.source}-${findingIndex}`}>
                    <span className="teach-tag" data-source={finding.source}>{finding.source === "screen" ? tr("屏幕检查") : finding.source === "privacy" ? tr("隐私") : finding.kind ? KIND_TAG[finding.kind]() : tr("小章鱼")}</span>
                    {finding.message}
                  </p>
                ))}
              </div>
              {check.status === "fix" && <button type="button" className="teach-primary" onClick={() => onFix(check.key)}>{tr("去改第 {{v0}} 张", { v0: index + 1 })}</button>}
            </li>
          ))}
        </ol>
      )}
      <div className="teach-check-foot">
        <button type="button" className="teach-secondary" disabled={running} onClick={onAgain}>{tr("再检查一遍")}</button>
        {watchHref && !running && <Link className="teach-primary" to={watchHref}><Play size={16} aria-hidden="true" />{tr("看我的课")}</Link>}
      </div>
    </dialog>
  );
}
