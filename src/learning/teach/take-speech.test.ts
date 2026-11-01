import { describe, expect, it, vi } from "vitest";
import { TakeSpeech } from "./take-speech";

const labels = new WeakMap<Blob, string>();
const wav = (label: string) => { const blob = new Blob([label], { type: "audio/wav" }); labels.set(blob, label); return blob; };
const said = (audio: Blob) => labels.get(audio);

function clockAt(times: number[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)]!;
}

describe("TakeSpeech", () => {
  it("transcribes utterances in order and spans first start to last end", async () => {
    const speech = new TakeSpeech(clockAt([600, 3_200, 4_000, 8_700]));
    speech.speechStarted(); speech.utterance(wav("one"));
    speech.speechStarted(); speech.utterance(wav("two"));
    const transcribe = vi.fn(async (audio: Blob) => ({ status: "speech" as const, transcript: said(audio) === "one" ? "Slope is steepness." : "Like a ramp." }));
    const result = await speech.finish(transcribe, new AbortController().signal);
    expect(result).toEqual({ text: "Slope is steepness. Like a ramp.", speechSpanMs: [600, 8_700], failed: 0 });
  });

  it("joins Chinese utterances without a space", async () => {
    const speech = new TakeSpeech(clockAt([0, 1, 2, 3]));
    speech.speechStarted(); speech.utterance(wav("a"));
    speech.speechStarted(); speech.utterance(wav("b"));
    const transcribe = async (audio: Blob) => ({ status: "speech" as const, transcript: said(audio) === "a" ? "斜率就是" : "有多陡" });
    expect((await speech.finish(transcribe, new AbortController().signal)).text).toBe("斜率就是有多陡");
  });

  it("counts failed utterances and keeps the rest", async () => {
    const speech = new TakeSpeech(clockAt([0, 1, 2, 3]));
    speech.speechStarted(); speech.utterance(wav("ok"));
    speech.speechStarted(); speech.utterance(wav("bad"));
    const transcribe = async (audio: Blob) => {
      if (said(audio) === "bad") throw new Error("network");
      return { status: "speech" as const, transcript: "Point A." };
    };
    expect(await speech.finish(transcribe, new AbortController().signal)).toMatchObject({ text: "Point A.", failed: 1 });
  });

  it("without a recognition service keeps the timing so the learner can type the words", async () => {
    const speech = new TakeSpeech(clockAt([500, 2_000]));
    speech.speechStarted(); speech.utterance(wav("x"));
    expect(await speech.finish(null, new AbortController().signal)).toEqual({ text: "", speechSpanMs: [500, 2_000], failed: 1 });
  });

  it("a silent take has no speech span", async () => {
    expect(await new TakeSpeech(() => 0).finish(vi.fn(), new AbortController().signal)).toEqual({ text: "", failed: 0 });
  });
});
