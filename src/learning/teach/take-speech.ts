// What a learner says during one take: each utterance with its timing,
// transcribed as soon as it ends so the words appear while the learner is
// still recording. Audio is only held until it is transcribed; nothing but the
// text and timing is kept.

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
  /** The words, "" for no speech, null when transcription failed; undefined while pending. */
  text?: string | null;
  done: Promise<void>;
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
  private readonly controller = new AbortController();

  private readonly elapsed: () => number;
  private readonly transcribe: Transcribe | null;
  private readonly onText?: (text: string) => void;

  /** Without a transcriber the timing is still kept, so the learner can type the words. */
  constructor(elapsed: () => number, transcribe: Transcribe | null, onText?: (text: string) => void) {
    this.elapsed = elapsed;
    this.transcribe = transcribe;
    this.onText = onText;
  }

  /** Voice activity began; the utterance that follows starts here. */
  speechStarted(): void {
    this.speechStartedAt ??= this.elapsed();
  }

  utterance(wav: Blob): void {
    const end = this.elapsed();
    const utterance: Utterance = { start: this.speechStartedAt ?? end, end, done: Promise.resolve() };
    this.speechStartedAt = null;
    this.utterances.push(utterance);
    const transcribe = this.transcribe;
    if (!transcribe) {
      utterance.text = null;
      return;
    }
    utterance.done = transcribe(wav, this.controller.signal)
      .then((result) => (result.status === "speech" ? result.transcript.trim() : ""), () => null)
      .then((text) => {
        utterance.text = text;
        if (!this.controller.signal.aborted) this.onText?.(this.text());
      });
  }

  /** The words heard so far, in the order they were said. */
  text(): string {
    return join(this.utterances.flatMap((utterance) => (utterance.text ? [utterance.text] : [])));
  }

  /** Waits for every utterance; failures are counted, never fatal. */
  async finish(): Promise<TakeSpeechResult> {
    await Promise.all(this.utterances.map((utterance) => utterance.done));
    if (!this.utterances.length) return { text: "", failed: 0 };
    return {
      text: this.text(),
      speechSpanMs: [this.utterances[0]!.start, this.utterances.at(-1)!.end],
      failed: this.utterances.filter((utterance) => utterance.text === null).length,
    };
  }

  /** The take was discarded: stop transcribing and report nothing more. */
  cancel(): void {
    this.controller.abort();
  }
}
