import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { LearnTraceEvent, LearnTraceRecorder } from "./learn-trace";

function eventOffset(
  event: LearnTraceEvent,
  firstByTurn: ReadonlyMap<string, number>,
): string {
  const first = firstByTurn.get(event.turn_id) ?? event.recorded_at_epoch_ms;
  return `+${Math.max(0, event.recorded_at_epoch_ms - first)}ms`;
}

export function LearningTraceInspector({
  recorder,
}: {
  recorder: LearnTraceRecorder;
}) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const subscribe = useCallback(
    (listener: () => void) => recorder.subscribe(listener),
    [recorder],
  );
  const getSnapshot = useCallback(() => recorder.getEvents(), [recorder]);
  const events = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const firstByTurn = useMemo(() => {
    const first = new Map<string, number>();
    for (const event of events) {
      if (!first.has(event.turn_id)) {
        first.set(event.turn_id, event.recorded_at_epoch_ms);
      }
    }
    return first;
  }, [events]);

  const copyTrace = async () => {
    try {
      await navigator.clipboard.writeText(recorder.toJsonl());
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <aside className={`learning-trace-inspector ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="learning-trace-trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Trace <span>{events.length}</span>
      </button>
      {open ? (
        <section className="learning-trace-panel" aria-label="Learn Trace Inspector">
          <header>
            <div>
              <strong>Learn Trace</strong>
              <small>{recorder.sessionId}</small>
            </div>
            <div>
              <button type="button" onClick={() => void copyTrace()}>
                {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制 JSONL"}
              </button>
              <button type="button" onClick={() => recorder.clear()}>清空</button>
            </div>
          </header>
          <ol>
            {[...events].reverse().map((event) => (
              <li key={event.sequence}>
                <span>{eventOffset(event, firstByTurn)}</span>
                <div>
                  <strong>{event.stage}</strong>
                  <small>
                    {event.source}{event.status ? ` · ${event.status}` : ""}
                  </small>
                  {event.data ? (
                    <code>{JSON.stringify(event.data)}</code>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
  );
}
