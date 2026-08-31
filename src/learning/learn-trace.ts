export const LEARN_TRACE_SCHEMA = "octos.learn.trace.v1" as const;

export type LearnTraceSource = "octos-web" | "learning-coach";

export interface LearnTraceEvent {
  schema: typeof LEARN_TRACE_SCHEMA;
  sequence: number;
  trace_id: string;
  session_id: string;
  turn_id: string;
  source: LearnTraceSource;
  stage: string;
  status?: string;
  recorded_at: string;
  recorded_at_epoch_ms: number;
  elapsed_ms?: number;
  data?: Record<string, unknown>;
}

export interface RecordLearnTraceEvent {
  turnId: string;
  source: LearnTraceSource;
  stage: string;
  status?: string;
  recordedAtEpochMs?: number;
  elapsedMs?: number;
  data?: Record<string, unknown>;
}

const COACH_LOG_PREFIX = "learning-coach:";
const TRACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_DATE_EPOCH_MS = 8_640_000_000_000_000;
const TRACE_ENVELOPE_FIELDS = new Set([
  "schema",
  "sequence",
  "trace_id",
  "session_id",
  "turn_id",
  "source",
  "stage",
  "status",
  "recorded_at",
  "recorded_at_epoch_ms",
  "elapsed_ms",
  "invocation_elapsed_ms",
  "tool",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validEpochMs(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_DATE_EPOCH_MS;
}

function boundedTraceValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, 512);
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 32)
      .map((item) => boundedTraceValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 32)
      .flatMap(([key, item]) => {
        const bounded = boundedTraceValue(item, depth + 1);
        return bounded === undefined ? [] : [[key, bounded]];
      }),
  );
}

function boundedTraceData(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const bounded = boundedTraceValue(value);
  return isRecord(bounded) && Object.keys(bounded).length > 0
    ? bounded
    : undefined;
}

export function parseLearningCoachTraceMessage(
  message: string | undefined,
): Omit<RecordLearnTraceEvent, "source"> | null {
  const trimmed = message?.trim();
  if (!trimmed?.startsWith(COACH_LOG_PREFIX)) return null;
  const json = trimmed.slice(COACH_LOG_PREFIX.length).trim();
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (
    !isRecord(payload)
    || payload.schema !== LEARN_TRACE_SCHEMA
    || payload.source !== "learning-coach"
    || typeof payload.stage !== "string"
  ) return null;
  const turnId = typeof payload.turn_id === "string"
    ? payload.turn_id
    : typeof payload.trace_id === "string"
      ? payload.trace_id
      : undefined;
  if (!turnId || !TRACE_ID_PATTERN.test(turnId) || turnId.includes("..")) {
    return null;
  }
  const data = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !TRACE_ENVELOPE_FIELDS.has(key)),
  );
  const elapsed = typeof payload.elapsed_ms === "number"
    ? payload.elapsed_ms
    : typeof payload.invocation_elapsed_ms === "number"
      ? payload.invocation_elapsed_ms
      : undefined;
  return {
    turnId,
    stage: payload.stage,
    ...(typeof payload.status === "string" ? { status: payload.status } : {}),
    ...(validEpochMs(payload.recorded_at_epoch_ms)
      ? { recordedAtEpochMs: payload.recorded_at_epoch_ms }
      : {}),
    ...(typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0
      ? { elapsedMs: elapsed }
      : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
  };
}

/**
 * A session-owned, bounded diagnostic timeline. It deliberately stays in
 * memory: learner prompts, media, and board documents never enter the trace,
 * and closing the page removes the diagnostics.
 */
export class LearnTraceRecorder {
  readonly sessionId: string;
  readonly maxEvents: number;
  private sequence = 0;
  private events: LearnTraceEvent[] = [];
  private readonly onceKeys = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;

  constructor(
    sessionId: string,
    options: { maxEvents?: number; now?: () => number } = {},
  ) {
    this.sessionId = sessionId;
    this.maxEvents = options.maxEvents ?? 240;
    this.now = options.now ?? Date.now;
    if (!Number.isInteger(this.maxEvents) || this.maxEvents <= 0) {
      throw new Error("LearnTraceRecorder maxEvents must be a positive integer");
    }
  }

  record(input: RecordLearnTraceEvent): LearnTraceEvent {
    if (!TRACE_ID_PATTERN.test(input.turnId) || input.turnId.includes("..")) {
      throw new Error("Learn trace turnId is invalid");
    }
    if (!input.stage.trim()) throw new Error("Learn trace stage is required");
    const candidateRecordedAt = input.recordedAtEpochMs ?? this.now();
    const recordedAtEpochMs = validEpochMs(candidateRecordedAt)
      ? candidateRecordedAt
      : this.now();
    const data = boundedTraceData(input.data);
    const event: LearnTraceEvent = {
      schema: LEARN_TRACE_SCHEMA,
      sequence: ++this.sequence,
      trace_id: input.turnId,
      session_id: this.sessionId,
      turn_id: input.turnId,
      source: input.source,
      stage: input.stage.slice(0, 128),
      ...(input.status ? { status: input.status } : {}),
      recorded_at: new Date(recordedAtEpochMs).toISOString(),
      recorded_at_epoch_ms: recordedAtEpochMs,
      ...(input.elapsedMs === undefined
        || !Number.isFinite(input.elapsedMs)
        || input.elapsedMs < 0
        ? {}
        : { elapsed_ms: input.elapsedMs }),
      ...(data ? { data } : {}),
    };
    this.events = [...this.events, event].slice(-this.maxEvents);
    this.listeners.forEach((listener) => listener());
    return event;
  }

  recordOnce(key: string, input: RecordLearnTraceEvent): LearnTraceEvent | null {
    if (this.onceKeys.has(key)) return null;
    this.onceKeys.add(key);
    return this.record(input);
  }

  ingestLearningCoachMessage(message: string | undefined): LearnTraceEvent | null {
    const parsed = parseLearningCoachTraceMessage(message);
    return parsed
      ? this.record({ ...parsed, source: "learning-coach" })
      : null;
  }

  getEvents(): readonly LearnTraceEvent[] {
    return this.events;
  }

  toJsonl(): string {
    return this.events.map((event) => JSON.stringify(event)).join("\n");
  }

  clear(): void {
    if (this.events.length === 0) return;
    this.events = [];
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
