import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookHeart, Loader2, Plus, RefreshCw } from "lucide-react";

import { ConfirmDialog } from "./confirm-dialog";
import { getMyMemory, requestMemoryChange, type MemoryOverview } from "./settings-api";
import { TEACHERS } from "@/learning/teachers/teachers";
import {
  memoryGroup,
  memoryGroupLabel,
  parseMemoryEntries,
  scopedContent,
  type MemoryEntry,
  type MemoryGroup,
} from "@/learning/memory/memory-entries";
import {
  loadPendingRequests,
  memorySnapshot,
  reconcileRequests,
  savePendingRequests,
  type MemoryOperation,
  type PendingMemoryRequest,
} from "@/learning/memory/memory-requests";

type Scope = Exclude<MemoryGroup, "other">;
type Filter = "every" | Scope;
type Draft =
  | { operation: "remember"; requestId: string; text: string; scope: Scope }
  | { operation: "correct"; requestId: string; entry: MemoryEntry; text: string; scope: Scope }
  | { operation: "forget"; requestId: string; entry: MemoryEntry };

const SCOPES: Scope[] = ["all", ...TEACHERS.map((teacher) => teacher.id), "me"];
const newRequestId = () => `learn-memory-${crypto.randomUUID()}`;

function ScopeChoice({ value, onChange }: { value: Scope; onChange: (scope: Scope) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-xs text-muted">对哪位老师</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {SCOPES.map((scope) => (
          <label key={scope} className="flex min-h-8 items-center gap-2 text-sm text-text">
            <input type="radio" name="memory-scope" checked={value === scope} onChange={() => onChange(scope)} />
            {scope === "all" || scope === "me" ? memoryGroupLabel(scope) : `只对${memoryGroupLabel(scope)}`}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EntryRow({ entry, group, pending, onCorrect, onForget, onDismiss }: {
  entry: MemoryEntry;
  group: MemoryGroup;
  pending?: PendingMemoryRequest;
  onCorrect: () => void;
  onForget: () => void;
  onDismiss: () => void;
}) {
  const forgetting = pending?.operation === "forget" && !pending.failed;
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0" data-testid={`memory-entry-${entry.id ?? entry.text}`}>
      <span className="workbench-status-pill shrink-0" data-tone={group === "other" || group === "me" ? "neutral" : "accent"}>
        {memoryGroupLabel(group)}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${forgetting ? "text-muted line-through" : "text-text-strong"}`}>{entry.text}</div>
        {entry.updated && <div className="mt-0.5 text-xs text-muted">更新于 {entry.updated}</div>}
      </div>
      {pending ? (
        pending.failed ? (
          <span className="flex shrink-0 items-center gap-2">
            <span className="workbench-status-pill" data-tone="neutral">没有按要求改好</span>
            <button type="button" onClick={onDismiss} className="text-xs text-accent">知道了</button>
          </span>
        ) : (
          <span className="workbench-status-pill shrink-0" data-tone="warning">已收到，等待整理</span>
        )
      ) : entry.id ? (
        <span className="flex shrink-0 gap-2">
          <button type="button" onClick={onCorrect} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:border-accent/40">改一改</button>
          <button type="button" onClick={onForget} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:border-accent/40">忘掉</button>
        </span>
      ) : null}
    </li>
  );
}

/** What the teachers remember about this learner: Octos long-term memory, read
 * as is. Changes are requests to Octos; they show as waiting until a later
 * read of memory shows them applied. */
export function TeacherMemoryTab({ profileId }: { profileId: string }) {
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<PendingMemoryRequest[]>(() => loadPendingRequests(profileId));
  const [filter, setFilter] = useState<Filter>("every");
  const [showOther, setShowOther] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const entries = useMemo(() => parseMemoryEntries(overview?.long_term ?? ""), [overview]);
  const updatePending = useCallback((next: PendingMemoryRequest[]) => {
    setPending(next);
    savePendingRequests(profileId, next);
  }, [profileId]);

  // Settle waiting requests against what Octos memory now holds.
  const show = useCallback((next: MemoryOverview) => {
    setOverview(next);
    setLoadError(false);
    updatePending(reconcileRequests(loadPendingRequests(profileId), parseMemoryEntries(next.long_term ?? ""), next.long_term_updated_at));
  }, [profileId, updatePending]);

  const load = useCallback(() => {
    let current = true;
    getMyMemory().then(
      (next) => { if (current) show(next); },
      () => { if (current) setLoadError(true); },
    ).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [show]);

  useEffect(() => load(), [load]);

  const grouped = entries.map((entry) => ({ entry, group: memoryGroup(entry.text) }));
  const learning = grouped.filter((item) => item.group !== "other");
  const other = grouped.filter((item) => item.group === "other");
  const shown = filter === "every" ? learning : learning.filter((item) => item.group === filter);
  const pendingFor = (entry: MemoryEntry) => entry.id ? pending.find((request) => request.entry_id === entry.id) : undefined;
  const waitingRemembers = pending.filter((request) => request.operation === "remember");

  const submit = async () => {
    if (!draft) return;
    const operation: MemoryOperation = draft.operation;
    const content = draft.operation === "forget" ? undefined : scopedContent(draft.scope, draft.text);
    const entry = draft.operation === "remember" ? undefined : draft.entry;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await requestMemoryChange({ request_id: draft.requestId, operation, ...(content ? { content } : {}), ...(entry?.id ? { entry_id: entry.id } : {}) });
      updatePending([
        ...pending.filter((request) => !(entry?.id && request.entry_id === entry.id)),
        { request_id: draft.requestId, operation, ...(content ? { content } : {}), ...(entry?.id ? { entry_id: entry.id, original_text: entry.text } : {}),
          snapshot: memorySnapshot(entries), submitted_at: new Date().toISOString() },
      ]);
      setDraft(null);
    } catch (error) {
      if ((error as { data?: { kind?: unknown } } | null)?.data?.kind === "not_found") {
        // The entry is already gone (changed elsewhere): show memory as it is now.
        setDraft(null);
        load();
        return;
      }
      // The same request id is reused on retry, so Octos admits it once.
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = ({ entry, group }: { entry: MemoryEntry; group: MemoryGroup }) => (
    <EntryRow
      key={entry.id ?? entry.text}
      entry={entry}
      group={group}
      pending={pendingFor(entry)}
      onCorrect={() => setDraft({ operation: "correct", requestId: newRequestId(), entry, text: entry.text, scope: group === "other" ? "me" : group })}
      onForget={() => setDraft({ operation: "forget", requestId: newRequestId(), entry })}
      onDismiss={() => updatePending(pending.filter((request) => request.entry_id !== entry.id))}
    />
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "every", label: `全部 ${learning.length}` },
    ...SCOPES.map((scope) => ({ id: scope, label: memoryGroupLabel(scope) })),
  ];

  return (
    <section className="glass-section p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="workbench-icon-tile flex h-10 w-10 shrink-0 items-center justify-center">
            <BookHeart size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-strong">老师记得的事</h3>
            <p className="mt-1 text-sm text-muted">老师从你们的对话里记住这些，下次上课时会用上。不对的可以改，不想让老师记着的可以让他们忘掉。</p>
            <p className="mt-1 text-sm text-muted">
              每次学习的经过（播放、作答、提问）另存在学习记录里，星图和成就都按它计算，可以逐条查看或删除：
              <Link to="/records?tab=facts" className="ml-1 text-accent underline">打开学习记录</Link>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => { setLoading(true); load(); }} aria-label="刷新" className="glass-icon-button p-2.5" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
          <button type="button" onClick={() => setDraft({ operation: "remember", requestId: newRequestId(), text: "", scope: "all" })}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dim">
            <Plus size={15} />让老师记住一件事
          </button>
        </div>
      </div>

      {loadError && <p role="alert" className="mt-4 text-sm text-red-500">暂时读不到老师的记忆，请稍后点刷新重试。</p>}
      {overview && !overview.refresh_enabled && (
        <p className="mt-4 rounded-lg bg-surface-container px-3 py-2 text-sm text-muted">后台整理记忆没有开启：你的请求会被保存，但要等开启后才会生效。</p>
      )}
      {overview?.long_term_truncated && (
        <p className="mt-4 rounded-lg bg-surface-container px-3 py-2 text-sm text-muted">记忆内容太长，这里只显示了前一部分。</p>
      )}

      {overview && (
        <>
          <div role="group" aria-label="按老师筛选" className="mt-5 flex flex-wrap gap-2">
            {filters.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                className={`rounded-full border px-3 py-1.5 text-xs ${filter === id ? "border-accent bg-accent text-white" : "border-border text-text hover:border-accent/40"}`}>
                {label}
              </button>
            ))}
          </div>

          <ul className="workbench-card mt-4 overflow-hidden p-0">
            {waitingRemembers.map((request) => (
              <li key={request.request_id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <span className="workbench-status-pill shrink-0" data-tone="neutral">新的</span>
                <div className="min-w-0 flex-1 text-sm text-text-strong">{request.content}</div>
                {request.failed ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="workbench-status-pill" data-tone="neutral">没有按要求改好</span>
                    <button type="button" onClick={() => updatePending(pending.filter((item) => item.request_id !== request.request_id))} className="text-xs text-accent">知道了</button>
                  </span>
                ) : <span className="workbench-status-pill shrink-0" data-tone="warning">已收到，等待整理</span>}
              </li>
            ))}
            {shown.map(renderRow)}
            {!shown.length && !waitingRemembers.length && (
              <li className="px-4 py-6 text-center text-sm text-muted">
                {learning.length ? "这一类还没有内容。" : "老师还没有记住什么。上课时说过的偏好和经历，整理后会出现在这里。"}
              </li>
            )}
          </ul>

          {other.length > 0 && (
            <div className="mt-4">
              <button type="button" aria-expanded={showOther} onClick={() => setShowOther(!showOther)} className="text-sm text-accent">
                {showOther ? "收起" : "展开"}其他（{other.length} 条，和学习无关）
              </button>
              {showOther && <ul className="workbench-card mt-2 overflow-hidden p-0">{other.map(renderRow)}</ul>}
            </div>
          )}
        </>
      )}

      <p className="mt-5 text-xs text-muted">上过哪些课、练习了几次，在学习记录里查看。删除学习记录和让老师忘掉是两件事：删除记录马上生效，但不会让老师忘掉已经记住的事；让老师忘掉只影响这里的内容，上过的课和统计都保留。</p>

      <ConfirmDialog
        open={draft !== null}
        title={draft?.operation === "remember" ? "让老师记住一件事" : draft?.operation === "correct" ? "改一改这条" : "让老师忘掉这条？"}
        body={draft?.operation === "forget"
          ? "所有老师以后都不会再用这条，你上过的课和学习记录不会被删除。如果以后上课时你又说起这件事，老师可能会重新记住。"
          : draft?.operation === "correct"
            ? "提交后老师会先收到，下次整理记忆时改好。整理之前，这条可能还会用到一次。"
            : "提交后老师会先收到，下次整理记忆时加上。"}
        confirmLabel={submitting ? "提交中…" : draft?.operation === "forget" ? "忘掉" : draft?.operation === "correct" ? "提交修改" : "提交"}
        cancelLabel={draft?.operation === "forget" ? "留着" : "取消"}
        confirmDisabled={submitting || (draft !== null && draft.operation !== "forget" && !draft.text.trim())}
        variant={draft?.operation === "forget" ? "danger" : "default"}
        onCancel={() => { if (!submitting) { setDraft(null); setSubmitError(false); } }}
        onConfirm={() => void submit()}
      >
        {draft && draft.operation !== "remember" && (
          <div className="rounded-lg bg-surface-container px-3 py-2 text-sm text-text">
            <div className="mb-1 text-xs text-muted">老师现在记得</div>
            {draft.entry.text}
          </div>
        )}
        {draft && draft.operation !== "forget" && (
          <>
            <label htmlFor="memory-draft" className="mb-1 mt-4 block text-xs text-muted">{draft.operation === "correct" ? "应该是" : "想让老师记住什么"}</label>
            <textarea id="memory-draft" rows={3} maxLength={2000} value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              className="w-full resize-none rounded-lg border border-border bg-surface-container px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            <ScopeChoice value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} />
          </>
        )}
        {submitError && <p role="alert" className="mt-3 text-sm text-red-500">没能提交，请稍后再试。</p>}
      </ConfirmDialog>
    </section>
  );
}
