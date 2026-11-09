import { readFileSync } from "node:fs";
import vm from "node:vm";
import { URL as NodeURL } from "node:url";
import { expect, it } from "vitest";

function audioHarness(mode: "peak" | "short" = "short", threshold = 0.008, rate = 48000) {
  const messages: Array<{ type: string; time?: number; peak?: number; recentPeak?: number; status?: string }> = [];
  let Processor: new () => { process(inputs: Float32Array[][]): boolean; port: { onmessage: (event: { data: unknown }) => void } };
  const context = vm.createContext({
    currentTime: 0, sampleRate: rate,
    AudioWorkletProcessor: class { port = { postMessage: (message: typeof messages[number]) => messages.push(message), onmessage: null }; },
    registerProcessor: (_: string, value: typeof Processor) => { Processor = value; },
  });
  vm.runInContext(readFileSync(new NodeURL("./impulse-processor.js", import.meta.url), "utf8"), context);
  const processor = new Processor!();
  processor.port.onmessage({ data: { mode, threshold } });
  let sample = 0;
  return {
    messages,
    configure(data: unknown) { processor.port.onmessage({ data }); },
    run(milliseconds: number, amplitude = 0) {
      for (let block = 0; block < Math.ceil(milliseconds * rate / 1000 / 128); block++) {
        const values = Float32Array.from({ length: 128 }, () => amplitude * Math.sin(sample++ * 0.8));
        processor.process([[values]]); context.currentTime += 128 / rate;
      }
    },
  };
}

it("detects a short transient even when it is shorter than a video frame", () => {
  const audio = audioHarness();
  audio.run(400); audio.run(6, 0.4); audio.run(50);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(1);
});
it("ignores silence, low volume noise, and a sustained loud sound", () => {
  const audio = audioHarness();
  audio.run(500); audio.run(500, 0.003); audio.run(500, 0.4); audio.run(100);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(0);
});
it("suppresses echoes within the short cooldown", () => {
  const audio = audioHarness();
  audio.run(400); audio.run(6, 0.4); audio.run(40); audio.run(6, 0.4); audio.run(50);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(1);
});

it("loose mode detects a quiet short onset without waiting for its tail", () => {
  const audio = audioHarness("peak");
  audio.run(400); audio.run(6, 0.02);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(1);
});
it("allows lowering the gate below the old slider minimum", () => {
  const audio = audioHarness("peak");
  audio.run(400); audio.run(6, 0.004); audio.run(60);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(0);
  audio.configure({ threshold: 0.002 });
  audio.run(400); audio.run(6, 0.004); audio.run(60);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(1);
});
it("accepts a longer decaying sound in strict mode, while reporting sustained sounds as rejected", () => {
  const audio = audioHarness();
  audio.run(400); audio.run(6, 0.04); audio.run(110, 0.015); audio.run(50);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(1);
  audio.run(400); audio.run(500, 0.4); audio.run(50);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(1);
  expect(audio.messages.some(message => message.status === "long")).toBe(true);
});
it("counts a sustained onset once in loose mode, then rearms after quiet", () => {
  const audio = audioHarness("peak");
  audio.run(400); audio.run(500, 0.04); audio.run(400); audio.run(6, 0.02); audio.run(50);
  expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(2);
});
it("aggregates between meter ticks and retains the short peak for display", () => {
  const audio = audioHarness("peak");
  audio.run(400); audio.run(6, 0.2); audio.run(150);
  const levels = audio.messages.filter(message => message.type === "level");
  expect(levels.some(message => message.peak! > 0.1)).toBe(true);
  expect(levels.at(-1)!.recentPeak).toBeGreaterThan(0.1);
});
it("detects against an existing quiet background at both common device sample rates", () => {
  for (const rate of [44100, 48000]) {
    const audio = audioHarness("peak", 0.008, rate);
    audio.run(600, 0.001); audio.run(6, 0.02); audio.run(60, 0.001);
    expect(audio.messages.filter(message => message.type === "impulse")).toHaveLength(1);
  }
});
