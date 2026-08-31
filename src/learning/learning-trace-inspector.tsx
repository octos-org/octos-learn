import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { LearnTraceEvent, LearnTraceRecorder } from "./learn-trace";

function TraceIdentifier({
  field,
  value,
}: {
  field: "trace_id" | "turn_id";
  value: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyIdentifier = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="learning-trace-identifier">
      <dt>{field}</dt>
      <dd>
        <code>{value}</code>
        <button
          type="button"
          aria-label={`复制 ${field} ${value}`}
          onClick={() => void copyIdentifier()}
        >
          <span aria-live="polite">
            {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
          </span>
        </button>
      </dd>
    </div>
  );
}

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

  const turns = useMemo(() => {
    const groups = new Map<string, {
      traceId: string;
      turnId: string;
      events: LearnTraceEvent[];
    }>();
    for (const event of [...events].reverse()) {
      const key = JSON.stringify([event.trace_id, event.turn_id]);
      const group = groups.get(key);
      if (group) {
        group.events.push(event);
      } else {
        groups.set(key, {
          traceId: event.trace_id,
          turnId: event.turn_id,
          events: [event],
        });
      }
    }
    return [...groups.entries()];
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
              <small title={recorder.sessionId}>session_id: {recorder.sessionId}</small>
            </div>
            <div>
              <button type="button" onClick={() => void copyTrace()}>
                {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制 JSONL"}
              </button>
              <button type="button" onClick={() => recorder.clear()}>清空</button>
            </div>
          </header>
          <p className="learning-trace-grouping-hint">按 turn 分组 · 最新事件优先</p>
          <ol className="learning-trace-turns">
            {turns.map(([key, turn]) => (
              <li key={key}>
                <section aria-label={`Turn ${turn.turnId}`}>
                  <header className="learning-trace-turn-header">
                    <dl>
                      <TraceIdentifier field="trace_id" value={turn.traceId} />
                      <TraceIdentifier field="turn_id" value={turn.turnId} />
                    </dl>
                    <small>{turn.events.length} 条事件</small>
                  </header>
                  <ol className="learning-trace-events">
                    {turn.events.map((event) => (
                      <li className="learning-trace-event" key={event.sequence}>
                        <span>{eventOffset(event, firstByTurn)}</span>
                        <div>
                          <strong>{event.stage}</strong>
                          <small>
                            {event.source}{event.status ? ` · ${event.status}` : ""}
                          </small>
                          {event.data ? (
                            <code className="learning-trace-data-preview">{JSON.stringify(event.data)}</code>
                          ) : null}
                          <details className="learning-trace-event-details">
                            <summary>完整事件 JSON</summary>
                            <pre>{JSON.stringify(event, null, 2)}</pre>
                          </details>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
  );
}
