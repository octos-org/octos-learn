import { tr } from "@/i18n";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

/** Native modal: makes the page inert, traps focus, and defaults to Cancel. */
export function DeleteLessonDialog({ title, busy, error, onConfirm, onCancel }: {
  title: string; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId(), bodyId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    cancel.current?.focus();
    return () => { if (typeof dialog.close === "function" && dialog.open) dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="teach-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} aria-busy={busy || undefined}
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onCancel();
    }}>
    <button type="button" className="teach-delete-close" aria-label={tr("关闭")} disabled={busy} onClick={onCancel}><X size={19} aria-hidden="true" /></button>
    <span className="teach-delete-symbol"><Trash2 size={23} strokeWidth={1.5} aria-hidden="true" /></span>
    <h2 id={titleId}>{tr("删除“{{v0}}”？", { v0: title })}</h2>
    <p id={bodyId}>{tr("删除后，这节课的草稿、保存的版本和它带来的星图记录都会删掉，不能恢复。")}</p>
    {error && <p className="teach-library-error" role="alert">{error}</p>}
    <div className="teach-delete-actions"><button ref={cancel} type="button" disabled={busy} onClick={onCancel}>{tr("取消")}</button><button type="button" className="teach-delete-confirm" disabled={busy} onClick={onConfirm}>{busy && <LoaderCircle size={16} className="teach-library-spin" aria-hidden="true" />}{busy ? tr("正在删除…") : tr("确定删除")}</button></div>
  </dialog>;
}
