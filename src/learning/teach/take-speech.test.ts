import { describe, expect, it, vi } from "vitest";
import { TakeSpeech, type SpeechUpdate, type Transcribe } from "./take-speech";

const labels = new WeakMap<Blob, string>();
const wav = (label: string) => { const blob = new Blob([label], { type: "audio/wav" }); labels.set(blob, label); return blob; };
const said = (audio: Blob) => labels.get(audio);

function clockAt(times: number[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)]!;
}

const speech = (words: Record<string, string>): Transcribe => async (audio) => ({ status: "speech", transcript: words[said(audio)!] ?? "" });

describe("TakeSpeech", () => {
  it("transcribes utterances in order, keeps each as a timed sentence, and spans first start to last end", async () => {
    const take = new TakeSpeech(clockAt([600, 3_200, 4_000, 8_700]), speech({ one: "Slope is steepness.", two: "Like a ramp." }));
    take.speechStarted(); take.utterance(wav("one"));
    take.speechStarted(); take.utterance(wav("two"));
    expect(await take.finish()).toEqual({
      text: "Slope is steepness. Like a ramp.", speechSpanMs: [600, 8_700], failed: 0,
      segments: [
        { startMs: 600, endMs: 3_200, text: "Slope is steepness.", asrText: "Slope is steepness." },
        { startMs: 4_000, endMs: 8_700, text: "Like a ramp.", asrText: "Like a ramp." },
      ],
    });
  });

  it("drops utterances that held no words from the sentences", async () => {
    const take = new TakeSpeech(clockAt([0, 1, 2, 3]), speech({ one: "Point A." }));
    take.speechStarted(); take.utterance(wav("one"));
    take.speechStarted(); take.utterance(wav("cough"));
    expect((await take.finish()).segments).toEqual([{ startMs: 0, endMs: 1, text: "Point A.", asrText: "Point A." }]);
  });

  it("shows the words while the learner is still recording, in the order they were said", async () => {
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const transcribe: Transcribe = async (audio) => {
      if (said(audio) === "one") await first;
      return { status: "speech", transcript: said(audio) === "one" ? "Point A" : "is at 1, 2." };
    };
    const heard: SpeechUpdate[] = [];
    const take = new TakeSpeech(clockAt([0, 1, 2, 3]), transcribe, (update) => heard.push(update));
    take.speechStarted(); take.utterance(wav("one"));
    take.speechStarted(); take.utterance(wav("two"));
    expect(heard.slice(0, 2)).toEqual([
      { text: "", sentences: [{ state: "transcribing" }], transcribing: 1 },
      { text: "", sentences: [{ state: "transcribing" }, { state: "transcribing" }], transcribing: 2 },
    ]);
    await vi.waitFor(() => expect(heard.at(-1)).toEqual({ text: "is at 1, 2.", sentences: [{ state: "transcribing" }, { state: "text", text: "is at 1, 2." }], transcribing: 1 }));
    releaseFirst();
    await take.finish();
    expect(heard.at(-1)).toEqual({ text: "Point A is at 1, 2.", sentences: [{ state: "text", text: "Point A" }, { state: "text", text: "is at 1, 2." }], transcribing: 0 });
  });

  it("joins Chinese utterances without a space", async () => {
    const take = new TakeSpeech(clockAt([0, 1, 2, 3]), speech({ a: "斜率就是", b: "有多陡" }));
    take.speechStarted(); take.utterance(wav("a"));
    take.speechStarted(); take.utterance(wav("b"));
    expect((await take.finish()).text).toBe("斜率就是有多陡");
  });

  it("joins Chinese sentences that end in Chinese punctuation without a space", async () => {
    const take = new TakeSpeech(clockAt([0, 1, 2, 3]), speech({ a: "这是单位圆。", b: "半径是一。" }));
    take.speechStarted(); take.utterance(wav("a"));
    take.speechStarted(); take.utterance(wav("b"));
    expect((await take.finish()).text).toBe("这是单位圆。半径是一。");
  });

  it("counts failed utterances and keeps the rest", async () => {
    const transcribe: Transcribe = async (audio) => {
      if (said(audio) === "bad") throw new Error("network");
      return { status: "speech", transcript: "Point A." };
    };
    const take = new TakeSpeech(clockAt([0, 1, 2, 3]), transcribe);
    take.speechStarted(); take.utterance(wav("ok"));
    take.speechStarted(); take.utterance(wav("bad"));
    expect(await take.finish()).toMatchObject({ text: "Point A.", failed: 1 });
  });

  it("without a recognition service keeps the timing so the learner can type the words", async () => {
    const take = new TakeSpeech(clockAt([500, 2_000]), null);
    take.speechStarted(); take.utterance(wav("x"));
    expect(await take.finish()).toEqual({ text: "", speechSpanMs: [500, 2_000], failed: 1, segments: [{ startMs: 500, endMs: 2_000, text: "", failed: true }] });
  });

  it("a silent take has no speech span", async () => {
    expect(await new TakeSpeech(() => 0, vi.fn()).finish()).toEqual({ text: "", segments: [], failed: 0 });
  });

  it("a discarded take stops reporting words", async () => {
    const take = new TakeSpeech(clockAt([0, 1]), speech({ one: "Hello." }), (update) => heard.push(update.text));
    const heard: string[] = [];
    take.cancel();
    take.speechStarted(); take.utterance(wav("one"));
    await take.finish();
    expect(heard).toEqual([]);
  });
});
