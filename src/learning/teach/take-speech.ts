// What a learner says during one take: each utterance with its timing, turned
// into text when the take stops. Audio is only held until it is transcribed;
// nothing but the text and timing is kept.

export type Transcribe = (wav: Blob, signal: AbortSignal) => Promise<{ status: "speech" | "no_speech"; transcript: string }>;

export interface TakeSpeechResult {
  text: string;
  /** From the start of the first utterance to the end of the last, in take time. */
  speechSpanMs?: [number, number];
  /** Utterances that could not be transcribed; the learner can type what they said. */
  failed: number;
}

interface Utterance {
  start: number;
  end: number;
  wav: Blob;
}

/** Joins utterances with a space unless the text is written without spaces (Chinese, Japanese). */
function join(parts: string[]): string {
  return parts.reduce((text, part) => {
    if (!text) return part;
    const unspaced = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(text) && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part);
    return unspaced ? `${text}${part}` : `${text} ${part}`;
  }, "");
}

export class TakeSpeech {
  private utterances: Utterance[] = [];
  private speechStartedAt: number | null = null;

  private readonly elapsed: () => number;

  constructor(elapsed: () => number) {
    this.elapsed = elapsed;
  }

  /** Voice activity began; the utterance that follows starts here. */
  speechStarted(): void {
    this.speechStartedAt ??= this.elapsed();
  }

  utterance(wav: Blob): void {
    const end = this.elapsed();
    this.utterances.push({ start: this.speechStartedAt ?? end, end, wav });
    this.speechStartedAt = null;
  }

  /** Transcribes every utterance in order; failures are counted, never fatal. */
  async finish(transcribe: Transcribe | null, signal: AbortSignal): Promise<TakeSpeechResult> {
    const utterances = this.utterances;
    this.utterances = [];
    if (!utterances.length) return { text: "", failed: 0 };
    const span: [number, number] = [utterances[0]!.start, utterances.at(-1)!.end];
    if (!transcribe) return { text: "", speechSpanMs: span, failed: utterances.length };
    const parts: string[] = [];
    let failed = 0;
    for (const utterance of utterances) {
      if (signal.aborted) break;
      try {
        const result = await transcribe(utterance.wav, signal);
        if (result.status === "speech" && result.transcript.trim()) parts.push(result.transcript.trim());
      } catch {
        failed += 1;
      }
    }
    return { text: join(parts), speechSpanMs: span, failed };
  }
}
