import type { LearningRunSummary } from "../history/history-api";

export interface LearnerBackgroundSources {
  /** Octos long-term memory (`memory/overview`), already processed by Octos. */
  memory?: { long_term: string; long_term_updated_at?: string } | null;
  /** Recent learning runs from the product history service. */
  runs?: LearningRunSummary[] | null;
}

const MAX_MEMORY_CHARS = 1500;
const MAX_RUNS = 5;

/** Formats facts for `learner_background`. Only states what the sources say;
 * counts are program-computed and playback is never described as mastery. */
export function buildLearnerContext(sources: LearnerBackgroundSources, asOf: Date): string | undefined {
  const sections: string[] = [];
  const memory = sources.memory?.long_term?.trim();
  if (memory) {
    const clipped = memory.length > MAX_MEMORY_CHARS ? `${memory.slice(0, MAX_MEMORY_CHARS)}…（已截断）` : memory;
    sections.push(`【Octos 长期记忆】（由 Octos 整理${sources.memory?.long_term_updated_at ? `，更新于 ${sources.memory.long_term_updated_at}` : ""}；未注明老师的内容不能当作你亲历）\n${clipped}`);
  }
  const runs = (sources.runs ?? []).filter((run) => run.question_preview?.trim()).slice(0, MAX_RUNS);
  if (runs.length) {
    sections.push(`【最近的学习记录】（Octos Learn 程序统计；播放不代表掌握）\n${runs.map((run) =>
      `- ${run.first_occurred_at.slice(0, 10)} “${run.question_preview!.trim().slice(0, 80)}”：提问 ${run.question_count} 次，播放 ${run.completed_beats} 个片段，练习作答 ${run.task_attempts} 次`).join("\n")}`);
  }
  if (!sections.length) return undefined;
  return `以下是学习应用提供的学生背景，截至 ${asOf.toISOString()}。只使用与本次问题相关的部分。\n${sections.join("\n")}`;
}

/** Keeps the latest background per account so submitting a question never
 * waits for it. Refreshes happen while the classroom is idle and at most once
 * per `maxAgeMs` unless forced; a failed or slow refresh keeps the previous
 * value and the lesson starts without it. A result is stored only if the
 * signed-in account is still the one it was loaded for. */
export class LearnerBackgroundCache {
  private value?: { account: string; text: string | undefined; at: number };
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly forcedAfter = new Map<string, Promise<void>>();
  private readonly load: (account: string) => Promise<LearnerBackgroundSources>;
  private readonly currentAccount: () => string | null;
  private readonly timeoutMs: number;
  private readonly maxAgeMs: number;
  private readonly now: () => Date;

  constructor(load: (account: string) => Promise<LearnerBackgroundSources>, options: {
    currentAccount: () => string | null; timeoutMs?: number; maxAgeMs?: number; now?: () => Date;
  }) {
    this.load = load; this.currentAccount = options.currentAccount;
    this.timeoutMs = options.timeoutMs ?? 8000; this.maxAgeMs = options.maxAgeMs ?? 120000; this.now = options.now ?? (() => new Date());
  }

  current(account: string | null): string | undefined {
    return account && this.value?.account === account ? this.value.text : undefined;
  }

  refresh(account: string | null, force = false): Promise<void> {
    if (!account) return Promise.resolve();
    const running = this.inflight.get(account);
    if (running) {
      if (!force) return running;
      // A forced refresh means sources changed (e.g. a connection appeared), so
      // the running load may be stale: queue one fresh load after it.
      let again = this.forcedAfter.get(account);
      if (!again) {
        again = running.then(() => { this.forcedAfter.delete(account); return this.refresh(account, true); });
        this.forcedAfter.set(account, again);
      }
      return again;
    }
    if (!force && this.value?.account === account && this.now().getTime() - this.value.at < this.maxAgeMs) return Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("learner background timed out")), this.timeoutMs); });
    const task = Promise.race([this.load(account), timeout])
      .then((sources) => {
        if (this.currentAccount() !== account) return;
        const now = this.now();
        this.value = { account, text: buildLearnerContext(sources, now), at: now.getTime() };
      })
      .catch(() => { /* keep the previous value; lessons start without background */ })
      .finally(() => { clearTimeout(timer); this.inflight.delete(account); });
    this.inflight.set(account, task);
    return task;
  }
}
