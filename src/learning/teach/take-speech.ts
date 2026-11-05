// What a learner says during one take: each utterance with its timing,
// transcribed as soon as it ends so the words appear while the learner is
// still recording. Audio is only held until it is transcribed; nothing but the
// text and timing is kept.

import { joinSpoken, type SpeechSegment } from "./recording";

export type Transcribe = (wav: Blob, signal: AbortSignal) => Promise<{ status: "speech" | "no_speech"; transcript: string }>;

export interface TakeSpeechResult {
  text: string;
  /** From the start of the first utterance to the end of the last, in take time. */
  speechSpanMs?: [number, number];
  /** Each utterance as a sentence, in the order said; failed ones are empty and marked, so the learner can type them. */
  segments: SpeechSegment[];
  /** Utterances that could not be transcribed; the learner can type what they said. */
  failed: number;
}

/** One sentence heard so far: its words, or still being turned into text, or not understood. */
export type LiveSentence = { state: "text"; text: string } | { state: "transcribing" } | { state: "failed" };

/** The words so far, sentence by sentence, and how many finished sentences are still being turned into text. */
export interface SpeechUpdate {
  text: string;
  sentences: LiveSentence[];
  transcribing: number;
}

interface Utterance {
  start: number;
  end: number;
  /** The words, "" for no speech, null when transcription failed; undefined while pending. */
  text?: string | null;
  done: Promise<void>;
}

export class TakeSpeech {
  private utterances: Utterance[] = [];
  private speechStartedAt: number | null = null;
  private readonly controller = new AbortController();

  private readonly elapsed: () => number;
  private readonly transcribe: Transcribe | null;
  private readonly onUpdate?: (update: SpeechUpdate) => void;

  /** Without a transcriber the timing is still kept, so the learner can type the words. */
  constructor(elapsed: () => number, transcribe: Transcribe | null, onUpdate?: (update: SpeechUpdate) => void) {
    this.elapsed = elapsed;
    this.transcribe = transcribe;
    this.onUpdate = onUpdate;
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
        this.report();
      });
    this.report();
  }

  private report(): void {
    if (this.controller.signal.aborted) return;
    this.onUpdate?.({
      text: this.text(),
      sentences: this.utterances.flatMap((utterance): LiveSentence[] => (
        utterance.text === undefined ? [{ state: "transcribing" }]
          : utterance.text === null ? [{ state: "failed" }]
            : utterance.text ? [{ state: "text", text: utterance.text }] : [])),
      transcribing: this.utterances.filter((utterance) => utterance.text === undefined).length,
    });
  }

  /** The words heard so far, in the order they were said. */
  text(): string {
    return joinSpoken(this.utterances.flatMap((utterance) => (utterance.text ? [utterance.text] : [])));
  }

  /** Waits for every utterance; failures are counted, never fatal. */
  async finish(): Promise<TakeSpeechResult> {
    await Promise.all(this.utterances.map((utterance) => utterance.done));
    if (!this.utterances.length) return { text: "", segments: [], failed: 0 };
    return {
      text: this.text(),
      speechSpanMs: [this.utterances[0]!.start, this.utterances.at(-1)!.end],
      // An utterance that held no speech (a cough, a click) is not a sentence.
      segments: this.utterances.flatMap((utterance): SpeechSegment[] => (
        utterance.text === null ? [{ startMs: utterance.start, endMs: utterance.end, text: "", failed: true }]
          : utterance.text ? [{ startMs: utterance.start, endMs: utterance.end, text: utterance.text, asrText: utterance.text }] : [])),
      failed: this.utterances.filter((utterance) => utterance.text === null).length,
    };
  }

  /** The take was discarded: stop transcribing and report nothing more. */
  cancel(): void {
    this.controller.abort();
  }
}
